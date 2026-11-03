import {decodeEventLog,parseAbiItem,toEventSelector,type Hex} from 'viem';
import {validateToken,type Chain,type Report} from './analysis';
import type {TradeRecord} from './investigation';

export type PoolProtocol='v2'|'v3';type Protocol=PoolProtocol;export type PoolChain='ethereum'|'base';type SupportedChain=PoolChain;type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const str=(v:unknown)=>typeof v==='string'?v:'';
const addr=(v:unknown)=>typeof v==='string'&&!validateToken('ethereum',v)?v.toLowerCase():undefined;
const hash=(v:unknown)=>typeof v==='string'&&/^0x[\da-f]{64}$/i.test(v)?v.toLowerCase():undefined;
const uint=(v:unknown)=>{
 if(typeof v!=='number'&&typeof v!=='string')return undefined;
 if(typeof v==='string'&&!/^(0x[\da-f]+|\d+)$/i.test(v))return undefined;
 const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:undefined;
};
const hex=(n:number)=>`0x${n.toString(16)}`;
const V2_CREATE=parseAbiItem('event PairCreated(address indexed token0,address indexed token1,address pair,uint256 count)');
const V3_CREATE=parseAbiItem('event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)');
const V2_SWAP=parseAbiItem('event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)');
const V3_SWAP=parseAbiItem('event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)');
// Exact official deployments; clones/other exchanges are deliberately unsupported.
export const SUPPORTED_POOL_FACTORIES:Readonly<Record<SupportedChain,Readonly<Partial<Record<Protocol,string>>>>>= {ethereum:{v2:'0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f',v3:'0x1f98431c8ad98523631ae4a59f267346ea31f984'},base:{v2:'0x8909dc15e40173ff4699343b6eb8132c65e18ec6',v3:'0x33128a8fc17869897dce68ed026d694621f6fdfd'}};
const FACTORIES=SUPPORTED_POOL_FACTORIES;
export const POOL_CREATION_TOPICS={v2:toEventSelector(V2_CREATE),v3:toEventSelector(V3_CREATE)} as const;
const RPCS:Record<SupportedChain,string>={ethereum:'https://ethereum-rpc.publicnode.com',base:'https://mainnet.base.org'};
class VerificationError extends Error{}
class RpcEvidenceError extends VerificationError{recorded=false;constructor(message:string,readonly kind?:'range'|'rate'|'archive'|'unavailable',readonly retryAfterMs=kind==='rate'?60_000:undefined){super(message);}}
class SliceComplete extends VerificationError{}
class WaitingForHead extends SliceComplete{}
function rpcFailure(error:unknown,status?:number){
 const row=obj(error),message=str(row.message);
 if(status===429||row.code===-32011||/rate.?limit|request limit reached|too many requests/i.test(message))return new RpcEvidenceError('The RPC provider is rate limited. Retry this provider later or configure an authorized RPC with sufficient capacity.','rate');
 if(/block range|range.{0,20}(large|wide|limit)|too many (results|logs)|query returned more|response size/i.test(message))return new RpcEvidenceError('The provider requires a smaller historical log range.','range');
 if(status===401||status===403||/archive|historical|personal token|api.?key|unauthori[sz]ed|authentication/i.test(message))return new RpcEvidenceError('The selected provider cannot serve the requested historical evidence. Configure an authorized archive RPC for this chain.','archive');
 return new VerificationError('Required RPC evidence was unavailable.');
}
type Log={address:string;transactionHash:string;blockNumber:number;blockHash?:string;logIndex:number;data:Hex;topics:[Hex,...Hex[]]};
function parseLog(value:unknown):Log{
 const row=obj(value),address=addr(row.address),transactionHash=hash(row.transactionHash),blockNumber=uint(row.blockNumber),logIndex=uint(row.logIndex);
 // Blockscout's LogsView emits all four slots, including trailing nulls.
 // Never remove a missing interior topic: that would change indexed arguments.
 const topics=Array.isArray(row.topics)?[...row.topics]:[];
 while(topics.at(-1)===null)topics.pop();
 if(!address||!transactionHash||blockNumber===undefined||logIndex===undefined||row.removed===true||!/^0x[\da-f]*$/i.test(str(row.data))||!topics.length||topics.length>4||!topics.every(t=>hash(t)))throw new VerificationError('A log was missing canonical event fields or was removed.');
 return {address,transactionHash,blockNumber,logIndex,blockHash:hash(row.blockHash),data:row.data as Hex,topics:topics as [Hex,...Hex[]]};
}
/** Decodes an allowlisted factory log. Callers must separately verify its
 * canonical block and successful transaction receipt before claiming evidence. */
export function decodePoolCreationEvent(chain:Chain,value:unknown):{protocol:Protocol;factory:string;pool:string;token0:string;token1:string;transaction:string;blockNumber:number;blockHash?:string;logIndex:number;fee?:number}|undefined{
 if(chain!=='ethereum'&&chain!=='base')return undefined;
 try{
  const l=parseLog(value);
  for(const protocol of ['v2','v3'] as const){
   const factory=FACTORIES[chain][protocol];if(l.address!==factory)continue;
   const event=decodeEventLog({abi:[protocol==='v2'?V2_CREATE:V3_CREATE],topics:l.topics,data:l.data,strict:true}),a=event.args as unknown as Row;
   const pool=addr(protocol==='v2'?a.pair:a.pool),token0=addr(a.token0),token1=addr(a.token1);
   if(pool&&token0&&token1&&token0!==token1)return {protocol,factory,pool,token0,token1,transaction:l.transactionHash,blockNumber:l.blockNumber,blockHash:l.blockHash,logIndex:l.logIndex,...(protocol==='v3'?{fee:uint(a.fee)}:{})};
  }
 }catch{/* Unrelated/malformed events cannot become creation candidates. */}
 return undefined;
}
/** Direction is the scanned token's flow relative to the pool. Sender/recipient
 * indexed event fields are routers/pools in common paths, never wallet identity. */
