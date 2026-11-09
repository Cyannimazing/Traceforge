import {decodeEventLog,parseAbi,toEventSelector} from 'viem';
import type {TradeRecord} from './investigation';
import type {CurveTimingProof} from './investigation-types';

// Contract sources: https://github.com/fobodotfun/contracts (FoboHook.sol, IFoboHook.sol)
// Verified hook ABI: https://sourcify.dev/server/v2/contract/4663/0x0Af57F62982D03066ef917AcAd87F771c06528Ec?fields=abi
export const FOBO_HOOK='0x0af57f62982d03066ef917acad87f771c06528ec';
export const FOBO_POOL_MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
export const FOBO_HISTORY_SOURCE='Robinhood RPC FOBO hook receipts';
const abi=parseAbi([
 'event TaxPaid(bytes32 indexed poolId,address indexed swapper,bool buy,uint256 quoteVolume,uint256 toFloor,uint256 toCreator,uint256 toTeam,uint256 toBurn)',
 'event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)',
]);
export const TAX_PAID=toEventSelector(abi[0]);
export const V4_SWAP=toEventSelector(abi[1]);
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i,X=/^0x[0-9a-f]+$/i;
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const num=(v:unknown)=>typeof v==='string'&&X.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const lower=(v:unknown)=>typeof v==='string'?v.toLowerCase():'';
const hex=(n:number)=>'0x'+n.toString(16);
const topicAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
const MAX_BUYS=400,CHUNK=50,DISCOVERY_SPAN=4000,EXTEND=1024;
// FOBO platform contracts that may receive pool tokens outside a taxed swap
// (burner, limit orders, revenue) plus burn sinks. README deployment table.
const PLATFORM_RECIPIENTS=new Set([FOBO_HOOK,'0x5541141cc427441f7ed5bd93bd16ac87a890990d','0x3126f62d604a0aa2de8788e3ec21ddd8f2a2f82a','0x8819036a0f6940285b6ea6d6b80cdc702ce8cb54','0x'+'0'.repeat(40),'0x000000000000000000000000000000000000dead']);
type Call={method:string;params:unknown[]};
type Log=Record<string,any>;
export type FoboHistoryResult={trades:TradeRecord[];proof?:CurveTimingProof;reasons:string[]};
export type FoboHistoryInput={token:string;poolId:string;decimals:number;launch:{transaction:string;blockNumber:number;blockHash:string;transactionIndex:number};anchor:{number:number;hash:string;timestamp:number};observedAt:string;batch:(calls:Call[])=>Promise<unknown[]>;logBatch?:(calls:Call[])=>Promise<unknown[]>;signal?:AbortSignal};

/** Bounded verification of the first sixty seconds of buys on one FOBO pool.
 * The caller has already bound token, pool and creation transaction to the
 * canonical factory. Any unresolved routing, missing range or receipt
 * withholds the timing proof instead of producing a partial classification. */
