import {DatabaseSync} from 'node:sqlite';import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';import {dirname,resolve} from 'node:path';
import {validateToken} from './analysis';import type {PublicHistoryResult} from './public-history';import type {TransferRecord} from './investigation';
type Chain='ethereum'|'base';type Row=Record<string,unknown>;
export type EvmTransferArchiveStatus={chain:Chain;token:string;status:'idle'|'partial'|'exhausted'|'cooldown'|'running';transactions:number;pages:number;trades:0;transfers:number;updatedAt?:string;retryAt?:number;hasMore:boolean;message:string;finalizedBlock:number|null;fromBlock:number;headChecks:number;indexComplete:boolean};
const source='Alchemy ERC20 transfer index (not receipt-verified)';
const object=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const address=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v)?v.toLowerCase():'';
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{64}$/.test(v)?v.toLowerCase():'';
const hex=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-fA-F]{1,64}$/.test(v)?BigInt(v):undefined;
const usableUrl=(value?:string)=>{try{const url=new URL(value||'');return url.protocol==='https:'&&/(^|\.)alchemy\.com$/.test(url.hostname);}catch{return false;}};

/** Durable provider-index pagination. No buy, sniper or funding inference is
 * produced from ERC20 transfers. Each page is committed before its cursor moves.
 * Finalized anchor prevents new head activity moving the pagination endpoint.
 */