export function decodePoolSwap(protocol:Protocol,value:unknown,targetIsToken0:boolean):{side:'buy'|'sell';amountRaw:bigint}|undefined{
 const row=obj(value),event=decodeEventLog({abi:[protocol==='v2'?V2_SWAP:V3_SWAP],topics:row.topics as [Hex,...Hex[]],data:row.data as Hex,strict:true}),a=event.args as unknown as Record<string,bigint>;
 if(protocol==='v3'){
  const target=targetIsToken0?a.amount0:a.amount1,counter=targetIsToken0?a.amount1:a.amount0;
  if(target<0n&&counter>0n)return {side:'buy',amountRaw:-target};
  if(target>0n&&counter<0n)return {side:'sell',amountRaw:target};
 }else{
  const targetIn=targetIsToken0?a.amount0In:a.amount1In,targetOut=targetIsToken0?a.amount0Out:a.amount1Out,counterIn=targetIsToken0?a.amount1In:a.amount0In,counterOut=targetIsToken0?a.amount1Out:a.amount0Out;
  if(targetOut>0n&&targetIn===0n&&counterIn>0n&&counterOut===0n)return {side:'buy',amountRaw:targetOut};
  if(targetIn>0n&&targetOut===0n&&counterOut>0n&&counterIn===0n)return {side:'sell',amountRaw:targetIn};
 }
 return undefined;
}
export type PoolTimingProof={verified:true;scope:'selected-pool';chain:SupportedChain;pool:string;firstSwapAt:string;firstSwapTransaction:string;firstSwapLogIndex:number;windowEndAt:string;creation:{transaction:string;blockNumber:number;blockHash:string};through:{blockNumber:number;blockHash:string;timestamp:string};factory:string;token0:string;token1:string;eligibleTradeIds:string[];verifiedAt:string};
type Block={number:number;hash:string;time:number};
type PoolIdentity={protocol:Protocol;factory:string;token0:string;token1:string;logIndex:number};
type SavedReceipt={transactionHash:string;blockNumber:number;blockHash:string;from:string;logs:Log[]};
type Range={from:number;to:number};
type DiscoveryRange=Range&{protocol:Protocol;position:1|2};
export type PoolProvider='primary-rpc'|'blockscout';
export type PoolProviderFamily='chain'|'headers'|'receipts'|'logs'|'calls'|'metadata'|'metadata-v1'|'metadata-v2'|'*';
export type PoolProviderState={provider:PoolProvider;family:PoolProviderFamily;kind:'rate'|'archive'|'unavailable';recordedAt:number;until:number;basis:'validation-reference'};
export type PoolProviderIssue={provider:PoolProvider;family:PoolProviderFamily;kind:'rate'|'archive'|'unavailable';message:string;retryAfterMs:number;recovered:boolean};
export type PoolCheckpoint={version:1;creationHintSearched?:number;chain:SupportedChain;pool:string;token:string;providerState?:PoolProviderState[];creation?:PoolIdentity&{transaction:string;blockNumber:number;blockHash:string};discovery?:{pending:DiscoveryRange[];searchedThrough:number;completed:number;candidate?:string;target?:{blockNumber:number;blockHash:string}};ranges:(Range&{endHash:string;endTime:number})[];pendingRanges:Range[];nextBlock?:number;through?:{blockNumber:number;blockHash:string;timestamp:string};logs:Log[];blocks:Block[];receipts:SavedReceipt[];windowTransactions?:string[];firstSwap?:{transaction:string;logIndex:number;blockNumber:number;timestamp:string};decimals?:number;decimalsAttempted?:boolean};
export type PoolProgress={phase:string;completedRanges:number;verifiedTransactions:number;discoveredTransactions:number;nextBlock?:number;retryable:boolean;retryAfterMs?:number};
export type PoolLaunchOptions={signal?:AbortSignal;validationTime?:number;creationTimeHint?:number;creationTransactionHint?:string;checkpoint?:PoolCheckpoint;onCheckpoint?:(checkpoint:PoolCheckpoint)=>void|Promise<void>};
export type PoolLaunchResult={status:'verified'|'partial'|'unavailable'|'unsupported';scope:'selected-pool';pool:string;token:string;protocol?:Protocol;trades:TradeRecord[];proof?:PoolTimingProof;checkpoint?:PoolCheckpoint;progress?:PoolProgress;providerIssues?:PoolProviderIssue[];reasons:string[];sources:Report['sources']};

/** Verifies one supported pool's first-minute sample. It never attests a token's
 * global launch, other pools/venues, complete history, or economic ownership. */
