import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {CHAINS,type Chain} from './analysis';
import type {MemoryBlock,MemoryEvent,VerifiedMemoryRecord} from './cross-token-memory';

export interface MemoryProofCache {get(chain:Chain,addresses:string[]):VerifiedMemoryRecord[];set(records:VerifiedMemoryRecord[]):void}
const MAX_RECORDS=256,MAX_RECORD_BYTES=256*1024,MAX_BYTES=16*1024*1024,TTL=30*86400000;
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const norm=(v:string)=>v.toLowerCase();
const validAddress=(v:unknown):v is string=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)&&norm(v)!=='0x000000000000000000000000000000000000dead';
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const raw=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n;
function clean(value:unknown):VerifiedMemoryRecord|null{
 try{
  const r=value as VerifiedMemoryRecord;
  if(!r||!(r.chain in CHAINS)||r.chain==='solana'||r.source!=='configured-rpc'||!validAddress(r.token)||typeof r.chainId!=='string'||r.chainId.length>20||! /^(?:[1-9]\d*|0x[0-9a-f]+)$/i.test(r.chainId)||BigInt(r.chainId)!==BigInt(CHAINS[r.chain].id!)||!Number.isFinite(Date.parse(r.verifiedAt))||!Array.isArray(r.connections)||!r.connections.length||r.connections.length>128)return null;
  const token=norm(r.token),headers=new Map<string,string>();
  const block=(b:MemoryBlock):MemoryBlock=>{
   if(!b||typeof b.number!=='string'||!HEX.test(b.number)||b.number.length>16||BigInt(b.number)>BigInt(Number.MAX_SAFE_INTEGER)||typeof b.hash!=='string'||!HASH.test(b.hash)||!Number.isFinite(Date.parse(b.timestamp))||Date.parse(b.timestamp)<=0||Date.parse(b.timestamp)>Date.parse(r.verifiedAt)+120000)throw Error('shape');
   const number='0x'+BigInt(b.number).toString(16),hash=norm(b.hash),prior=headers.get(number),identity=hash+':'+Date.parse(b.timestamp);if(prior&&prior!==identity)throw Error('anchor');headers.set(number,identity);return {number,hash,timestamp:b.timestamp};
  };
  const anchor=block(r.anchor),within=(b:MemoryBlock)=>{const out=block(b);if(BigInt(out.number)>BigInt(anchor.number)||Date.parse(out.timestamp)>Date.parse(anchor.timestamp))throw Error('range');return out;};
  const event=(e:MemoryEvent):MemoryEvent=>{
   if(!e||!['erc20','native'].includes(e.kind)||!validAddress(e.from)||!validAddress(e.to)||norm(e.from)===norm(e.to)||!validAddress(e.initiator)||!raw(e.amountRaw)||typeof e.transaction!=='string'||!HASH.test(e.transaction)||!(e.kind==='erc20'?typeof e.token==='string'&&norm(e.token)===token&&integer(e.logIndex):e.logIndex===null&&['native',r.chain==='bsc'?'BNB':'ETH'].includes(e.token)))throw Error('event');
   return {kind:e.kind,token:e.kind==='erc20'?token:e.token,from:norm(e.from),to:norm(e.to),initiator:norm(e.initiator),amountRaw:e.amountRaw,transaction:norm(e.transaction),block:within(e.block),logIndex:e.logIndex};
  };
  const connections=r.connections.map(c=>{
   if(!c||!Array.isArray(c.participants)||c.participants.length!==2||c.senderFanout?.complete!==true||!integer(c.senderFanout.recipients)||c.senderFanout.recipients<1||c.senderFanout.recipients>20)throw Error('connection');
   const connectionEvent=event(c.event);
   if(connectionEvent.initiator!==connectionEvent.from)throw Error('sender');
   const participants=c.participants.map(p=>{
    const h=p?.holding;
    if(!p||!validAddress(p.address)||norm(p.address)===token||typeof p.code!=='string'||!(p.code==='0x'||/^0xef0100[0-9a-f]{40}$/i.test(p.code))||!h||!raw(h.balanceRaw)||!raw(h.totalSupplyRaw)||BigInt(h.balanceRaw)>BigInt(h.totalSupplyRaw)||BigInt(h.balanceRaw)*10000n<BigInt(h.totalSupplyRaw)||!integer(h.decimals)||h.decimals>255)throw Error('participant');
    const activity=event(p.activity),address=norm(p.address);if(activity.kind!=='erc20'||activity.initiator!==address||![activity.from,activity.to].includes(address))throw Error('participation');
    return {address,activity,holding:{block:within(h.block),balanceRaw:h.balanceRaw,totalSupplyRaw:h.totalSupplyRaw,decimals:h.decimals},code:p.code};
   });
   const addresses=new Set(participants.map(p=>p.address));if(addresses.size!==2||!addresses.has(connectionEvent.from)||!addresses.has(connectionEvent.to))throw Error('endpoints');
   return {event:connectionEvent,participants,senderFanout:{complete:true,recipients:c.senderFanout.recipients}};
  });
  return {chain:r.chain,chainId:CHAINS[r.chain].id!,token,anchor,verifiedAt:r.verifiedAt,source:'configured-rpc',connections};
 }catch{return null;}
}
const key=(r:VerifiedMemoryRecord)=>`${r.chain}:${r.token}:${[...new Set(r.connections.flatMap(c=>[c.event.from,c.event.to]))].sort().join(':')}`;

