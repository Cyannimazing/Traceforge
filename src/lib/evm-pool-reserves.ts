import {SUPPORTED_POOL_FACTORIES} from './pool-launch';

// Independently pinned contract reads, not a trade quote.
// https://developer.pancakeswap.finance/contracts/v2/addresses
// https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol
// https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
export type EvmReserveChain='ethereum'|'base'|'bsc';
type Asset={address:string;reserveRaw:string;balanceRaw:string;decimals:number};
export type EvmPoolReserveSnapshot={chain:EvmReserveChain;protocol:'uniswap-v2'|'pancakeswap-v2';pool:string;factory:string;token:string;base:Asset;quote:Asset;totalSupplyRaw:string;holders:{address:string;status:'observed'|'unknown';balanceRaw?:string}[];holdersTruncated:boolean;blockNumber:number;blockHash:string;blockTimestamp:string;blockRef:string;observedAt:string;finality:'finalized';source:string;evidenceId:string;constantProductEligible:boolean;feeBps:null;limitations:string[]};
export type EvmPoolReserveResult={status:'verified'|'unknown';snapshot?:EvmPoolReserveSnapshot;reasons:string[]};
type Dependencies={rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number};
const PANCAKE:Record<EvmReserveChain,string>={ethereum:'0x1097053fd2ea711dad45caccc45eff7548fcb362',base:'0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',bsc:'0xca143ce32fe78f1f7019d7d551a6402fc5350c73'};
const CHAIN_IDS:Record<EvmReserveChain,string>={ethereum:'0x1',base:'0x2105',bsc:'0x38'};
const address=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&!/^0x0{40}$/i.test(v);
export function isSupportedEvmPoolFactory(chain:EvmReserveChain,factory:string):boolean{
 if(!Object.hasOwn(CHAIN_IDS,chain)||!address(factory))return false;const normalized=factory.toLowerCase();
 return normalized===PANCAKE[chain]||(chain!=='bsc'&&normalized===SUPPORTED_POOL_FACTORIES[chain].v2);
}
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const word=(v:unknown)=>{if(typeof v!=='string'||!/^0x[0-9a-f]{64}$/i.test(v))throw Error('Invalid ABI word');return BigInt(v);};
const addrWord=(v:unknown)=>{if(typeof v!=='string'||!/^0x0{24}[0-9a-f]{40}$/i.test(v))throw Error('Invalid ABI address');const a='0x'+v.slice(26).toLowerCase();if(!address(a))throw Error('Zero address');return a;};
const pad=(a:string)=>a.slice(2).padStart(64,'0');
const quantity=(v:unknown)=>{if(typeof v!=='string'||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v))throw Error('Invalid quantity');const n=Number(BigInt(v));if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid quantity');return n;};
const block=(v:unknown)=>{const b=obj(v),number=quantity(b.number),timestamp=quantity(b.timestamp);if(typeof b.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(b.hash))throw Error('Invalid block');return {number,hash:b.hash.toLowerCase(),timestamp:new Date(timestamp*1000).toISOString(),tag:'0x'+number.toString(16)};};
async function mapBounded<T,R>(items:T[],fn:(item:T)=>Promise<R>):Promise<R[]>{let index=0;const output:R[]=[];await Promise.all(Array.from({length:Math.min(3,items.length)},async()=>{for(;;){const i=index++;if(i>=items.length)return;output[i]=await fn(items[i]);}}));return output;}

