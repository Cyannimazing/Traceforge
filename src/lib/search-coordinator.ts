import type {Chain} from './analysis';
import type {ScanOptions} from './investigation-service';
import type {InvestigationReport,ScanEvent} from './investigation-types';

export function searchRequestUrl(chain:Chain,token:string,fresh=false){
 const query=new URLSearchParams({chain,token});
 if(fresh)query.set('fresh','1');
 return `/api/scan/stream?${query}`;
}

type Listener={resolve:(report:InvestigationReport)=>void;reject:(error:unknown)=>void;onEvent?:ScanOptions['onEvent'];cleanup:()=>void};
type Job={controller:AbortController;listeners:Set<Listener>;stages:Map<string,ScanEvent>};

/** One bounded evidence scan per token/scope. Archive pagination is a separate operation. */
export function createSearchCoordinator(run:(chain:Chain,token:string,options:ScanOptions)=>Promise<InvestigationReport>){
 const jobs=new Map<string,Job>();
 return {scan(chain:Chain,token:string,options:ScanOptions={}):Promise<InvestigationReport>{
  if(options.signal?.aborted)return Promise.reject(options.signal.reason);
  if(options.mode&&options.mode!=='deep')return run(chain,token,options);
  const key=`${chain}:${chain==='solana'?token:token.toLowerCase()}:${options.expanded?200:100}:${options.fresh?'fresh':'normal'}`;
  let job=jobs.get(key);
  const start=!job;
  if(!job){job={controller:new AbortController(),listeners:new Set(),stages:new Map()};jobs.set(key,job);}
  const current=job;
  const promise=new Promise<InvestigationReport>((resolve,reject)=>{
   const cancel=()=>{
    current.listeners.delete(listener);listener.cleanup();reject(options.signal?.reason);
    if(!current.listeners.size){if(jobs.get(key)===current)jobs.delete(key);current.controller.abort();}
   };
   const listener:Listener={resolve,reject,onEvent:options.onEvent,cleanup:()=>options.signal?.removeEventListener('abort',cancel)};
   current.listeners.add(listener);options.signal?.addEventListener('abort',cancel,{once:true});
   for(const event of current.stages.values())options.onEvent?.(event);
  });
  if(start){
   const settle=(report?:InvestigationReport,error?:unknown)=>{
    if(jobs.get(key)===current)jobs.delete(key);
    for(const listener of current.listeners){listener.cleanup();if(report)listener.resolve(structuredClone(report));else listener.reject(error);}
    current.listeners.clear();
   };
   try{
    void run(chain,token,{...options,signal:current.controller.signal,onEvent:event=>{
     if(event.type==='stage')current.stages.set(event.stage,event);
     for(const listener of current.listeners)listener.onEvent?.(event);
    }}).then(report=>settle(report),error=>settle(undefined,error));
   }catch(error){settle(undefined,error);}
  }
  return promise;
 }};
}
