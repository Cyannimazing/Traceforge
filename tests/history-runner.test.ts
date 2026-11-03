import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HistoryStore} from '../src/lib/history-store';
import {createHistoryRunner} from '../src/lib/history-runner';
import type {PoolCheckpoint,PoolLaunchResult} from '../src/lib/pool-launch';
import type {EvidenceClock} from '../src/lib/evidence-clock';

const token='0x0000000000000000000000000000000000000001',pool='0x0000000000000000000000000000000000000002';
const now=Date.UTC(2026,0,1),at=new Date(now).toISOString();
const clock:EvidenceClock={basis:'local',referenceAt:at,localCapturedAt:at,offsetMs:0,sources:[],detail:'Local clock'};
const discovery=(pools=[pool])=>({candidates:pools.map(pool=>({pool,venue:'Uniswap',source:'test',creationTimeHint:123})),observedCandidates:pools.length,excluded:0,truncated:false,completeRegistry:false as const,fetchedAt:at,detail:'Candidate feed, not complete registry'});
const cp=(cursor:number)=>({cursor} as unknown as PoolCheckpoint);
const result=(status:PoolLaunchResult['status']='verified'):PoolLaunchResult=>({status,scope:'selected-pool',pool,token,trades:[],reasons:['test result'],sources:[],...(status==='verified'?{proof:{verified:true,scope:'selected-pool',chain:'ethereum',pool,firstSwapAt:at,firstSwapTransaction:'tx',firstSwapLogIndex:0,windowEndAt:new Date(now+60_000).toISOString(),creation:{transaction:'create',blockNumber:1,blockHash:'hash1'},through:{blockNumber:3,blockHash:'hash3',timestamp:new Date(now+61_000).toISOString()},factory:'factory',token0:token,token1:'other',eligibleTradeIds:[],verifiedAt:at}}:{})});
type TestContext={after:(fn:()=>void)=>void};
function fixture(t:TestContext){const dir=mkdtempSync(join(tmpdir(),'traceforge-runner-')),store=new HistoryStore(join(dir,'history.sqlite'),{now:()=>now});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;}
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};

test('the final allowed slice completes immediately and saves clock provenance',async t=>{
 const store=fixture(t);let hint:number|undefined;
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:1,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async(_c,_t,_p,o)=>{hint=o.creationTimeHint;return result();}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 const done=runner.get(job.id)!;assert.equal(done.status,'complete');assert.equal(done.counts.complete,1);assert.equal(hint,123);assert.deepEqual((done.progress as {clock:EvidenceClock}).clock,clock);
});

test('an empty candidate list is blocked with an accurate discovery message',async t=>{
 const store=fixture(t);let calls=0;
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery([]),resolveClock:async()=>clock,verify:async()=>{calls++;return result();}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);const done=runner.get(job.id)!;
 assert.equal(done.status,'blocked');assert.match(done.message,/no.*candidate/i);assert.doesNotMatch(done.message,/all.*verified/i);assert.equal(calls,0);
});

test('callback checkpoints survive a partial result without a checkpoint field',async t=>{
 const store=fixture(t);
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:1,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async(_c,_t,_p,o)=>{await o.onCheckpoint?.(cp(7));return result('partial');}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 assert.deepEqual(runner.get(job.id)!.pools[0].checkpoint,cp(7));assert.equal(runner.get(job.id)!.status,'paused');
});

test('immediate pause and resume waits for the fenced worker then starts a new slice',async t=>{
 const store=fixture(t),entered=deferred<void>();let calls=0;
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:1,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async(_c,_t,_p,o)=>{
  calls++;if(calls===1){entered.resolve();await new Promise<void>((_r,reject)=>o.signal!.addEventListener('abort',()=>reject(o.signal!.reason),{once:true}));}return result();
 }});
 const job=await runner.start('ethereum',token);await entered.promise;runner.pause(job.id);runner.resume(job.id);await runner.wait(job.id);
 assert.equal(calls,2);assert.equal(runner.get(job.id)!.status,'complete');
});

test('startup storage failures settle background work and leave a resumable job',async t=>{
 const store=fixture(t),acquire=store.acquire.bind(store);let calls=0;
 store.acquire=((...args:Parameters<HistoryStore['acquire']>)=>{if(++calls===1)throw Error('temporary database busy');return acquire(...args);});
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async()=>result()});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 assert.equal(runner.get(job.id)!.status,'paused');assert.match(runner.get(job.id)!.message,/stopped|interrupted|start/i);
});

