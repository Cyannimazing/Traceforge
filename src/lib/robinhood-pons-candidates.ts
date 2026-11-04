import type {Report} from './analysis';
import type {IdentityRecord} from './investigation';
import {PONS_FACTORY} from './pons-launch-record';

export const PONS_CANDIDATE_SOURCE='Robinhood Pons Transfer candidate history';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LAUNCH='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const ZERO='0x'+'0'.repeat(40),MAX=(1n<<256n)-1n,HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const wordAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
type Call={method:string;params:unknown[]};
export type PonsCandidateResult={candidates:string[];identity?:IdentityRecord;source:Report['sources'][number];rateLimited?:boolean;ledger?:{balances:Record<string,string>;netSupplyRaw:string};scope?:{creationVerified:true;fromBlock:number;toBlock:number;eventCount:number;positiveCandidates:number;creationTransaction:string}};
type Input={token:string;curve:string;launcher:string;anchor:{number:string;hash:string;timestamp:string};observedAt:string;signal?:AbortSignal};
/** Caller first matches public RPC chain/hash to its independent holder anchor.
 * A bounded ledger nominates addresses only. Every displayed balance must still
 * be read by balanceOf at that anchor. No inferred trade/sniper classification.
 */
export async function readRobinhoodPonsCandidates(input:Input,read:(calls:Call[],maxBytes?:number)=>Promise<unknown[]>):Promise<PonsCandidateResult>{
 input.signal?.throwIfAborted();
 const failed=(detail:string,rateLimited=false):PonsCandidateResult=>({candidates:[],source:{name:PONS_CANDIDATE_SOURCE,status:'unavailable',fetchedAt:input.observedAt,detail},...(rateLimited?{rateLimited:true}:{})});
 try{
  const token=input.token.toLowerCase(),curve=input.curve.toLowerCase(),launcher=input.launcher.toLowerCase(),end=quantity(input.anchor.number),anchorTime=quantity(input.anchor.timestamp);
  if(![token,curve,launcher].every(a=>ADDRESS.test(a)&&a!==ZERO)||end===null||anchorTime===null||!HASH.test(input.anchor.hash))return failed('A valid token, Pons binding and safe anchor are required.');
  const from=Math.max(0,end-9999999);
  const [raw]=await read([{method:'eth_getLogs',params:[{address:token,topics:[TRANSFER],fromBlock:'0x'+from.toString(16),toBlock:input.anchor.number}]}],8*1024*1024);
  if(!Array.isArray(raw)||!raw.length||raw.length>=10000)return failed('Transfer history was empty, unavailable or reached the 10,000-row cap. Earlier holder candidates remain unknown.');
  const unique=new Map<string,Record<string,any>>();
  for(const value of raw){const r=object(value),height=quantity(r.blockNumber),index=quantity(r.logIndex),txIndex=quantity(r.transactionIndex);
   if(r.address?.toLowerCase()!==token||r.removed!==false||height===null||height<from||height>end||index===null||txIndex===null||!HASH.test(r.blockHash)||!HASH.test(r.transactionHash)||!HASH.test(r.data)||!Array.isArray(r.topics)||r.topics.length!==3||r.topics[0]?.toLowerCase()!==TRANSFER||!r.topics.slice(1).every((t:unknown)=>wordAddress(t)!==null))return failed('Transfer history contained a malformed, removed or mismatched event; no ledger candidate order was used.');
   const normalized={...r,address:token,blockHash:r.blockHash.toLowerCase(),transactionHash:r.transactionHash.toLowerCase(),data:r.data.toLowerCase(),topics:r.topics.map((t:string)=>t.toLowerCase())};
   const key=height+':'+index,old=unique.get(key);if(old&&(old.blockHash!==normalized.blockHash||old.transactionHash!==normalized.transactionHash||old.data!==normalized.data||JSON.stringify(old.topics)!==JSON.stringify(normalized.topics)||quantity(old.transactionIndex)!==txIndex))return failed('Transfer history contained conflicting duplicate events; no ledger candidate order was used.');
   unique.set(key,normalized);
  }
  const rows=[...unique.values()].sort((a,b)=>quantity(a.blockNumber)!-quantity(b.blockNumber)!||quantity(a.transactionIndex)!-quantity(b.transactionIndex)!||quantity(a.logIndex)!-quantity(b.logIndex)!);
  const first=rows[0];if(wordAddress(first.topics[1])!==ZERO||wordAddress(first.topics[2])!==curve||BigInt(first.data)===0n)return failed('The bounded window did not begin with the token mint to its verified Pons curve; creation coverage is not established.');
  const balances=new Map<string,bigint>();
  for(const row of rows){const sender=wordAddress(row.topics[1])!,recipient=wordAddress(row.topics[2])!,amount=BigInt(row.data);for(const [a,delta] of [[sender,-amount],[recipient,amount]] as const){if(a===ZERO)continue;const balance=(balances.get(a)||0n)+delta;if(balance<0n||balance>MAX)return failed('The transfer ledger was negative or overflowed; it cannot reliably rank holder candidates.');balances.set(a,balance);}}
  const [rawReceipt]=await read([{method:'eth_getTransactionReceipt',params:[first.transactionHash]}]);const receipt=object(rawReceipt);
  if(receipt.status!=='0x1'||receipt.transactionHash?.toLowerCase()!==first.transactionHash||receipt.blockHash?.toLowerCase()!==first.blockHash||quantity(receipt.blockNumber)!==quantity(first.blockNumber)||!Array.isArray(receipt.logs)||receipt.logs.length>2000)return failed('The first mint did not have a successful matching receipt.');
  const mint=receipt.logs.some((v:unknown)=>{const l=object(v);return l.removed===false&&l.address?.toLowerCase()===token&&quantity(l.logIndex)===quantity(first.logIndex)&&l.transactionHash?.toLowerCase()===first.transactionHash&&l.blockHash?.toLowerCase()===first.blockHash&&quantity(l.blockNumber)===quantity(first.blockNumber)&&l.data?.toLowerCase()===first.data&&Array.isArray(l.topics)&&JSON.stringify(l.topics.map((t:string)=>typeof t==='string'?t.toLowerCase():t))===JSON.stringify(first.topics);});
  const launched=receipt.logs.some((v:unknown)=>{const l=object(v);return l.removed===false&&l.address?.toLowerCase()===PONS_FACTORY&&l.transactionHash?.toLowerCase()===first.transactionHash&&l.blockHash?.toLowerCase()===first.blockHash&&quantity(l.blockNumber)===quantity(first.blockNumber)&&quantity(l.logIndex)!==null&&Array.isArray(l.topics)&&l.topics.length===4&&l.topics[0]?.toLowerCase()===LAUNCH&&wordAddress(l.topics[1])===token&&wordAddress(l.topics[2])===curve&&wordAddress(l.topics[3])===launcher&&typeof l.data==='string'&&/^0x[0-9a-f]{192}$/i.test(l.data);});
  if(!mint||!launched)return failed('The mint receipt did not contain the matching official Pons TokenLaunched event; no creator transaction or ledger ranking was accepted.');
  const [rawBlock,rawAnchor]=await read([{method:'eth_getBlockByNumber',params:[first.blockNumber,false]},{method:'eth_getBlockByNumber',params:[input.anchor.number,false]}]);const block=object(rawBlock),anchor=object(rawAnchor),time=quantity(block.timestamp);
  if(quantity(block.number)!==quantity(first.blockNumber)||block.hash?.toLowerCase()!==first.blockHash||time===null||time<=0||time>anchorTime||quantity(anchor.number)!==end||anchor.hash?.toLowerCase()!==input.anchor.hash.toLowerCase()||quantity(anchor.timestamp)!==anchorTime)return failed('The mint block or ending safe anchor changed or could not be reverified; no historical candidates were retained.');
  input.signal?.throwIfAborted();
  const candidates=[...balances.entries()].filter(([,amount])=>amount>0n).sort((a,b)=>a[1]>b[1]?-1:a[1]<b[1]?1:a[0].localeCompare(b[0])).map(([a])=>a);
  const timestamp=new Date(time*1000).toISOString(),netSupply=[...balances.values()].reduce((sum,value)=>sum+value,0n);
  if(netSupply>MAX)return failed('Transfer ledger aggregate supply overflowed; no ledger order was retained.');
  return {candidates,ledger:{balances:Object.fromEntries([...balances].map(([a,n])=>[a,n.toString()])),netSupplyRaw:netSupply.toString()},identity:{address:launcher,role:'creator',source:PONS_CANDIDATE_SOURCE,timestamp,timestampBasis:'provider-event',transaction:first.transactionHash,label:'Launch initiator'},scope:{creationVerified:true,fromBlock:quantity(first.blockNumber)!,toBlock:end,eventCount:rows.length,positiveCandidates:candidates.length,creationTransaction:first.transactionHash},source:{name:PONS_CANDIDATE_SOURCE,status:'available',fetchedAt:input.observedAt,detail:`One bounded Transfer query returned ${rows.length} unique events. A successful canonical mint receipt and official Pons TokenLaunched event establish token creation at block ${quantity(first.blockNumber)}, ${timestamp}, transaction ${first.transactionHash}. Read scope: creation through safe block ${end} (${input.anchor.hash}); ${candidates.length} positive net-transfer candidates, sorted by ledger amount. Log timestamps were not trusted. Ledger amounts only rank candidates; independent same-block balanceOf reads determine current balances. This is not a complete holder census, a complete trade history, or verified first-minute buyer coverage.`}};
 }catch(error){input.signal?.throwIfAborted();const limited=error instanceof Error&&/rate limit/i.test(error.message);return failed(limited?'Public log route was rate limited; no retry or alternate log route was used.':'Bounded Pons Transfer history was unavailable; supplied and recent candidates remain eligible for independent balance verification.',limited);}
}
