import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {validateToken} from './analysis';
import {parseAlchemySolanaTransactions} from './alchemy-solana-history';
import type {PublicHistoryResult} from './public-history';

export type SolanaArchiveStatus={token:string;status:'idle'|'partial'|'exhausted'|'cooldown'|'capped'|'running'|'unsupported';transactions:number;pages:number;trades:number;transfers:number;updatedAt?:string;retryAt?:number;hasMore:boolean;message:string};

/** A missing/incompatible endpoint is a terminal configuration gap, not a
 * temporary transport failure. No URL or credential is returned to clients. */
export function solanaArchiveConfigurationStatus(token:string,rpcUrl:string):SolanaArchiveStatus|null{
 let compatible=false;
 try{const endpoint=new URL(rpcUrl);compatible=endpoint.protocol==='https:'&&/(^|\.)alchemy\.com$/.test(endpoint.hostname);}catch{}
 return compatible?null:{token,status:'unsupported',transactions:0,pages:0,trades:0,transfers:0,hasMore:false,message:'Historical retrieval is unavailable: configure an authorized Alchemy Solana HTTPS endpoint. This request retrieved no additional history; coverage is incomplete.'};
}
type Options={dbPath:string;rpcUrl:string;fetcher?:typeof fetch;now?:()=>number;maxStorageBytes?:number};
type Row=Record<string,unknown>;
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const SOURCE='Alchemy durable Solana mint-address history';
const MAX_TOKENS=32;
const STALLED_CURSOR_COOLDOWN_MS=60000;
const scope='This archive covers ascending finalized mint-address indexed transactions only, not complete token-wide history or verified launch coverage. Native transfers remain observations, not acquisition funding. Only supported canonical Pump instructions establish trades.';

/** Server-only, explicitly advanced bounded archive. No timers run between calls.
 * SQLite fencing prevents concurrent app processes from advancing the same cursor.
 * Only decoded public records, transaction IDs and pagination state are persisted.
 */