/** Optional bounded nomination storage. A cache hit is NEVER current proof:
 * callers must independently reverify receipts/state/canonical anchors. Reads
 * preserve verifiedAt verbatim. Storage errors expose no local paths or secrets. */
export class CrossTokenMemoryStore implements MemoryProofCache {
 private db?:DatabaseSync;private disabled=false;private readonly now:()=>number;
 constructor(private readonly filePath:string,options:{now?:()=>number}={}){this.now=options.now||Date.now;}
 private database(){
  if(this.disabled)return; if(this.db)return this.db;
  try{const path=resolve(this.filePath);mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path,{timeout:100,allowExtension:false});this.db=db;db.exec('PRAGMA journal_mode=DELETE; PRAGMA max_page_count=5120; CREATE TABLE IF NOT EXISTS cross_token_memory (cache_key TEXT PRIMARY KEY, version INTEGER NOT NULL, chain TEXT NOT NULL, stored_at INTEGER NOT NULL, bytes INTEGER NOT NULL, record_json TEXT NOT NULL)');return db;}catch{this.close();this.disabled=true;return;}
 }
 get(chain:Chain,addresses:string[]):VerifiedMemoryRecord[]{
  if(!(chain in CHAINS)||chain==='solana'||!Array.isArray(addresses))return [];
  const selected=new Set(addresses.slice(0,10000).filter(validAddress).map(norm));if(selected.size<2)return [];
  try{const now=this.now(),rows=this.database()?.prepare('SELECT cache_key,record_json FROM cross_token_memory WHERE chain=? AND version=1 AND stored_at>? AND stored_at<=? AND bytes<=? AND length(CAST(record_json AS BLOB))<=? ORDER BY stored_at DESC,cache_key ASC LIMIT ?').all(chain,now-TTL,now,MAX_RECORD_BYTES,MAX_RECORD_BYTES,MAX_RECORDS)||[];
   return rows.flatMap(row=>{if(typeof row.record_json!=='string')return [];const r=clean(JSON.parse(row.record_json));if(!r||r.chain!==chain||key(r)!==row.cache_key)return [];const members=new Set(r.connections.flatMap(c=>[c.event.from,c.event.to]).filter(a=>selected.has(a)));return members.size>=2?[r]:[];});
  }catch{return [];}
 }
 set(records:VerifiedMemoryRecord[]):void{
  if(!Array.isArray(records))return;
  for(const candidate of records.slice(0,MAX_RECORDS))try{
   // Check the entire input before whitelisting: unknown huge fields must not
   // cause unbounded temporary storage or become a covert persisted payload.
   if(Buffer.byteLength(JSON.stringify(candidate),'utf8')>MAX_RECORD_BYTES)continue;
   const r=clean(candidate);if(!r)continue;const text=JSON.stringify(r),bytes=Buffer.byteLength(text,'utf8'),db=this.database();if(!db||bytes>MAX_RECORD_BYTES)continue;
   const now=this.now();db.prepare('INSERT OR REPLACE INTO cross_token_memory VALUES(?,1,?,?,?,?)').run(key(r),r.chain,now,bytes,text);
   db.prepare('DELETE FROM cross_token_memory WHERE stored_at<=? OR stored_at>?').run(now-TTL,now);
   db.exec(`DELETE FROM cross_token_memory WHERE cache_key NOT IN (SELECT cache_key FROM cross_token_memory ORDER BY stored_at DESC,cache_key DESC LIMIT ${MAX_RECORDS})`);
   while(Number(db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM cross_token_memory').get()?.bytes)>MAX_BYTES)db.exec('DELETE FROM cross_token_memory WHERE cache_key=(SELECT cache_key FROM cross_token_memory ORDER BY stored_at ASC,cache_key ASC LIMIT 1)');
  }catch{/* Optional cache failure cannot fail the scan. */}
 }
 close(){try{this.db?.close();}catch{}this.db=undefined;}
}
