import {HistoryStore} from './history-store';
import {createFactoryRegistry,type RegistryReader,type RegistryCheckpoint} from './factory-registry';
import {type HistoryDiscovery,type HistoryCandidate} from './history-discovery';
type Chain='ethereum'|'base';
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'?v as Record<string,any>:{};
/** Separate durable registry job: discovered inactive pools do not depend on the
 * market feed. Candidate limits bound subsequent verification, not discovery. */
export function createRegistryDiscovery(deps:{store:HistoryStore;reader:RegistryReader;market:(chain:Chain,token:string,expanded:boolean,signal?:AbortSignal)=>Promise<HistoryDiscovery>}){
 return async(chain:Chain,token:string,expanded=false,signal?:AbortSignal):Promise<HistoryDiscovery>=>{
  const limit=expanded?100:20;deps.store.recoverExpired();let job=deps.store.create({chain,token,pools:['registry']});
  if(job.status!=='running'){
   const readyAt=Number(object(job.progress).retryAt)||0;
   if(readyAt<=Date.now()){
    job=deps.store.resume(job.id,job.revision,{recheckComplete:true});const acquired=deps.store.acquire(job.id,90_000);
    if(acquired){job=acquired.job;const lease=acquired.token;
     try{
      const result=await createFactoryRegistry(deps.reader)(chain,token,{signal:AbortSignal.any([AbortSignal.timeout(25_000),...(signal?[signal]:[])]),checkpoint:job.pools[0].checkpoint as RegistryCheckpoint|undefined||undefined,maxRanges:4,onCheckpoint:async cp=>{job=deps.store.savePool(job.id,lease,job.revision,{pool:'registry',status:'running',checkpoint:cp,message:'Factory discovery cursor saved.'});}});
      job=deps.store.savePool(job.id,lease,job.revision,{pool:'registry',status:result.status==='complete'?'complete':'paused',checkpoint:result.checkpoint,message:result.detail},{message:result.detail,progress:result.retryAfterMs?{retryAt:Date.now()+result.retryAfterMs}:{}});
      job=deps.store.release(job.id,lease,job.revision,result.status==='complete'?'complete':'paused');
     }catch{try{job=deps.store.saveJob(job.id,lease,job.revision,{status:'paused',message:'Factory discovery stopped before completion. Saved ranges are preserved.'});}catch{job=deps.store.get(job.id)||job;}}
    }
   }
  }
  let market:HistoryDiscovery;try{market=await deps.market(chain,token,expanded,signal);}catch{market={candidates:[],observedCandidates:0,excluded:0,truncated:false,completeRegistry:false,fetchedAt:new Date().toISOString(),detail:'Market candidate feed unavailable.'};}
  const cp=object(job.pools[0]?.checkpoint),pools=Array.isArray(cp.pools)?cp.pools:[];
  const registryCandidates:HistoryCandidate[]=pools.map(p=>({pool:p.pool,venue:`Uniswap ${p.protocol}`,source:'Historical factory event candidate - receipt verification required',creationTransactionHint:p.creationTransactionHint}));
  const all=new Map(registryCandidates.map(p=>[p.pool,p]));for(const p of market.candidates)if(!all.has(p.pool))all.set(p.pool,p);
  const registry={status:job.status==='complete'?'complete' as const:'partial' as const,discovered:pools.length,pendingRanges:Array.isArray(cp.pending)?cp.pending.length:null,completedRanges:Number(cp.completedRanges)||0,anchor:Number(cp.anchor?.number)||null,detail:job.message||'Factory discovery has not completed.',...(object(job.progress).retryAt?{retryAt:Number(object(job.progress).retryAt)}:{})};
  return {candidates:[...all.values()].slice(0,limit),observedCandidates:Math.max(all.size,market.observedCandidates),excluded:market.excluded,truncated:all.size>limit||market.truncated,completeRegistry:false,fetchedAt:new Date().toISOString(),registry,detail:`Configured factory registry: ${registry.status}; ${pools.length} historical candidates, ${registry.completedRanges} ranges saved${registry.anchor?`, fixed anchor block ${registry.anchor}`:''}. ${registry.detail} Discovery is not exhaustive across all token venues. ${market.detail}`};
 };
}
