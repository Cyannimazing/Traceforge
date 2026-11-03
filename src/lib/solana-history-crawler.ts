import type {SolanaArchiveStatus} from './solana-history-archive';

export type HistoryCrawlerView={progress:SolanaArchiveStatus|null;busy:boolean;error:string};
type Step={method:'GET'|'POST'|null;delay:number};
type EvidenceMarker=[transactions:number,trades:number,transfers:number];
const evidenceMarker=(progress:SolanaArchiveStatus|null):EvidenceMarker=>[progress?.transactions||0,progress?.trades||0,progress?.transfers||0];
const evidenceAdvanced=(next:EvidenceMarker,previous:EvidenceMarker)=>next.some((count,index)=>count>previous[index]);
/** Pure scheduling policy. A storage cap is terminal for this worker, not completion. */
export function historyCrawlerStep(progress:SolanaArchiveStatus|null,initialized:boolean,now:number,failures=0):Step{
 const backoff=failures?Math.min(60000,5000*2**Math.min(failures-1,4)):0;
 if(progress&&(progress.status==='exhausted'||progress.status==='capped'||!progress.hasMore))return {method:null,delay:0};
 if(!initialized)return {method:'GET',delay:backoff};
 if(progress?.retryAt&&progress.retryAt>now)return {method:'GET',delay:progress.retryAt-now};
 if(progress?.status==='running')return {method:'GET',delay:2000};
 return {method:'POST',delay:backoff||1000};
}

