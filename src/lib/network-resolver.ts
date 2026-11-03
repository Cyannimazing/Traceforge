import {CHAINS,type Chain} from './analysis';
import {tokenRouteTarget} from './token-route';
import {publicJson} from './providers';

type EvmChain=Exclude<Chain,'solana'>;
export type NetworkCandidate={chain:Chain;liquidityUsd:number|null;pairs:number};
export type NetworkResolution={token:string;chain:Chain;method:'address-format'|'dex-liquidity'|'rpc-code';candidates:NetworkCandidate[];notice?:string};
export class NetworkResolutionError extends Error {
 constructor(message:string,public status:number,public candidates:NetworkCandidate[]=[]){super(message);this.name='NetworkResolutionError';}
}
const EVM:EvmChain[]=['ethereum','base','bsc'];
const IDS:Record<EvmChain,string>={ethereum:'0x1',base:'0x2105',bsc:'0x38'};
const PUBLIC_RPC:Record<EvmChain,string>={ethereum:'https://ethereum-rpc.publicnode.com',base:'https://mainnet.base.org',bsc:'https://bsc-dataseed-public.bnbchain.org'};
const aliases:Record<string,Chain>={ethereum:'ethereum',eth:'ethereum',base:'base',bsc:'bsc',bnb:'bsc','binance-smart-chain':'bsc',solana:'solana',sol:'solana'};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
async function bounded<T>(task:Promise<T>,signal:AbortSignal):Promise<T>{
 signal.throwIfAborted();let rejectAbort:()=>void=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(signal.reason);signal.addEventListener('abort',rejectAbort,{once:true});});
 try{return await Promise.race([task,cancelled]);}finally{signal.removeEventListener('abort',rejectAbort);}
}
/** Matching observed markets, not a claim that an EVM address exists on only
 * one network. Aliases are canonicalized before matching and aggregation. */
export function marketNetworkCandidates(payload:unknown,token:string):NetworkCandidate[]{
 const rows=object(payload).pairs;if(!Array.isArray(rows)||rows.length>1000)throw Error('Market response missing or outside bounds');
 const pairs=new Map<string,{chain:EvmChain;liquidity:number|null}>();
 for(const raw of rows.slice(0,1000)){
  const row=object(raw),chain=typeof row.chainId==='string'&&Object.hasOwn(aliases,row.chainId.toLowerCase())?aliases[row.chainId.toLowerCase()]:undefined;
  if(!chain||chain==='solana')continue;
  const base=object(row.baseToken).address,quote=object(row.quoteToken).address;
  if(![base,quote].some(address=>typeof address==='string'&&address.toLowerCase()===token))continue;
  if(typeof row.pairAddress!=='string'||!/^0x[\da-f]{40}$/i.test(row.pairAddress))continue;
  const value=object(row.liquidity).usd,liquidity=typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
  const key=`${chain}:${row.pairAddress.toLowerCase()}`,old=pairs.get(key);
  if(!old||liquidity!==null&&(old.liquidity===null||liquidity>old.liquidity))pairs.set(key,{chain,liquidity});
 }
 const totals=new Map<EvmChain,NetworkCandidate>();
 for(const pair of pairs.values()){
  const old=totals.get(pair.chain)||{chain:pair.chain,liquidityUsd:0,pairs:0};
  const sum=old.liquidityUsd===null||pair.liquidity===null?null:old.liquidityUsd+pair.liquidity;
  totals.set(pair.chain,{chain:pair.chain,pairs:old.pairs+1,liquidityUsd:sum!==null&&Number.isFinite(sum)?sum:null});
 }
 return [...totals.values()].sort((a,b)=>(b.liquidityUsd??-1)-(a.liquidityUsd??-1)||a.chain.localeCompare(b.chain));
}

