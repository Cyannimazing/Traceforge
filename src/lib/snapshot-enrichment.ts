import {validateToken,type Chain,type Report} from './analysis';
import {readWalletActivity,type WalletActivitySnapshot} from './wallet-activity';
import {runEvmControlProbes,type EvmControlProbeResult} from './evm-control-probes';
export type SnapshotEnrichment={walletActivity?:WalletActivitySnapshot;controlProbes?:EvmControlProbeResult};
/** Server-only URLs are injected at the server boundary; never returned in evidence. */
export function createSnapshotEnrichment(deps:{rpcUrls?:Partial<Record<Chain,string|undefined>>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number}={}){
 const fetcher=deps.fetcher||fetch;
 return async(report:Report,options:{signal?:AbortSignal}={}):Promise<SnapshotEnrichment>=>{
  const url=deps.rpcUrls?.[report.chain];if(!url)return {};
  const deadline=AbortSignal.timeout(deps.timeoutMs??10000),signal=options.signal?AbortSignal.any([options.signal,deadline]):deadline;
  let id=0;const rpc=async(method:string,params:unknown[],requestSignal?:AbortSignal)=>{
   const combined=requestSignal?AbortSignal.any([signal,requestSignal]):signal;combined.throwIfAborted();
   const requestId=++id;
   for(let attempt=0;attempt<2;attempt++){
    combined.throwIfAborted();
    const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:combined,cache:'no-store'});
    if((response.status===429||response.status===503)&&attempt===0){
     await response.body?.cancel();
     await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(combined.reason);};const timer=setTimeout(()=>{combined.removeEventListener('abort',abort);resolve();},500);combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort();});
     continue;
    }
    if(!response.ok)throw Error('RPC unavailable');
    const body=await response.json();if(!body||body.error||body.id!==requestId||!Object.hasOwn(body,'result'))throw Error('RPC response unavailable');return body.result;
   }
   throw Error('RPC unavailable');
  };
  const norm=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
  const holders=report.holders.filter(h=>!validateToken(report.chain,h.address)&&norm(h.address)!==norm(report.market?.pairAddress||'')&&!['pool','exchange','bridge','burn'].includes(h.tag.toLowerCase()));
  const tasks=await Promise.allSettled([
   readWalletActivity(report.chain,holders.map(h=>h.address),rpc,{signal:options.signal,now:deps.now}),
   report.chain==='solana'?Promise.resolve(undefined):runEvmControlProbes({chain:report.chain,token:report.token,holders,recipient:holders[0]?.address||'0x000000000000000000000000000000000000dEaD',signal:options.signal,now:deps.now,timeoutMs:deps.timeoutMs},rpc),
  ]);
  options.signal?.throwIfAborted();
  return {walletActivity:tasks[0].status==='fulfilled'?tasks[0].value:undefined,controlProbes:tasks[1].status==='fulfilled'?tasks[1].value:undefined};
 };
}
