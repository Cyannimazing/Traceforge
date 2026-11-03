import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import type {CurveTimingProof} from './investigation-types';
import {FOUR_MEME_MANAGER,FOUR_MEME_HISTORY_SOURCE} from './four-meme-history';

export interface PersistentLaunchProofs {
 get(chain:string,token:string):CurveTimingProof|null;
 set(proof:CurveTimingProof):void;
 delete(chain:string,token:string):void;
}
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const positive=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
function clean(value:unknown):CurveTimingProof|null {
 try{
  const p=value as CurveTimingProof;
  if(!p||p.verified!==true||p.scope!=='selected-launchpad'||p.protocol!=='four-meme-v2'||p.chain!=='bsc'||!ADDRESS.test(p.token)||p.manager!==FOUR_MEME_MANAGER||p.source!==FOUR_MEME_HISTORY_SOURCE)return null;
  const first=Date.parse(p.firstPurchaseAt),end=Date.parse(p.windowEndAt),through=Date.parse(p.through.timestamp),verified=Date.parse(p.verifiedAt);
  if(![first,end,through,verified].every(Number.isFinite)||first<=0||end-first!==60000||through<=end||verified<through||!positive(p.creation.blockNumber)||!positive(p.through.blockNumber)||p.through.blockNumber<p.creation.blockNumber||![p.creation.transaction,p.creation.blockHash,p.through.blockHash,p.firstPurchaseTransaction].every(v=>HASH.test(v)))return null;
  if(!Array.isArray(p.eligibleTradeIds)||!p.eligibleTradeIds.length||p.eligibleTradeIds.length>64||!p.eligibleTradeIds.every(v=>/^fourmeme:0x[0-9a-f]{64}:\d+$/i.test(v)))return null;
  // Whitelist canonical anchors only. No wallets, balances, classifications or provider URLs.
  return {verified:true,scope:p.scope,protocol:p.protocol,chain:'bsc',token:p.token.toLowerCase(),manager:FOUR_MEME_MANAGER,firstPurchaseAt:p.firstPurchaseAt,firstPurchaseTransaction:p.firstPurchaseTransaction,windowEndAt:p.windowEndAt,creation:{transaction:p.creation.transaction,blockNumber:p.creation.blockNumber,blockHash:p.creation.blockHash},through:{blockNumber:p.through.blockNumber,blockHash:p.through.blockHash,timestamp:p.through.timestamp},eligibleTradeIds:[...p.eligibleTradeIds],verifiedAt:p.verifiedAt,source:FOUR_MEME_HISTORY_SOURCE};
 }catch{return null;}
}
/** Durable discovery anchors, never a substitute for live proof. Every consumer
 * must re-read canonical headers, receipts and the complete bounded event window.
 * Unlike mutable balance reports these anchors have no freshness TTL. */
export class LaunchProofStore implements PersistentLaunchProofs {
 private db?:DatabaseSync;private disabled=false;
 constructor(private readonly file:string){}
 private database(){
  if(this.disabled)return; if(this.db)return this.db;
  try{const path=resolve(this.file);mkdirSync(dirname(path),{recursive:true});const db=new DatabaseSync(path,{timeout:100,allowExtension:false});this.db=db;db.exec('PRAGMA journal_mode=DELETE; PRAGMA max_page_count=1024; CREATE TABLE IF NOT EXISTS launch_proofs (token TEXT PRIMARY KEY, version INTEGER NOT NULL, saved_at INTEGER NOT NULL, proof TEXT NOT NULL)');return db;}catch{this.close();this.disabled=true;return;}
 }
 get(chain:string,token:string):CurveTimingProof|null {
  if(chain!=='bsc'||!ADDRESS.test(token))return null;
  try{const row=this.database()?.prepare('SELECT proof FROM launch_proofs WHERE token=? AND version=1 AND length(proof)<=16384').get(token.toLowerCase());const p=row&&typeof row.proof==='string'?clean(JSON.parse(row.proof)):null;return p?.token===token.toLowerCase()?p:null;}catch{return null;}
 }
 set(proof:CurveTimingProof){
  const p=clean(proof);if(!p)return;const text=JSON.stringify(p);if(text.length>16384)return;
  try{const db=this.database();if(!db)return;db.prepare('INSERT OR REPLACE INTO launch_proofs(token,version,saved_at,proof) VALUES(?,1,?,?)').run(p.token,Date.now(),text);db.exec('DELETE FROM launch_proofs WHERE token NOT IN (SELECT token FROM launch_proofs ORDER BY saved_at DESC,token LIMIT 128)');}catch{/* Optional storage failure does not invalidate live evidence. */}
 }
 delete(chain:string,token:string){if(chain!=='bsc'||!ADDRESS.test(token))return;try{this.database()?.prepare('DELETE FROM launch_proofs WHERE token=?').run(token.toLowerCase());}catch{}}
 close(){try{this.db?.close();}catch{}this.db=undefined;}
}
