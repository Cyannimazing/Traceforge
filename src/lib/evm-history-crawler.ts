import type {HistoryView} from './history-view';
import type {HistoryJob} from './history-store';

export type EvmCrawlerAction='GET'|'start'|'resume'|'apply'|'pause';
export type EvmCrawlerView={job:HistoryView|null;busy:boolean;error:string;state:'idle'|'running'|'waiting'|'stopped'|'scope-complete'|'blocked'};
type Reply={job:HistoryView|null;history?:HistoryJob};
type Step={action:EvmCrawlerAction|null;delay:number;terminal?:'scope-complete'|'blocked'};
/** Continues saved configured-factory ranges and selected pool windows, not all
 * token transfers. A provider/storage limit is never interpreted as exhaustion. */
export function evmHistoryCrawlerStep(job:HistoryView|null,initialized:boolean,now:number,failures=0):Step{
 const delay=failures?Math.min(60000,2000*2**Math.min(failures,5)):1000;
 if(!initialized)return {action:'GET',delay:failures?delay:0};
 if(!job)return {action:'start',delay};
 if(job.status==='running'||job.status==='queued')return {action:'GET',delay:2000};
 const retryAt=Math.max(job.retryAt||0,job.registry?.retryAt||0);
 if(retryAt>now)return {action:'GET',delay:retryAt-now};
 if(job.status==='paused')return {action:'resume',delay};
 if(job.registry?.status==='partial')return {action:'start',delay};
 if(job.status==='blocked')return {action:null,delay:0,terminal:'blocked'};
 if(job.status==='complete'&&job.registry?.status==='complete'&&job.totalPools>=job.registry.discovered)return {action:null,delay:0,terminal:'scope-complete'};
 return {action:null,delay:0,terminal:'blocked'};
}
export function createEvmHistoryCrawler(options:{
 chain:'ethereum'|'base';token:string;
 request:(action:EvmCrawlerAction,signal:AbortSignal)=>Promise<Reply>;
 onView:(view:EvmCrawlerView)=>void;onApply:(history:HistoryJob)=>void|Promise<void>;
 onSettled?:(state:'scope-complete'|'blocked')=>void;
 now?:()=>number;schedule?:(callback:()=>void,delay:number)=>()=>void;
}){
 const now=options.now||Date.now,schedule=options.schedule||((callback,delay)=>{const timer=setTimeout(callback,Math.min(delay,2147483647));return()=>clearTimeout(timer);});
 let active=false,disposed=false,initialized=false,inFlight=false,pausePending=false,epoch=0,failures=0,retryUntil=0,appliedPools=0,settled=false;
 let job:HistoryView|null=null,error='',controller:AbortController|undefined,cancelTimer:(()=>void)|undefined;
 const matches=(next:HistoryView)=>next.chain===options.chain&&next.token.toLowerCase()===options.token.toLowerCase();
 const progressKey=(v:HistoryView|null)=>v?`${v.verifiedPools}:${v.totalPools}:${v.registry?.completedRanges||0}:${v.pools.reduce((s,p)=>s+p.completedRanges+p.verifiedTransactions,0)}`:'';
 function view(){if(disposed)return;const step=evmHistoryCrawlerStep(job,initialized,now(),failures);options.onView({job,busy:inFlight&&active,error,state:!active?'stopped':step.terminal||((job?.retryAt||0)>now()||(job?.registry?.retryAt||0)>now()||retryUntil>now()?'waiting':'running')});}
 function accept(next:HistoryView|null){
  if(next&&!matches(next))throw Error('History response belongs to another token.');
  if(next&&(!Number.isSafeInteger(next.revision)||!Array.isArray(next.pools)||!['running','queued','paused','complete','blocked'].includes(next.status)))throw Error('Invalid saved history response.');
  if(job&&next&&job.id===next.id&&next.revision<job.revision)return;
  job=next;initialized=true;
 }
 async function flushPause(){
  if(!pausePending||inFlight)return;pausePending=false;inFlight=true;
  try{await options.request('pause',AbortSignal.timeout(8000));}catch{/* Existing checkpoint remains; server lease expiry recovers interrupted workers. */}
  finally{inFlight=false;queue();}
 }
 function queue(){
  cancelTimer?.();cancelTimer=undefined;
  if(pausePending&&!inFlight){void flushPause();return;}
  if(!active||disposed||inFlight)return;
  const step=evmHistoryCrawlerStep(job,initialized,now(),failures);view();
  if(step.action)cancelTimer=schedule(()=>{cancelTimer=undefined;void run(step.action!);},Math.max(step.delay,retryUntil-now()));
  else if(step.terminal&&!settled){settled=true;options.onSettled?.(step.terminal);}
 }
 async function run(action:EvmCrawlerAction){
  if(!active||disposed||inFlight)return;
  const generation=epoch,abort=new AbortController();controller=abort;inFlight=true;view();
  try{
   const reply=await options.request(action,abort.signal);
   if(disposed||!active||abort.signal.aborted||generation!==epoch)return;
   const before=progressKey(job);accept(reply.job);
   if(action!=='GET'&&!reply.job)throw Error('History batch returned no saved job.');
   if(progressKey(job)!==before){failures=0;error='';}
   else if(action==='start'||action==='resume'){failures++;error='No new historical range was saved. Continuing with backoff; progress is preserved.';}
   if(job&&job.verifiedPools>appliedPools){
    const applied=await options.request('apply',abort.signal);
    if(disposed||!active||abort.signal.aborted||generation!==epoch)return;
    if(!applied.job||!matches(applied.job)||!applied.history||applied.history.chain!==options.chain||applied.history.token.toLowerCase()!==options.token.toLowerCase())throw Error('Verified evidence response was missing or mismatched.');
    accept(applied.job);await options.onApply(applied.history);
    if(disposed||!active||abort.signal.aborted||generation!==epoch)return;
    appliedPools=applied.job.verifiedPools;
   }
  }catch(cause){
   if(!disposed&&active&&!abort.signal.aborted&&generation===epoch){failures++;error=cause instanceof Error?cause.message:'History temporarily unavailable. Checkpoints are preserved.';const retry=Number(typeof cause==='object'&&cause&&'retryAt' in cause?cause.retryAt:NaN);if(Number.isFinite(retry))retryUntil=Math.max(retryUntil,retry);initialized=false;}
  }finally{inFlight=false;if(controller===abort)controller=undefined;if(!disposed)view();queue();}
 }
 return {
  setActive(value:boolean){if(disposed||active===value)return;active=value;epoch++;cancelTimer?.();cancelTimer=undefined;
   if(!value){controller?.abort();pausePending=inFlight||job?.status==='running'||job?.status==='queued';}else initialized=false;
   view();queue();
  },
  dispose(){disposed=true;active=false;epoch++;cancelTimer?.();controller?.abort();pausePending=inFlight||job?.status==='running'||job?.status==='queued';queue();},
 };
}
