import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {validateToken} from './analysis';

import {TRANSFER_WINDOW_LIMIT,type WindowChain,type TransferWindowStatus,type TransferWindowSummary,type TransferWindowResult} from './transfer-window-types';
export {TRANSFER_WINDOW_LIMIT};export type {WindowChain,TransferWindowStatus,TransferWindowSummary,TransferWindowResult};
type Options={dbPath:string;rpcUrls:Partial<Record<WindowChain,string|undefined>>;fetcher?:typeof fetch;now?:()=>number;limit?:number;explorerTimeoutMs?:number};

const CHAINS:Record<WindowChain,{id:string;finality:'finalized'|'safe';explorer?:string}>={
 ethereum:{id:'0x1',finality:'finalized',explorer:'https://eth.blockscout.com'},
 base:{id:'0x2105',finality:'safe',explorer:'https://base.blockscout.com'},
 robinhood:{id:'0x1237',finality:'safe',explorer:'https://robinhoodchain.blockscout.com'},
 bsc:{id:'0x38',finality:'finalized'},
};
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,HEX=/^0x[0-9a-f]+$/i;
const ZERO='0x'+'0'.repeat(40);
const PAGE=1000,NET_CANDIDATES=300,RECENT_CANDIDATES=100,REFRESH_MS=6*3600_000,LEASE_MS=55_000;
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const addr=(v:unknown)=>typeof v==='string'&&ADDRESS.test(v)&&v.toLowerCase()!==ZERO?v.toLowerCase():null;
const qty=(v:unknown)=>typeof v==='string'&&HEX.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const isAlchemy=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&(u.hostname==='alchemy.com'||u.hostname.endsWith('.alchemy.com'));}catch{return false;}};

/** Bounded newest-first token transfer window, persisted in SQLite. It stores
 * per-address inflow/outflow aggregates only; it nominates candidate holders
 * and never supplies balances (those are read independently by RPC). */
