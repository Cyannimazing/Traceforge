import type {TransferRecord} from './investigation';
export const DIRECT_TRANSFER_SOURCE='EVM canonical holder-transfer receipts';
const TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const quantity=(v:unknown)=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const wordAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
export type DirectTransferCandidate={address:string;topics:string[];data:string;blockNumber:string;blockHash:string;transactionHash:string;logIndex:string;transactionIndex:string;removed:boolean};
function normalize(value:unknown):DirectTransferCandidate|null{
 const r=object(value);if(!ADDRESS.test(r.address)||r.removed!==false||!HASH.test(r.data)||BigInt(r.data)<=0n||!HASH.test(r.blockHash)||!HASH.test(r.transactionHash)||quantity(r.blockNumber)===null||quantity(r.logIndex)===null||quantity(r.transactionIndex)===null||!Array.isArray(r.topics)||r.topics.length!==3||r.topics[0]?.toLowerCase()!==TOPIC||!wordAddress(r.topics[1])||!wordAddress(r.topics[2]))return null;
 return {address:r.address.toLowerCase(),topics:r.topics.map((t:string)=>t.toLowerCase()),data:r.data.toLowerCase(),blockNumber:r.blockNumber,blockHash:r.blockHash.toLowerCase(),transactionHash:r.transactionHash.toLowerCase(),logIndex:r.logIndex,transactionIndex:r.transactionIndex,removed:false};
}
/** Select from independently fetched ledger rows only, never provider risk labels. */
export function selectDirectTransferCandidates(rows:unknown[],rankedPositiveAddresses:string[],excludedAddresses:string[]=[]){
 const excluded=new Set(excludedAddresses.map(a=>a.toLowerCase())),eligible=new Set(rankedPositiveAddresses.map(a=>a.toLowerCase()).filter(a=>ADDRESS.test(a)&&!excluded.has(a)&&!/^0x0{40}$/.test(a)).slice(0,50));
 const seen=new Set<string>(),transactions=new Set<string>(),candidates:DirectTransferCandidate[]=[];let eligibleEvents=0;const ranks=new Map([...eligible].map((a,i)=>[a,i]));
 const rankedRows=rows.map(normalize).filter((r):r is DirectTransferCandidate=>!!r).sort((a,b)=>Math.max(ranks.get(wordAddress(a.topics[1])!)??Infinity,ranks.get(wordAddress(a.topics[2])!)??Infinity)-Math.max(ranks.get(wordAddress(b.topics[1])!)??Infinity,ranks.get(wordAddress(b.topics[2])!)??Infinity)||quantity(a.blockNumber)!-quantity(b.blockNumber)!||quantity(a.logIndex)!-quantity(b.logIndex)!);
 for(const r of rankedRows){const from=wordAddress(r.topics[1])!,to=wordAddress(r.topics[2])!;if(from===to||!eligible.has(from)||!eligible.has(to))continue;const key=r.transactionHash+':'+quantity(r.logIndex);if(seen.has(key))continue;seen.add(key);eligibleEvents++;
  if(candidates.length>=32||!transactions.has(r.transactionHash)&&transactions.size>=4)continue;transactions.add(r.transactionHash);candidates.push(r);
 }
 return {candidates,eligibleEvents,selectedTransactions:transactions.size,truncated:eligibleEvents>candidates.length};
}
type Call={method:string;params:unknown[]};
type Input={token:string;anchor:{number:string;hash:string;timestamp:string};decimals:number;observedAt:string;candidates:DirectTransferCandidate[];eligibleAddresses:string[];excludedAddresses?:string[];signal?:AbortSignal;canRead?:()=>boolean};
export async function verifyDirectTransferCandidates(input:Input,read:(calls:Call[])=>Promise<unknown[]>){
 input.signal?.throwIfAborted();const selected=selectDirectTransferCandidates(input.candidates,input.eligibleAddresses,input.excludedAddresses),transfers:TransferRecord[]=[],anchorNumber=quantity(input.anchor.number),anchorTime=quantity(input.anchor.timestamp);let attempted=0,failed=0,stopped=false;
 const finish=(extra='')=>({transfers,truncated:selected.truncated||failed>0||stopped,detail:`${transfers.length} exact token Transfer logs verified from ${attempted}/${selected.selectedTransactions} selected transactions between the top 50 eligible positive holders; at most 4 transactions and 32 logs, prioritized by current holder rank. Accepted links require a successful receipt, canonical block and ending safe anchor. This is bounded direct-transfer evidence, not a complete relationship graph, trade classification or ownership proof.${extra}`});
 if(!ADDRESS.test(input.token)||anchorNumber===null||anchorTime===null||!HASH.test(input.anchor.hash)||!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>255){stopped=true;return finish(' Invalid units or anchor; no evidence accepted.');}
 const groups=new Map<string,DirectTransferCandidate[]>();for(const r of selected.candidates){if(r.address!==input.token.toLowerCase()||quantity(r.blockNumber)!>anchorNumber){failed++;continue;}const group=groups.get(r.transactionHash)||[];group.push(r);groups.set(r.transactionHash,group);}
 for(const [tx,rows] of groups){
  input.signal?.throwIfAborted();if(input.canRead?.()===false){stopped=true;break;}attempted++;
  try{
   const first=rows[0],[rawReceipt,rawBlock]=await read([{method:'eth_getTransactionReceipt',params:[tx]},{method:'eth_getBlockByNumber',params:[first.blockNumber,false]}]),receipt=object(rawReceipt),block=object(rawBlock),time=quantity(block.timestamp);
   if(receipt.status!=='0x1'||receipt.transactionHash?.toLowerCase()!==tx||receipt.blockHash?.toLowerCase()!==first.blockHash||quantity(receipt.blockNumber)!==quantity(first.blockNumber)||block.hash?.toLowerCase()!==first.blockHash||quantity(block.number)!==quantity(first.blockNumber)||time===null||time<=0||time>anchorTime||!Array.isArray(receipt.logs)||receipt.logs.length>2000){failed+=rows.length;continue;}
   for(const row of rows){const matches=receipt.logs.map(normalize).filter((l:DirectTransferCandidate|null)=>l&&quantity(l.logIndex)===quantity(row.logIndex));
    const proof=matches.length===1?matches[0] as DirectTransferCandidate:null;
    if(!proof||row.blockHash!==first.blockHash||quantity(row.blockNumber)!==quantity(first.blockNumber)||proof.address!==row.address||proof.transactionHash!==tx||proof.blockHash!==first.blockHash||quantity(proof.blockNumber)!==quantity(first.blockNumber)||quantity(proof.transactionIndex)!==quantity(row.transactionIndex)||proof.data!==row.data||JSON.stringify(proof.topics)!==JSON.stringify(row.topics)){failed++;continue;}
    const raw=BigInt(row.data),amount=Number(raw)/10**input.decimals;if(!Number.isFinite(amount)||amount<=0){failed++;continue;}
    transfers.push({id:`evm-direct:${tx}:${quantity(row.logIndex)}`,from:wordAddress(row.topics[1])!,to:wordAddress(row.topics[2])!,token:input.token.toLowerCase(),native:false,amountRaw:raw.toString(),decimals:input.decimals,amount,timestamp:new Date(time*1000).toISOString(),transaction:tx,source:`${DIRECT_TRANSFER_SOURCE}; exact successful receipt log and canonical block header; safe anchor ${anchorNumber}; direct token transfer, not a buy, sell or ownership proof`});
   }
  }catch(error){input.signal?.throwIfAborted();failed++;stopped=true;if(error instanceof Error&&/rate limit|denied/i.test(error.message)){transfers.length=0;return finish(' Provider denied further reads; no retry was made, and links without an ending-anchor check were withheld.');}break;}
 }
 if(transfers.length){try{if(input.canRead?.()===false)throw Error('deadline');const checked=object((await read([{method:'eth_getBlockByNumber',params:[input.anchor.number,false]}]))[0]);if(quantity(checked.number)!==anchorNumber||checked.hash?.toLowerCase()!==input.anchor.hash.toLowerCase()||quantity(checked.timestamp)!==anchorTime)throw Error('reorg');}catch{input.signal?.throwIfAborted();transfers.length=0;stopped=true;return finish(' Ending anchor was not verified; all links withheld.');}}
 return finish(failed||stopped?' Some proofs were unavailable, conflicting or outside the remaining request/time budget.':'');
}