export async function readFoboHistory(input:FoboHistoryInput):Promise<FoboHistoryResult>{
 const result:FoboHistoryResult={trades:[],reasons:[]},token=lower(input.token),poolId=lower(input.poolId);
 if(!A.test(token)||!H.test(poolId)||!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>255)return result;
 let requests=0;
 const call=async(calls:Call[],logs=false)=>{input.signal?.throwIfAborted();if(!calls.length)return [];if(++requests>40)throw Error('Request budget');return await (logs&&input.logBatch?input.logBatch:input.batch)(calls);};
 const chunked=async(calls:Call[])=>{const out:unknown[]=[];for(let i=0;i<calls.length;i+=CHUNK)out.push(...await call(calls.slice(i,i+CHUNK)));return out;};
 const header=async(n:number)=>{const b=obj((await call([{method:'eth_getBlockByNumber',params:[hex(n),false]}]))[0]);if(num(b.number)!==n||!H.test(b.hash)||num(b.timestamp)===null)throw Error('Header unavailable');return b;};
 const validLog=(l:Log,lo:number,hi:number)=>lower(l.address)===FOBO_HOOK&&l.removed===false&&H.test(l.transactionHash)&&H.test(l.blockHash)&&num(l.blockNumber)!==null&&num(l.blockNumber)!>=lo&&num(l.blockNumber)!<=hi&&num(l.logIndex)!==null&&num(l.transactionIndex)!==null&&Array.isArray(l.topics)&&l.topics.length===3&&lower(l.topics[0])===TAX_PAID&&lower(l.topics[1])===poolId;
 const decodeTax=(l:Log)=>{const d=decodeEventLog({abi,data:l.data,topics:l.topics,strict:true});if(d.eventName!=='TaxPaid')throw Error('Malformed tax event');return d.args;};
 async function scan(address:string,topics:string[],lo:number,hi:number,check:(l:Log,a:number,b:number)=>boolean,bound:number):Promise<Log[]>{
  const pending:[number,number][]=[[lo,hi]],out:Log[]=[];
  while(pending.length){const [a,b]=pending.shift()!;let value:unknown;
   try{value=(await call([{method:'eth_getLogs',params:[{address,topics,fromBlock:hex(a),toBlock:hex(b)}]}],true))[0];}catch{input.signal?.throwIfAborted();value=undefined;}
   if(!Array.isArray(value)||value.length>2000){if(a===b)throw Error('Range unavailable');const mid=Math.floor((a+b)/2);pending.unshift([a,mid],[mid+1,b]);continue;}
   for(const raw of value){const l=obj(raw);if(!check(l,a,b))throw Error('Invalid indexed log');out.push(l);}
   if(out.length>bound)throw Error('Window event bound');
  }
  return out;
 }
 const logs=(lo:number,hi:number)=>scan(FOBO_HOOK,[TAX_PAID,poolId],lo,hi,(l,a,b)=>{if(!validLog(l,a,b))return false;decodeTax(l);return true;},MAX_BUYS*2);
 try{
  const start=input.launch.blockNumber,anchor=input.anchor;
  if(!Number.isSafeInteger(start)||start<=0||start>anchor.number)throw Error('Launch outside anchor');
  // Discover the first buy, then extend to the first block strictly after its minute.
  const discoveryEnd=Math.min(anchor.number,start+DISCOVERY_SPAN);
  let found=await logs(start,discoveryEnd);
  const order=(a:Log,b:Log)=>num(a.blockNumber)!-num(b.blockNumber)!||num(a.logIndex)!-num(b.logIndex)!;
  const buys=(rows:Log[])=>rows.filter(l=>decodeTax(l).buy===true).sort(order);
  const firstKnown=buys(found)[0];if(!firstKnown)throw Error('No buy in bounded discovery range');
  const firstHeader=await header(num(firstKnown.blockNumber)!),firstTime=num(firstHeader.timestamp)!;
  if(anchor.timestamp<=firstTime+60)throw Error('First-minute end not finalized');
  let end=Math.min(anchor.number,num(firstKnown.blockNumber)!+EXTEND),through=await header(end);
  for(let attempt=0;num(through.timestamp)!<=firstTime+60&&attempt<12&&end<anchor.number;attempt++){end=Math.min(anchor.number,end+EXTEND);through=await header(end);}
  if(num(through.timestamp)!<=firstTime+60||num(through.timestamp)!>anchor.timestamp)throw Error('Bounded first-minute window unavailable');
  if(end>discoveryEnd)found=[...found,...await logs(discoveryEnd+1,end)];
  const covered=found.filter(l=>num(l.blockNumber)!<=end);
  if(buys(covered).length>MAX_BUYS)throw Error('Buy event bound');
  // Receipts and their block headers are loaded independently of the log index.
  const hashes=[...new Set(covered.map(l=>lower(l.transactionHash)))];
  // Independent token index: every PoolManager-origin delivery of this token in
  // the window must belong to an indexed taxed swap, so an omitted hook event
  // cannot silently drop a buyer. Platform sinks are excluded.
  const deliveries=await scan(token,[TRANSFER,'0x'+'0'.repeat(24)+FOBO_POOL_MANAGER.slice(2)],start,end,(l,a,b)=>lower(l.address)===token&&l.removed===false&&H.test(l.transactionHash)&&num(l.blockNumber)!==null&&num(l.blockNumber)!>=a&&num(l.blockNumber)!<=b&&Array.isArray(l.topics)&&l.topics.length===3&&lower(l.topics[0])===TRANSFER&&topicAddress(l.topics[1])===FOBO_POOL_MANAGER&&topicAddress(l.topics[2])!==null,MAX_BUYS*4);
  if(deliveries.some(l=>!PLATFORM_RECIPIENTS.has(topicAddress(l.topics[2])!)&&!hashes.includes(lower(l.transactionHash))))throw Error('Pool delivery outside indexed taxed swaps');
  const rawReceipts=await chunked(hashes.map(h=>({method:'eth_getTransactionReceipt',params:[h]})));
  const receipts=new Map<string,Record<string,any>>();
  for(let i=0;i<hashes.length;i++){const r=obj(rawReceipts[i]);if(lower(r.transactionHash)!==hashes[i]||r.status!=='0x1'||num(r.blockNumber)===null||num(r.blockNumber)!>end||!H.test(r.blockHash)||!A.test(r.from)||!Array.isArray(r.logs)||r.logs.length>2000)throw Error('Receipt unavailable');receipts.set(hashes[i],r);}
  const heights=[...new Set([...receipts.values()].map(r=>num(r.blockNumber)!))];
  const rawHeaders=await chunked(heights.map(n=>({method:'eth_getBlockByNumber',params:[hex(n),false]})));
  const headers=new Map<number,Record<string,any>>();
  for(let i=0;i<heights.length;i++){const b=obj(rawHeaders[i]),t=num(b.timestamp);if(num(b.number)!==heights[i]||!H.test(b.hash)||t===null||t<=0||t>anchor.timestamp)throw Error('Block header unavailable');headers.set(heights[i],b);}
  const sameLog=(a:Log,b:Log)=>lower(a.transactionHash)===lower(b.transactionHash)&&num(a.logIndex)===num(b.logIndex)&&lower(a.data)===lower(b.data)&&lower(a.blockHash)===lower(b.blockHash);
  for(const r of receipts.values()){
   const b=headers.get(num(r.blockNumber)!)!;if(lower(b.hash)!==lower(r.blockHash))throw Error('Receipt block mismatch');
   // Reverse completeness: every pool tax event in a loaded receipt is indexed.
   for(const raw of r.logs){const l=obj(raw);if(lower(l.address)===FOBO_HOOK&&Array.isArray(l.topics)&&lower(l.topics[0])===TAX_PAID&&lower(l.topics[1])===poolId&&!covered.some(c=>sameLog(c,l)))throw Error('Receipt tax event missing from indexed window');}
  }
  // Forward completeness: every indexed event appears in its canonical receipt.
  for(const l of covered){const r=receipts.get(lower(l.transactionHash))!;if(!r.logs.some((raw:unknown)=>sameLog(obj(raw),l)&&lower(obj(raw).address)===FOBO_HOOK))throw Error('Indexed event missing from receipt');}
  const launchTx=lower(input.launch.transaction);
  const trade=(l:Log):TradeRecord=>{
   const r=receipts.get(lower(l.transactionHash))!,b=headers.get(num(r.blockNumber)!)!,args=decodeTax(l),index=num(l.logIndex)!,sender=lower(r.from),swapper=topicAddress(l.topics[2]);
   const rows=(r.logs as unknown[]).map(obj).filter(x=>x.removed===false&&lower(x.transactionHash)===lower(r.transactionHash)&&lower(x.blockHash)===lower(r.blockHash)&&num(x.logIndex)!==null);
   const taxes=rows.filter(x=>lower(x.address)===FOBO_HOOK&&Array.isArray(x.topics)&&lower(x.topics[0])===TAX_PAID&&lower(x.topics[1])===poolId);
   const swaps=rows.filter(x=>lower(x.address)===FOBO_POOL_MANAGER&&Array.isArray(x.topics)&&x.topics.length===3&&lower(x.topics[0])===V4_SWAP&&lower(x.topics[1])===poolId);
   if(args.buy!==true||!swapper||taxes.length!==1||swaps.length!==1||lower(swaps[0].topics[2])!==lower(l.topics[2]))throw Error('Unresolved pool swap');
   const swapIndex=num(swaps[0].logIndex)!;
   const transfers=rows.flatMap(x=>{if(lower(x.address)!==token||!Array.isArray(x.topics)||x.topics.length!==3||lower(x.topics[0])!==TRANSFER||!H.test(x.data))return [];const from=topicAddress(x.topics[1]),to=topicAddress(x.topics[2]);return from&&to?[{from,to,amount:BigInt(x.data),index:num(x.logIndex)!}]:[];});
   const delivered=transfers.filter(t=>t.from===FOBO_POOL_MANAGER);
   if(delivered.length!==1||delivered[0].amount<=0n||delivered[0].index<swapIndex)throw Error('Unresolved token delivery');
   // Follow a single forwarding path from the PoolManager delivery. Each hop must
   // be the holder's only later outgoing transfer, carry the full amount less at
   // most two raw units of rounding, and never revisit an address. The buy is
   // attributed to the final recipient that retains the tokens.
   let hop=delivered[0],amount=hop.amount;const visited=new Set([FOBO_POOL_MANAGER,hop.to]);
   for(let hops=0;hop.to!==sender;hops++){
    const onward=transfers.filter(t=>t.from===hop.to&&t.index>hop.index);
    if(!onward.length)break;
    if(hops>=4||onward.length!==1||onward[0].amount>hop.amount||hop.amount-onward[0].amount>2n||visited.has(onward[0].to))throw Error('Unresolved routed delivery');
    hop=onward[0];amount=hop.amount;visited.add(hop.to);
   }
   const recipient=hop.to;
   if(recipient!==sender&&delivered[0].to!==swapper&&delivered[0].to!==recipient)throw Error('Unresolved routed delivery');
   const value=Number(amount)/10**input.decimals;if(!Number.isFinite(value)||value<=0)throw Error('Invalid amount');
   if(num(b.number)!<start||(num(b.number)===start&&num(r.transactionIndex)!<input.launch.transactionIndex&&lower(r.transactionHash)!==launchTx))throw Error('Buy precedes launch');
   return {id:`fobo:${lower(r.transactionHash)}:${index}`,wallet:recipient,timestamp:new Date(num(b.timestamp)!*1000).toISOString(),side:'buy',amount:value,amountRaw:amount.toString(),decimals:input.decimals,transaction:lower(r.transactionHash),source:FOBO_HISTORY_SOURCE};
  };
  const purchases=buys(covered),trades=purchases.map(trade);
  const first=purchases[0],at=num(headers.get(num(first.blockNumber)!)!.timestamp)!;
  if(at!==firstTime)throw Error('First purchase changed');
  const times=purchases.map(l=>num(headers.get(num(l.blockNumber)!)!.timestamp)!);if(times.some((t,i)=>i>0&&t<times[i-1]))throw Error('Inconsistent block times');
  const recheck=await call([{method:'eth_getBlockByNumber',params:[hex(start),false]},{method:'eth_getBlockByNumber',params:[hex(end),false]}]);
  if(lower(obj(recheck[0]).hash)!==lower(input.launch.blockHash)||lower(obj(recheck[1]).hash)!==lower(through.hash))throw Error('Window changed');
  result.trades=trades;
  result.proof={verified:true,scope:'selected-launchpad',protocol:'fobo-v1',chain:'robinhood',token,manager:FOBO_HOOK,firstPurchaseAt:new Date(at*1000).toISOString(),firstPurchaseTransaction:lower(first.transactionHash),windowEndAt:new Date((at+60)*1000).toISOString(),creation:{transaction:launchTx,blockNumber:start,blockHash:lower(input.launch.blockHash)},through:{blockNumber:end,blockHash:lower(through.hash),timestamp:new Date(num(through.timestamp)!*1000).toISOString()},eligibleTradeIds:trades.filter((_,i)=>times[i]<=at+60).map(t=>t.id),verifiedAt:input.observedAt,source:FOBO_HISTORY_SOURCE};
  result.reasons.push(`Contiguous FOBO hook TaxPaid coverage for pool ${poolId} verified from the canonical TokenLaunched block through block ${end}, after the first purchase plus sixty seconds. Every indexed event matched its receipt and every receipt tax event was indexed. Buyers require one taxed V4 swap and a single PoolManager token delivery path, attributed to the final recipient (directly, or through router hops forwarding the full amount less at most two raw units). Scope is this token's FOBO pool; other venues, beneficial ownership and automation are not established.`);
 }catch{
  input.signal?.throwIfAborted();
  result.trades=[];
  result.reasons.push('The bounded FOBO first-minute window could not be fully verified. No launchpad timing classification is established.');
 }
 return result;
}
