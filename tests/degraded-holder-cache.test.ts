import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import type {Chain,Report} from '../src/lib/analysis';
import type {EvmHolderResult} from '../src/lib/evm-holder-fallback';
import type {CachedReport} from '../src/lib/report-cache';

const initial=Date.parse('2026-11-04T09:00:00Z'),token='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64);
const address=(i:number)=>'0x'+(i+20).toString(16).padStart(40,'0');
const client=()=>({configured:false,request:async()=>null});
function report(chain:Chain,at:number,sources:Report['sources'],count=10):Report{
 return {chain,token,name:'Synthetic token',symbol:'TEST',fetchedAt:new Date(at).toISOString(),market:null,holders:Array.from({length:count},(_,i)=>({address:address(i),share:100/count,contract:false,locked:null,tag:''})),holderCount:null,checks:[],sources};
}
function holderResult(at:number,count:number,complete:boolean|undefined):EvmHolderResult{
 const timestamp=new Date(at).toISOString(),holders=Array.from({length:count},(_,i)=>({address:address(i),share:100/count,balance:1}));
 return {holders,totalSupply:count,trades:[],transfers:[],identities:[],labels:[],reasons:['Trading history remains partial.'],truncated:true,sources:[{name:'EVM RPC holder balances',status:'available',fetchedAt:timestamp,detail:'Independently measured positive candidate balances'}],snapshot:{chain:'robinhood',finality:'safe',blockNumber:100,blockHash:hash,blockTimestamp:timestamp,observedAt:timestamp,decimals:0,totalSupplyRaw:String(count),balances:holders.map(h=>({address:h.address,status:'observed',amountRaw:'1'})),candidateCount:count,...(complete===undefined?{}:{holderEnumeration:{kind:'pons-creation-ledger',recordedAccounts:complete?count:199,verifiedAccounts:count,complete}})}};
}
test('Pons-backed positive fallback and incomplete enumeration retry after thirty seconds',async()=>{
 for(const complete of [undefined,false]){
  let now=initial,calls=0;
  const service=createInvestigationService({now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report('robinhood',now,[{name:'Pons factory launch record',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Verified current factory/token binding'}]);},evmHolders:async()=>holderResult(now,10,complete)});
  const first=await service.scan('robinhood',token);assert.equal(first.holders.length,10);assert.equal(first.holderEnumeration?.complete,complete);
  now=initial+29_000;await service.scan('robinhood',token);assert.equal(calls,1);
  now=initial+31_000;await service.scan('robinhood',token);assert.equal(calls,2,String(complete));
 }
});
test('explicit EVM holder failure with positive fallback retries on all supported EVM holder chains',async()=>{
 for(const chain of ['robinhood','base','ethereum'] as const){let now=initial,calls=0;
  const service=createInvestigationService({now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report(chain,now,[{name:'GoPlus Security',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Positive provider fallback'},{name:'EVM RPC holder balances',status:'unavailable',fetchedAt:new Date(now).toISOString(),detail:'Bounded independent holder request failed'}]);}});
  assert.equal((await service.scan(chain,token)).holders.length,10);now+=29_000;await service.scan(chain,token);assert.equal(calls,1);now+=2_000;await service.scan(chain,token);assert.equal(calls,2,chain);
 }
});
test('complete small and large holder inventories retain ten-minute reuse despite partial trading history',async()=>{
 for(const count of [3,239]){let now=initial,calls=0;
  const service=createInvestigationService({now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report('robinhood',now,[{name:'Pons factory launch record',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Verified current factory/token binding'},{name:'Bitquery history',status:'unavailable',detail:'Historical network unsupported'}]);},evmHolders:async()=>holderResult(now,count,true)});
  const first=await service.scan('robinhood',token);assert.equal(first.holderEnumeration?.complete,true);assert.equal(first.holders.length,count);assert.equal(first.investigation.coverage.launchVerified,false);
  now=initial+31_000;await service.scan('robinhood',token);now=initial+599_999;await service.scan('robinhood',token);assert.equal(calls,1,String(count));now++;await service.scan('robinhood',token);assert.equal(calls,2);
 }
});
test('unrelated missing history and an unavailable Pons lookup do not shorten an ordinary positive snapshot',async()=>{
 let now=initial,calls=0;
 const service=createInvestigationService({now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report('robinhood',now,[{name:'GoPlus Security',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Positive snapshot'},{name:'Pons factory launch record',status:'unavailable',detail:'Not a supported launch'},{name:'Bitquery history',status:'unavailable',detail:'No history provider'}]);}});
 await service.scan('robinhood',token);now+=599_999;await service.scan('robinhood',token);assert.equal(calls,1);now++;await service.scan('robinhood',token);assert.equal(calls,2);
});
test('legacy persisted degraded positive snapshots cannot restore the former ten-minute TTL',async()=>{
 for(const chain of ['robinhood','base'] as const){let now=initial,calls=0,saved:CachedReport|null=null;
  const deps={now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report(chain,now,[{name:'GoPlus Security',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Positive snapshot'},chain==='robinhood'?{name:'Pons factory launch record',status:'available' as const,detail:'Verified launch state',fetchedAt:new Date(now).toISOString()}:{name:'EVM RPC holder balances',status:'unavailable' as const,detail:'Candidate verification unavailable',fetchedAt:new Date(now).toISOString()}]);},persistentCache:{get:()=>saved,set:(_chain:unknown,_token:unknown,_limit:unknown,entry:CachedReport)=>{saved=structuredClone(entry);}}};
  await createInvestigationService(deps).scan(chain,token);assert(saved);(saved as CachedReport).expires=initial+600_000;now=initial+31_000;await createInvestigationService(deps).scan(chain,token);assert.equal(calls,2,chain);
 }
});
test('a failed holder refresh shortens existing reuse and persists that downgrade across service restart',async()=>{
 for(const restart of [false,true]){let now=initial,calls=0,failed=false,saved:CachedReport|null=null;
  const deps={now:()=>now,makeClient:client,publicScan:async()=>{calls++;return report('ethereum',now,[{name:'GoPlus Security',status:'available',fetchedAt:new Date(now).toISOString(),detail:'Positive fallback snapshot'},{name:'EVM RPC holder balances',status:failed?'unavailable' as const:'available' as const,fetchedAt:new Date(now).toISOString(),detail:failed?'Bounded holder read failed':'Current independent holder evidence'}]);},persistentCache:{get:()=>saved,set:(_chain:unknown,_token:unknown,_limit:unknown,entry:CachedReport)=>{saved=structuredClone(entry);}}};
  let service=createInvestigationService(deps);await service.scan('ethereum',token);now+=1000;failed=true;
  const refreshed=await service.scan('ethereum',token,{mode:'holders'});assert(refreshed.holders.length>0);assert.equal(calls,2);
  now+=31_000;if(restart)service=createInvestigationService(deps);await service.scan('ethereum',token);assert.equal(calls,3,String(restart));
 }
});