export function createTransferWindow(options:Options){
 if(typeof window!=='undefined')throw Error('Transfer window is server-only.');
 const path=resolve(options.dbPath);mkdirSync(dirname(path),{recursive:true,mode:0o700});
 const db=new DatabaseSync(path,{timeout:1500,allowExtension:false}),now=options.now||Date.now,fetcher=options.fetcher||fetch,limit=Math.max(1,Math.min(TRANSFER_WINDOW_LIMIT,options.limit??TRANSFER_WINDOW_LIMIT));
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS window_jobs(chain TEXT NOT NULL,token TEXT NOT NULL,anchor INTEGER,page_key TEXT,read INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'partial',total INTEGER,newest INTEGER,oldest INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,started INTEGER NOT NULL,updated INTEGER NOT NULL,message TEXT NOT NULL DEFAULT '',PRIMARY KEY(chain,token));
 CREATE TABLE IF NOT EXISTS window_flows(chain TEXT NOT NULL,token TEXT NOT NULL,address TEXT NOT NULL,inflow TEXT NOT NULL DEFAULT '0',outflow TEXT NOT NULL DEFAULT '0',last_in INTEGER NOT NULL DEFAULT -1,PRIMARY KEY(chain,token,address));`);
 type Job={chain:string;token:string;anchor:number|null;page_key:string|null;read:number;status:TransferWindowStatus;total:number|null;newest:number|null;oldest:number|null;retry_at:number;lease_until:number;started:number;updated:number;message:string};
 const getJob=db.prepare('SELECT * FROM window_jobs WHERE chain=? AND token=?');
 const job=(chain:string,token:string)=>getJob.get(chain,token) as Job|undefined;
 const configured=(chain:WindowChain)=>!!options.rpcUrls[chain]&&isAlchemy(options.rpcUrls[chain]!);
 function summary(j:Job|undefined,chain:WindowChain):TransferWindowSummary{
  if(!j)return {limit,read:0,total:null,status:configured(chain)?'partial':'unavailable',anchorBlock:null,newestBlock:null,oldestBlock:null,updatedAt:new Date(now()).toISOString(),detail:configured(chain)?'Transfer window not started.':'An authorized Alchemy endpoint is required to read the transfer window for this chain.'};
  const large=j.status==='capped'||(j.total!==null&&j.total>limit);
  const detail=j.status==='complete'?`All ${j.read.toLocaleString('en-US')} token transfers through block ${j.anchor} were read; the window covers the full history.`
   :large?`Token too large for a full crawl${j.total!==null?` (${j.total.toLocaleString('en-US')} transfers reported)`:''}: real holders are nominated from the most recent ${Math.min(j.read,limit).toLocaleString('en-US')} of ${limit.toLocaleString('en-US')} window transfers through block ${j.anchor}${j.status==='capped'?'':' (still reading)'}. Older history is outside this window.`
   :`${j.read.toLocaleString('en-US')} of up to ${limit.toLocaleString('en-US')} most recent transfers read through block ${j.anchor}; reading continues.`;
  return {limit,read:j.read,total:j.total,status:j.status,anchorBlock:j.anchor,newestBlock:j.newest,oldestBlock:j.oldest,updatedAt:new Date(j.updated).toISOString(),detail:j.message?`${detail} ${j.message}`:detail};
 }
 function candidates(chain:string,token:string):string[]{
  const rows=db.prepare('SELECT address,inflow,outflow,last_in FROM window_flows WHERE chain=? AND token=?').all(chain,token) as {address:string;inflow:string;outflow:string;last_in:number}[];
  const net=rows.map(r=>({address:r.address,net:BigInt(r.inflow)-BigInt(r.outflow),last:r.last_in})).filter(r=>r.net>0n);
  net.sort((a,b)=>b.net>a.net?1:b.net<a.net?-1:a.address.localeCompare(b.address));
  const recent=rows.filter(r=>r.last_in>=0).sort((a,b)=>b.last_in-a.last_in||a.address.localeCompare(b.address));
  return [...new Set([...net.slice(0,NET_CANDIDATES).map(r=>r.address),...recent.slice(0,RECENT_CANDIDATES).map(r=>r.address)])];
 }
 let id=0;
 async function rpc(url:string,method:string,params:unknown[],signal:AbortSignal):Promise<{result?:unknown;retryAfter?:number}>{
  const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),signal,cache:'no-store'});
  if(response.status===429){const r=response.headers.get('retry-after');await response.body?.cancel();return {retryAfter:r&&/^\d+$/.test(r)?Math.min(3600,Number(r)):30};}
  if(!response.ok){await response.body?.cancel();throw Error('rpc');}
  const text=await response.text();if(text.length>4_000_000)throw Error('size');const data=obj(JSON.parse(text));
  if(data.error){if(obj(data.error).code===429)return {retryAfter:30};throw Error('rpc-error');}
  return {result:data.result};
 }
 async function explorerTotal(chain:WindowChain,token:string,signal:AbortSignal):Promise<number|null>{
  const base=CHAINS[chain].explorer;if(!base)return null;
  try{const response=await fetcher(`${base}/api/v2/tokens/${token}/counters`,{signal:AbortSignal.any([signal,AbortSignal.timeout(options.explorerTimeoutMs??6000)]),cache:'no-store'});if(!response.ok){await response.body?.cancel();return null;}
   const value=obj(await response.json()).transfers_count,n=typeof value==='string'&&/^\d{1,15}$/.test(value)?Number(value):typeof value==='number'&&Number.isSafeInteger(value)?value:null;return n!==null&&n>=0?n:null;}catch{signal.throwIfAborted();return null;}
 }
 const upsertFlow=db.prepare(`INSERT INTO window_flows(chain,token,address,inflow,outflow,last_in) VALUES(?,?,?,?,?,?) ON CONFLICT(chain,token,address) DO UPDATE SET inflow=excluded.inflow,outflow=excluded.outflow,last_in=MAX(last_in,excluded.last_in)`);
 const readFlow=db.prepare('SELECT inflow,outflow,last_in FROM window_flows WHERE chain=? AND token=? AND address=?');
 /** Read up to `pages` pages (1,000 transfers each) within the deadline. */
 async function advance(chain:WindowChain,tokenInput:string,opts:{pages?:number;signal?:AbortSignal;deadlineMs?:number}={}):Promise<TransferWindowResult>{
  const token=tokenInput.toLowerCase();if(!CHAINS[chain]||validateToken(chain,token))throw Error('Invalid transfer window request.');
  const url=options.rpcUrls[chain];if(!url||!isAlchemy(url))return {summary:summary(undefined,chain),candidates:[]};
  const signal=AbortSignal.any([...(opts.signal?[opts.signal]:[]),AbortSignal.timeout(Math.max(1000,opts.deadlineMs??45000))]),started=now(),deadline=started+Math.max(1000,opts.deadlineMs??45000);
  let j=job(chain,token);
  // Refresh a finished window periodically so real holders track current activity.
  if(j&&(j.status==='complete'||j.status==='capped')&&now()-j.updated>REFRESH_MS){db.prepare('DELETE FROM window_flows WHERE chain=? AND token=?').run(chain,token);db.prepare('DELETE FROM window_jobs WHERE chain=? AND token=?').run(chain,token);j=undefined;}
  if(j&&j.lease_until>now())return {summary:summary(j,chain),candidates:candidates(chain,token)};
  if(j&&(j.status==='complete'||j.status==='capped'))return {summary:summary(j,chain),candidates:candidates(chain,token)};
  if(j&&j.retry_at>now())return {summary:{...summary(j,chain),status:'cooldown'},candidates:candidates(chain,token)};
  if(!j){
   const anchor=await rpc(url,'eth_getBlockByNumber',[CHAINS[chain].finality,false],signal);const block=obj(anchor.result),number=qty(block.number);
   if(anchor.retryAfter||number===null||!HASH.test(block.hash))return {summary:{...summary(undefined,chain),status:anchor.retryAfter?'cooldown':'unavailable',detail:'The transfer window could not pin a finalized block; real holders use provider candidates only.'},candidates:[]};
   const total=await explorerTotal(chain,token,signal);
   db.prepare('INSERT INTO window_jobs(chain,token,anchor,read,status,total,started,updated) VALUES(?,?,?,0,?,?,?,?)').run(chain,token,number,total===0?'complete':'partial',total,now(),now());
   j=job(chain,token)!;if(j.status==='complete')return {summary:summary(j,chain),candidates:[]};
  }
  db.prepare('UPDATE window_jobs SET lease_until=? WHERE chain=? AND token=?').run(now()+LEASE_MS,chain,token);
  try{
   for(let page=0;page<(opts.pages??20)&&j.read<limit&&now()<deadline-1500;page++){
    const params:Record<string,unknown>={fromBlock:'0x0',toBlock:'0x'+j.anchor!.toString(16),contractAddresses:[token],category:['erc20'],order:'desc',withMetadata:false,excludeZeroValue:true,maxCount:'0x'+Math.min(PAGE,limit-j.read).toString(16)};
    if(j.page_key)params.pageKey=j.page_key;
    const response=await rpc(url,'alchemy_getAssetTransfers',[params],signal);
    if(response.retryAfter){db.prepare('UPDATE window_jobs SET retry_at=?,updated=?,message=? WHERE chain=? AND token=?').run(now()+response.retryAfter*1000,now(),'Provider rate limit reached; reading resumes automatically.',chain,token);j=job(chain,token)!;return {summary:{...summary(j,chain),status:'cooldown'},candidates:candidates(chain,token)};}
    const value=obj(response.result),rows=Array.isArray(value.transfers)?value.transfers:null;if(!rows||rows.length>PAGE)throw Error('Transfer window page malformed.');
    const flows=new Map<string,{inflow:bigint;outflow:bigint;last:number}>();let newest=j.newest,oldest=j.oldest,accepted=0;
    for(const raw of rows){const row=obj(raw),contract=obj(row.rawContract),number=qty(row.blockNum),amount=typeof contract.value==='string'&&HEX.test(contract.value)?BigInt(contract.value):null;
     if(addr(contract.address)!==token||number===null||number>j.anchor!||amount===null||!HASH.test(String(row.hash||'')))continue;
     accepted++;newest=newest===null?number:Math.max(newest,number);oldest=oldest===null?number:Math.min(oldest,number);
     const from=addr(row.from),to=addr(row.to);
     if(to){const f=flows.get(to)||{inflow:0n,outflow:0n,last:-1};f.inflow+=amount;f.last=Math.max(f.last,number);flows.set(to,f);}
     if(from){const f=flows.get(from)||{inflow:0n,outflow:0n,last:-1};f.outflow+=amount;flows.set(from,f);}
    }
    const next=typeof value.pageKey==='string'&&value.pageKey.length<=2048?value.pageKey:null,read=j.read+rows.length;
    const status:TransferWindowStatus=!next?'complete':read>=limit?'capped':'partial';
    db.exec('BEGIN IMMEDIATE');
    try{
     for(const [address,f] of flows){const prior=readFlow.get(chain,token,address) as {inflow:string;outflow:string;last_in:number}|undefined;upsertFlow.run(chain,token,address,(BigInt(prior?.inflow||'0')+f.inflow).toString(),(BigInt(prior?.outflow||'0')+f.outflow).toString(),Math.max(prior?.last_in??-1,f.last));}
     db.prepare('UPDATE window_jobs SET page_key=?,read=?,status=?,newest=?,oldest=?,updated=?,message=?,retry_at=0 WHERE chain=? AND token=?').run(next,read,status,newest,oldest,now(),accepted===rows.length?'':`${rows.length-accepted} malformed rows ignored.`,chain,token);
     db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    j=job(chain,token)!;if(status!=='partial')break;
   }
  }catch(error){if(opts.signal?.aborted)throw error;db.prepare('UPDATE window_jobs SET message=?,updated=? WHERE chain=? AND token=?').run('A transfer window page was unavailable; reading resumes on the next pass.',now(),chain,token);}
  finally{db.prepare('UPDATE window_jobs SET lease_until=0 WHERE chain=? AND token=?').run(chain,token);}
  j=job(chain,token)!;return {summary:summary(j,chain),candidates:candidates(chain,token)};
 }
 function status(chain:WindowChain,tokenInput:string):TransferWindowResult{
  const token=tokenInput.toLowerCase(),j=job(chain,token);return {summary:summary(j,chain),candidates:j?candidates(chain,token):[]};
 }
 return {advance,status,configured,limit};
}
