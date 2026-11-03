import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {validateToken,type Chain} from './analysis';
import type {InvestigationReport} from './investigation-types';

export const REPORT_CACHE_TTL=10*60_000;
export const REPORT_CACHE_MAX_REPORT_BYTES=16*1024*1024;
export const REPORT_CACHE_MAX_BYTES=64*1024*1024;
const SCHEMA_VERSION=5,MAX_ENTRIES=32;
export type CachedReport={expires:number;report:InvestigationReport};
export type PersistentReportCache={get:(chain:Chain,token:string,limit:number)=>CachedReport|null;set:(chain:Chain,token:string,limit:number,entry:CachedReport)=>void};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const canonical=(chain:Chain,token:string)=>chain==='solana'?token:token.toLowerCase();
function key(chain:Chain,token:string,limit:number){
 if(validateToken(chain,token)||![100,200].includes(limit))return null;
 return `${chain}:${canonical(chain,token)}:${limit}`;
}
function validReport(value:unknown,chain:Chain,token:string,limit:number):value is InvestigationReport{
 if(!object(value)||value.fixture||value.providerAnalysis!==undefined||value.chain!==chain||typeof value.token!=='string'||canonical(chain,value.token)!==canonical(chain,token))return false;
 if(typeof value.name!=='string'||typeof value.symbol!=='string'||typeof value.fetchedAt!=='string'||!Number.isFinite(Date.parse(value.fetchedAt)))return false;
 if(!Array.isArray(value.holders)||!Array.isArray(value.checks)||!Array.isArray(value.sources)||!value.sources.every(s=>object(s)&&typeof s.name==='string'&&typeof s.detail==='string'&&['available','unavailable','unsupported'].includes(String(s.status)))||!value.sources.some(s=>s.status==='available')||value.sources.some(s=>/swarm/i.test(s.name)))return false;
 const investigation=value.investigation;
 if(!object(investigation)||!['wallets','relationships','evidence','timeline','findings'].every(name=>Array.isArray(investigation[name])&&(investigation[name] as unknown[]).every(object)))return false;
 const coverage=investigation.coverage,assessment=investigation.assessment;
 return object(coverage)&&coverage.holderLimit===limit&&Array.isArray(coverage.reasons)&&coverage.reasons.every(reason=>typeof reason==='string')&&typeof coverage.fetchedAt==='string'&&Number.isFinite(Date.parse(coverage.fetchedAt))&&['complete','partial','unavailable'].includes(String(coverage.status))&&object(assessment)&&['critical','caution','insufficient','clear'].includes(String(assessment.status))&&typeof assessment.title==='string'&&typeof assessment.summary==='string';
}

/** Optional, bounded local storage. A miss or storage failure always falls back to a live scan.
 * Bump SCHEMA_VERSION whenever persisted report interpretation becomes incompatible.
 * Opening is lazy: importing the server module never creates a build-time database.
 */
export class ReportCache implements PersistentReportCache{
 private db?:DatabaseSync;
 private disabled=false;
 private readonly now:()=>number;
 constructor(private readonly filePath:string,options:{now?:()=>number}={}){this.now=options.now||Date.now;}
 private database():DatabaseSync|undefined{
  if(this.disabled)return;
  if(this.db)return this.db;
  let db:DatabaseSync|undefined;
  try{
   const path=resolve(this.filePath);mkdirSync(dirname(path),{recursive:true});
   db=new DatabaseSync(path,{timeout:100,allowExtension:false});
   // Payloads stay below 64 MiB; the file is also capped at 80 MiB including indexes.
   db.exec('PRAGMA journal_mode=DELETE; PRAGMA max_page_count=20480;');
   db.exec('CREATE TABLE IF NOT EXISTS report_cache (cache_key TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, saved_at INTEGER NOT NULL, expires INTEGER NOT NULL, report_at INTEGER NOT NULL, bytes INTEGER NOT NULL, report_json TEXT NOT NULL)');
   return this.db=db;
  }catch{try{db?.close();}catch{}this.disabled=true;return;}
 }
 get(chain:Chain,token:string,limit:number):CachedReport|null{
  try{
   const cacheKey=key(chain,token,limit);if(!cacheKey)return null;
   const db=this.database();if(!db)return null;const now=this.now();
   const row=db.prepare('SELECT * FROM report_cache WHERE cache_key=? AND schema_version=? AND expires>? AND bytes<=? AND length(CAST(report_json AS BLOB))<=?').get(cacheKey,SCHEMA_VERSION,now,REPORT_CACHE_MAX_REPORT_BYTES,REPORT_CACHE_MAX_REPORT_BYTES);
   if(!row||typeof row.expires!=='number'||typeof row.saved_at!=='number'||row.saved_at>now||row.expires>row.saved_at+REPORT_CACHE_TTL||typeof row.report_json!=='string')return null;
   const report:unknown=JSON.parse(row.report_json);if(!validReport(report,chain,token,limit))return null;
   return {report,expires:row.expires};
  }catch{return null;}
 }
 set(chain:Chain,token:string,limit:number,entry:CachedReport):void{
  let db:DatabaseSync|undefined,transaction=false;
  try{
   const cacheKey=key(chain,token,limit),now=this.now();
   if(!cacheKey||!Number.isFinite(entry.expires)||entry.expires<=now||entry.expires>now+REPORT_CACHE_TTL||!validReport(entry.report,chain,token,limit))return;
   const json=JSON.stringify(entry.report, (name,value)=>{
    if(/^(api[-_]?key|authorization|cookie|password|secret|access[-_]?token|refresh[-_]?token|rpc[-_]?url|credentials)$/i.test(name))throw Error('Not report evidence');
    return value;
   });
   const bytes=Buffer.byteLength(json);if(bytes>REPORT_CACHE_MAX_REPORT_BYTES)return;
   db=this.database();if(!db)return;
   db.exec('BEGIN IMMEDIATE');transaction=true;
   db.prepare('DELETE FROM report_cache WHERE expires<=? OR schema_version<>?').run(now,SCHEMA_VERSION);
   const previous=db.prepare('SELECT report_at FROM report_cache WHERE cache_key=?').get(cacheKey);
   const reportAt=Date.parse(entry.report.fetchedAt);
   if(!previous||Number(previous.report_at)<=reportAt){
    db.prepare('DELETE FROM report_cache WHERE cache_key=?').run(cacheKey);
    const rows=db.prepare('SELECT cache_key,bytes FROM report_cache ORDER BY saved_at ASC,rowid ASC').all();
    let size=rows.reduce((sum,row)=>sum+Number(row.bytes),0),count=rows.length;
    for(const row of rows){if(count<MAX_ENTRIES&&size+bytes<=REPORT_CACHE_MAX_BYTES)break;db.prepare('DELETE FROM report_cache WHERE cache_key=?').run(String(row.cache_key));size-=Number(row.bytes);count--;}
    db.prepare('INSERT INTO report_cache VALUES (?,?,?,?,?,?,?)').run(cacheKey,SCHEMA_VERSION,now,entry.expires,reportAt,bytes,json);
   }
   db.exec('COMMIT');transaction=false;
  }catch{if(transaction)try{db?.exec('ROLLBACK');}catch{}}
 }
 close(){try{this.db?.close();}catch{}this.db=undefined;this.disabled=true;}
}
