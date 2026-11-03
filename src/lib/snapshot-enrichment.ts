import {validateToken,type Chain,type Report} from './analysis';
import {readWalletActivity,WalletActivityRpcError,type WalletActivitySnapshot,type WalletActivity} from './wallet-activity';
import {runEvmControlProbes,type EvmControlProbeResult} from './evm-control-probes';
export type SnapshotEnrichment={walletActivity?:WalletActivitySnapshot;controlProbes?:EvmControlProbeResult};
/** Server-only URLs are injected at the server boundary; never returned in evidence. */
export function createSnapshotEnrichment(deps:{rpcUrls?:Partial<Record<Chain,string|undefined>>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number}={}){
 const fetcher=deps.fetcher||fetch;
 const now=deps.now||Date.now;
 const provenActivity=new Map<string,{wallet:WalletActivity;observedAt:string;storedAt:number}>();
 const signatureQueues=new Map<string,{tail:Promise<void>;lastStart:number}>();
 const wait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.min(2_147_483_647,Math.max(0,ms)));
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 });
 return async(report:Report,options:{signal?:AbortSignal}={}):Promise<SnapshotEnrichment>=>{
  options.signal?.throwIfAborted();
  const url=deps.rpcUrls?.[report.chain];if(!url)return {};
  const deadline=AbortSignal.timeout(deps.timeoutMs??10000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  let id=0;const rpc=async(method:string,params:unknown[],requestSignal?:AbortSignal)=>{
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
      const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:combined,cache:'no-store'});
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
  const norm=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
  const holders=report.holders.filter(h=>!validateToken(report.chain,h.address)&&norm(h.address)!==norm(report.market?.pairAddress||'')&&!['pool','exchange','bridge','burn'].includes(h.tag.toLowerCase()));
  const activity=async():Promise<WalletActivitySnapshot>=>{
   if(report.chain!=='solana')return readWalletActivity(report.chain,holders.map(h=>h.address),rpc,{signal:options.signal,now});
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
  const tasks=await Promise.allSettled([
   activity(),
   report.chain==='solana'?Promise.resolve(undefined):runEvmControlProbes({chain:report.chain,token:report.token,holders,recipient:holders[0]?.address||'0x000000000000000000000000000000000000dEaD',signal:options.signal,now:deps.now,timeoutMs:deps.timeoutMs},rpc),
  ]);
  options.signal?.throwIfAborted();
  return {walletActivity:tasks[0].status==='fulfilled'?tasks[0].value:undefined,controlProbes:tasks[1].status==='fulfilled'?tasks[1].value:undefined};
 };
}
