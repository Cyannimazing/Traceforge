import type {Report} from './analysis';
import type {IdentityRecord} from './investigation';
import {PONS_FACTORY} from './pons-launch-record';
import {selectDirectTransferCandidates,type DirectTransferCandidate} from './evm-direct-transfer-proof';

export const PONS_CANDIDATE_SOURCE='Robinhood Pons Transfer candidate history';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const LAUNCH='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const ZERO='0x'+'0'.repeat(40),MAX=(1n<<256n)-1n,HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const wordAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
type Call={method:string;params:unknown[]};
type RateMetadata={httpStatus?:number;rpcCode?:number;retryAfterSeconds?:number};
/** An oversized read may be subdivided. This is not a rate/access denial. */
export class CandidateRpcLogLimitError extends Error{constructor(){super('Log result limit requires a smaller block interval.');this.name='CandidateRpcLogLimitError';}}
/** Preserve a fixed diagnostic message for existing rate-stop handlers. Only
 * bounded numeric metadata crosses the provider boundary, never its message. */
export class CandidateRpcRateLimitError extends Error{
 readonly diagnostics:RateMetadata={};
 constructor(metadata:RateMetadata={}){super('RPC rate limit reached; no retry was made.');this.name='CandidateRpcRateLimitError';
  if(Number.isInteger(metadata.httpStatus)&&metadata.httpStatus!>=100&&metadata.httpStatus!<=599)this.diagnostics.httpStatus=metadata.httpStatus;
  if(Number.isSafeInteger(metadata.rpcCode)&&Math.abs(metadata.rpcCode!)<=2147483647)this.diagnostics.rpcCode=metadata.rpcCode;
  if(typeof metadata.retryAfterSeconds==='number'&&Number.isFinite(metadata.retryAfterSeconds)&&metadata.retryAfterSeconds>=0&&metadata.retryAfterSeconds<=2147483647)this.diagnostics.retryAfterSeconds=Math.ceil(metadata.retryAfterSeconds);
 }
}
export type PonsCandidateResult={candidates:string[];directTransfers?:{candidates:DirectTransferCandidate[];eligibleEvents:number;selectedTransactions:number;truncated:boolean};identity?:IdentityRecord;source:Report['sources'][number];rateLimited?:boolean;rateLimit?:RateMetadata&{stage:'logs'|'mint-receipt'|'block-proof'};ledger?:{balances:Record<string,string>;netSupplyRaw:string};scope?:{creationVerified:true;fromBlock:number;toBlock:number;eventCount:number;positiveCandidates:number;creationTransaction:string}};
type Input={token:string;curve:string;launcher:string;anchor:{number:string;hash:string;timestamp:string};observedAt:string;signal?:AbortSignal;excludedAddresses?:string[]};
/** Caller first matches public RPC chain/hash to its independent holder anchor.
 * A bounded ledger nominates addresses only. Every displayed balance must still
 * be read by balanceOf at that anchor. No inferred trade/sniper classification.
 */
