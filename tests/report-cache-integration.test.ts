import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import type {Report} from '../src/lib/analysis';
import type {CachedReport} from '../src/lib/report-cache';
import {ReportCache} from '../src/lib/report-cache';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
const token='0x0000000000000000000000000000000000000001';
const initial=Date.parse('2026-11-02T00:00:00Z');
const publicReport:Report={chain:'ethereum',token,name:'Stored',symbol:'STO',fetchedAt:new Date(initial).toISOString(),market:null,holders:[],holderCount:null,checks:[],sources:[{name:'Public',status:'available',detail:'Observed',fetchedAt:new Date(initial).toISOString()}]};
const makeClient=()=>({configured:false,request:async()=>null});
test('new service instances reuse injected persistence, fresh bypasses it and expiry never slides',async()=>{
 let calls=0,now=initial,saved:CachedReport|null=null;
 const persistentCache={get:()=>saved,set:(_c:unknown,_t:unknown,_l:unknown,entry:CachedReport)=>{saved=structuredClone(entry);}};
 const create=()=>createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return {...publicReport,fetchedAt:new Date(now).toISOString()};},makeClient,persistentCache});
 const first=await create().scan('ethereum',token);assert.equal(calls,1);
 now+=1000;const resumed=create();assert.deepEqual(await resumed.scan('ethereum',token),first);assert.equal(calls,1);
 assert.equal(saved!.expires,initial+600000);assert.deepEqual(resumed.cachedReport('ethereum',token),first);
 await resumed.scan('ethereum',token,{fresh:true});assert.equal(calls,2);
 now+=600000;await create().scan('ethereum',token);assert.equal(calls,3);
});
test('persistence failures do not break live scans and unavailable-only results are not persisted',async()=>{
 let writes=0;
 const service=createInvestigationService({publicScan:async()=>publicReport,makeClient,persistentCache:{get:()=>{throw Error('broken');},set:()=>{throw Error('full');}}});
 assert.equal((await service.scan('ethereum',token)).name,'Stored');
 const unavailable=createInvestigationService({publicScan:async()=>({...publicReport,sources:[]}),makeClient,persistentCache:{get:()=>null,set:()=>{writes++;}}});
 await unavailable.scan('ethereum',token);assert.equal(writes,0);
});
test('superseded deep scans cannot persist over a newer revision',async()=>{
 let calls=0,finish!:(report:Report)=>void,saved:CachedReport|null=null;
 const service=createInvestigationService({publicScan:async()=>++calls===1?new Promise<Report>(resolve=>{finish=resolve;}):{...publicReport,name:'New'},makeClient,persistentCache:{get:()=>null,set:(_c,_t,_l,entry)=>{saved=entry;}}});
 const old=service.scan('ethereum',token,{fresh:true});await service.scan('ethereum',token,{fresh:true});finish({...publicReport,name:'Old'});await old;assert.equal(saved!.report.name,'New');
});
test('a restarted service loads a real SQLite report without calling providers and expires on schedule',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'traceforge-report-integration-'));t.after(()=>{assert(resolve(dir).startsWith(resolve(tmpdir())+sep));rmSync(dir,{recursive:true,force:true});});
 const path=join(dir,'reports.sqlite');let now=initial,calls=0;
 let storage=new ReportCache(path,{now:()=>now});
 const create=()=>createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return publicReport;},makeClient,persistentCache:storage});
 const original=await create().scan('ethereum',token);storage.close();
 now+=599999;storage=new ReportCache(path,{now:()=>now});const restarted=create();
 assert.deepEqual(await restarted.scan('ethereum',token),JSON.parse(JSON.stringify(original)));assert.equal(calls,1);
 now++;await restarted.scan('ethereum',token);assert.equal(calls,2);storage.close();
});
test('fresh after restart calls providers and preserves the persisted baseline on total outage',async()=>{
 let saved:CachedReport|null=null,writes=0;
 const persistentCache={get:()=>saved,set:(_c:unknown,_t:unknown,_l:unknown,entry:CachedReport)=>{saved=entry;writes++;}};
 await createInvestigationService({now:()=>initial,publicScan:async()=>publicReport,makeClient,persistentCache}).scan('ethereum',token);
 let calls=0;const restarted=createInvestigationService({now:()=>initial+1000,publicScan:async()=>{calls++;return {...publicReport,sources:[]};},makeClient,persistentCache});
 await assert.rejects(restarted.scan('ethereum',token,{fresh:true}),/previous report/);assert.equal(calls,1);assert.equal(writes,1);
 assert.equal((await restarted.scan('ethereum',token)).name,'Stored');assert.equal(calls,1);
});
