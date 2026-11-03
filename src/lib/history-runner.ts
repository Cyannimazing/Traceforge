import {HistoryStore,historyJobId,type HistoryJob} from './history-store';
import type {PoolCheckpoint,PoolLaunchResult} from './pool-launch';
import {clockReferenceTime,type EvidenceClock} from './evidence-clock';
import type {HistoryDiscovery} from './history-discovery';
import type {HistoryView} from './history-view';
type Chain='ethereum'|'base';
const clean=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export function historyView(job:HistoryJob):HistoryView{
 const discovery=object(object(job.result).discovery),progress=object(job.progress);
 return {id:job.id,chain:job.chain,token:job.token,status:job.status,revision:job.revision,updatedAt:job.updatedAt,message:job.message,poolLimit:job.poolLimit,verifiedPools:job.counts.complete,totalPools:job.pools.length,completeRegistry:false,...(discovery.registry?{registry:discovery.registry as HistoryView['registry']}:{}),discoveryNote:typeof discovery.detail==='string'?discovery.detail:'Pool discovery is pending.',...(typeof progress.retryAt==='number'?{retryAt:progress.retryAt}:{}),pools:job.pools.map(p=>{const r=object(p.result),g=object(r.progress);return {pool:p.pool,status:p.status,message:p.message,phase:typeof g.phase==='string'?g.phase:p.status,completedRanges:Number(g.completedRanges)||0,verifiedTransactions:Number(g.verifiedTransactions)||0,discoveredTransactions:Number(g.discoveredTransactions)||0,...(Number.isSafeInteger(g.nextBlock)?{nextBlock:g.nextBlock}:{})};})};
}
export function createHistoryRunner(deps:{store:HistoryStore;discover:(chain:Chain,token:string,expanded:boolean,signal?:AbortSignal)=>Promise<HistoryDiscovery>;resolveClock:(options?:{signal?:AbortSignal})=>Promise<EvidenceClock>;verify:(chain:Chain,token:string,pool:string,options:{signal?:AbortSignal;validationTime?:number;checkpoint?:PoolCheckpoint;onCheckpoint?:(cp:PoolCheckpoint)=>Promise<void>;creationTimeHint?:number;creationTransactionHint?:string})=>Promise<PoolLaunchResult>;now?:()=>number;maxSlices?:number}){
 const active=new Map<string,{controller:AbortController;promise:Promise<void>;restart:boolean}>(),now=deps.now||Date.now;
 function get(id:string){deps.store.recoverExpired();return deps.store.get(id);}
 async function run(id:string,controller:AbortController){
  let lease:string|undefined;
  try{
   const acquired=deps.store.acquire(id,90_000);if(!acquired)return;
   let job=acquired.job;lease=acquired.token;
   const finish=()=>{
    if(job.pools.some(p=>p.status!=='complete'&&p.status!=='blocked'))return false;
    const empty=!job.pools.length,blocked=empty||job.counts.blocked>0;
    job=deps.store.saveJob(id,lease!,job.revision,{status:blocked?'blocked':'complete',message:empty?'No supported pool candidates were discovered. This does not establish that no historical pools exist.':blocked?'Some pools could not be verified. Completed pool evidence is preserved.':'All listed pool windows verified. Discovery is not an exhaustive historical registry.'});return true;
   };
   const readyAt=(pool:HistoryJob['pools'][number])=>{
    const value=object(object(pool.result).progress).readyAt;
    return typeof value==='number'&&Number.isFinite(value)&&value>0?value:0;
   };
   const pauseForReadiness=()=>{
    const pending=job.pools.filter(p=>p.status!=='complete'&&p.status!=='blocked');
    const progress={...object(job.progress)};delete progress.retryAt;
    if(pending.length&&pending.every(p=>readyAt(p)>now()))progress.retryAt=Math.min(...pending.map(readyAt));
    job=deps.store.saveJob(id,lease!,job.revision,{progress});
    job=deps.store.release(id,lease!,job.revision,'paused');
   };
   for(let slice=0;slice<(deps.maxSlices??8);slice++){
    controller.signal.throwIfAborted();
    if(finish())return;
    const cursor=Math.max(0,job.pools.findIndex(p=>p.pool===object(job.progress).nextPool));
    const ordered=[...job.pools.slice(cursor),...job.pools.slice(0,cursor)];
    const pool=ordered.find(p=>p.status!=='complete'&&p.status!=='blocked'&&readyAt(p)<=now());
    if(!pool){pauseForReadiness();return;}
    const nextPool=job.pools[(job.pools.findIndex(p=>p.pool===pool.pool)+1)%job.pools.length].pool;
    const discovery=object(object(job.result).discovery),candidate=(Array.isArray(discovery.candidates)?discovery.candidates:[]).find((p:any)=>p.pool===pool.pool);
    job=deps.store.renew(id,lease,job.revision,90_000);
    job=deps.store.savePool(id,lease,job.revision,{pool:pool.pool,status:'running',message:'Checking canonical historical evidence.'});
    const clock=await deps.resolveClock({signal:controller.signal});controller.signal.throwIfAborted();
    const result=await deps.verify(job.chain as Chain,job.token,pool.pool,{signal:controller.signal,validationTime:clockReferenceTime(clock,now()),checkpoint:pool.checkpoint?pool.checkpoint as PoolCheckpoint:undefined,creationTimeHint:candidate?.creationTimeHint,creationTransactionHint:candidate?.creationTransactionHint,onCheckpoint:async checkpoint=>{
     controller.signal.throwIfAborted();job=deps.store.savePool(id,lease!,job.revision,{pool:pool.pool,status:'running',checkpoint:clean(checkpoint),message:'Verified progress saved to disk.'});
    }});
    const progress=object(result.progress),rate=/rate.limit|request limit|too many requests/i.test(result.reasons.join(' ')),access=/authorized|cannot serve|archive access/i.test(result.reasons.join(' '));
    const status=result.status==='verified'?'complete':result.status==='unsupported'||access?'blocked':'paused';
    const requestedDelay=typeof progress.retryAfterMs==='number'&&Number.isFinite(progress.retryAfterMs)&&progress.retryAfterMs>0?progress.retryAfterMs:0;
    const retryAt=rate||requestedDelay?now()+Math.max(rate?60_000:0,requestedDelay):undefined;
    const savedResult:Record<string,unknown>=clean(result);if(retryAt)savedResult.progress={...progress,readyAt:retryAt};
    const savedProgress:Record<string,unknown>={...object(job.progress),slices:Number(object(job.progress).slices||0)+1,clock:clean(clock),nextPool};delete savedProgress.retryAt;
    if(rate&&retryAt)savedProgress.retryAt=retryAt;
    job=deps.store.savePool(id,lease,job.revision,{pool:pool.pool,status,...(result.checkpoint?{checkpoint:clean(result.checkpoint)}:{}),result:savedResult,message:result.reasons[0]||status},{progress:savedProgress,message:result.status==='verified'?'A pool window is verified and ready to apply.':'Checkpoint saved. Remaining history is not yet verified.'});
    if(finish())return;
    if(rate){job=deps.store.release(id,lease,job.revision,'paused');return;}
    if(!requestedDelay&&!result.progress?.retryable&&status==='paused'){pauseForReadiness();return;}
   }
   pauseForReadiness();
  }catch{
   try{
    const latest=deps.store.get(id);
    if(lease&&latest?.status==='running')deps.store.saveJob(id,lease,latest.revision,{status:'paused',message:'Work stopped. Saved checkpoints are preserved; resume to continue.'});
    else if(!lease&&latest?.status==='queued'){
     const recovery=deps.store.acquire(id);
     if(recovery)deps.store.saveJob(id,recovery.token,recovery.job.revision,{status:'paused',message:'Work could not start. Saved checkpoints are preserved; resume to retry.'});
    }
   }catch{/* A new lease fences this worker; unavailable storage is recovered after lease expiry. */}
  }
 }
 function launch(id:string){
  const previous=active.get(id);if(previous){if(previous.controller.signal.aborted)previous.restart=true;return;}
  const entry={controller:new AbortController(),promise:Promise.resolve(),restart:false};active.set(id,entry);
  entry.promise=Promise.resolve().then(()=>run(id,entry.controller)).catch(()=>{/* Never leak a detached background rejection. */}).finally(()=>{
   if(active.get(id)!==entry)return;active.delete(id);if(entry.restart)launch(id);
  });
 }
 return {
  get,find:(chain:Chain,token:string)=>get(historyJobId(chain,token)),
  async start(chain:Chain,token:string,expanded=false,signal?:AbortSignal){
   signal?.throwIfAborted();
   let job=get(historyJobId(chain,token));if(job?.status==='running')return job;
   if(job&&Number(object(job.progress).retryAt)>now())throw Error('Provider cooldown is still active. Check the displayed retry time.');
   const discovery=await deps.discover(chain,token,expanded,signal);signal?.throwIfAborted();
   const limit=Math.max(job?.poolLimit||20,expanded?100:20),existing=job?.pools.map(p=>p.pool)||[];
   const requested=[...new Set([...existing,...discovery.candidates.map(p=>p.pool.toLowerCase())])],accepted=requested.slice(0,limit),omitted=requested.length-accepted.length;
   const previous=object(object(job?.result).discovery),oldCandidates=Array.isArray(previous.candidates)?previous.candidates:[];
   const candidates=[...new Map([...oldCandidates,...discovery.candidates].map(p=>[p.pool.toLowerCase(),{...p,pool:p.pool.toLowerCase()}])).values()].filter(p=>accepted.includes(p.pool));
   const savedDiscovery={...discovery,candidates,truncated:discovery.truncated||omitted>0,observedCandidates:Math.max(discovery.observedCandidates,requested.length),detail:discovery.detail+(omitted?` ${omitted} additional pools remain outside the ${limit}-pool verification scope; existing evidence was retained.`:'')};
   job=job||deps.store.create({chain,token,pools:accepted,expanded});
   if(job.status==='running')return job;
   job=deps.store.addPools(job.id,job.revision,accepted,expanded);
   job=deps.store.updateDiscovery(job.id,job.revision,clean(savedDiscovery));
   if(job.status==='complete')return job;
   if(job.status!=='queued')job=deps.store.resume(job.id,job.revision);
   launch(job.id);return job;
  },
  resume(id:string){let job=get(id);if(!job)throw Error('History job not found.');if(Number(object(job.progress).retryAt)>now())throw Error('Provider cooldown is still active. Check the displayed retry time.');if(job.status==='running')return job;
   job=deps.store.resume(id,job.revision);const acquired=deps.store.acquire(id);if(acquired){job=acquired.job;for(const pool of job.pools.filter(p=>p.status==='blocked'))job=deps.store.savePool(id,acquired.token,job.revision,{pool:pool.pool,status:'paused',message:'Retry requested; saved evidence retained.'});job=deps.store.release(id,acquired.token,job.revision,'paused');job=deps.store.resume(id,job.revision);}launch(id);return job;},
  pause(id:string){const job=get(id);if(!job)throw Error('History job not found.');const paused=deps.store.pause(id,job.revision);const entry=active.get(id);if(entry){entry.restart=false;entry.controller.abort();}return paused;},
  async wait(id:string){while(active.has(id))await active.get(id)!.promise;},
 };
}
