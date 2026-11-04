import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {ReportCache,REPORT_CACHE_TTL,REPORT_CACHE_MAX_BYTES,REPORT_CACHE_MAX_REPORT_BYTES} from '../src/lib/report-cache';
import {analyzeInvestigation} from '../src/lib/investigation';
import type {InvestigationReport} from '../src/lib/investigation-types';

const token='0x00000000000000000000000000000000000000ab';
const start=Date.parse('2026-11-02T00:00:00Z');
function report(address=token):InvestigationReport{
 const fetchedAt=new Date(start).toISOString();
 return {chain:'ethereum',token:address,name:'Observed',symbol:'OBS',fetchedAt,market:null,holders:[],holderCount:null,checks:[],sources:[{name:'Public evidence',status:'available',detail:'Observed',fetchedAt}],investigation:analyzeInvestigation({chain:'ethereum',token:address,holders:[],trades:[],transfers:[],identities:[],labels:[],launchVerified:false,complete:false,reasons:[],fetchedAt,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true})};
}
function file(t:{after:(fn:()=>void)=>void}){const dir=mkdtempSync(join(tmpdir(),'traceforge-report-cache-'));t.after(()=>{const path=resolve(dir);assert(path.startsWith(resolve(tmpdir())+sep));rmSync(path,{recursive:true,force:true});});return join(dir,'reports.sqlite');}
test('SQLite reports survive reopen without changing source timestamps or extending expiry',t=>{
 let now=start;const path=file(t);let cache=new ReportCache(path,{now:()=>now});
 const original=report();cache.set('ethereum',token,100,{report:original,expires:start+REPORT_CACHE_TTL});cache.close();
 now+=1000;cache=new ReportCache(path,{now:()=>now});
 assert.deepEqual(cache.get('ethereum',token.toUpperCase().replace('0X','0x'),100),{report:JSON.parse(JSON.stringify(original)),expires:start+REPORT_CACHE_TTL});
 const hit=cache.get('ethereum',token,100)!;hit.report.name='Changed';assert.equal(cache.get('ethereum',token,100)?.report.name,'Observed');
 assert.equal(cache.get('ethereum',token,200),null);assert.equal(cache.get('base',token,100),null);
 now=start+REPORT_CACHE_TTL;assert.equal(cache.get('ethereum',token,100),null);cache.close();
});
test('invalid reports, provider ratings, fixtures, mismatched scope and unavailable-only reports are not stored',t=>{
 const cache=new ReportCache(file(t),{now:()=>start});
 const invalid=[{...report(),fixture:true},{...report(),providerAnalysis:{}},{...report(),token:token.replace('ab','ac')},{...report(),chain:'base'},{...report(),sources:[{name:'Offline',status:'unavailable',detail:'Offline'}]},{...report(),investigation:{}}];
 for(const item of invalid){cache.set('ethereum',token,100,{report:item as InvestigationReport,expires:start+REPORT_CACHE_TTL});assert.equal(cache.get('ethereum',token,100),null);}
 cache.close();
});
test('bad schema versions and corrupt JSON are cache misses; a corrupt database cannot break reads',t=>{
 const path=file(t),cache=new ReportCache(path,{now:()=>start});
 cache.set('ethereum',token,100,{report:report(),expires:start+REPORT_CACHE_TTL});
 const db=new DatabaseSync(path);db.exec('UPDATE report_cache SET schema_version=999');assert.equal(cache.get('ethereum',token,100),null);
 cache.set('ethereum',token,100,{report:report(),expires:start+REPORT_CACHE_TTL});db.exec("UPDATE report_cache SET report_json='{bad'");assert.equal(cache.get('ethereum',token,100),null);db.close();cache.close();
 writeFileSync(path,'not a sqlite database');const broken=new ReportCache(path,{now:()=>start});assert.equal(broken.get('ethereum',token,100),null);assert.doesNotThrow(()=>broken.set('ethereum',token,100,{report:report(),expires:start+REPORT_CACHE_TTL}));broken.close();
});
test('valid JSON with wrong identity, provider origin or malformed evidence is rejected on read',t=>{
 const path=file(t),cache=new ReportCache(path,{now:()=>start});
 cache.set('ethereum',token,100,{report:report(),expires:start+REPORT_CACHE_TTL});const db=new DatabaseSync(path);
 for(const changed of [{...report(),chain:'base'},{...report(),token:token.replace('ab','ac')},{...report(),fixture:true},{...report(),providerAnalysis:{}},{...report(),investigation:{...report().investigation,wallets:[null]}}]){
  db.prepare('UPDATE report_cache SET report_json=?').run(JSON.stringify(changed));assert.equal(cache.get('ethereum',token,100),null);
 }
 db.close();cache.close();
});
test('persistent cache enforces row and aggregate byte bounds and rejects oversized entries',t=>{
 const path=file(t),cache=new ReportCache(path,{now:()=>start});
 for(let i=1;i<=40;i++){const address=`0x${i.toString(16).padStart(40,'0')}`;cache.set('ethereum',address,100,{report:report(address),expires:start+REPORT_CACHE_TTL});}
 const db=new DatabaseSync(path);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM report_cache').get()?.n,32);
 for(let i=41;i<=48;i++){const address=`0x${i.toString(16).padStart(40,'0')}`;cache.set('ethereum',address,100,{report:{...report(address),name:'x'.repeat(10_000_000)},expires:start+REPORT_CACHE_TTL});}
 assert(Number(db.prepare('SELECT SUM(bytes) AS n FROM report_cache').get()?.n)<=REPORT_CACHE_MAX_BYTES);
 assert(Number(db.prepare('SELECT COUNT(*) AS n FROM report_cache').get()?.n)<8);
 cache.set('ethereum',token,100,{report:{...report(),name:'x'.repeat(REPORT_CACHE_MAX_REPORT_BYTES)},expires:start+REPORT_CACHE_TTL});assert.equal(cache.get('ethereum',token,100),null);db.close();cache.close();
});

test('reports predating custody, explicit decision output or Pons qualification are invalidated for ordinary searches',t=>{const path=file(t),cache=new ReportCache(path,{now:()=>start});cache.set('ethereum',token,100,{report:report(),expires:start+REPORT_CACHE_TTL});const db=new DatabaseSync(path);for(const version of [6,7,8,9,10,11,12]){db.exec(`UPDATE report_cache SET schema_version=${version}`);assert.equal(cache.get('ethereum',token,100),null);}db.close();cache.close();});
