import {decodeEventLog,parseAbi,toEventSelector} from 'viem';
import type {IdentityRecord,TradeRecord} from './investigation';
import type {CurveTimingProof} from './investigation-types';
export const FOUR_MEME_MANAGER='0x5c952063c7fc8610ffdb798152d69f0b9550762b';
export const FOUR_MEME_HISTORY_SOURCE='BSC RPC Four.Meme curve receipts';
// Official deployment and ABI: https://github.com/four-meme-community/fourmeme-docs/blob/main/abi/TokenManager2.lite.json
const abi=parseAbi(['event TokenCreate(address creator,address token,uint256 requestId,string name,string symbol,uint256 totalSupply,uint256 launchTime,uint256 launchFee)','event TokenPurchase(address token,address account,uint256 price,uint256 amount,uint256 cost,uint256 fee,uint256 offers,uint256 funds)']);
const signatures=[toEventSelector(abi[0]),toEventSelector(abi[1])];
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i,X=/^0x[0-9a-f]+$/i;
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const num=(v:unknown)=>typeof v==='string'&&X.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const lower=(v:unknown)=>typeof v==='string'?v.toLowerCase():'';
const topicAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
type Call={method:string;params:unknown[]};
type Event={name:'TokenCreate'|'TokenPurchase';args:Record<string,any>;log:Record<string,any>;receipt:Record<string,any>;block:Record<string,any>};
export type FourMemeHistoryResult={trades:TradeRecord[];identities:IdentityRecord[];proof?:CurveTimingProof;reasons:string[]};
/** Bounded public receipt verification; never an exhaustive chain crawl. Caller
 * has independently verified this token's canonical manager membership. */