export function createSolanaHistoryArchive(options:Options){
 if(typeof window!=='undefined')throw Error('Solana history archive is server-only.');
 const endpoint=new URL(options.rpcUrl);
 if(endpoint.protocol!=='https:'||!/(^|\.)alchemy\.com$/.test(endpoint.hostname))throw Error('An Alchemy HTTPS Solana endpoint is required.');
 const file=resolve(options.dbPath);mkdirSync(dirname(file),{recursive:true,mode:0o700});
 const db=new DatabaseSync(file,{timeout:1500,enableForeignKeyConstraints:true,allowExtension:false});
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS solana_archive(token TEXT PRIMARY KEY,cursor TEXT,pages INTEGER NOT NULL DEFAULT 0,transactions INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0,exhausted INTEGER NOT NULL DEFAULT 0,capped INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '',updated_at TEXT,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS solana_archive_seen(token TEXT NOT NULL REFERENCES solana_archive(token),signature TEXT NOT NULL,PRIMARY KEY(token,signature));
 CREATE TABLE IF NOT EXISTS solana_archive_records(token TEXT NOT NULL REFERENCES solana_archive(token),kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(token,kind,id));
 CREATE TABLE IF NOT EXISTS solana_archive_cursors(token TEXT NOT NULL REFERENCES solana_archive(token),cursor TEXT NOT NULL,PRIMARY KEY(token,cursor));`);
 const maxStorageBytes=Number.isFinite(options.maxStorageBytes)&&options.maxStorageBytes!>=262144?options.maxStorageBytes!:512*1024*1024;
 const storageLimitReached=()=>Number(db.prepare('PRAGMA page_count').get()?.page_count)*Number(db.prepare('PRAGMA page_size').get()?.page_size)>=maxStorageBytes;
 if(!storageLimitReached())db.prepare("UPDATE solana_archive SET capped=0,message='Legacy row limit removed; saved cursor can continue.' WHERE capped=1 AND message LIKE 'Storage cap reached (10,000%'").run();
 const now=options.now||Date.now,fetcher=options.fetcher||fetch;
 const validate=(token:string)=>{if(validateToken('solana',token))throw Error('Invalid Solana mint address.');return token;};
 const row=(token:string)=>db.prepare('SELECT * FROM solana_archive WHERE token=?').get(token) as Row|undefined;
 const tx=<T>(run:()=>T):T=>{db.exec('BEGIN IMMEDIATE');try{const v=run();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}};
 const stamp=()=>new Date(now()).toISOString();
 function status(token:string):SolanaArchiveStatus|null{
  validate(token);const r=row(token);if(!r)return null;
  const counts=Object.fromEntries(db.prepare('SELECT kind,COUNT(*) AS n FROM solana_archive_records WHERE token=? GROUP BY kind').all(token).map(v=>[String(v.kind),Number(v.n)]));
  const state:SolanaArchiveStatus['status']=r.lease&&Number(r.lease_until)>now()?'running':Number(r.capped)?'capped':Number(r.retry_at)>now()?'cooldown':Number(r.exhausted)?'exhausted':Number(r.pages)?'partial':'idle';
  return {token,status:state,transactions:Number(r.transactions),pages:Number(r.pages),trades:counts.trades||0,transfers:counts.transfers||0,...(r.updated_at?{updatedAt:String(r.updated_at)}:{}),...(Number(r.retry_at)>now()?{retryAt:Number(r.retry_at)}:{}),hasMore:!Number(r.exhausted)&&!Number(r.capped),message:String(r.message)||'Ready to retrieve finalized mint-address history.'};
 }
 function evidence(token:string):PublicHistoryResult|undefined{
  const progress=status(token);if(!progress||!progress.pages)return undefined;
  const result:PublicHistoryResult={trades:[],transfers:[],identities:[],labels:[],reasons:[scope,progress.message],sources:[{name:SOURCE,status:Number(row(token)?.accepted)?'available':'unavailable',detail:`${progress.transactions} distinct indexed transactions visited in ${progress.pages} pages; ${progress.trades} decoded trades and ${progress.transfers} observed transfers. ${progress.status==='exhausted'?'The provider returned no further mint-index cursor.':progress.message}`,fetchedAt:progress.updatedAt}],truncated:true};
  const included:string[]=[];
  for(const [kind,limit] of [['trades',1000],['transfers',3000],['identities',1000],['labels',1000]] as const){
   const total=Number(db.prepare('SELECT COUNT(*) AS n FROM solana_archive_records WHERE token=? AND kind=?').get(token,kind)?.n);
   const select=(order:'ASC'|'DESC',count:number)=>db.prepare(`SELECT id,json FROM solana_archive_records WHERE token=? AND kind=? ORDER BY json_extract(json,'$.timestamp') ${order},id ${order} LIMIT ?`).all(token,kind,count);
   const rows=total>limit&&(kind==='trades'||kind==='transfers')?[...select('ASC',limit/2),...select('DESC',limit/2)]:select('ASC',limit);
   const unique=[...new Map(rows.map(r=>[r.id,r])).values()];
   for(const item of unique)result[kind].push(JSON.parse(String(item.json)) as never);
   included.push(`${unique.length}/${total} ${kind}`);
   if(total>limit)result.reasons.push(`Report subset: ${kind} includes ${limit} of ${total} archived records${kind==='trades'||kind==='transfers'?' (oldest half and newest half by event timestamp)':''}. Other records remain saved but are outside this report analysis.`);
  }
  result.sources[0].detail+=` Included in this report: ${included.join(', ')}.`;
  return result;
 }
 async function advance(token:string,request:{signal?:AbortSignal;pages?:number}={}):Promise<SolanaArchiveStatus>{
  validate(token);request.signal?.throwIfAborted();
  const pages=Math.max(1,Math.min(4,Math.floor(request.pages||4))),lease=randomUUID();
  const acquired=tx(()=>{
   if(!row(token)){
    if(Number(db.prepare('SELECT COUNT(*) AS n FROM solana_archive').get()?.n)>=MAX_TOKENS)throw Error('Archive capacity reached: 32 token histories. Existing evidence was preserved.');
    db.prepare('INSERT INTO solana_archive(token) VALUES(?)').run(token);
   }
   const s=status(token)!;if(['running','capped','cooldown','exhausted'].includes(s.status))return false;
   db.prepare('UPDATE solana_archive SET lease=?,lease_until=? WHERE token=?').run(lease,now()+60000,token);return true;
  });
  if(!acquired)return status(token)!;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000),abort=()=>controller.abort(request.signal?.reason);
  request.signal?.addEventListener('abort',abort,{once:true});
  const owned=()=>{const r=row(token);if(r?.lease!==lease||Number(r.lease_until)<=now())throw Error('Archive worker lease expired.');return r;};
  const updateFailure=(message:string,retry=0)=>tx(()=>{owned();db.prepare('UPDATE solana_archive SET message=?,retry_at=?,updated_at=? WHERE token=?').run(message,retry,stamp(),token);});
  try{
   for(let page=0;page<pages;page++){
    controller.signal.throwIfAborted();const current=owned(),cursor=typeof current.cursor==='string'?current.cursor:undefined;
    const response=await fetcher(options.rpcUrl,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:page+1,method:'getTransactionsForAddress',params:[token,{transactionDetails:'full',sortOrder:'asc',limit:100,filters:{status:'succeeded'},commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:1,...(cursor?{paginationToken:cursor}:{})}]})});
    if(response.status===429){const header=response.headers.get('Retry-After'),seconds=Number(header),date=header?Date.parse(header):NaN;const delay=header&&Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-now():60000;updateFailure('Provider rate limit reached. Saved pages are retained; retry after the cooldown.',now()+Math.max(1000,Math.min(86400000,delay)));break;}
    if(!response.ok)throw Error('Provider request failed.');
    const payload=object(await response.json()),result=object(payload.result);
    if(payload.error||!Array.isArray(result.data)||result.data.length>100)throw Error('Invalid historical page.');
    if(result.paginationToken!=null&&(typeof result.paginationToken!=='string'||result.paginationToken.length>4096))throw Error('Invalid historical cursor.');
    const next=typeof result.paginationToken==='string'&&result.paginationToken?result.paginationToken:null;
    controller.signal.throwIfAborted();
    const stop=tx(()=>{
     const latest=owned();let count=Number(latest.transactions),accepted=Number(latest.accepted),capped=false;
     let records=Number(db.prepare('SELECT COUNT(*) AS n FROM solana_archive_records WHERE token=?').get(token)?.n);
     for(const raw of result.data as unknown[]){
      const transaction=object(object(raw).transaction),signatures=transaction.signatures;
      const signature=Array.isArray(signatures)&&typeof signatures[0]==='string'?signatures[0]:createHash('sha256').update(JSON.stringify(raw)).digest('hex');
      if(db.prepare('SELECT 1 FROM solana_archive_seen WHERE token=? AND signature=?').get(token,signature))continue;
      if(storageLimitReached()){capped=true;break;}
      const parsed=parseAlchemySolanaTransactions([raw],token);
      db.prepare('INSERT INTO solana_archive_seen VALUES(?,?)').run(token,signature);count++;accepted+=parsed.acceptedTransactions;
      for(const kind of ['trades','transfers','identities','labels'] as const)for(const original of parsed[kind]){
       const item=kind==='transfers'&&'native' in original&&original.native?{...original,fundingEligible:false}:original;
       const id='id' in item?item.id:kind==='identities'?`${'transaction' in item?item.transaction:''}:${item.address}:${'role' in item?item.role:''}`:`${item.address}:${'category' in item?item.category:''}`;
       const encoded=JSON.stringify(item);if(encoded.length>262144||storageLimitReached()){capped=true;break;}
       records+=Number(db.prepare('INSERT OR IGNORE INTO solana_archive_records VALUES(?,?,?,?)').run(token,kind,id,encoded).changes);
      }
     }
     const repeated=!!next&&(next===cursor||!!db.prepare('SELECT 1 FROM solana_archive_cursors WHERE token=? AND cursor=?').get(token,next));
     const emptyPage=!(result.data as unknown[]).length;
     const duplicateOnly=count===Number(latest.transactions);
     const stalled=!!next&&(repeated||emptyPage||duplicateOnly);
     if(next&&!repeated)db.prepare('INSERT INTO solana_archive_cursors VALUES(?,?)').run(token,next);
     capped=capped||storageLimitReached();
     const exhausted=!next&&!capped;
     const message=capped?'Archive storage safety limit reached or a record exceeds the size bound. History is incomplete; no end-of-index claim is made.':repeated||emptyPage?'Provider cursor repeated or stalled; saved evidence retained. Retry after the cooldown.':stalled?'Provider page contained no new transactions. Its new cursor was saved; continue after the cooldown.':exhausted?'Mint-address index exhausted at the last retrieval. This is not complete token-wide coverage.':'Saved page checkpoint. More mint-address history is available.';
     // A genuinely new cursor may cross overlapping provider pages. Preserve it
     // so the next bounded batch can reach new data. Cycles and empty pages keep
     // the current checkpoint; neither case proves an end of the provider index.
     const checkpoint=capped||repeated||emptyPage&&!!next?cursor||null:next;
     db.prepare('UPDATE solana_archive SET cursor=?,pages=pages+1,transactions=?,accepted=?,exhausted=?,capped=?,retry_at=?,message=?,updated_at=? WHERE token=?').run(checkpoint,count,accepted,exhausted?1:0,capped?1:0,stalled&&!capped?now()+STALLED_CURSOR_COOLDOWN_MS:0,message,stamp(),token);
     return capped||stalled||exhausted;
    });
    if(stop)break;
   }
  }catch{
   // Provider errors can contain credential-bearing URLs, so only fixed text is saved.
   try{updateFailure(controller.signal.aborted?'History retrieval paused at the saved checkpoint.':'Historical page failed validation or retrieval. Saved evidence and cursor were retained.');}catch{}
   request.signal?.throwIfAborted();
  }finally{
   clearTimeout(timeout);request.signal?.removeEventListener('abort',abort);
   db.prepare('UPDATE solana_archive SET lease=NULL,lease_until=0 WHERE token=? AND lease=?').run(token,lease);
  }
  return status(token)!;
 }
 return {status,evidence,advance,close:()=>db.close()};
}
