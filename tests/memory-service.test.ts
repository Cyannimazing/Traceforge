import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import type {Report} from '../src/lib/analysis';

const at='2026-11-04T10:00:00.000Z',token='0x'+'1'.repeat(40),wallet='0x'+'2'.repeat(40);
const publicReport:Report={chain:'ethereum',token,name:'Token',symbol:'T',fetchedAt:at,market:null,holders:[{address:wallet,share:10,contract:false,locked:null,tag:''}],holderCount:1,checks:[],sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:'Current snapshot'}]};

test('deep scan starts independent memory while activity is still running and attaches its scope before verdicts',async()=>{
 let called=0,releaseActivity:()=>void=()=>{};
 const pendingActivity=new Promise<void>(resolve=>{releaseActivity=resolve;});
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>structuredClone(publicReport),makeClient:()=>({configured:false,request:async()=>null}),
  enrichSnapshot:async()=>{await pendingActivity;return {};},
  crossTokenMemory:async(report:any)=>{called++;assert.equal(report.token,token);assert.equal(report.holders[0].address,wallet);releaseActivity();return {version:1,chain:'ethereum',token,observedAt:at,status:'partial',records:[],scope:{selectedWallets:1,queriedWallets:1,candidateTokens:0,verifiedTransactions:0,truncated:true},reasons:['A bounded search does not certify absence.']};},
 } as any);
 const abort=new AbortController(),timeout=setTimeout(()=>{releaseActivity();abort.abort();},1000);
 try{const events:string[]=[];const result=await service.scan('ethereum',token,{signal:abort.signal,onEvent:e=>{if(e.type==='stage')events.push(e.stage);}});
 assert.equal(called,1);assert.equal((result as any).crossTokenMemory.scope.queriedWallets,1);assert(events.includes('cross-token-memory'));assert(result.sources.some(s=>s.name==='Independent cross-token memory'));assert.equal(result.investigation.relationships.length,0);
 }finally{clearTimeout(timeout);}
});

test('memory failure returns the independently available report without carrying a previous memory claim',async()=>{
 let fail=false;
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>structuredClone(publicReport),makeClient:()=>({configured:false,request:async()=>null}),crossTokenMemory:async()=>{if(fail)throw Error('private provider URL must never escape');return {version:1,chain:'ethereum',token,observedAt:at,status:'partial',records:[],scope:{selectedWallets:1,queriedWallets:1,candidateTokens:0,verifiedTransactions:0,truncated:true},reasons:[]};}} as any);
 await service.scan('ethereum',token);fail=true;
 const result=await service.scan('ethereum',token,{fresh:true});assert.equal((result as any).crossTokenMemory?.status,'unavailable');assert.equal((result as any).crossTokenMemory?.records.length,0);assert.equal(JSON.stringify(result).includes('private provider URL'),false);
});

test('market and holder refreshes do not start a new historical memory crawl',async()=>{
 let called=0;const service=createInvestigationService({publicScan:async()=>structuredClone(publicReport),makeClient:()=>({configured:false,request:async()=>null}),crossTokenMemory:async()=>{called++;throw Error('unexpected');}} as any);
 await service.scan('ethereum',token,{mode:'market'});await service.scan('ethereum',token,{mode:'holders'});assert.equal(called,0);
});

test('a slow holder scan reserves time to return the report before the streaming deadline',async(t)=>{
 let wallTime=1000,budget:number|undefined,activityBudget:number|undefined;
 t.mock.method(Date,'now',()=>wallTime);
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>{wallTime+=89_000;return structuredClone(publicReport);},makeClient:()=>({configured:false,request:async()=>null}),enrichSnapshot:async(_report:any,options:any)=>{activityBudget=options.timeoutMs;return {};},crossTokenMemory:async(_report:any,options:any)=>{budget=options.deadlineMs;return {version:1,chain:'ethereum',token,observedAt:at,status:'partial',records:[],scope:{selectedWallets:1,queriedWallets:0,candidateTokens:0,verifiedTransactions:0,truncated:true},reasons:['Remaining scan budget reached.']};}} as any);
 const result=await service.scan('ethereum',token);
 assert.equal(budget,14_000);
 assert.equal(activityBudget,14_000);
 assert.equal(result.token,token);
});