export async function readFourMemeHistory(input:{token:string;decimals:number;candidateLogs:unknown[];anchor:{number:number;hash:string;timestamp:number};observedAt:string;batch:(calls:Call[])=>Promise<unknown[]>;signal?:AbortSignal}):Promise<FourMemeHistoryResult>{
 const result:FourMemeHistoryResult={trades:[],identities:[],reasons:[]},token=lower(input.token),receipts=new Map<string,Record<string,any>>(),blocks=new Map<number,Record<string,any>>();
 if(!A.test(token)||!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>255)return result;
 const call=async(calls:Call[])=>{input.signal?.throwIfAborted();try{return await input.batch(calls);}catch{input.signal?.throwIfAborted();return calls.map(()=>undefined);}};
 const candidates=input.candidateLogs.map(obj).filter(l=>lower(l.address)===token&&H.test(l.transactionHash)&&num(l.blockNumber)!==null).sort((a,b)=>num(a.blockNumber)!-num(b.blockNumber)!);
 const hashes=[...new Set(candidates.map(l=>lower(l.transactionHash)))].slice(0,32);
 async function load(hashes:string[]){
  const missing=hashes.filter(h=>!receipts.has(h));if(missing.length>64)throw Error('Receipt bound');
  const values=await call(missing.map(h=>({method:'eth_getTransactionReceipt',params:[h]})));
  for(let i=0;i<missing.length;i++){const r=obj(values[i]),n=num(r.blockNumber);if(lower(r.transactionHash)!==missing[i]||r.status!=='0x1'||n===null||n>input.anchor.number||!H.test(r.blockHash)||!A.test(r.from)||!Array.isArray(r.logs)||r.logs.length>2000)continue;receipts.set(missing[i],r);}
  const heights=[...new Set([...receipts.values()].map(r=>num(r.blockNumber)!))].filter(n=>!blocks.has(n));
  const headers=await call(heights.map(n=>({method:'eth_getBlockByNumber',params:['0x'+n.toString(16),false]})));
  for(let i=0;i<heights.length;i++){const b=obj(headers[i]),t=num(b.timestamp);if(num(b.number)===heights[i]&&H.test(b.hash)&&t!==null&&t>0&&t<=input.anchor.timestamp)blocks.set(heights[i],b);}
 }
 function events():Event[]{const out:Event[]=[];
  for(const r of receipts.values()){const b=blocks.get(num(r.blockNumber)!);if(!b||lower(b.hash)!==lower(r.blockHash))continue;
   for(const raw of r.logs){const l=obj(raw);if(lower(l.address)!==FOUR_MEME_MANAGER||!Array.isArray(l.topics)||l.topics.length!==1||!signatures.includes(lower(l.topics[0]) as any)||l.removed!==false||lower(l.transactionHash)!==lower(r.transactionHash)||lower(l.blockHash)!==lower(r.blockHash)||l.blockNumber!==r.blockNumber||num(l.logIndex)===null)continue;
    try{const d=decodeEventLog({abi,data:l.data,topics:l.topics as [`0x${string}`,...`0x${string}`[]],strict:true});if(lower(d.args.token)!==token)continue;if(d.eventName==='TokenPurchase'&&(!/^0x[0-9a-f]{512}$/i.test(l.data)||d.args.amount<=0n))continue;out.push({name:d.eventName,args:d.args,log:l,receipt:r,block:b});}catch{}
   }
  }return out;
 }
 function transferRows(event:Event):{from:string;to:string;amount:bigint;index:number}[]{return (event.receipt.logs as unknown[]).map(obj).flatMap(l=>{if(lower(l.address)!==token||l.removed!==false||lower(l.transactionHash)!==lower(event.receipt.transactionHash)||lower(l.blockHash)!==lower(event.block.hash)||l.blockNumber!==event.block.number||!Array.isArray(l.topics)||l.topics.length!==3||lower(l.topics[0])!==TRANSFER||!H.test(l.data)||num(l.logIndex)===null)return [];const from=topicAddress(l.topics[1]),to=topicAddress(l.topics[2]);return from&&to?[{from,to,amount:BigInt(l.data),index:num(l.logIndex)!}]:[];});}
 function trade(e:Event):TradeRecord|null{
  if(e.name!=='TokenPurchase')return null;const account=lower(e.args.account),sender=lower(e.receipt.from),amount=e.args.amount as bigint,rows=transferRows(e),index=num(e.log.logIndex)!;
  const incoming=rows.filter(t=>t.from===FOUR_MEME_MANAGER&&t.to===account&&t.amount===amount&&t.index<index);if(incoming.length!==1)return null;
  if(account!==sender){const outgoing=rows.filter(t=>t.from===account);if(outgoing.length!==1||outgoing[0].to!==sender||outgoing[0].amount!==amount||outgoing[0].index<=index)return null;}
  const value=Number(amount)/10**input.decimals;if(!Number.isFinite(value)||value<=0)return null;
  return {id:`fourmeme:${lower(e.receipt.transactionHash)}:${index}`,wallet:sender,timestamp:new Date(num(e.block.timestamp)!*1000).toISOString(),side:'buy',amount:value,amountRaw:amount.toString(),decimals:input.decimals,transaction:lower(e.receipt.transactionHash),source:FOUR_MEME_HISTORY_SOURCE};
 }
 function update(){const es=events(),seen=new Set<string>();result.trades=es.flatMap(e=>{const t=trade(e);if(!t||seen.has(t.id))return [];seen.add(t.id);return [t];});result.identities=es.filter(e=>e.name==='TokenCreate').flatMap(e=>{const minted=transferRows(e).filter(t=>t.from==='0x'+'0'.repeat(40)&&t.amount===e.args.totalSupply&&t.amount>0n&&t.index<num(e.log.logIndex)!);return minted.length===1?[{address:lower(e.args.creator),role:'creator' as const,source:FOUR_MEME_HISTORY_SOURCE,timestamp:new Date(num(e.block.timestamp)!*1000).toISOString(),transaction:lower(e.receipt.transactionHash),label:'Four.Meme TokenCreate creator'}]:[];});return es;}
 try{
  await load(hashes);const initial=update(),creations=initial.filter(e=>e.name==='TokenCreate'&&result.identities.some(i=>i.transaction===lower(e.receipt.transactionHash))),known=initial.filter(e=>e.name==='TokenPurchase').sort((a,b)=>num(a.block.number)!-num(b.block.number)!||num(a.log.logIndex)!-num(b.log.logIndex)!);
  if(creations.length!==1||!known.length)throw Error('Canonical creation or purchase receipt unavailable');
  const creation=creations[0],start=num(creation.block.number)!,knownFirst=known[0],firstTime=num(knownFirst.block.timestamp)!;
  if(start<=0||num(knownFirst.block.number)!<start||input.anchor.timestamp<=firstTime+60)throw Error('First-minute end not finalized');
  // Scope is the canonical manager's TokenCreate marker plus matching prior mint,
  // not proof that this address had no code before the event or a token-wide launch.
  const afterCreation=(e:Event)=>num(e.block.number)!>start||(num(e.block.number)===start&&num(e.log.logIndex)!>num(creation.log.logIndex)!);
  if(known.some(e=>!afterCreation(e)))throw Error('Purchase precedes launchpad creation marker');
  let end=Math.min(input.anchor.number,num(knownFirst.block.number)!+256),through:Record<string,any>={};
  for(let attempt=0;attempt<3;attempt++){through=obj((await call([{method:'eth_getBlockByNumber',params:['0x'+end.toString(16),false]}]))[0]);if(num(through.number)!==end||!H.test(through.hash)||num(through.timestamp)===null)throw Error('Window header unavailable');if(num(through.timestamp)!>firstTime+60)break;end=Math.min(input.anchor.number,end+256);}
  if(num(through.timestamp)!<=firstTime+60||num(through.timestamp)!>input.anchor.timestamp||end-start>3000)throw Error('Bounded first-minute window unavailable');
  const pending:[[number,number]]|[number,number][]=[[start,end]],covered:Record<string,any>[]=[];let requests=0;
  while(pending.length){if(++requests>8)throw Error('Range budget');const [lo,hi]=pending.shift()!;const value=(await call([{method:'eth_getLogs',params:[{address:FOUR_MEME_MANAGER,topics:[signatures],fromBlock:'0x'+lo.toString(16),toBlock:'0x'+hi.toString(16)}]}]))[0];
   if(!Array.isArray(value)||value.length>2000){if(lo===hi)throw Error('Range unavailable');const mid=Math.floor((lo+hi)/2);pending.unshift([lo,mid],[mid+1,hi]);continue;}
   for(const raw of value){const l=obj(raw);if(lower(l.address)!==FOUR_MEME_MANAGER||l.removed!==false||!H.test(l.transactionHash)||!H.test(l.blockHash)||num(l.blockNumber)===null||num(l.blockNumber)!<lo||num(l.blockNumber)!>hi||num(l.logIndex)===null||!Array.isArray(l.topics)||l.topics.length!==1)throw Error('Invalid manager log');if(!signatures.includes(lower(l.topics[0]) as any))continue;
    try{const d=decodeEventLog({abi,data:l.data,topics:l.topics as [`0x${string}`,...`0x${string}`[]],strict:true});if(lower(d.args.token)===token)covered.push(l);}catch{throw Error('Malformed manager event');}
   }if(covered.length>64)throw Error('Token event bound');
  }
  if(initial.filter(e=>num(e.block.number)!>=start&&num(e.block.number)!<=end).some(e=>!covered.some(l=>lower(l.transactionHash)===lower(e.log.transactionHash)&&l.logIndex===e.log.logIndex&&l.data===e.log.data)))throw Error('Previously observed event missing from window');
  await load([...new Set(covered.map(l=>lower(l.transactionHash)))]);const all=update();
  // Receipt verification can reveal additional canonical events beyond the indexed row.
  // Every in-window event must be present in both views, including newly loaded receipts.
  if(all.filter(e=>num(e.block.number)!>=start&&num(e.block.number)!<=end).some(e=>!covered.some(l=>lower(l.transactionHash)===lower(e.log.transactionHash)&&l.logIndex===e.log.logIndex&&l.data===e.log.data&&lower(l.blockHash)===lower(e.log.blockHash))))throw Error('Canonical receipt event missing from indexed window');
  for(const l of covered){if(!all.some(e=>lower(e.log.transactionHash)===lower(l.transactionHash)&&e.log.logIndex===l.logIndex&&e.log.data===l.data&&lower(e.log.blockHash)===lower(l.blockHash)))throw Error('Window receipt unavailable');}
  const relevant=all.filter(e=>covered.some(l=>lower(l.transactionHash)===lower(e.log.transactionHash)&&l.logIndex===e.log.logIndex));
  if(relevant.filter(e=>e.name==='TokenCreate').length!==1||!relevant.some(e=>e.name==='TokenCreate'&&e.log.transactionHash===creation.log.transactionHash))throw Error('Creation not covered');
  const purchases=relevant.filter(e=>e.name==='TokenPurchase').sort((a,b)=>num(a.block.number)!-num(b.block.number)!||num(a.log.logIndex)!-num(b.log.logIndex)!);if(!purchases.length||purchases.some(e=>!trade(e)))throw Error('Unresolved purchase routing');
  if(purchases.some(e=>!afterCreation(e)))throw Error('Purchase precedes launchpad creation marker');
  const ordered=[creation,...purchases].sort((a,b)=>num(a.block.number)!-num(b.block.number)!);if(ordered.some((e,i)=>i>0&&num(e.block.timestamp)!<num(ordered[i-1].block.timestamp)!))throw Error('Inconsistent block times');
  const first=purchases[0],at=num(first.block.timestamp)!;if(num(through.timestamp)!<=at+60)throw Error('Window incomplete');
  const recheck=await call([{method:'eth_getBlockByNumber',params:[creation.block.number,false]},{method:'eth_getBlockByNumber',params:[through.number,false]}]);if(lower(obj(recheck[0]).hash)!==lower(creation.block.hash)||lower(obj(recheck[1]).hash)!==lower(through.hash)){result.trades=[];result.identities=[];throw Error('Window changed');}
  result.proof={verified:true,scope:'selected-launchpad',protocol:'four-meme-v2',chain:'bsc',token,manager:FOUR_MEME_MANAGER,firstPurchaseAt:new Date(at*1000).toISOString(),firstPurchaseTransaction:lower(first.receipt.transactionHash),windowEndAt:new Date((at+60)*1000).toISOString(),creation:{transaction:lower(creation.receipt.transactionHash),blockNumber:start,blockHash:lower(creation.block.hash)},through:{blockNumber:end,blockHash:lower(through.hash),timestamp:new Date(num(through.timestamp)!*1000).toISOString()},eligibleTradeIds:purchases.filter(e=>num(e.block.timestamp)!<=at+60).map(e=>trade(e)!.id),verifiedAt:input.observedAt,source:FOUR_MEME_HISTORY_SOURCE};
  result.reasons.push('Canonical Four.Meme TokenCreate with a matching prior mint for its declared supply, and contiguous manager-event coverage through the first purchase plus sixty seconds verified. Buyers require matching exact token transfers, including routed delivery to the transaction sender. Scope is this token on this launchpad; pre-event contract deployment, all venues and beneficial ownership are not established; timing does not establish bots or malicious intent.');
 }catch{input.signal?.throwIfAborted();result.reasons.push('The bounded Four.Meme first-minute window could not be fully verified. Canonical observed receipts remain available, but no curve timing classification is established.');}
 return result;
}