/** One sequential token-scoped worker. The server owns the durable cursor. */
export function createSolanaHistoryCrawler(options:{
 token:string;
 request:(method:'GET'|'POST',signal:AbortSignal)=>Promise<SolanaArchiveStatus|null>;
 onView:(view:HistoryCrawlerView)=>void;
 onRefresh:()=>void|Promise<void>;
 onSettled?:(progress:SolanaArchiveStatus)=>void|Promise<void>;
 now?:()=>number;
 schedule?:(callback:()=>void,delay:number)=>()=>void;
}){
 const now=options.now||Date.now,schedule=options.schedule||((callback,delay)=>{const timer=setTimeout(callback,Math.min(delay,2147483647));return()=>clearTimeout(timer);});
 let active=false,disposed=false,inFlight=false,initialized=false,epoch=0,failures=0;
 let progress:SolanaArchiveStatus|null=null,error='',cancelTimer:(()=>void)|undefined,controller:AbortController|undefined;
 let lastRefreshAt=now(),lastRefreshedEvidence:EvidenceMarker=[0,0,0],terminalRefreshed=false,retryUntil=0;
 let refreshInFlight=false,refreshFailures=0,refreshRetryAt=0,refreshError='',cancelRefreshTimer:(()=>void)|undefined;
 const terminal=()=>!!progress&&(progress.status==='exhausted'||progress.status==='capped'||!progress.hasMore);
 const view=()=>{if(!disposed)options.onView({progress,busy:inFlight&&active,error:refreshError||error});};
 function queueRefresh(){
  cancelRefreshTimer?.();cancelRefreshTimer=undefined;
  if(!active||disposed||refreshInFlight||!progress)return;
  const final=terminal();
  if(final?terminalRefreshed:!evidenceAdvanced(evidenceMarker(progress),lastRefreshedEvidence))return;
  const delay=Math.max(0,refreshRetryAt-now(),final?0:30000-(now()-lastRefreshAt));
  if(delay===0)void refreshReport();
  else cancelRefreshTimer=schedule(()=>{cancelRefreshTimer=undefined;void refreshReport();},delay);
 }
 async function refreshReport(){
  if(!active||disposed||refreshInFlight||!progress)return;
  const generation=epoch,marker=evidenceMarker(progress),final=terminal();refreshInFlight=true;
  try{
   await options.onRefresh();
   if(disposed||!active||generation!==epoch)return;
   lastRefreshAt=now();lastRefreshedEvidence=lastRefreshedEvidence.map((count,index)=>Math.max(count,marker[index])) as EvidenceMarker;
   const settled=final&&terminal()&&!evidenceAdvanced(evidenceMarker(progress),marker);
   if(settled){
    await options.onSettled?.({...progress!});
    if(disposed||!active||generation!==epoch)return;
   }
   terminalRefreshed=settled;
   refreshFailures=0;refreshRetryAt=0;refreshError='';
  }catch{
   if(!disposed&&active&&generation===epoch){
    refreshFailures++;refreshRetryAt=now()+Math.min(60000,5000*2**Math.min(refreshFailures-1,4));
    refreshError='Saved history is retained, but the report refresh failed. Retrying the report without restarting the archive.';
   }
  }finally{
   refreshInFlight=false;if(!disposed){view();queueRefresh();}
  }
 }
 function queue(){
  cancelTimer?.();cancelTimer=undefined;queueRefresh();if(!active||disposed||inFlight)return;
  const step=historyCrawlerStep(progress,initialized,now(),failures);
  if(step.method)cancelTimer=schedule(()=>{cancelTimer=undefined;void run(step.method!);},Math.max(step.delay,retryUntil-now()));
 }
 async function run(method:'GET'|'POST'){
  if(!active||disposed||inFlight)return;
  const generation=epoch,abort=new AbortController();controller=abort;inFlight=true;view();
  try{
   const next=await options.request(method,abort.signal);
   if(disposed||!active||abort.signal.aborted||generation!==epoch)return;
   if(next&&next.token!==options.token)throw Error('History response belongs to a different token.');
   if(next&&(!['idle','partial','exhausted','cooldown','capped','running','unsupported'].includes(next.status)||typeof next.hasMore!=='boolean'||!['transactions','pages','trades','transfers'].every(key=>Number.isSafeInteger(next[key as keyof SolanaArchiveStatus])&&Number(next[key as keyof SolanaArchiveStatus])>=0)||(['exhausted','capped','unsupported'].includes(next.status)&&next.hasMore)))throw Error('History progress was invalid. The saved checkpoint will be retried.');
   if(method==='POST'&&!next)throw Error('History batch returned no saved progress.');
   // Existing history establishes the initial baseline, not new evidence saved
   // by this worker. Later batches can leave a pending refresh during cooldown.
   if(!initialized&&progress===null&&method==='GET')lastRefreshedEvidence=evidenceMarker(next);
   // Page counts are retrieval diagnostics, not evidence progress: a provider
   // can replay one page forever while that counter continues to increase.
   const advanced=!!next&&evidenceAdvanced(evidenceMarker(next),evidenceMarker(progress));
   failures=method==='POST'&&!advanced&&next?.hasMore&&next.status!=='running'&&next.status!=='cooldown'?failures+1:0;
   progress=next;initialized=true;error=failures?'No new transactions or decoded evidence were saved. Retrying from the checkpoint with a slower pace.':'';view();
   queueRefresh();
  }catch(cause){
   if(!disposed&&active&&!abort.signal.aborted&&generation===epoch){
    failures++;error=cause instanceof Error?cause.message:'History retrieval failed. Saved progress is preserved.';
    // Retry-After on route/network errors is represented by the transport.
    const retryAt=typeof cause==='object'&&cause!==null&&'retryAt' in cause?Number(cause.retryAt):NaN;
    if(Number.isFinite(retryAt)&&retryAt>now()){retryUntil=retryAt;if(progress)progress={...progress,status:'cooldown',retryAt};}
    view();
   }
  }finally{
   inFlight=false;if(controller===abort)controller=undefined;
   if(!disposed){view();queue();}
  }
 }
 return {
  setActive(value:boolean){
   if(disposed||active===value)return;active=value;epoch++;cancelTimer?.();cancelTimer=undefined;cancelRefreshTimer?.();cancelRefreshTimer=undefined;
   if(!value)controller?.abort();else if(!progress||progress.hasMore)initialized=false;
   view();queue();
  },
  dispose(){disposed=true;active=false;epoch++;cancelTimer?.();cancelRefreshTimer?.();controller?.abort();},
 };
}
