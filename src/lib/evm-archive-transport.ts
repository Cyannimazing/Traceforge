import type {EvmTransferArchiveStatus} from './evm-transfer-archive';

/** One transport per search. A previously exhausted index must check the new
 * finalized head once before its old exhaustion can settle this search. */
export function createEvmArchiveTransport(options:{chain:'ethereum'|'base';token:string;fetcher?:typeof fetch;now?:()=>number;onUnsupported?:(message:string)=>void}){
 const token=options.token.toLowerCase(),fetcher=options.fetcher||fetch,now=options.now||Date.now;
 const url=`/api/history/transfers?chain=${options.chain}&token=${encodeURIComponent(token)}`;
 let initial=true,pendingHead:number|undefined;
 async function call(method:'GET'|'POST',signal:AbortSignal,update=false):Promise<EvmTransferArchiveStatus|null>{
  const response=await fetcher(url,{method,signal,cache:'no-store',...(update?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update'})}:{})});
  const data=await response.json();signal.throwIfAborted();
  if(response.status===501||data.supported===false){options.onUnsupported?.(data.error||'No compatible authorized archive is configured.');return null;}
  if(!response.ok){const error=Object.assign(Error(data.error||'Transfer history is temporarily unavailable. Saved pages will retry.'),{retryAt:undefined as number|undefined});const retry=response.headers.get('Retry-After'),seconds=retry===null?NaN:Number(retry),date=retry?Date.parse(retry):NaN;if(Number.isFinite(seconds))error.retryAt=now()+Math.max(1000,seconds*1000);else if(Number.isFinite(date))error.retryAt=date;else if(response.status===429)error.retryAt=now()+60000;throw error;}
  if(!data||typeof data!=='object'||!('progress' in data))throw Error('Transfer archive returned invalid progress.');
  const p=data.progress as EvmTransferArchiveStatus|null;
  if(p&&(p.chain!==options.chain||p.token!==token||typeof p.indexComplete!=='boolean'||!Number.isSafeInteger(p.headChecks)))throw Error('Transfer archive response was invalid or belonged to another token.');
  return p;
 }
 return async(method:'GET'|'POST',signal:AbortSignal):Promise<EvmTransferArchiveStatus|null>=>{
  let progress=await call(method,signal,pendingHead!==undefined&&method==='POST');
  if(initial){initial=false;if(progress&&!progress.hasMore)pendingHead=progress.headChecks;}
  if(pendingHead===undefined||!progress)return progress;
  if(progress.headChecks>pendingHead){pendingHead=undefined;return progress;}
  if(progress.status==='running'||(progress.retryAt||0)>now())return {...progress,hasMore:true,indexComplete:false};
  // A previous update failed before reaching the head. Keep the requirement
  // pending and retry; an old exhausted snapshot is not fresh evidence.
  if(method==='GET')progress=await call('POST',signal,true);
  if(!progress)return null;
  if(progress.headChecks>pendingHead){pendingHead=undefined;return progress;}
  if(progress.status==='running'||(progress.retryAt||0)>now())return {...progress,hasMore:true,indexComplete:false};
  throw Error('Finalized head has not been checked yet. Retrying from the saved checkpoint.');
 };
}