export function createNetworkResolver(deps:{getMarkets?:(token:string,signal:AbortSignal)=>Promise<unknown>;fetcher?:typeof fetch;rpcUrls?:Partial<Record<EvmChain,string|undefined>>;timeoutMs?:number}={}){
 const getMarkets=deps.getMarkets||((token,signal)=>publicJson(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(token)}`,signal)),fetcher=deps.fetcher||fetch;
 return async(input:string,options:{signal?:AbortSignal}={}):Promise<NetworkResolution>=>{
  options.signal?.throwIfAborted();const token=input.trim();
  const evm=tokenRouteTarget('ethereum',token),solana=tokenRouteTarget('solana',token);
  if(!evm){if(solana)return {...solana,method:'address-format',candidates:[{chain:'solana',liquidityUsd:null,pairs:0}],notice:'Solana address format identified. The scan still verifies the token account and available evidence.'};throw new NetworkResolutionError('Paste a valid Solana mint or 42-character EVM token address.',400);}
  const controller=new AbortController(),abort=()=>controller.abort(options.signal?.reason),timeout=Math.max(25,Math.min(12000,deps.timeoutMs??5000));
  options.signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>controller.abort(),timeout),signal=controller.signal;
  try{
   let candidates:NetworkCandidate[]=[];
   try{const dexSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.floor(timeout*.55)))]);candidates=marketNetworkCandidates(await bounded(getMarkets(evm.token,dexSignal),dexSignal),evm.token);}catch{options.signal?.throwIfAborted();}
   if(candidates.length){
    if(candidates.length>1&&(candidates.some(c=>c.liquidityUsd===null)||candidates[0].liquidityUsd===candidates[1].liquidityUsd))throw new NetworkResolutionError('This address has markets on multiple networks without a unique liquidity leader. Choose the network explicitly.',422,candidates);
    return {token:evm.token,chain:candidates[0].chain,method:'dex-liquidity',candidates,notice:candidates.length>1?`Selected ${CHAINS[candidates[0].chain].name} by highest reported DEX liquidity. This address also has matching markets on ${candidates.slice(1).map(c=>CHAINS[c.chain].name).join(', ')}; choose a different network if intended.`:'Network identified from matching DEX market records; market presence does not verify token safety.'};
   }
   const probes=await bounded(Promise.all(EVM.map(async chain=>{
    const url=deps.rpcUrls?.[chain]||PUBLIC_RPC[chain];let id=0;
    const rpc=async(method:string,params:unknown[])=>{
     const requestId=++id,response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal,cache:'no-store',redirect:'error'});
     if(!response.ok)throw Error('Unavailable');const text=await response.text();if(text.length>200000)throw Error('Oversized');const row=object(JSON.parse(text));if(row.jsonrpc!=='2.0'||row.id!==requestId||row.error)throw Error('Invalid');return row.result;
    };
    try{if(await rpc('eth_chainId',[])!==IDS[chain])return {chain,code:null};const code=await rpc('eth_getCode',[evm.token,'latest']);if(typeof code!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(code))return {chain,code:null};return {chain,code:code!=='0x'};}catch{return {chain,code:null};}
   })),signal);
   const present=probes.filter(p=>p.code===true).map(p=>({chain:p.chain,liquidityUsd:null,pairs:0}));
   if(probes.some(p=>p.code===null))throw new NetworkResolutionError('Some networks could not be checked. Choose the token network explicitly or retry Auto.',503,present);
   if(present.length>1)throw new NetworkResolutionError('Contract code exists at this address on multiple networks. Choose the intended network explicitly.',422,present);
   if(!present.length)throw new NetworkResolutionError('No matching supported-network market or contract code was found. Check the address or choose its network explicitly.',404);
   return {token:evm.token,chain:present[0].chain,method:'rpc-code',candidates:present,notice:'Contract code was found on one checked network. This does not verify that the contract is a token; the scan performs further checks.'};
  }catch(error){options.signal?.throwIfAborted();if(error instanceof NetworkResolutionError)throw error;throw new NetworkResolutionError('Automatic network lookup timed out or was unavailable. Choose the network explicitly or retry.',503);}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);controller.abort();}
 };
}