export function createPoolLaunch(deps:{rpcUrls?:Partial<Record<SupportedChain,string>>;fetcher?:typeof fetch;now?:()=>number;monotonic?:()=>number}={}){
 const liveProviderStates=new Map<string,PoolProviderState>();
 return async(chain:Chain,tokenInput:string,poolInput:string,options:PoolLaunchOptions={}):Promise<PoolLaunchResult>=>{
  options.signal?.throwIfAborted();
  if(typeof window!=='undefined')throw Error('Pool verification is server-only.');
  const result:PoolLaunchResult={status:'unavailable',scope:'selected-pool',pool:poolInput.toLowerCase(),token:tokenInput.toLowerCase(),trades:[],reasons:[],sources:[],providerIssues:[],progress:{phase:'creation',completedRanges:0,verifiedTransactions:0,discoveredTransactions:0,retryable:false}};
  if(chain!=='ethereum'&&chain!=='base'){result.status='unsupported';result.reasons.push('Selected-pool verification currently supports Ethereum and Base only.');return result;}
  const pool=addr(poolInput),token=addr(tokenInput);
  if(!pool||!token){result.reasons.push('Pool and token addresses must be valid EVM addresses.');return result;}
  const now=deps.now||Date.now,signal=AbortSignal.any([AbortSignal.timeout(25_000),...(options.signal?[options.signal]:[])]),explorer=chain==='ethereum'?'https://eth.blockscout.com':'https://base.blockscout.com',rpcUrl=deps.rpcUrls?.[chain]||RPCS[chain];
  const latestAllowedBlockTime=((options.validationTime??now())+120_000)/1000;
  const monotonic=deps.monotonic||(()=>performance.now()),started=monotonic(),validationReference=options.validationTime??now();
  const retryDelay=(header:string|null)=>{
   if(header&&/^\d+(\.\d+)?$/.test(header)){const delay=Number(header)*1000;if(Number.isSafeInteger(delay))return delay;}
   const date=header&&/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(header)?Date.parse(header):NaN;
   return Number.isFinite(date)?Math.max(0,Math.ceil(date-validationReference-Math.max(0,monotonic()-started))):60_000;
  };
  const fresh=():PoolCheckpoint=>({version:1,chain,pool,token,ranges:[],pendingRanges:[],logs:[],blocks:[],receipts:[]});
  let cp=fresh(),requests=0,rpcSequence=0,phase='creation',sliceReceipts=0,resumed=false;
  const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
  const input=options.checkpoint;
  if(input){
   try{
    if(input.version!==1||input.chain!==chain||addr(input.pool)!==pool||addr(input.token)!==token)throw Error('binding');
    cp=clone(input);
    if(!Array.isArray(cp.ranges)||!Array.isArray(cp.pendingRanges)||!Array.isArray(cp.logs)||!Array.isArray(cp.blocks)||!Array.isArray(cp.receipts))throw Error('shape');
    cp.logs=cp.logs.map(parseLog);
    if(cp.creation&&(!hash(cp.creation.transaction)||!hash(cp.creation.blockHash)||uint(cp.creation.blockNumber)===undefined))throw Error('creation');
    if(cp.decimals!==undefined&&(uint(cp.decimals)===undefined||cp.decimals>255))throw Error('decimals');
    if(cp.creationHintSearched!==undefined&&(!Number.isSafeInteger(cp.creationHintSearched)||cp.creationHintSearched<=0))throw Error('hint');
    if(cp.ranges.length&&!cp.creation)throw Error('ranges');
    let cursor=cp.creation?.blockNumber;
    for(const range of cp.ranges){if(uint(range.from)!==cursor||uint(range.to)===undefined||range.to<range.from||!hash(range.endHash)||uint(range.endTime)===undefined)throw Error('range');cursor=range.to+1;}
    if(cp.ranges.length&&(cp.nextBlock!==cursor||cp.through?.blockNumber!==cursor!-1||cp.through.blockHash!==cp.ranges.at(-1)!.endHash))throw Error('cursor');
    if(cp.logs.some(l=>!cp.creation||!cp.through||l.address!==pool||l.blockNumber<cp.creation.blockNumber||l.blockNumber>cp.through.blockNumber))throw Error('logs');
    if(cp.pendingRanges.some(r=>uint(r.from)===undefined||uint(r.to)===undefined||r.to<r.from))throw Error('pending');
    if(cp.discovery&&(!Array.isArray(cp.discovery.pending)||cp.discovery.pending.some(r=>!FACTORIES[chain][r.protocol]||![1,2].includes(r.position)||uint(r.from)===undefined||uint(r.to)===undefined||r.to<r.from)))throw Error('discovery');
    resumed=true;
   }catch{cp=fresh();result.reasons.push('The stored checkpoint was invalid or belonged to another pool; verification restarted.');}
  }
  const referenceNow=()=>Math.ceil(validationReference+Math.max(0,monotonic()-started));
  const stateKey=(s:Pick<PoolProviderState,'provider'|'family'>)=>chain+':'+s.provider+':'+s.family;
  if(cp.providerState!==undefined&&(!Array.isArray(cp.providerState)||cp.providerState.some(s=>!s||!['primary-rpc','blockscout'].includes(s.provider)||!['chain','headers','receipts','logs','calls','metadata','metadata-v1','metadata-v2','*'].includes(s.family)||!['rate','archive','unavailable'].includes(s.kind)||s.basis!=='validation-reference'||!Number.isSafeInteger(s.recordedAt)||!Number.isSafeInteger(s.until)||s.until<s.recordedAt||s.until-s.recordedAt>30*86_400_000))){
   result.reasons.push('Stored provider cooldown state is invalid; no provider requests were made.');result.checkpoint=clone(cp);return result;
  }
  if(cp.providerState?.some(s=>s.recordedAt>referenceNow()+120_000)){result.reasons.push('Provider cooldown timestamps cannot be compared with the current validation clock; no requests were made.');result.checkpoint=clone(cp);result.progress={...result.progress!,retryable:false,retryAfterMs:60_000};return result;}
  for(const s of cp.providerState||[])if(s.until>referenceNow()&&s.recordedAt<=referenceNow()+120_000){const prior=liveProviderStates.get(stateKey(s));if(!prior||prior.until<s.until)liveProviderStates.set(stateKey(s),s);}
  const syncProviderState=()=>{for(const [key,s] of liveProviderStates)if(s.until<=referenceNow())liveProviderStates.delete(key);cp.providerState=[...liveProviderStates].filter(([key])=>key.startsWith(chain+':')).map(([,s])=>s);};
  syncProviderState();
  const sameOrigin=(()=>{try{return new URL(rpcUrl).origin===new URL(explorer).origin;}catch{return false;}})();
  const origin=(provider:PoolProvider)=>provider==='blockscout'||sameOrigin?'blockscout':'primary-rpc';
  const familyFor=(method:string):PoolProviderFamily=>method==='eth_chainId'?'chain':method==='eth_getBlockByNumber'?'headers':method==='eth_getTransactionReceipt'?'receipts':method==='eth_getLogs'?'logs':'calls';
  const route=(url:string,init:RequestInit):{provider:PoolProvider;family:PoolProviderFamily}=>({provider:url===rpcUrl?'primary-rpc':'blockscout',family:init.method==='POST'?familyFor(str(obj(JSON.parse(String(init.body))).method)):url.includes('action=getLogs')?'logs':url.includes('action=getcontractcreation')?'metadata-v1':'metadata-v2'});
  const addIssue=(provider:PoolProvider,family:PoolProviderFamily,kind:PoolProviderState['kind'],message:string,delay:number)=>{
   const existing=result.providerIssues!.find(i=>i.provider===provider&&i.family===family&&i.kind===kind);
   if(existing){existing.retryAfterMs=Math.max(existing.retryAfterMs,delay);return;}
   result.providerIssues!.push({provider,family,kind,message,retryAfterMs:delay,recovered:false});
  };
  const recordFailure=(error:unknown,ctx:{provider:PoolProvider;family:PoolProviderFamily},scope:PoolProviderFamily=ctx.family)=>{
   if(error instanceof SliceComplete||(error instanceof RpcEvidenceError&&error.kind==='range'))return error;
   const failure=error instanceof RpcEvidenceError?error:new RpcEvidenceError(error instanceof VerificationError?error.message:'The evidence provider did not return a usable response.','unavailable');
   if(failure.recorded)return failure;
   const kind=failure.kind==='rate'||failure.kind==='archive'?failure.kind:'unavailable',delay=failure.retryAfterMs??30_000,at=referenceNow();
   const state:PoolProviderState={provider:ctx.provider,family:scope,kind,recordedAt:at,until:at+delay,basis:'validation-reference'};
   liveProviderStates.set(stateKey(state),state);syncProviderState();addIssue(ctx.provider,ctx.family,kind,failure.message,delay);failure.recorded=true;return failure;
  };
  const checkCooldown=(ctx:{provider:PoolProvider;family:PoolProviderFamily})=>{
   syncProviderState();const state=cp.providerState!.filter(s=>origin(s.provider)===origin(ctx.provider)&&(s.family==='*'||s.family===ctx.family)).sort((a,b)=>b.until-a.until)[0];
   if(state){const delay=Math.max(0,state.until-referenceNow()),message=state.kind==='rate'?'This provider route is rate limited and remains in cooldown.':'This provider route remains unavailable during its cooldown.';addIssue(ctx.provider,ctx.family,state.kind,message,delay);const error=new RpcEvidenceError(message,state.kind,delay);error.recorded=true;throw error;}
  };
  const recover=(family:PoolProviderFamily,used:PoolProvider)=>{for(const issue of result.providerIssues!)if(issue.family===family&&origin(issue.provider)!==origin(used))issue.recovered=true;};
  const preferredFailure=(a:unknown,b:unknown)=>{
   const rate=[a,b].filter((e):e is RpcEvidenceError=>e instanceof RpcEvidenceError&&e.kind==='rate').sort((x,y)=>(x.retryAfterMs??60_000)-(y.retryAfterMs??60_000));
   return b instanceof SliceComplete?b:rate[0]|| (a instanceof RpcEvidenceError&&a.kind==='archive'?a:b);
  };
  const progress=(retryable:boolean):PoolProgress=>({phase,completedRanges:cp.ranges.length,verifiedTransactions:cp.receipts.length,discoveredTransactions:cp.windowTransactions?.length??new Set(cp.logs.map(l=>l.transactionHash)).size,...(cp.nextBlock!==undefined?{nextBlock:cp.nextBlock}:{}),retryable});
  const publish=async(retryable=true)=>{
   result.checkpoint=clone(cp);result.progress=progress(retryable);
   if(options.onCheckpoint)await options.onCheckpoint(clone(cp));
  };
  const request=async(url:string,init:RequestInit={})=>{
   options.signal?.throwIfAborted();signal.throwIfAborted();
   const ctx=route(url,init);checkCooldown(ctx);
   if(requests>=60)throw new SliceComplete('This 60-request work slice is complete; saved verification can resume.');
   requests++;
   let originFailure=false;
   try{
   const response=await(deps.fetcher||fetch)(url,{...init,signal:AbortSignal.any([signal,AbortSignal.timeout(7_000)]),cache:'no-store'});
   if(!response.ok){
    originFailure=response.status===429||response.status===403||response.status===401;
    if(response.status===429)throw new RpcEvidenceError('The public evidence provider is rate limited; saved work can resume after its cooldown.','rate',retryDelay(response.headers.get('retry-after')));
    if(init.method==='POST'){const failure=obj(await response.json().catch(()=>undefined));throw rpcFailure(failure.error,response.status);}
    throw new VerificationError('A public evidence endpoint returned an unavailable response.');
   }
   const value:unknown=await response.json();
   if(obj(value).status==='0'&&/rate.?limit|request limit reached|too many requests/i.test(str(obj(value).message))){originFailure=true;throw new RpcEvidenceError('The explorer is rate limited; saved history can resume after its cooldown.','rate',retryDelay(response.headers.get('retry-after')));}
   if(init.method==='POST'&&obj(value).error){const error=rpcFailure(obj(value).error);if(error instanceof RpcEvidenceError&&error.kind==='rate')throw new RpcEvidenceError(error.message,'rate',retryDelay(response.headers.get('retry-after')));}
   return value;
   }catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();throw recordFailure(error,ctx,originFailure?'*':ctx.family);}
  };
  const rpc=async(method:string,params:unknown[],url=rpcUrl)=>{
   try{
   const id=++rpcSequence,payload=obj(await request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params})}));
   if(payload.error)throw rpcFailure(payload.error);
   if(payload.id!==id||!Object.hasOwn(payload,'result'))throw new VerificationError('Required RPC evidence was unavailable.');
   return payload.result;
   }catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();throw recordFailure(error,{provider:url===rpcUrl?'primary-rpc':'blockscout',family:familyFor(method)});}
  };
  // Each RPC origin must attest its own network before any of its evidence is
  // consumed. A successful fallback chain check never authenticates primary.
  const networks=new Map<string,Promise<unknown>>();
  const checkedRpc=async(method:string,params:unknown[],url=rpcUrl)=>{
   let network=networks.get(url);
   if(!network){network=rpc('eth_chainId',[],url).then(value=>{
    if(uint(value)!==(chain==='ethereum'?1:8453))throw recordFailure(new RpcEvidenceError('This RPC provider does not match the requested chain.','unavailable'),{provider:url===rpcUrl?'primary-rpc':'blockscout',family:'chain'},'*');
    return value;
   });networks.set(url,network);}
   const chainId=await network;
   return method==='eth_chainId'?chainId:rpc(method,params,url);
  };
  const historicalRpc=async(method:string,params:unknown[])=>{
   let primaryFailure:unknown;
   const family=familyFor(method);
   try{const value=await checkedRpc(method,params);if(value===null)throw recordFailure(new RpcEvidenceError('The primary RPC did not return required historical evidence.','unavailable'),{provider:'primary-rpc',family});recover(family,'primary-rpc');return value;}
   catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();if(error instanceof SliceComplete||(error instanceof RpcEvidenceError&&error.kind==='range'))throw error;primaryFailure=error;}
   const url=explorer+'/api/eth-rpc';
   try{
    const value=await checkedRpc(method,params,url);if(value===null)throw recordFailure(new RpcEvidenceError('The explorer RPC did not return required historical evidence.','unavailable'),{provider:'blockscout',family});recover(family,'blockscout');return value;
   }catch(error){throw preferredFailure(primaryFailure,error);}
  };
  const blocks=new Map<number,Block>();
  const rememberBlock=(block:Block)=>{
   if(uint(block.number)===undefined||!hash(block.hash)||uint(block.time)===undefined)throw new VerificationError('A canonical block header could not be verified.');
   if(!Number.isFinite(latestAllowedBlockTime)||block.time>latestAllowedBlockTime)throw new VerificationError('A block timestamp exceeds the server verification clock by more than 120 seconds; timing proof withheld.');
   for(const prior of blocks.values())if((prior.number<block.number&&prior.time>block.time)||(prior.number>block.number&&prior.time<block.time))throw new VerificationError('Canonical block timestamps are nonmonotonic; timing proof withheld.');
   blocks.set(block.number,block);return block;
  };
  const readBlock=async(n:number)=>{
   if(blocks.has(n))return blocks.get(n)!;
   const b=obj(await historicalRpc('eth_getBlockByNumber',[hex(n),false])),number=uint(b.number),blockHash=hash(b.hash),time=uint(b.timestamp);
   if(number!==n||!blockHash||time===undefined)throw new VerificationError('A canonical block header could not be verified.');
   return rememberBlock({number:n,hash:blockHash,time});
  };
  const rawReceipt=async(tx:string)=>{
   if(sliceReceipts>=64)throw new SliceComplete('This 64-receipt work slice is complete; saved verification can resume.');
   sliceReceipts++;
   const r=obj(await historicalRpc('eth_getTransactionReceipt',[tx]));
   if(hash(r.transactionHash)!==tx||uint(r.status)!==1||uint(r.blockNumber)===undefined||!hash(r.blockHash)||!addr(r.from)||!Array.isArray(r.logs))throw new VerificationError('A successful canonical transaction receipt was unavailable.');
   return r;
  };
  const creationIdentity=(receipt:Row,tx:string,header:Block):PoolIdentity|undefined=>{
   for(const raw of receipt.logs as unknown[])for(const protocol of ['v2','v3'] as const){
    const row=obj(raw),factory=FACTORIES[chain][protocol];if(!factory||addr(row.address)!==factory)continue;
    try{
     const l=parseLog(raw);if(l.transactionHash!==tx||l.blockNumber!==header.number||(l.blockHash&&l.blockHash!==header.hash))continue;
     const event=decodeEventLog({abi:[protocol==='v2'?V2_CREATE:V3_CREATE],topics:l.topics,data:l.data,strict:true}),a=event.args as unknown as Row,token0=addr(a.token0),token1=addr(a.token1);
     if(addr(protocol==='v2'?a.pair:a.pool)===pool&&token0&&token1&&(token0===token||token1===token))return {protocol,factory,token0,token1,logIndex:l.logIndex};
    }catch{/* Only a matching official creation event authenticates this pool. */}
   }
  };
  const split=(r:Range)=>{if(r.from===r.to)throw new VerificationError('One block reached the provider log cap; completeness cannot be established.');const mid=Math.floor((r.from+r.to)/2);return [{from:r.from,to:mid},{from:mid+1,to:r.to}];};
  let explorerLogsAvailable=true;
  const queryLogs=async(r:Range,address:string,topics:(string|null)[])=>{
   let values:unknown;
   if(explorerLogsAvailable)try{
    const q=new URLSearchParams({module:'logs',action:'getLogs',fromBlock:String(r.from),toBlock:String(r.to),address,topic0:topics[0]!});
    for(let i=1;i<topics.length;i++)if(topics[i]){q.set('topic'+i,topics[i]!);q.set('topic0_'+i+'_opr','and');}
    const p=obj(await request(explorer+'/api?'+q.toString()));
    if(p.status==='0'&&/rate.?limit|request limit reached|too many requests/i.test(str(p.message)))throw new RpcEvidenceError('The explorer is rate limited; saved history can resume after its cooldown.','rate');
    if(!Array.isArray(p.result)||!(p.status==='1'||(p.status==='0'&&p.message==='No records found'&&p.result.length===0)))throw new VerificationError('A contiguous log range failed or returned an invalid dataset.');
    values=p.result;
   }catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();if(error instanceof SliceComplete)throw error;explorerLogsAvailable=false;}
   if(!explorerLogsAvailable)values=await historicalRpc('eth_getLogs',[{fromBlock:hex(r.from),toBlock:hex(r.to),address,topics}]);
   else recover('logs','blockscout');
   if(!Array.isArray(values))throw new VerificationError('A contiguous RPC log range failed or returned an invalid dataset.');
   if(values.length>=1000)throw new RpcEvidenceError('The provider log cap requires subdivision.','range');
   return values.map(value=>{
    const l=parseLog(value);
    if(l.address!==address||l.blockNumber<r.from||l.blockNumber>r.to||topics.some((t,i)=>t!==null&&l.topics[i]?.toLowerCase()!==t.toLowerCase()))throw new VerificationError('Log response did not match the requested pool, event and block range.');
    return l;
   });
  };
  // A market timestamp only nominates a small factory-log range. It never
  // authenticates a pool or supplies the first-trade timestamp.
  const locateCreationHint=async(head:Block):Promise<string|undefined>=>{
   const hint=options.creationTimeHint;
   if(typeof hint!=='number'||!Number.isSafeInteger(hint)||hint<=0||hint>latestAllowedBlockTime*1000||cp.creationHintSearched===hint)return;
   if(hint>head.time*1000)throw new WaitingForHead('The reported pool creation time is newer than the finalized boundary; wait for finalized history before locating its creation event.');
   phase='creation-time-locator';
   let low=0,high=head.number;
   // Recent pools dominate interactive scans. First bracket the last 2048
   // finalized blocks to avoid dozens of unnecessary historical header reads.
   if(head.number>2048){const recent=await readBlock(head.number-2048);if(recent.time*1000<hint)low=recent.number+1;else high=recent.number;}
   while(low<high){const middle=Math.floor((low+high)/2),block=await readBlock(middle);if(block.time*1000<hint)low=middle+1;else high=middle;}
   const range={from:Math.max(0,low-16),to:Math.min(head.number,low+16)};
   const padded='0x'+token.slice(2).padStart(64,'0');
   for(const protocol of ['v2','v3'] as const)if(FACTORIES[chain][protocol])for(const position of [1,2] as const){
    const pending:Range[]=[range],selector=POOL_CREATION_TOPICS[protocol],topics=position===1?[selector,padded]:[selector,null,padded];
    while(pending.length){
     const next=pending[0];let logs:Log[];
     try{logs=await queryLogs(next,FACTORIES[chain][protocol]!,topics);}
     catch(error){if(error instanceof RpcEvidenceError&&error.kind==='range'){pending.splice(0,1,...split(next));continue;}throw error;}
     for(const log of logs){const candidate=decodePoolCreationEvent(chain,log);
      if(candidate?.pool===pool&&(candidate.token0===token||candidate.token1===token)){
       cp.discovery??={pending:[],searchedThrough:-1,completed:0,target:{blockNumber:head.number,blockHash:head.hash}};
       cp.discovery.candidate=candidate.transaction;await publish();return candidate.transaction;
      }
     }
     pending.shift();
    }
   }
   cp.creationHintSearched=hint;await publish();
   return undefined;
  };
  const discoverCreation=async(head:number)=>{
   phase='factory-discovery';
   if(cp.discovery?.candidate)return cp.discovery.candidate;
   const pending:DiscoveryRange[]=[];
   const start=cp.discovery?cp.discovery.searchedThrough+1:0;
   if(start<=head)for(const protocol of ['v2','v3'] as const)if(FACTORIES[chain][protocol])for(const position of [1,2] as const)pending.push({protocol,position,from:start,to:head});
   cp.discovery??={pending:[],searchedThrough:-1,completed:0};
   if(!cp.discovery.pending.length&&pending.length){cp.discovery.pending=pending;cp.discovery.searchedThrough=head;cp.discovery.target={blockNumber:head,blockHash:(await readBlock(head)).hash};await publish();}
   const padded='0x'+token.slice(2).padStart(64,'0');
   while(cp.discovery.pending.length){
    const range=cp.discovery.pending[0],selector=toEventSelector(range.protocol==='v2'?V2_CREATE:V3_CREATE),topics=range.position===1?[selector,padded]:[selector,null,padded];
    let logs:Log[];
    try{logs=await queryLogs(range,FACTORIES[chain][range.protocol]!,topics);}
    catch(error){
     if(error instanceof RpcEvidenceError&&error.kind==='range'){cp.discovery.pending.splice(0,1,...split(range).map(r=>({...r,protocol:range.protocol,position:range.position})));await publish();continue;}
     throw error;
    }
    for(const log of logs){
     const event=decodeEventLog({abi:[range.protocol==='v2'?V2_CREATE:V3_CREATE],topics:log.topics,data:log.data,strict:true}),a=event.args as unknown as Row;
     if(addr(range.protocol==='v2'?a.pair:a.pool)===pool&&(addr(a.token0)===token||addr(a.token1)===token)){cp.discovery.candidate=log.transactionHash;await publish();return log.transactionHash;}
    }
    cp.discovery.pending.shift();cp.discovery.completed++;await publish();
   }
   throw new WaitingForHead('No matching factory event was found in the completed finalized discovery ranges; wait for newer finalized history before resuming.');
  };
  try{
   const [chainId,headValue]=await Promise.all([historicalRpc('eth_chainId',[]),historicalRpc('eth_getBlockByNumber',['finalized',false])]);
   if(uint(chainId)!==(chain==='ethereum'?1:8453))throw new VerificationError('RPC network does not match the requested chain.');
   const headRow=obj(headValue),headNumber=uint(headRow.number),headHash=hash(headRow.hash),headTime=uint(headRow.timestamp);
   if(headNumber===undefined||!headHash||headTime===undefined)throw new VerificationError('A finalized chain boundary is unavailable.');
   const head=rememberBlock({number:headNumber,hash:headHash,time:headTime});
   if(resumed&&(cp.creation||cp.discovery?.target)){
    const anchors=[...(cp.creation?[{number:cp.creation.blockNumber,hash:cp.creation.blockHash}]:[]),...(cp.through?[{number:cp.through.blockNumber,hash:cp.through.blockHash}]:[]),...(!cp.creation&&cp.discovery?.target?[{number:cp.discovery.target.blockNumber,hash:cp.discovery.target.blockHash}]:[])];
    let changed=false;
    for(const anchor of anchors)if(anchor.number>head.number||(await readBlock(anchor.number)).hash!==anchor.hash)changed=true;
    if(changed){cp=fresh();syncProviderState();resumed=false;blocks.clear();rememberBlock(head);result.reasons.push('A saved canonical block changed; checkpoint history was discarded and verification restarted.');await publish();}
    else{
     for(const b of cp.blocks)if(b.number!==head.number&&cp.through&&b.number<=cp.through.blockNumber){const known=blocks.get(b.number);if(known&&(known.hash!==b.hash||known.time!==b.time))throw new VerificationError('Stored block metadata conflicts with the current canonical header.');rememberBlock(b);}
    }
   }
   let creationTx=cp.creation?.transaction||cp.discovery?.candidate||hash(options.creationTransactionHint);
   if(!creationTx&&!cp.discovery){
    try{const a=obj(await request(explorer+'/api/v2/addresses/'+pool));creationTx=hash(a.creation_transaction_hash);}catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();if(error instanceof SliceComplete)throw error;}
    if(!creationTx)try{
     const p=obj(await request(explorer+'/api?module=contract&action=getcontractcreation&contractaddresses='+pool)),row=Array.isArray(p.result)?p.result.map(obj).find(r=>addr(r.contractAddress)===pool):undefined;
     if(p.status==='1')creationTx=hash(row?.txHash);
    }catch(error){options.signal?.throwIfAborted();signal.throwIfAborted();if(error instanceof SliceComplete)throw error;}
   }
   creationTx??=await locateCreationHint(head);
   creationTx??=await discoverCreation(head.number);
   const creation=await rawReceipt(creationTx),creationBlock=uint(creation.blockNumber)!;
   if(creationBlock>head.number)throw new VerificationError('Pool creation is beyond the finalized chain boundary.');
   const creationHeader=await readBlock(creationBlock);
   if(hash(creation.blockHash)!==creationHeader.hash)throw new VerificationError('Pool creation receipt does not match the canonical block.');
   const identity=creationIdentity(creation,creationTx,creationHeader);
   if(!identity){result.status='unsupported';throw new VerificationError('No matching token/pool creation event from a supported official factory was verified.');}
   if(cp.creation&&(cp.creation.transaction!==creationTx||cp.creation.protocol!==identity.protocol||cp.creation.token0!==identity.token0||cp.creation.token1!==identity.token1||cp.creation.factory!==identity.factory))throw new VerificationError('The stored pool identity did not match its revalidated factory receipt.');
   cp.creation={...identity,transaction:creationTx,blockNumber:creationBlock,blockHash:creationHeader.hash};
   for(const issue of result.providerIssues!)if(issue.family.startsWith('metadata'))issue.recovered=true;
   cp.nextBlock??=creationBlock;result.protocol=identity.protocol;result.status='partial';await publish();
   phase='pool-logs';
   const selector=toEventSelector(identity.protocol==='v2'?V2_SWAP:V3_SWAP).toLowerCase();
   const all=new Map(cp.logs.map(l=>[l.transactionHash+':'+l.logIndex,l]));
   let first:Log|undefined,firstTime:number|undefined;
   const findFirst=async()=>{
    first=[...all.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex)[0];
    if(first){
     if(first.blockNumber===creationBlock&&first.logIndex<=identity.logIndex)throw new VerificationError('A swap was reported before the pool creation event.');
     firstTime=(await readBlock(first.blockNumber)).time;
     cp.firstSwap={transaction:first.transactionHash,logIndex:first.logIndex,blockNumber:first.blockNumber,timestamp:new Date(firstTime*1000).toISOString()};
    }
   };
   await findFirst();
   let through=cp.through?await readBlock(cp.through.blockNumber):undefined;
   while(firstTime===undefined||!through||through.time<=firstTime+60){
    if(!cp.pendingRanges.length){if(cp.nextBlock!>head.number)throw new WaitingForHead(first?'The first-minute interval is not yet closed at the finalized boundary.':'No swap was found within the scanned finalized pool history.');cp.pendingRanges.push({from:cp.nextBlock!,to:Math.min(cp.nextBlock!+2047,head.number)});await publish();}
    const range=cp.pendingRanges[0];if(range.from!==cp.nextBlock||range.to>head.number)throw new VerificationError('The saved range cursor is not contiguous with finalized history.');
    let logs:Log[];
    try{logs=await queryLogs(range,pool,[selector]);}
    catch(error){if(error instanceof RpcEvidenceError&&error.kind==='range'){cp.pendingRanges.splice(0,1,...split(range));await publish();continue;}throw error;}
    const boundary=await readBlock(range.to);
    for(const l of logs){
     const key=l.transactionHash+':'+l.logIndex,prior=all.get(key);
     if(prior&&(prior.data!==l.data||prior.topics.join()!==l.topics.join()||prior.blockNumber!==l.blockNumber||prior.blockHash!==l.blockHash))throw new VerificationError('Conflicting duplicate event identities were returned.');
     all.set(key,l);
    }
    cp.logs=[...all.values()];cp.ranges.push({...range,endHash:boundary.hash,endTime:boundary.time});cp.pendingRanges.shift();cp.nextBlock=range.to+1;through=boundary;
    cp.through={blockNumber:boundary.number,blockHash:boundary.hash,timestamp:new Date(boundary.time*1000).toISOString()};
    cp.blocks=[...blocks.values()].filter(b=>b.number<=boundary.number);await publish();
    await findFirst();cp.blocks=[...blocks.values()].filter(b=>b.number<=boundary.number);await publish();
   }
   if(!first||firstTime===undefined||!through)throw new VerificationError('A closed first-minute interval was not established.');
   phase='receipts';
   const inWindow:Log[]=[];
   for(const l of [...all.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex)){
    const block=await readBlock(l.blockNumber);if(block.time>firstTime+60)break;
    if(block.time<firstTime||(l.blockHash&&l.blockHash!==block.hash))throw new VerificationError('A swap block did not match canonical first-minute history.');
    const canonical={...l,blockHash:block.hash};inWindow.push(canonical);all.set(l.transactionHash+':'+l.logIndex,canonical);
   }
   cp.logs=[...all.values()];cp.blocks=[...blocks.values()].filter(b=>b.number<=through!.number);await publish();
   const transactions=[...new Set(inWindow.map(l=>l.transactionHash))],saved=new Map(cp.receipts.map(r=>[r.transactionHash,r]));
   cp.windowTransactions=transactions;
   const receiptSwaps=(r:Row)=>(r.logs as unknown[]).filter(value=>{const row=obj(value);return addr(row.address)===pool&&Array.isArray(row.topics)&&str(row.topics[0]).toLowerCase()===selector;}).map(parseLog);
   const verifyReceipt=async(tx:string,r:SavedReceipt)=>{
    const expected=inWindow.filter(l=>l.transactionHash===tx),block=await readBlock(r.blockNumber);
    if(r.transactionHash!==tx||!addr(r.from)||r.blockHash!==block.hash||!expected.length||expected.some(l=>l.blockNumber!==r.blockNumber))throw new VerificationError('Swap receipt block hash or number differs from canonical history.');
    for(const raw of r.logs){
     const l=parseLog(raw),indexed=all.get(l.transactionHash+':'+l.logIndex);
     if(l.address!==pool||l.transactionHash!==tx||l.blockNumber!==r.blockNumber||(l.blockHash&&l.blockHash!==block.hash)||!indexed||indexed.blockNumber!==r.blockNumber||(indexed.blockHash&&indexed.blockHash!==block.hash)||indexed.data!==l.data||indexed.topics.join()!==l.topics.join())throw new VerificationError('A canonical receipt contains a pool swap missing from the indexed range.');
    }
    for(const l of expected)if(!r.logs.some(v=>v.logIndex===l.logIndex&&v.data===l.data&&v.topics.join()===l.topics.join()))throw new VerificationError('An indexed swap could not be matched to its canonical receipt.');
   };
   for(const l of receiptSwaps(creation)){const indexed=all.get(l.transactionHash+':'+l.logIndex);if(!indexed||indexed.blockNumber!==creationBlock||indexed.data!==l.data||indexed.topics.join()!==l.topics.join())throw new VerificationError('A canonical creation receipt contains a pool swap missing from the indexed range.');}
   for(const tx of transactions){
    let receipt=saved.get(tx);
    if(!receipt){
     const raw=tx===creationTx?creation:await rawReceipt(tx);
     receipt={transactionHash:tx,blockNumber:uint(raw.blockNumber)!,blockHash:hash(raw.blockHash)!,from:addr(raw.from)!,logs:receiptSwaps(raw)};
     await verifyReceipt(tx,receipt);saved.set(tx,receipt);cp.receipts=[...saved.values()];await publish();
    }else await verifyReceipt(tx,receipt);
   }
   options.signal?.throwIfAborted();signal.throwIfAborted();phase='amounts';
   if(!cp.decimalsAttempted||cp.decimals===undefined){
    try{const scale=uint(await checkedRpc('eth_call',[{to:token,data:'0x313ce567'},hex(first.blockNumber)]));if(scale!==undefined&&scale<=255)cp.decimals=scale;}
    catch(error){
     options.signal?.throwIfAborted();
     if(error instanceof RpcEvidenceError&&error.kind==='rate')result.reasons.push('Optional decimal metadata was unavailable; verified timing and raw amounts are retained.');
    }
    cp.decimalsAttempted=true;await publish();
   }
   let ambiguous=0;const trades:TradeRecord[]=[];
   for(const l of inWindow){
    const decoded=decodePoolSwap(identity.protocol,l,token===identity.token0);if(!decoded){ambiguous++;continue;}
    const block=blocks.get(l.blockNumber)!,receipt=saved.get(l.transactionHash)!;
    const amount=cp.decimals!==undefined?Number(decoded.amountRaw)/10**cp.decimals:undefined;
    trades.push({id:chain+':'+pool+':'+l.transactionHash+':'+l.logIndex,wallet:receipt.from,timestamp:new Date(block.time*1000).toISOString(),side:decoded.side,...(amount!==undefined&&Number.isFinite(amount)&&amount>0?{amount}:{}),amountRaw:decoded.amountRaw.toString(),...(cp.decimals!==undefined?{decimals:cp.decimals}:{}),transaction:l.transactionHash,source:'Verified '+identity.protocol+' selected-pool swap; transaction initiator, not proven economic owner'});
   }
   options.signal?.throwIfAborted();
   result.trades=trades;result.status='verified';phase='complete';
   result.proof={verified:true,scope:'selected-pool',chain,pool,firstSwapAt:new Date(firstTime*1000).toISOString(),firstSwapTransaction:first.transactionHash,firstSwapLogIndex:first.logIndex,windowEndAt:new Date((firstTime+60)*1000).toISOString(),creation:{transaction:creationTx,blockNumber:creationBlock,blockHash:creationHeader.hash},through:{blockNumber:through.number,blockHash:through.hash,timestamp:new Date(through.time*1000).toISOString()},factory:identity.factory,token0:identity.token0,token1:identity.token1,eligibleTradeIds:trades.filter(t=>t.side==='buy').map(t=>t.id),verifiedAt:new Date(now()).toISOString()};
   if(ambiguous)result.reasons.push(String(ambiguous)+' first-minute events had ambiguous token direction and were excluded.');
   if(cp.decimals===undefined)result.reasons.push('Historical decimals were unavailable. Raw integer amounts and verified timing are retained; normalized token amounts are unknown.');
   result.sources.push({name:'Selected pool first minute',status:'available',fetchedAt:result.proof.verifiedAt,detail:'Official factory creation and contiguous provider swap ranges verified through finalized block '+through.number+'; all first-minute transactions were checked against canonical receipts.'});
   await publish(false);
  }catch(error){
   options.signal?.throwIfAborted();result.trades=[];delete result.proof;
   result.reasons.push(error instanceof VerificationError?error.message:'Selected-pool verification stopped during '+phase+'; a request failed, expired or returned unsupported data.');
   result.sources.push({name:'Selected pool first minute',status:'unavailable',detail:result.reasons.at(-1)!});
   // Preserve completed ranges/receipts even if the current request or storage
   // callback failed. No unfinished checkpoint can enable timing labels.
   result.checkpoint=clone(cp);result.progress=progress(result.status!=='unsupported');
   if(error instanceof RpcEvidenceError&&error.kind==='rate')result.progress.retryAfterMs=error.retryAfterMs;
   if(error instanceof WaitingForHead){result.progress.retryable=false;result.progress.retryAfterMs=60_000;result.progress.phase='waiting-finalized-head';}
   if(result.status!=='unsupported'&&(cp.creation||cp.ranges.length||cp.receipts.length))result.status='partial';
  }
  result.reasons.push('This proof covers one supported pool and its first swap plus 60 seconds, using provider log completeness and receipt checks. It does not establish token-global launch, other venues, common ownership or automated trading.');
  return result;
 };
}