export function createEvmTransferArchive(options:{dbPath:string;rpcUrls:Partial<Record<Chain,string>>;fetcher?:typeof fetch;now?:()=>number}){
 if(typeof window!=='undefined')throw Error('EVM transfer archive is server-only.');
 const path=resolve(options.dbPath);mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path,{timeout:1500,enableForeignKeyConstraints:true,allowExtension:false}),now=options.now||Date.now,fetcher=options.fetcher||fetch;
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS evm_transfer_jobs(id TEXT PRIMARY KEY,chain TEXT NOT NULL,token TEXT NOT NULL,cursor TEXT,anchor TEXT,anchor_hash TEXT,pages INTEGER NOT NULL DEFAULT 0,transactions INTEGER NOT NULL DEFAULT 0,transfers INTEGER NOT NULL DEFAULT 0,withheld INTEGER NOT NULL DEFAULT 0,exhausted INTEGER NOT NULL DEFAULT 0,retry_at INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '',updated_at TEXT,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS evm_transfer_records(job_id TEXT NOT NULL REFERENCES evm_transfer_jobs(id),id TEXT NOT NULL,timestamp TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(job_id,id));
 CREATE INDEX IF NOT EXISTS evm_transfer_time ON evm_transfer_records(job_id,timestamp,id);
 CREATE TABLE IF NOT EXISTS evm_transfer_transactions(job_id TEXT NOT NULL REFERENCES evm_transfer_jobs(id),hash TEXT NOT NULL,PRIMARY KEY(job_id,hash));
 CREATE TABLE IF NOT EXISTS evm_transfer_cursors(job_id TEXT NOT NULL REFERENCES evm_transfer_jobs(id),cursor TEXT NOT NULL,PRIMARY KEY(job_id,cursor));`);
 const key=(chain:Chain,token:string)=>{if(chain!=='ethereum'&&chain!=='base')throw Error('Transfer index pagination supports configured Ethereum and Base only.');if(validateToken(chain,token))throw Error('Invalid token contract.');return `${chain}:${token.toLowerCase()}`;};
 const row=(id:string)=>db.prepare('SELECT * FROM evm_transfer_jobs WHERE id=?').get(id) as Row|undefined;
 const transaction=<T>(run:()=>T):T=>{db.exec('BEGIN IMMEDIATE');try{const value=run();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 transaction(()=>{if(!db.prepare('PRAGMA table_info(evm_transfer_jobs)').all().some(column=>column.name==='from_block'))db.exec("ALTER TABLE evm_transfer_jobs ADD COLUMN from_block TEXT NOT NULL DEFAULT '0x0'");});
 transaction(()=>{if(!db.prepare('PRAGMA table_info(evm_transfer_jobs)').all().some(column=>column.name==='head_checks'))db.exec('ALTER TABLE evm_transfer_jobs ADD COLUMN head_checks INTEGER NOT NULL DEFAULT 0');});
 const stamp=()=>new Date(now()).toISOString();
 function status(chain:Chain,token:string):EvmTransferArchiveStatus|null{
  const r=row(key(chain,token));if(!r)return null;
  const working=!!r.lease&&Number(r.lease_until)>now();
  return {chain,token:token.toLowerCase(),status:working?'running':Number(r.retry_at)>now()?'cooldown':Number(r.exhausted)?'exhausted':Number(r.pages)?'partial':'idle',transactions:Number(r.transactions),pages:Number(r.pages),trades:0,transfers:Number(r.transfers),hasMore:working||!Number(r.exhausted),message:String(r.message)||'Ready to page the configured transfer index.',finalizedBlock:r.anchor?Number(BigInt(String(r.anchor))):null,fromBlock:Number(BigInt(String(r.from_block))),headChecks:Number(r.head_checks),indexComplete:!working&&!!Number(r.exhausted)&&Number(r.withheld)===0,...(r.updated_at?{updatedAt:String(r.updated_at)}:{}),...(Number(r.retry_at)>now()?{retryAt:Number(r.retry_at)}:{})};
 }
 function evidence(chain:Chain,token:string):PublicHistoryResult|undefined{
  const id=key(chain,token),s=status(chain,token),r=row(id);if(!s?.pages||!r)return undefined;
  const select=(order:'ASC'|'DESC',limit:number)=>db.prepare(`SELECT id,json FROM evm_transfer_records WHERE job_id=? ORDER BY timestamp ${order},id ${order} LIMIT ?`).all(id,limit);
  const selected=s.transfers>3000?[...select('ASC',1500),...select('DESC',1500)]:select('ASC',3000);
  const transfers=[...new Map(selected.map(v=>[v.id,JSON.parse(String(v.json)) as TransferRecord])).values()];
  return {trades:[],transfers,identities:[],labels:[],truncated:true,sources:[{name:source,status:transfers.length?'available':'unavailable',fetchedAt:s.updatedAt,detail:`${s.transfers} indexed transfers saved, ${transfers.length} included in this report. Finalized anchor ${s.finalizedBlock}. ${s.hasMore?'More provider pages remain.':'Provider returned no further pageKey in this anchored index.'}`}],reasons:[
   'This is provider-indexed ERC20 transfer history at a fixed finalized block. Transfers are not receipt-verified buys, sells, acquisition funding or sniper evidence. Native funding and other data sources are separate scopes.',
   `${Number(r.withheld)} invalid or unsupported indexed records were withheld. Provider page exhaustion does not establish complete token-wide history or launch coverage.`,
   ...(s.transfers>3000?['Report subset includes the oldest 1,500 and newest 1,500 indexed transfers; all other saved records remain outside this report analysis.']:[]),s.message]};
 }
 async function advance(chain:Chain,token:string,request:{signal?:AbortSignal;pages?:number;update?:boolean}={}):Promise<EvmTransferArchiveStatus>{
  const id=key(chain,token);request.signal?.throwIfAborted();
  const url=options.rpcUrls[chain];if(!usableUrl(url))throw Error('A configured Alchemy endpoint is required for this chain.');
  const lease=randomUUID(),acquired=transaction(()=>{
   db.prepare('INSERT OR IGNORE INTO evm_transfer_jobs(id,chain,token) VALUES(?,?,?)').run(id,chain,token.toLowerCase());
   const s=status(chain,token)!;if(['running','cooldown'].includes(s.status)||s.status==='exhausted'&&!request.update)return false;
   db.prepare('UPDATE evm_transfer_jobs SET lease=?,lease_until=? WHERE id=?').run(lease,now()+60000,id);return true;
  });
  if(!acquired)return status(chain,token)!;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000),abort=()=>controller.abort(request.signal?.reason);request.signal?.addEventListener('abort',abort,{once:true});
  const owned=()=>{const r=row(id)!;if(r.lease!==lease||Number(r.lease_until)<=now())throw Error('Worker lease expired.');return r;};
  const message=(text:string,retryAt=0)=>transaction(()=>{owned();db.prepare('UPDATE evm_transfer_jobs SET message=?,retry_at=?,updated_at=? WHERE id=?').run(text,retryAt,stamp(),id);});
  let call=0,cooldown=false;
  async function rpc(method:string,params:unknown[]){
   controller.signal.throwIfAborted();const response=await fetcher(url!,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',redirect:'error',signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:++call,method,params})});
   if(response.status===429){const value=response.headers.get('Retry-After'),seconds=Number(value),date=value?Date.parse(value):NaN;const delay=value&&Number.isFinite(seconds)?seconds*1000:Number.isFinite(date)?date-now():60000;message('Provider rate limit reached. Saved pages are retained.',now()+Math.max(1000,Math.min(86400000,delay)));cooldown=true;throw Error('Cooldown');}
   if(!response.ok)throw Error('Historical endpoint unavailable.');
   if(Number(response.headers.get('Content-Length'))>2000000){await response.body?.cancel();throw Error('Historical response exceeded the page bound.');}
   const text=await response.text();if(text.length>2000000)throw Error('Historical response exceeded the page bound.');const payload=object(JSON.parse(text));
   if(payload.error){if(Number(object(payload.error).code)===429){message('Provider RPC rate limit reached. Saved pages are retained.',now()+60000);cooldown=true;}throw Error('Historical endpoint rejected the query.');}return payload.result;
  }
  try{
   const chainId=await rpc('eth_chainId',[]);if(chainId!==(chain==='ethereum'?'0x1':'0x2105'))throw Error('Configured endpoint chain mismatch.');
   const previous=owned(),head=object(await rpc('eth_getBlockByNumber',[previous.anchor||'finalized',false])),block=hex(head.number),blockHash=hash(head.hash);
   if(block===undefined||block>BigInt(Number.MAX_SAFE_INTEGER)||!blockHash||previous.anchor_hash&&previous.anchor_hash!==blockHash)throw Error('Finalized anchor invalid or changed.');
   if(!previous.anchor)transaction(()=>{owned();db.prepare('UPDATE evm_transfer_jobs SET anchor=?,anchor_hash=?,updated_at=? WHERE id=?').run('0x'+block.toString(16),blockHash,stamp(),id);});
   let noNewer=false;
   if(request.update&&previous.anchor&&Number(previous.exhausted)){
    const latest=object(await rpc('eth_getBlockByNumber',['finalized',false])),latestBlock=hex(latest.number),latestHash=hash(latest.hash);
    if(latestBlock===undefined||latestBlock>BigInt(Number.MAX_SAFE_INTEGER)||!latestHash)throw Error('New finalized anchor invalid.');
    if(latestBlock<block)throw Error('Finalized head moved behind the saved anchor.');
    if(latestBlock===block){transaction(()=>{owned();db.prepare('UPDATE evm_transfer_jobs SET head_checks=head_checks+1,retry_at=0,message=?,updated_at=? WHERE id=?').run('No newer finalized block is available. Saved records and the existing anchor are unchanged.',stamp(),id);});noNewer=true;}
    else transaction(()=>{
     owned();db.prepare('DELETE FROM evm_transfer_cursors WHERE job_id=?').run(id);
     db.prepare('UPDATE evm_transfer_jobs SET head_checks=head_checks+1 WHERE id=?').run(id);
     db.prepare('UPDATE evm_transfer_jobs SET from_block=?,anchor=?,anchor_hash=?,cursor=NULL,exhausted=0,retry_at=0,message=?,updated_at=? WHERE id=?').run('0x'+(block+1n).toString(16),'0x'+latestBlock.toString(16),latestHash,'New finalized block range opened. Earlier indexed records are preserved.',stamp(),id);
    });
   }
   for(let page=0;!noNewer&&page<Math.max(1,Math.min(4,Math.floor(request.pages||4)));page++){
    const saved=owned(),cursor=typeof saved.cursor==='string'?saved.cursor:undefined;
    const lower=BigInt(String(saved.from_block)),upper=BigInt(String(saved.anchor));
    const result=object(await rpc('alchemy_getAssetTransfers',[{fromBlock:saved.from_block,toBlock:saved.anchor,contractAddresses:[token.toLowerCase()],category:['erc20'],withMetadata:true,excludeZeroValue:true,order:'asc',maxCount:'0x64',...(cursor?{pageKey:cursor}:{})}]));
    if(!Array.isArray(result.transfers)||result.transfers.length>100)throw Error('Invalid transfer page.');
    if(result.pageKey!=null&&(typeof result.pageKey!=='string'||result.pageKey.length>4096))throw Error('Invalid transfer cursor.');
    const next=typeof result.pageKey==='string'&&result.pageKey?result.pageKey:null;
    controller.signal.throwIfAborted();
    const stop=transaction(()=>{
     const latest=owned();let txs=Number(latest.transactions),records=Number(latest.transfers),withheld=Number(latest.withheld);
     for(const value of result.transfers as unknown[]){
      const item=object(value),raw=object(item.rawContract),metadata=object(item.metadata),amount=hex(raw.value),decimalsRaw=hex(raw.decimal),decimals=decimalsRaw===undefined?NaN:Number(decimalsRaw),at=typeof metadata.blockTimestamp==='string'?metadata.blockTimestamp:'',n=hex(item.blockNum);
      const uniqueId=typeof item.uniqueId==='string'&&item.uniqueId.length<=512?item.uniqueId:'',txHash=hash(item.hash),from=address(item.from),to=address(item.to);
      const failed=item.status==='failed'||item.status==='error'||item.status==='0x0'||item.isError===true||item.success===false;
      if(failed||!uniqueId||!txHash||!from||!to||item.category!=='erc20'||address(raw.address)!==token.toLowerCase()||amount===undefined||amount<=0n||!Number.isInteger(decimals)||decimals<0||decimals>255||!Number.isFinite(Date.parse(at))||n===undefined||n<lower||n>upper){withheld++;continue;}
      const number=Number(amount)/10**decimals;
      if(!Number.isFinite(number)||number<=0){withheld++;continue;}
      const transfer:TransferRecord={id:`alchemy:${txHash}:${uniqueId}`,from,to,timestamp:new Date(at).toISOString(),amountRaw:amount.toString(),decimals,amount:number,token:token.toLowerCase(),native:false,transaction:txHash,source};
      records+=Number(db.prepare('INSERT OR IGNORE INTO evm_transfer_records VALUES(?,?,?,?)').run(id,transfer.id,transfer.timestamp,JSON.stringify(transfer)).changes);
      txs+=Number(db.prepare('INSERT OR IGNORE INTO evm_transfer_transactions VALUES(?,?)').run(id,txHash).changes);
     }
     const repeated=!!next&&!!db.prepare('SELECT 1 FROM evm_transfer_cursors WHERE job_id=? AND cursor=?').get(id,next),stalled=!!next&&(repeated||!(result.transfers as unknown[]).length);
     if(next&&!repeated)db.prepare('INSERT INTO evm_transfer_cursors VALUES(?,?)').run(id,next);
     const msg=stalled?'Provider cursor repeated or stalled. Saved evidence retained; retry with backoff.':!next?'Provider transfer index exhausted through the saved finalized block. Other historical scopes remain unverified.':'Page saved. Continuing the next provider cursor.';
     db.prepare('UPDATE evm_transfer_jobs SET cursor=?,pages=pages+?,transactions=?,transfers=?,withheld=?,exhausted=?,retry_at=?,message=?,updated_at=? WHERE id=?').run(stalled?cursor||null:next,stalled?0:1,txs,records,withheld,next?0:1,stalled?now()+30000:0,msg,stamp(),id);
     return stalled||!next;
    });if(stop)break;
   }
  }catch{
   if(!cooldown)try{message(controller.signal.aborted?'Retrieval stopped at the saved checkpoint.':'Provider retrieval, chain/anchor validation or page decoding failed. The last checkpoint is preserved.');}catch{}
   request.signal?.throwIfAborted();
  }finally{clearTimeout(timer);request.signal?.removeEventListener('abort',abort);db.prepare('UPDATE evm_transfer_jobs SET lease=NULL,lease_until=0 WHERE id=? AND lease=?').run(id,lease);}
  return status(chain,token)!;
 }
 return {status,evidence,advance,configured:(chain:Chain)=>usableUrl(options.rpcUrls[chain]),close:()=>db.close()};
}
