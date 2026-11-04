import {validateToken,type Chain,type Report} from './analysis';
import {readWalletActivity,WalletActivityRpcError,type WalletActivitySnapshot,type WalletActivity,type WalletActivityBatch} from './wallet-activity';
import {runEvmControlProbes,type EvmControlProbeResult} from './evm-control-probes';
export type SnapshotEnrichment={walletActivity?:WalletActivitySnapshot;controlProbes?:EvmControlProbeResult};
export type SnapshotEnrichmentOptions={signal?:AbortSignal;timeoutMs?:number;activityScope?:{kind:'pons-creation-ledger';maxAddresses:number}};
/** Server-only URLs are injected at the server boundary; never returned in evidence. */
export function createSnapshotEnrichment(deps:{rpcUrls?:Partial<Record<Chain,string|undefined>>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number;activityScheduler?:{now:()=>number;wait:(ms:number,signal:AbortSignal)=>Promise<void>}}={}){
 const fetcher=deps.fetcher||fetch;
 const now=deps.now||Date.now;
 const provenActivity=new Map<string,{wallet:WalletActivity;observedAt:string;storedAt:number}>();
 const signatureQueues=new Map<string,{tail:Promise<void>;lastStart:number}>();
 const activityQueues=new Map<string,{tail:Promise<void>;lastStart:number}>();
 const wait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.min(2_147_483_647,Math.max(0,ms)));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 return async(report:Report,options:SnapshotEnrichmentOptions={}):Promise<SnapshotEnrichment>=>{
  options.signal?.throwIfAborted();
  const url=deps.rpcUrls?.[report.chain];if(!url)return {};
  const expanded=report.chain==='robinhood'&&options.activityScope?.kind==='pons-creation-ledger';
  const timeoutMs=Math.min(deps.timeoutMs??(expanded?60000:10000),Math.max(1,options.timeoutMs??60_000)),deadline=AbortSignal.timeout(timeoutMs),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  const pacingNow=deps.activityScheduler?.now||(()=>performance.now()),pacingWait=deps.activityScheduler?.wait||wait;
  // Code and nonce each cost20 throughput CU. A qualified full snapshot
  // shares a conservative250CU/s lane with its control/header reads.
  // https://www.alchemy.com/docs/reference/compute-unit-costs
  const pace=async<T>(cost:number,combined:AbortSignal,run:()=>Promise<T>):Promise<T>=>{
   if(!expanded)return run();let queue=activityQueues.get(url);if(!queue){queue={tail:Promise.resolve(),lastStart:pacingNow()};activityQueues.set(url,queue);}
   const task=queue.tail.then(async()=>{combined.throwIfAborted();await pacingWait(Math.max(0,queue!.lastStart+cost*4-pacingNow()),combined);combined.throwIfAborted();queue!.lastStart=pacingNow();return run();});queue.tail=task.then(()=>{},()=>{});return task;
  };
  let id=0,batchRateLimited=false;const rpc=async(method:string,params:unknown[],requestSignal?:AbortSignal)=>{
   if(batchRateLimited)throw new WalletActivityRpcError('rate-limit');
   const combined=requestSignal?AbortSignal.any([signal,requestSignal]):signal;
   const requestId=++id;
   const signature=method==='getSignaturesForAddress';
   let queue=signatureQueues.get(url);
   if(signature&&!queue){queue={tail:Promise.resolve(),lastStart:-Infinity};signatureQueues.set(url,queue);}
   const execute=async()=>{
    let rateLimited=false;
    try{
     for(let attempt=0;attempt<3;attempt++){
      combined.throwIfAborted();
      // Share the signature lane across simultaneous scans. Fixed-size pages
      // do not need a burst that consumes the provider's rolling CU bucket.
      if(signature){await wait(250-(performance.now()-queue!.lastStart),combined);queue!.lastStart=performance.now();}
      const response=await pace(method==='eth_chainId'?5:method==='eth_call'?26:20,combined,()=>{if(batchRateLimited)throw new WalletActivityRpcError('rate-limit');return fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:combined,cache:'no-store'});});
      const body=await response.json().catch(()=>null);
      const throttled=response.status===429||body?.error?.code===429;
      const temporary=throttled||response.status===503;
      if(temporary){
       rateLimited ||= throttled;
       if(attempt===2)throw new WalletActivityRpcError(throttled?'rate-limit':'unavailable');
       const retry=response.headers.get('retry-after');
       const retryMs=retry===null?0:/^\d+(\.\d+)?$/.test(retry)?Number(retry)*1000:Math.max(0,Date.parse(retry)-Date.now());
       await wait(Math.max(1000*2**attempt,Number.isFinite(retryMs)?retryMs:0),combined);continue;
      }
      if(!response.ok||!body||body.error||body.id!==requestId||!Object.hasOwn(body,'result'))throw new WalletActivityRpcError('unavailable');return body.result;
     }
     throw new WalletActivityRpcError('unavailable');
    }catch(error){
     if(options.signal?.aborted)throw options.signal.reason;
     if(combined.aborted)throw new WalletActivityRpcError(rateLimited?'rate-limit':'deadline');
     if(error instanceof WalletActivityRpcError)throw error;
     throw new WalletActivityRpcError('unavailable');
    }
   };
   if(!signature)return execute();
   const task=queue!.tail.then(execute,execute);queue!.tail=task.then(()=>{},()=>{});
   return new Promise<unknown>((resolve,reject)=>{
    const abort=()=>reject(options.signal?.aborted?options.signal.reason:new WalletActivityRpcError('deadline'));
    combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();
    task.then(resolve,reject).finally(()=>combined.removeEventListener('abort',abort));
   });
  };
  // Only the creation-qualified Robinhood path uses paced five-account
  // batches. Reserve time for the final canonical anchor recheck.
  const batchDeadline=AbortSignal.timeout(Math.max(1,timeoutMs-3000));
  const rpcBatch:WalletActivityBatch=async(requests,requestSignal)=>{
   if(batchRateLimited)throw new WalletActivityRpcError('rate-limit');
   const combined=AbortSignal.any([signal,batchDeadline,...(requestSignal?[requestSignal]:[])]);
   try{
    combined.throwIfAborted();if(requests.length>50)throw new WalletActivityRpcError('unavailable');
    const payload=requests.map(q=>({jsonrpc:'2.0',id:++id,...q}));
    const response=await pace(requests.length*20,combined,()=>{if(batchRateLimited)throw new WalletActivityRpcError('rate-limit');return fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:combined,cache:'no-store',redirect:'error'});});
    if(response.status===429){await response.body?.cancel();batchRateLimited=true;throw new WalletActivityRpcError('rate-limit');}
    if(!response.ok||Number(response.headers.get('content-length'))>1048576||!response.body){await response.body?.cancel();throw new WalletActivityRpcError('unavailable');}
    const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
    for(;;){combined.throwIfAborted();const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>1048576){await reader.cancel();throw new WalletActivityRpcError('unavailable');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();
    const body=JSON.parse(text),rows=Array.isArray(body)?body:[body];
    if(rows.some(row=>row?.error&&(row.error.code===429||row.error.code===-32005||/rate.?limit|throughput|compute units/i.test(String(row.error.message||''))))){batchRateLimited=true;throw new WalletActivityRpcError('rate-limit');}
    if(!Array.isArray(body)||body.length>payload.length||body.some(row=>!row||row.jsonrpc!=='2.0'||!Number.isSafeInteger(row.id)))throw new WalletActivityRpcError('unavailable');
    const byId=new Map<number,unknown>(),duplicates=new Set<number>();
    for(const row of body){if(byId.has(row?.id))duplicates.add(row.id);byId.set(row?.id,row);}
    return payload.map(q=>{const row=byId.get(q.id) as {id?:number;error?:unknown;result?:unknown}|undefined;return row&&!duplicates.has(q.id)&&!row.error&&Object.hasOwn(row,'result')?{status:'fulfilled' as const,value:row.result}:{status:'rejected' as const,reason:new WalletActivityRpcError('unavailable')};});
   }catch(error){if(options.signal?.aborted)throw options.signal.reason;if(combined.aborted)throw new WalletActivityRpcError('deadline');if(error instanceof WalletActivityRpcError)throw error;throw new WalletActivityRpcError('unavailable');}
  };
  const norm=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
  const holders=report.holders.filter(h=>!validateToken(report.chain,h.address)&&norm(h.address)!==norm(report.market?.pairAddress||'')&&!['pool','exchange','bridge','burn'].includes(h.tag.toLowerCase()));
  const activity=async():Promise<WalletActivitySnapshot>=>{
   if(report.chain!=='solana')return readWalletActivity(report.chain,holders.map(h=>h.address),rpc,{signal:options.signal,now,...(expanded?{maxAddresses:options.activityScope!.maxAddresses,rpcBatch,batchSize:5,batchConcurrency:1}:{})});
   const addresses=[...new Set(holders.map(h=>h.address))],selected=addresses.slice(0,100),cached=new Map<string,WalletActivity>();
   const cacheKey=(address:string)=>`${report.chain}:${url}:${address}`;
   for(const address of selected){
    const key=cacheKey(address),entry=provenActivity.get(key),age=entry?now()-entry.storedAt:Infinity;
    if(entry&&age>=0&&age<=300_000)cached.set(address,{...entry.wallet,observedAt:entry.observedAt});
    else if(entry)provenActivity.delete(key);
   }
   const latest=await readWalletActivity(report.chain,selected.filter(address=>!cached.has(address)),rpc,{signal:options.signal,now});
   options.signal?.throwIfAborted();
   for(const wallet of latest.wallets){
    const row={...wallet,observedAt:latest.observedAt};cached.set(wallet.address,row);
    // A finalized lower bound above ten is reusable. Short, failed and
    // lifetime-fresh claims are never persisted as a nonfresh proof.
    if(wallet.fresh===false&&wallet.count!==null&&wallet.count>10&&wallet.basis==='solana-address-signatures'){
     const key=cacheKey(wallet.address);provenActivity.delete(key);provenActivity.set(key,{wallet:{...row},observedAt:latest.observedAt,storedAt:now()});
     while(provenActivity.size>1000)provenActivity.delete(provenActivity.keys().next().value!);
    }
   }
   const wallets=selected.map(address=>({...cached.get(address)!}));
   // Consumers that only know snapshot-level freshness receive its oldest
   // proof time. Cached rows never acquire a new observation timestamp.
   const oldest=Math.min(Date.parse(latest.observedAt),...wallets.map(wallet=>Date.parse(wallet.observedAt!)));
   return {...latest,observedAt:new Date(oldest).toISOString(),wallets,truncated:addresses.length>100};
  };
  const controls=()=>report.chain==='solana'?Promise.resolve(undefined):runEvmControlProbes({chain:report.chain,token:report.token,holders,recipient:holders[0]?.address||'0x000000000000000000000000000000000000dEaD',signal:options.signal,now:deps.now,timeoutMs:deps.timeoutMs??(expanded?15000:undefined)},rpc);
  // Expanded activity shares the paced endpoint lane with these fifteen
  // bounded reads. Finish controls and their anchor check before admitting
  // large activity batches; otherwise their own deadline can expire in queue.
  // Both passes still share the existing overall deadline and CU pacing.
  const controlTask=expanded?controls():undefined;
  const activityTask=controlTask?controlTask.then(activity,activity):activity();
  const tasks=await Promise.allSettled([activityTask,controlTask||controls()]);
  options.signal?.throwIfAborted();
  return {walletActivity:tasks[0].status==='fulfilled'?tasks[0].value:undefined,controlProbes:tasks[1].status==='fulfilled'?tasks[1].value:undefined};
 };
}
