import {validateToken,type Chain} from './analysis';
export type HistoryCandidate={pool:string;venue:string;source:string;creationTimeHint?:number;creationTransactionHint?:string};
export type HistoryDiscovery={candidates:HistoryCandidate[];observedCandidates:number;excluded:number;truncated:boolean;completeRegistry:false;fetchedAt:string;detail:string;registry?:{status:'complete'|'partial';discovered:number;pendingRanges:number|null;completedRanges:number;anchor:number|null;detail:string;retryAt?:number}};
export function parseHistoryCandidates(payload:unknown,chain:Chain,token:string,limit=20):HistoryDiscovery{
 if(!Array.isArray(payload))throw Error('Pool discovery returned an invalid dataset.');
 const norm=(s:string)=>chain==='solana'?s:s.toLowerCase(),found=new Map<string,HistoryCandidate>();let excluded=0;
 for(const item of payload){
  if(!item||typeof item!=='object'){excluded++;continue;}
  const row=item as Record<string,any>;
  if(row.chainId!==chain||![row.baseToken?.address,row.quoteToken?.address].some(a=>typeof a==='string'&&norm(a)===norm(token))){excluded++;continue;}
  if(typeof row.pairAddress!=='string'||validateToken(chain,row.pairAddress)){excluded++;continue;}
  const pool=norm(row.pairAddress);if(found.has(pool))continue;
  found.set(pool,{pool,venue:typeof row.dexId==='string'?row.dexId.slice(0,80):'Unidentified venue',source:'DEX Screener candidate feed',...(Number.isFinite(row.pairCreatedAt)&&row.pairCreatedAt>0?{creationTimeHint:row.pairCreatedAt}:{} )});
 }
 const candidates=[...found.values()].sort((a,b)=>(a.creationTimeHint??Infinity)-(b.creationTimeHint??Infinity)||a.pool.localeCompare(b.pool));
 return {candidates:candidates.slice(0,limit),observedCandidates:candidates.length,excluded,truncated:candidates.length>limit,completeRegistry:false,fetchedAt:new Date().toISOString(),detail:`Candidate feed only; inactive or unlisted pools and unsupported pool identifiers may be missing. Each candidate still requires independent factory/token/receipt verification. No token-global launch claim. ${excluded} unrelated or unsupported rows excluded.`};
}
export async function discoverHistoryPools(chain:Chain,token:string,expanded=false,signal?:AbortSignal):Promise<HistoryDiscovery>{
 if(validateToken(chain,token))throw Error('Invalid token address.');
 const response=await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain}/${encodeURIComponent(token)}`,{cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(12_000),...(signal?[signal]:[])])});
 if(!response.ok)throw Error('Pool discovery is unavailable. Existing checkpoints were preserved.');
 return parseHistoryCandidates(await response.json(),chain,token,expanded?100:20);
}