export async function readRobinhoodPonsCandidates(input:Input,read:(calls:Call[],maxBytes?:number)=>Promise<unknown[]>):Promise<PonsCandidateResult>{
 input.signal?.throwIfAborted();
 const failed=(detail:string,rateLimited=false):PonsCandidateResult=>({candidates:[],source:{name:PONS_CANDIDATE_SOURCE,status:'unavailable',fetchedAt:input.observedAt,detail},...(rateLimited?{rateLimited:true}:{})});
 let stage:'logs'|'mint-receipt'|'block-proof'='logs';
 try{
  const token=input.token.toLowerCase(),curve=input.curve.toLowerCase(),launcher=input.launcher.toLowerCase(),end=quantity(input.anchor.number),anchorTime=quantity(input.anchor.timestamp);
  if(![token,curve,launcher].every(a=>ADDRESS.test(a)&&a!==ZERO)||end===null||anchorTime===null||!HASH.test(input.anchor.hash))return failed('A valid token, Pons binding and safe anchor are required.');
  let from=Math.max(0,end-9999999),logQueries=0,factoryHint:Record<string,any>|undefined;
  // RPC range limits are transport boundaries, never a token-age boundary.
  // A query at the provider row cap must be subdivided, not accepted as complete.
  const page=async(contract:string,topics:string[],lo:number,hi:number):Promise<Record<string,any>[]>=>{
   input.signal?.throwIfAborted();if(++logQueries>64)throw Error('Log request budget exceeded.');
   let value:unknown,oversized=false;
   try{[value]=await read([{method:'eth_getLogs',params:[{address:contract,topics,fromBlock:'0x'+lo.toString(16),toBlock:'0x'+hi.toString(16)}]}],8*1024*1024);}catch(error){if(!(error instanceof CandidateRpcLogLimitError))throw error;oversized=true;}
   if(oversized){if(lo===hi)throw Error('Single-block log cap prevents complete history.');const mid=lo+Math.floor((hi-lo)/2),left=await page(contract,topics,lo,mid),right=await page(contract,topics,mid+1,hi);if(left.length+right.length>50000)throw Error('Event budget exceeded.');return [...left,...right];}
   if(!Array.isArray(value)||value.length>10000)throw Error('Log page unavailable or outside response bound.');
   for(const rawRow of value){const r=object(rawRow),height=quantity(r.blockNumber);if(height===null||height<lo||height>hi||r.address?.toLowerCase()!==contract||r.removed!==false||!Array.isArray(r.topics)||!topics.every((topic,index)=>typeof r.topics[index]==='string'&&r.topics[index].toLowerCase()===topic))throw Error('Mismatched log page.');}
   if(value.length===10000){if(lo===hi)throw Error('Single-block log cap prevents complete history.');const mid=lo+Math.floor((hi-lo)/2),left=await page(contract,topics,lo,mid),right=await page(contract,topics,mid+1,hi);if(left.length+right.length>50000)throw Error('Event budget exceeded.');return [...left,...right];}
   return value;
  };
  let raw=await page(token,[TRANSFER],from,end);
  const ordered=[...raw].sort((a,b)=>(quantity(a.blockNumber)??Infinity)-(quantity(b.blockNumber)??Infinity)||(quantity(a.logIndex)??Infinity)-(quantity(b.logIndex)??Infinity));
  const recentMint=ordered[0]&&wordAddress(ordered[0].topics?.[1])===ZERO&&wordAddress(ordered[0].topics?.[2])===curve;
  if(!recentMint){
   // Find this token's factory event with indexed token topics. Walk every
   // preceding provider-sized interval until creation is found or genesis ends.
   for(let hi=end;hi>=0;){
    const lo=Math.max(0,hi-9999999),events=await page(PONS_FACTORY,[LAUNCH,'0x'+token.slice(2).padStart(64,'0')],lo,hi);
    if(events.length){
     const unique=new Map<string,Record<string,any>>();
     for(const r of events){if(!HASH.test(r.transactionHash)||!HASH.test(r.blockHash)||quantity(r.logIndex)===null||quantity(r.transactionIndex)===null||r.topics.length!==4||wordAddress(r.topics[2])!==curve||wordAddress(r.topics[3])!==launcher||typeof r.data!=='string'||!/^0x[0-9a-f]{192}$/i.test(r.data))throw Error('Factory event does not match token binding.');const key=r.transactionHash.toLowerCase()+':'+r.logIndex,prior=unique.get(key);if(prior&&JSON.stringify(prior)!==JSON.stringify(r))throw Error('Conflicting factory event.');unique.set(key,r);}
     if(unique.size!==1)throw Error('Ambiguous factory creation event.');factoryHint=[...unique.values()][0];break;
    }
    if(lo===0)break;hi=lo-1;
   }
   if(!factoryHint)return failed('No matching factory creation event was found within the bounded contiguous search. Holder ranking remains unverified.');
   const creation=quantity(factoryHint.blockNumber)!;
   // Reuse the already-read recent interval only when it follows creation.
   // Older inactive balances then participate in the same complete ledger.
   if(creation<from){const older:Record<string,any>[]=[];for(let lo=creation;lo<from;lo+=10000000){older.push(...await page(token,[TRANSFER],lo,Math.min(from-1,lo+9999999)));if(older.length+raw.length>50000)throw Error('Event budget exceeded.');}raw=[...older,...raw];}
   else raw=await page(token,[TRANSFER],creation,end);
   from=creation;
  }
  if(!raw.length)return failed('Transfer history was empty. Holder ranking remains unverified.');
  const unique=new Map<string,Record<string,any>>();
  for(const value of raw){const r=object(value),height=quantity(r.blockNumber),index=quantity(r.logIndex),txIndex=quantity(r.transactionIndex);
   if(r.address?.toLowerCase()!==token||r.removed!==false||height===null||height<from||height>end||index===null||txIndex===null||!HASH.test(r.blockHash)||!HASH.test(r.transactionHash)||!HASH.test(r.data)||!Array.isArray(r.topics)||r.topics.length!==3||r.topics[0]?.toLowerCase()!==TRANSFER||!r.topics.slice(1).every((t:unknown)=>wordAddress(t)!==null))return failed('Transfer history contained a malformed, removed or mismatched event; no ledger candidate order was used.');
   const normalized={...r,address:token,blockHash:r.blockHash.toLowerCase(),transactionHash:r.transactionHash.toLowerCase(),data:r.data.toLowerCase(),topics:r.topics.map((t:string)=>t.toLowerCase())};
   const key=height+':'+index,old=unique.get(key);if(old&&(old.blockHash!==normalized.blockHash||old.transactionHash!==normalized.transactionHash||old.data!==normalized.data||JSON.stringify(old.topics)!==JSON.stringify(normalized.topics)||quantity(old.transactionIndex)!==txIndex))return failed('Transfer history contained conflicting duplicate events; no ledger candidate order was used.');
   unique.set(key,normalized);
  }
  const rows=[...unique.values()].sort((a,b)=>quantity(a.blockNumber)!-quantity(b.blockNumber)!||quantity(a.transactionIndex)!-quantity(b.transactionIndex)!||quantity(a.logIndex)!-quantity(b.logIndex)!);
  const first=rows[0];if(wordAddress(first.topics[1])!==ZERO||wordAddress(first.topics[2])!==curve||BigInt(first.data)===0n||factoryHint&&(first.blockNumber!==factoryHint.blockNumber||first.blockHash!==factoryHint.blockHash.toLowerCase()||first.transactionHash!==factoryHint.transactionHash.toLowerCase()))return failed('The contiguous history did not begin with the token mint to its verified Pons curve; creation coverage is not established.');
  const balances=new Map<string,bigint>();
  for(const row of rows){const sender=wordAddress(row.topics[1])!,recipient=wordAddress(row.topics[2])!,amount=BigInt(row.data);for(const [a,delta] of [[sender,-amount],[recipient,amount]] as const){if(a===ZERO)continue;const balance=(balances.get(a)||0n)+delta;if(balance<0n||balance>MAX)return failed('The transfer ledger was negative or overflowed; it cannot reliably rank holder candidates.');balances.set(a,balance);}}
  stage='mint-receipt';const [rawReceipt]=await read([{method:'eth_getTransactionReceipt',params:[first.transactionHash]}]);const receipt=object(rawReceipt);
  if(receipt.status!=='0x1'||receipt.transactionHash?.toLowerCase()!==first.transactionHash||receipt.blockHash?.toLowerCase()!==first.blockHash||quantity(receipt.blockNumber)!==quantity(first.blockNumber)||!Array.isArray(receipt.logs)||receipt.logs.length>2000)return failed('The first mint did not have a successful matching receipt.');
  const mint=receipt.logs.some((v:unknown)=>{const l=object(v);return l.removed===false&&l.address?.toLowerCase()===token&&quantity(l.logIndex)===quantity(first.logIndex)&&l.transactionHash?.toLowerCase()===first.transactionHash&&l.blockHash?.toLowerCase()===first.blockHash&&quantity(l.blockNumber)===quantity(first.blockNumber)&&l.data?.toLowerCase()===first.data&&Array.isArray(l.topics)&&JSON.stringify(l.topics.map((t:string)=>typeof t==='string'?t.toLowerCase():t))===JSON.stringify(first.topics);});
  const launched=receipt.logs.some((v:unknown)=>{const l=object(v);return l.removed===false&&l.address?.toLowerCase()===PONS_FACTORY&&l.transactionHash?.toLowerCase()===first.transactionHash&&l.blockHash?.toLowerCase()===first.blockHash&&quantity(l.blockNumber)===quantity(first.blockNumber)&&quantity(l.logIndex)!==null&&Array.isArray(l.topics)&&l.topics.length===4&&l.topics[0]?.toLowerCase()===LAUNCH&&wordAddress(l.topics[1])===token&&wordAddress(l.topics[2])===curve&&wordAddress(l.topics[3])===launcher&&typeof l.data==='string'&&/^0x[0-9a-f]{192}$/i.test(l.data);});
  if(!mint||!launched)return failed('The mint receipt did not contain the matching official Pons TokenLaunched event; no creator transaction or ledger ranking was accepted.');
  stage='block-proof';const [rawBlock,rawAnchor]=await read([{method:'eth_getBlockByNumber',params:[first.blockNumber,false]},{method:'eth_getBlockByNumber',params:[input.anchor.number,false]}]);const block=object(rawBlock),anchor=object(rawAnchor),time=quantity(block.timestamp);
  if(quantity(block.number)!==quantity(first.blockNumber)||block.hash?.toLowerCase()!==first.blockHash||time===null||time<=0||time>anchorTime||quantity(anchor.number)!==end||anchor.hash?.toLowerCase()!==input.anchor.hash.toLowerCase()||quantity(anchor.timestamp)!==anchorTime)return failed('The mint block or ending safe anchor changed or could not be reverified; no historical candidates were retained.');
  input.signal?.throwIfAborted();
  const candidates=[...balances.entries()].filter(([,amount])=>amount>0n).sort((a,b)=>a[1]>b[1]?-1:a[1]<b[1]?1:a[0].localeCompare(b[0])).map(([a])=>a);
  const timestamp=new Date(time*1000).toISOString(),netSupply=[...balances.values()].reduce((sum,value)=>sum+value,0n);
  if(netSupply>MAX)return failed('Transfer ledger aggregate supply overflowed; no ledger order was retained.');
  const directTransfers=selectDirectTransferCandidates(rows,candidates,[token,curve,PONS_FACTORY,ZERO,...(input.excludedAddresses||[])]);
  return {candidates,directTransfers,ledger:{balances:Object.fromEntries([...balances].map(([a,n])=>[a,n.toString()])),netSupplyRaw:netSupply.toString()},identity:{address:launcher,role:'creator',source:PONS_CANDIDATE_SOURCE,timestamp,timestampBasis:'provider-event',transaction:first.transactionHash,label:'Launch initiator'},scope:{creationVerified:true,fromBlock:quantity(first.blockNumber)!,toBlock:end,eventCount:rows.length,positiveCandidates:candidates.length,creationTransaction:first.transactionHash},source:{name:PONS_CANDIDATE_SOURCE,status:'available',fetchedAt:input.observedAt,detail:`${logQueries} bounded log queries returned ${rows.length} unique Transfer events with contiguous creation-to-anchor coverage. A successful canonical mint receipt and official Pons TokenLaunched event establish token creation at block ${quantity(first.blockNumber)}, ${timestamp}, transaction ${first.transactionHash}. Read scope: creation through safe block ${end} (${input.anchor.hash}); ${candidates.length} positive net-transfer candidates, sorted by ledger amount. Log timestamps were not trusted. Ledger amounts only rank candidates; independent same-block balanceOf reads determine current balances. This is not a complete holder census, a complete trade history, or verified first-minute buyer coverage.`}};
 }catch(error){input.signal?.throwIfAborted();const limited=error instanceof Error&&/rate limit/i.test(error.message);
  if(limited){const metadata=error instanceof CandidateRpcRateLimitError?error.diagnostics:{},parts=[metadata.httpStatus===undefined?null:`HTTP ${metadata.httpStatus}`,metadata.rpcCode===undefined?null:`RPC code ${metadata.rpcCode}`,metadata.retryAfterSeconds===undefined?null:`retry after ${metadata.retryAfterSeconds} seconds`].filter(Boolean);return {...failed(`Public log route was rate limited during ${stage}${parts.length?` (${parts.join('; ')})`:''}; no retry or alternate log route was used.`,true),rateLimit:{stage,...metadata}};}
  return failed('Bounded Pons Transfer history was unavailable; supplied and recent candidates remain eligible for independent balance verification.');
 }
}
