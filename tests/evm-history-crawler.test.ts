import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvmHistoryCrawler,evmHistoryCrawlerStep,type EvmCrawlerAction} from '../src/lib/evm-history-crawler';
import type {HistoryView} from '../src/lib/history-view';
const token='0x'+'1'.repeat(40);
const job=(patch:Partial<HistoryView>={}):HistoryView=>({id:'job',chain:'ethereum',token,status:'paused',revision:1,updatedAt:'2026-01-01T00:00:00Z',message:'Saved',poolLimit:100,verifiedPools:0,totalPools:1,completeRegistry:false,discoveryNote:'bounded',registry:{status:'partial',discovered:1,pendingRanges:1,completedRanges:1,anchor:100,detail:'scope'},pools:[],...patch});
test('continues pool batches then incomplete discovery; stops only on exhausted configured scope',()=>{
 assert.equal(evmHistoryCrawlerStep(job(),true,0).action,'resume');assert.equal(evmHistoryCrawlerStep(job({status:'complete'}),true,0).action,'start');
 const done=job({status:'complete',registry:{...job().registry!,status:'complete'}});assert.equal(evmHistoryCrawlerStep(done,true,0).terminal,'scope-complete');
 assert.equal(evmHistoryCrawlerStep({...done,totalPools:1,registry:{...done.registry!,discovered:2}},true,0).terminal,'blocked');
 assert.equal(evmHistoryCrawlerStep(job({retryAt:10000}),true,0).delay,10000);
});
test('one worker sequentially advances multiple batches and automatically applies newly verified pools',async()=>{
 let pending:(()=>void)|undefined;const calls:EvmCrawlerAction[]=[];let resumes=0,applied=0;
 const schedule=(fn:()=>void)=>{pending=fn;return()=>{pending=undefined;};};
 const crawler=createEvmHistoryCrawler({chain:'ethereum',token,schedule,onView:()=>{},onApply:()=>{applied++;},request:async action=>{calls.push(action);if(action==='GET')return {job:job()};if(action==='resume'){resumes++;return {job:job(resumes===2?{status:'complete',revision:3,verifiedPools:1,registry:{...job().registry!,status:'complete'}}:{revision:2})};}return {job:job({status:'complete',revision:3,verifiedPools:1,registry:{...job().registry!,status:'complete'}}),history:{chain:'ethereum',token} as never};}});
 crawler.setActive(true);for(let n=0;n<5&&pending;n++){const fn=pending;pending=undefined;fn();await new Promise(r=>setImmediate(r));}
 assert.deepEqual(calls,['GET','resume','resume','apply']);assert.equal(applied,1);assert.equal(pending,undefined);crawler.dispose();
});
test('stop aborts in-flight work and pauses server without accepting stale token evidence',async()=>{
 let pending:(()=>void)|undefined,resolve!:(v:any)=>void;const calls:string[]=[];let applied=0;
 const crawler=createEvmHistoryCrawler({chain:'ethereum',token,schedule:fn=>{pending=fn;return()=>{pending=undefined;};},onView:()=>{},onApply:()=>{applied++;},request:async action=>{calls.push(action);if(action==='pause')return {job:null};return new Promise(r=>resolve=r);}});
 crawler.setActive(true);pending!();crawler.setActive(false);resolve({job:job({status:'complete',verifiedPools:1})});await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['GET','pause']);assert.equal(applied,0);crawler.dispose();
});
test('settlement waits for successful evidence application and retries failures',async()=>{
 let pending:(()=>void)|undefined,resolve!:()=>void,applies=0,settled=0;
 const complete=job({status:'complete',verifiedPools:1,registry:{...job().registry!,status:'complete'}});
 const crawler=createEvmHistoryCrawler({chain:'ethereum',token,schedule:fn=>{pending=fn;return()=>{pending=undefined;};},onView:()=>{},onSettled:()=>{settled++;},onApply:async()=>{if(++applies===1)throw Error('refresh failed');await new Promise<void>(r=>resolve=r);},request:async()=>({job:complete,history:{chain:'ethereum',token} as never})});
 crawler.setActive(true);pending!();await new Promise(r=>setImmediate(r));assert.equal(settled,0);assert.ok(pending);pending!();await new Promise(r=>setImmediate(r));assert.equal(settled,0);resolve();await new Promise(r=>setImmediate(r));assert.equal(settled,1);assert.equal(applies,2);crawler.dispose();
});