export function createEvmPoolReserves(deps:Dependencies={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now;
 return async(chain:EvmReserveChain,poolInput:string,tokenInput:string,options:{holders?:string[];signal?:AbortSignal}={}):Promise<EvmPoolReserveResult>=>{
  options.signal?.throwIfAborted();const unknown=(reason:string):EvmPoolReserveResult=>({status:'unknown',reasons:[reason]});
  if(!Object.hasOwn(CHAIN_IDS,chain)||!address(poolInput)||!address(tokenInput))return unknown('Pool, token or chain is invalid.');
  const pool=poolInput.toLowerCase(),token=tokenInput.toLowerCase();
  // Only BSC has a documented public fallback. Configured failures do not silently switch providers.
  const url=deps.rpcUrl||(chain==='bsc'?'https://bsc-dataseed-public.bnbchain.org':undefined);
  if(!url)return unknown('A configured chain RPC is required for reserve verification.');
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.max(50,Math.min(15000,deps.timeoutMs??10000)));let id=0;
  const rpc=async(method:string,params:unknown[])=>{
   controller.signal.throwIfAborted();const requestId=++id;if(requestId>38)throw Error('Request bound exceeded');
   let rejectAbort:(()=>void)|undefined;
   const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(Error('Aborted'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
   try{return await Promise.race([cancelled,(async()=>{
    const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
    if(!response.ok)throw Error('RPC unavailable');const text=await response.text();if(text.length>100000)throw Error('RPC response too large');const b=obj(JSON.parse(text));if(b.error||b.id!==requestId||b.jsonrpc!=='2.0'||!Object.hasOwn(b,'result'))throw Error('RPC response invalid');return b.result;
   })()]);}finally{if(rejectAbort)controller.signal.removeEventListener('abort',rejectAbort);}
  };
  try{
   if(await rpc('eth_chainId',[])!==CHAIN_IDS[chain])return unknown('RPC chain identity does not match the selected network.');
   const anchor=block(await rpc('eth_getBlockByNumber',['finalized',false]));
   const currentAnchor=()=>{const age=now()-Date.parse(anchor.timestamp);return Number.isFinite(age)&&age>=-120000&&age<=900000;};
   if(!currentAnchor())return unknown('Finalized block timestamp is stale or outside the allowed clock skew.');
   const call=(to:string,data:string)=>rpc('eth_call',[{to,data},anchor.tag]);
   const code=async(a:string)=>{const c=await rpc('eth_getCode',[a,anchor.tag]);if(typeof c!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(c)||/^0x(?:00)+$/i.test(c))throw Error('Contract bytecode unavailable');};
   await code(pool);
   const [t0raw,t1raw,fraw,reserves]=await mapBounded(['0x0dfe1681','0xd21220a7','0xc45a0155','0x0902f1ac'],s=>call(pool,s));
   const t0=addrWord(t0raw),t1=addrWord(t1raw),factory=addrWord(fraw);
   if(t0===t1||![t0,t1].includes(token))return unknown('Verified pool token identities do not contain the scanned token.');
   if(!isSupportedEvmPoolFactory(chain,factory))return unknown('Pool factory is outside the verified V2 deployment allowlist.');
   if(addrWord(await call(factory,'0xe6a43905'+pad(t0)+pad(t1)))!==pool)return unknown('Official factory membership does not match the selected pool.');
   await mapBounded([factory,t0,t1],code);
   if(typeof reserves!=='string'||!/^0x[0-9a-f]{192}$/i.test(reserves))throw Error('Invalid reserves');
   const words=[0,1,2].map(i=>BigInt('0x'+reserves.slice(2+i*64,66+i*64)));
   if(words[0]>=1n<<112n||words[1]>=1n<<112n||words[2]>=1n<<32n)throw Error('Invalid reserve width');
   const [d0,d1,supply,b0,b1]=await mapBounded([[t0,'0x313ce567'],[t1,'0x313ce567'],[token,'0x18160ddd'],[t0,'0x70a08231'+pad(pool)],[t1,'0x70a08231'+pad(pool)]],async([a,s])=>word(await call(a,s)));
   if(d0>255n||d1>255n||supply===0n)throw Error('Invalid decimals or supply');
   const a0:Asset={address:t0,reserveRaw:words[0].toString(),balanceRaw:b0.toString(),decimals:Number(d0)},a1:Asset={address:t1,reserveRaw:words[1].toString(),balanceRaw:b1.toString(),decimals:Number(d1)};
   const base=token===t0?a0:a1,quote=token===t0?a1:a0;
   const candidates=[...new Set((options.holders||[]).filter(address).map(a=>a.toLowerCase()))].filter(a=>a!==pool);
   const holders=await mapBounded(candidates.slice(0,20),async(a):Promise<EvmPoolReserveSnapshot['holders'][number]>=>{try{const balance=word(await call(token,'0x70a08231'+pad(a)));if(balance>supply)throw Error('Balance exceeds supply');return {address:a,status:'observed',balanceRaw:balance.toString()};}catch{return {address:a,status:'unknown'};}});
   if(holders.reduce((sum,h)=>sum+(h.status==='observed'?BigInt(h.balanceRaw!):0n),BigInt(base.balanceRaw))>supply)return unknown('Verified distinct holder and pool balances exceed the scanned token total supply.');
   const again=block(await rpc('eth_getBlockByNumber',[anchor.tag,false]));if(again.hash!==anchor.hash||again.number!==anchor.number||again.timestamp!==anchor.timestamp)return unknown('Pinned block identity changed during reserve verification.');
   if(!currentAnchor())return unknown('Finalized block timestamp became stale during reserve verification.');
   const limitations=['Nominal fee-free constant-product scenario only. Transfer taxes, token restrictions, slippage, actual sellability and realized execution are not established.'];
   let eligible=true;
   if(words[0]===0n||words[1]===0n){eligible=false;limitations.push('Zero reserves do not support constant-product impact.');}
   if(b0!==words[0]||b1!==words[1]){eligible=false;limitations.push('Pool token balance differs from recorded reserves; unsynced transfers or token mechanics prevent this nominal calculation.');}
   if(BigInt(base.balanceRaw)>supply){eligible=false;limitations.push('Pool balance exceeds the scanned token total supply.');}
   if(holders.some(h=>h.status==='unknown'))limitations.push('Some requested holder balances were unavailable at the pinned block.');
   if(candidates.length>20)limitations.push('Holder balance verification is bounded to the first 20 distinct supplied addresses.');
   options.signal?.throwIfAborted();const observedAt=new Date(now()).toISOString();
   return {status:'verified',reasons:[],snapshot:{chain,protocol:factory===PANCAKE[chain]?'pancakeswap-v2':'uniswap-v2',pool,factory,token,base,quote,totalSupplyRaw:supply.toString(),holders,holdersTruncated:candidates.length>20,blockNumber:anchor.number,blockHash:anchor.hash,blockTimestamp:anchor.timestamp,blockRef:`${chain}:${anchor.number}:${anchor.hash}`,observedAt,finality:'finalized',source:deps.rpcUrl?'Configured EVM RPC - verified V2 pool reserves':'BNB Chain public RPC - verified PancakeSwap V2 reserves',evidenceId:`reserve:v2:${chain}:${pool}:${anchor.hash}`,constantProductEligible:eligible,feeBps:null,limitations}};
  }catch{options.signal?.throwIfAborted();return unknown(controller.signal.aborted?'Reserve verification exceeded its bounded deadline.':'Reserve RPC data was unavailable or malformed; no balance or reserve is inferred.');}
  finally{clearTimeout(timer);controller.abort();options.signal?.removeEventListener('abort',abort);}
 };
}