test('stale clocks fall back to local validation and clock lookup receives the work signal',async t=>{
 const store=fixture(t);let validationTime:number|undefined,seenSignal:AbortSignal|undefined;
 const stale:EvidenceClock={...clock,basis:'provider-quorum',referenceAt:new Date(now+3600_000).toISOString(),localCapturedAt:new Date(now-300_000).toISOString(),sources:[{name:'a',date:at,age:null,cache:null},{name:'b',date:at,age:null,cache:null}]};
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:1,discover:async()=>discovery(),resolveClock:async o=>{seenSignal=o?.signal;return stale;},verify:async(_c,_t,_p,o)=>{validationTime=o.validationTime;return result();}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);assert.equal(validationTime,now);assert(seenSignal instanceof AbortSignal);
});

test('pause aborts a pending clock lookup before any pool requests begin',async t=>{
 const store=fixture(t),entered=deferred<void>();let calls=0,aborted=false;
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery(),resolveClock:async o=>{
  entered.resolve();return new Promise((_resolve,reject)=>o!.signal!.addEventListener('abort',()=>{aborted=true;reject(o!.signal!.reason);},{once:true}));
 },verify:async()=>{calls++;return result();}});
 const job=await runner.start('ethereum',token);await entered.promise;runner.pause(job.id);await runner.wait(job.id);
 assert.equal(aborted,true);assert.equal(calls,0);assert.equal(runner.get(job.id)!.status,'paused');
});

test('cooldowns forbid premature retries and blocked pools can be explicitly resumed',async t=>{
 const store=fixture(t);let time=now,calls=0;
 const runner=createHistoryRunner({store,now:()=>time,maxSlices:1,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async()=>{
  calls++;return calls===1?{...result('partial'),reasons:['RPC rate limited'],progress:{retryAfterMs:90_000} as PoolLaunchResult['progress']}:calls===2?{...result('unsupported'),reasons:['Unsupported factory']}:result();
 }});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);assert.equal(runner.get(job.id)!.status,'paused');
 assert.throws(()=>runner.resume(job.id),/cooldown/i);assert.equal(calls,1);
 time+=90_001;runner.resume(job.id);await runner.wait(job.id);assert.equal(runner.get(job.id)!.status,'blocked');
 runner.resume(job.id);await runner.wait(job.id);assert.equal(calls,3);assert.equal(runner.get(job.id)!.status,'complete');
});

test('starting a completed job is idempotent; newly discovered pools extend scope',async t=>{
 const store=fixture(t),second='0x0000000000000000000000000000000000000003';let pools=[pool],calls=0;
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:1,discover:async()=>discovery(pools),resolveClock:async()=>clock,verify:async(_c,_t,p)=>{calls++;return {...result(),pool:p,proof:{...result().proof!,pool:p}};}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);await runner.start('ethereum',token);await runner.wait(job.id);assert.equal(calls,1);
 pools=[pool,second];await runner.start('ethereum',token);await runner.wait(job.id);assert.equal(calls,2);assert.equal(runner.get(job.id)!.counts.complete,2);assert.equal(runner.get(job.id)!.status,'complete');
});

test('an explicit finalized-head wait pauses the batch and enforces its retry time',async t=>{
 const store=fixture(t);let calls=0;
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery(),resolveClock:async()=>clock,verify:async()=>{
  calls++;return {...result('partial'),reasons:['Waiting for a closed first-minute window'],progress:{phase:'waiting-finalized-head',retryable:false,retryAfterMs:60_000} as PoolLaunchResult['progress']};
 }});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 assert.equal(calls,1);assert.equal(runner.get(job.id)!.status,'paused');assert.equal((runner.get(job.id)!.progress as {retryAt:number}).retryAt,now+60_000);
 assert.throws(()=>runner.resume(job.id),/cooldown/i);
});

test('round-robin position survives bounded batches so later pending pools are visited',async t=>{
 const store=fixture(t),pools=Array.from({length:12},(_,i)=>'0x'+(i+2).toString(16).padStart(40,'0')),visited:string[]=[];
 const deps={store,now:()=>now,discover:async()=>discovery(pools),resolveClock:async()=>clock,verify:async(_c:string,_t:string,p:string)=>{
  visited.push(p);return {...result('partial'),pool:p,progress:{retryable:true} as PoolLaunchResult['progress']};
 }};
 const first=createHistoryRunner(deps),job=await first.start('ethereum',token);await first.wait(job.id);
 assert.deepEqual(visited,pools.slice(0,8));
 const restarted=createHistoryRunner(deps);restarted.resume(job.id);await restarted.wait(job.id);
 assert.deepEqual(visited.slice(8,12),pools.slice(8));assert.equal(new Set(visited).size,12);
});

