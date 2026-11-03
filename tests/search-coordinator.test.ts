import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearchCoordinator,searchRequestUrl} from '../src/lib/search-coordinator';
import type {ScanOptions} from '../src/lib/investigation-service';
import type {InvestigationReport,ScanEvent} from '../src/lib/investigation-types';

const report={chain:'ethereum',token:'0xabc',name:'Independent result'} as InvestigationReport;
function harness(){
 let calls=0,finish!:(r:InvestigationReport)=>void,options!:ScanOptions;
 const service=createSearchCoordinator(async(_chain,_token,input)=>{calls++;options=input;return new Promise<InvestigationReport>((resolve,reject)=>{finish=resolve;input.signal?.addEventListener('abort',()=>reject(input.signal?.reason),{once:true});});});
 return {service,get calls(){return calls;},get options(){return options;},finish:()=>finish(report)};
}
test('ordinary searches reuse server cache; only explicit refresh requests fresh data',()=>{
 const normal=new URL(searchRequestUrl('ethereum','0xabc'),'http://localhost');
 assert.equal(normal.searchParams.has('fresh'),false);
 assert.equal(normal.searchParams.has('expanded'),false);
 assert.equal(new URL(searchRequestUrl('ethereum','0xabc',true),'http://localhost').searchParams.get('fresh'),'1');
});
test('same token searches share one scan, replay current stages and return isolated reports',async()=>{
 const h=harness(),firstEvents:ScanEvent[]=[],secondEvents:ScanEvent[]=[];
 const first=h.service.scan('ethereum','0xAbC',{onEvent:e=>firstEvents.push(e)});
 h.options.onEvent?.({type:'stage',stage:'holders',status:'running',detail:'Reading holders'});
 const second=h.service.scan('ethereum','0xabc',{onEvent:e=>secondEvents.push(e)});
 assert.equal(h.calls,1);assert.deepEqual(secondEvents,firstEvents);
 h.finish();const [a,b]=await Promise.all([first,second]);assert.deepEqual(a,b);assert.notEqual(a,b);
});
test('canceling one subscriber preserves the scan for another; canceling all aborts it',async()=>{
 const h=harness(),a=new AbortController(),b=new AbortController();
 const first=h.service.scan('ethereum','0xabc',{signal:a.signal});
 const second=h.service.scan('ethereum','0xabc',{signal:b.signal});
 a.abort();await assert.rejects(first);assert.equal(h.options.signal?.aborted,false);
 b.abort();await assert.rejects(second);assert.equal(h.options.signal?.aborted,true);
 const replacement=h.service.scan('ethereum','0xabc');assert.equal(h.calls,2);h.finish();await replacement;
});
test('completed jobs are removed so refresh can start a new scan',async()=>{
 const h=harness(),first=h.service.scan('ethereum','0xabc');h.finish();await first;
 const second=h.service.scan('ethereum','0xabc',{fresh:true});assert.equal(h.calls,2);assert.equal(h.options.fresh,true);h.finish();await second;
});
test('pre-canceled searches do no provider work',async()=>{
 const h=harness(),controller=new AbortController();controller.abort();
 await assert.rejects(h.service.scan('ethereum','0xabc',{signal:controller.signal}));assert.equal(h.calls,0);
});
test('explicit refresh cannot reuse a pending ordinary cache lookup',async()=>{
 let calls=0;const service=createSearchCoordinator(async()=>{calls++;return report;});
 await Promise.all([service.scan('ethereum','0xabc'),service.scan('ethereum','0xabc',{fresh:true})]);assert.equal(calls,2);
});
test('Solana case, expanded scope and refresh modes cannot share the wrong job',async()=>{
 let calls=0;
 const service=createSearchCoordinator(async()=>{calls++;return report;});
 await Promise.all([service.scan('solana','Case'),service.scan('solana','case'),service.scan('solana','Case',{expanded:true}),service.scan('solana','Case',{mode:'market'})]);
 assert.equal(calls,4);
});