test('one pool waiting for finality does not prevent another pool from completing',async t=>{
 const store=fixture(t),second='0x0000000000000000000000000000000000000003',visited:string[]=[];
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery([pool,second]),resolveClock:async()=>clock,verify:async(_c,_t,p)=>{
  visited.push(p);return p===pool?{...result('partial'),progress:{phase:'waiting-finalized-head',retryable:false,retryAfterMs:60_000} as PoolLaunchResult['progress']}:{...result(),pool:p,proof:{...result().proof!,pool:p}};
 }});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);const saved=runner.get(job.id)!;
 assert.deepEqual(visited,[pool,second]);assert.equal(saved.counts.complete,1);assert.equal(saved.status,'paused');
 assert.equal((saved.progress as {retryAt:number}).retryAt,now+60_000);assert.throws(()=>runner.resume(job.id),/cooldown/i);
});

test('all delayed pools expose the nearest retry and only eligible pools resume',async t=>{
 const store=fixture(t),second='0x0000000000000000000000000000000000000003',visited:string[]=[];let time=now;
 const runner=createHistoryRunner({store,now:()=>time,discover:async()=>discovery([pool,second]),resolveClock:async()=>clock,verify:async(_c,_t,p)=>{
  visited.push(p);return time>now?{...result(),pool:p,proof:{...result().proof!,pool:p}}:{...result('partial'),pool:p,progress:{phase:'waiting-finalized-head',retryable:false,retryAfterMs:p===pool?90_000:30_000} as PoolLaunchResult['progress']};
 }});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 assert.equal((runner.get(job.id)!.progress as {retryAt:number}).retryAt,now+30_000);
 time+=30_001;runner.resume(job.id);await runner.wait(job.id);assert.deepEqual(visited,[pool,second,second]);
 assert.equal((runner.get(job.id)!.progress as {retryAt:number}).retryAt,now+90_000);
 time=now+90_001;runner.resume(job.id);await runner.wait(job.id);assert.equal(runner.get(job.id)!.status,'complete');
});

test('an unrecovered provider rate limit still pauses other pools globally',async t=>{
 const store=fixture(t),second='0x0000000000000000000000000000000000000003',visited:string[]=[];
 const runner=createHistoryRunner({store,now:()=>now,discover:async()=>discovery([pool,second]),resolveClock:async()=>clock,verify:async(_c,_t,p)=>{
  visited.push(p);return {...result('partial'),pool:p,reasons:['RPC rate limited'],progress:{retryable:true,retryAfterMs:90_000} as PoolLaunchResult['progress']};
 }});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);
 assert.deepEqual(visited,[pool]);assert.equal((runner.get(job.id)!.progress as {retryAt:number}).retryAt,now+90_000);
 assert.throws(()=>runner.resume(job.id),/cooldown/i);
});

test('discovery updates completed metadata, passes creation hints and retains old pools within the merged cap',async t=>{
 const store=fixture(t),pools=Array.from({length:20},(_,i)=>'0x'+(i+2).toString(16).padStart(40,'0'));let fresh=pools,version=0,calls=0,hint:string|undefined;
 const runner=createHistoryRunner({store,now:()=>now,maxSlices:25,discover:async()=>({...discovery(fresh),candidates:fresh.map(pool=>({pool,venue:'test',source:'test',creationTransactionHint:'creation-tx'})),registry:{status:'partial' as const,discovered:fresh.length,pendingRanges:4-version,completedRanges:version,anchor:99,detail:'fixed registry'}}),resolveClock:async()=>clock,verify:async(_c,_t,p,o)=>{calls++;hint=o.creationTransactionHint;return {...result(),pool:p,proof:{...result().proof!,pool:p}};}});
 const job=await runner.start('ethereum',token);await runner.wait(job.id);assert.equal(calls,20);assert.equal(hint,'creation-tx');
 version=1;fresh=['0x000000000000000000000000000000000000ffff',...pools.slice(1)];await runner.start('ethereum',token);await runner.wait(job.id);
 const saved=runner.get(job.id)!;assert.equal(saved.status,'complete');assert.equal(calls,20);assert.deepEqual(saved.pools.map(p=>p.pool),pools);
 const stored=(saved.result as {discovery:{truncated:boolean;registry:{completedRanges:number}}}).discovery;assert.equal(stored.truncated,true);assert.equal(stored.registry.completedRanges,1);
});
