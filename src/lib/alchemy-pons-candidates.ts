import {PONS_FACTORY,PONS_DEPLOYER} from './pons-launch-record';
import {CandidateRpcRateLimitError,type PonsCandidateResult} from './robinhood-pons-candidates';

export const ALCHEMY_PONS_SOURCE='Alchemy Robinhood token-transfer index';
/** Fixed diagnostic only; provider response text and endpoint secrets stay out. */
export class AlchemyIndexAccessDeniedError extends Error{
 constructor(){super('Configured Alchemy index access denied.');this.name='AlchemyIndexAccessDeniedError';}
}
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',LAUNCH='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const ZERO='0x'+'0'.repeat(40),DEAD='0x000000000000000000000000000000000000dead',MAX=(1n<<256n)-1n,HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const uint=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{1,64}$/i.test(v)?BigInt(v):null;
const quantity=(v:unknown)=>{const n=uint(v);return n!==null&&n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;};
const wordAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?'0x'+v.slice(-40).toLowerCase():null;
type Call={method:string;params:unknown[]};
export type AlchemyDirectNomination={transaction:string;logIndex:number;blockNumber:number;token:string;from:string;to:string;amountRaw:string};
type Indexed=AlchemyDirectNomination&{uniqueId:string};
export type AlchemyPonsCandidateResult=PonsCandidateResult&{
 accessDenied?:true;
 indexProvenance?:{kind:'alchemy-token-index';pages:number;exhausted:true;indexedEvents:number;canonicalReceiptCount:1};
 directNominations?:AlchemyDirectNomination[];
};
export type AlchemyPonsCandidateInput={token:string;curve:string;launcher:string;anchor:{number:string;hash:string;timestamp:string};observedAt:string;decimals:number;signal?:AbortSignal;excludedAddresses?:string[]};

/** Primary configured-provider index. Exhaustion establishes only this index's
 * scope, not proof of every indexed event. Balances still require same-anchor
 * balanceOf/totalSupply; nominees need actual receipt logs before becoming edges.
 * Reader owns endpoint selection, authentication, pacing and timeout policy.
 */
export async function readAlchemyPonsCandidates(input:AlchemyPonsCandidateInput,read:(calls:Call[],maxBytes?:number)=>Promise<unknown[]>):Promise<AlchemyPonsCandidateResult>{
 input.signal?.throwIfAborted();let stage:'logs'|'mint-receipt'|'block-proof'='logs',pages=0;
 const fail=(detail:string):AlchemyPonsCandidateResult=>({candidates:[],source:{name:ALCHEMY_PONS_SOURCE,status:'unavailable',fetchedAt:input.observedAt,detail}});
 try{
  const token=input.token.toLowerCase(),curve=input.curve.toLowerCase(),launcher=input.launcher.toLowerCase(),end=quantity(input.anchor.number),anchorTime=quantity(input.anchor.timestamp);
  if(![token,curve,launcher].every(a=>ADDRESS.test(a)&&a!==ZERO)||end===null||anchorTime===null||anchorTime<=0||!HASH.test(input.anchor.hash)||!Number.isInteger(input.decimals)||input.decimals<0||input.decimals>255)return fail('Valid token/Pons binding, token decimals and safe anchor are required.');
  const rows=new Map<string,Indexed>(),cursors=new Set<string>();let cursor:string|undefined,lastBlock=-1,exhausted=false;
  for(;pages<64;){
   input.signal?.throwIfAborted();
   const [rawPage]=await read([{method:'alchemy_getAssetTransfers',params:[{fromBlock:'0x0',toBlock:input.anchor.number,contractAddresses:[token],category:['erc20'],order:'asc',maxCount:'0x3e8',withMetadata:false,excludeZeroValue:true,...(cursor?{pageKey:cursor}:{})}]}],8*1024*1024);pages++;
   input.signal?.throwIfAborted();const page=object(rawPage);
   if(!Array.isArray(page.transfers)||page.transfers.length>1000)throw Error('shape');
   if(page.pageKey!=null&&(typeof page.pageKey!=='string'||page.pageKey.length>2048))throw Error('cursor');
   const next=typeof page.pageKey==='string'&&page.pageKey?page.pageKey:undefined;
   if(next&&(!page.transfers.length||next===cursor||cursors.has(next)))throw Error('cursor');
   let added=0;
   for(const raw of page.transfers){
    const row=object(raw),contract=object(row.rawContract),blockNumber=quantity(row.blockNum),amount=uint(contract.value),decimals=uint(contract.decimal);
    const id=typeof row.uniqueId==='string'?row.uniqueId:'',match=/^(0x[0-9a-f]{64}):log:(0|[1-9][0-9]*)$/i.exec(id),logIndex=match?Number(match[2]):NaN;
    if(row.category!=='erc20'||!ADDRESS.test(row.from)||!ADDRESS.test(row.to)||!HASH.test(row.hash)||!match||match[1].toLowerCase()!==row.hash.toLowerCase()||!Number.isSafeInteger(logIndex)||blockNumber===null||blockNumber>end||amount===null||decimals===null||decimals!==BigInt(input.decimals)||typeof contract.address!=='string'||contract.address.toLowerCase()!==token||row.removed===true||row.status==='failed'||row.status==='error'||row.status==='0x0'||row.isError===true||row.success===false)throw Error('record');
    const record:Indexed={token,from:row.from.toLowerCase(),to:row.to.toLowerCase(),transaction:row.hash.toLowerCase(),logIndex,blockNumber,amountRaw:amount.toString(),uniqueId:row.hash.toLowerCase()+':log:'+logIndex};
    const prior=rows.get(record.uniqueId);
    if(prior){if(JSON.stringify(prior)!==JSON.stringify(record))throw Error('conflicting duplicate');continue;}
    // API promises block ordering, not ordering of logs within the same block.
    if(blockNumber<lastBlock)throw Error('ordering');lastBlock=blockNumber;
    rows.set(record.uniqueId,record);added++;if(rows.size>50000)throw Error('event bound');
   }
   if(next&&!added)throw Error('stalled');
   if(!next){exhausted=true;break;}cursors.add(next);cursor=next;
  }
  if(!exhausted)return fail('Alchemy index pagination reached its 64-page bound before exhaustion. No complete ledger or ranked inventory was accepted.');
  const ordered=[...rows.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex),first=ordered[0];
  if(!first||first.from!==ZERO||first.to!==curve||BigInt(first.amountRaw)<=0n)return fail('Exhausted index does not begin with a positive token mint to the verified Pons curve. No ledger was accepted.');
  // A block-global log index cannot identify two different transactions.
  const positions=new Map<string,string>(),balances=new Map<string,bigint>();
  for(const row of ordered){const key=row.blockNumber+':'+row.logIndex;if(positions.has(key)&&positions.get(key)!==row.transaction)throw Error('conflicting log position');positions.set(key,row.transaction);
   for(const [a,delta] of [[row.from,-BigInt(row.amountRaw)],[row.to,BigInt(row.amountRaw)]] as const){if(a===ZERO)continue;const next=(balances.get(a)||0n)+delta;if(next<0n||next>MAX)throw Error('ledger');balances.set(a,next);}
  }
  const netSupply=[...balances.values()].reduce((sum,n)=>sum+n,0n);if(netSupply<=0n||netSupply>MAX)throw Error('supply');
  stage='mint-receipt';input.signal?.throwIfAborted();const [rawReceipt]=await read([{method:'eth_getTransactionReceipt',params:[first.transaction]}],8*1024*1024),receipt=object(rawReceipt);
  if(receipt.status!=='0x1'||receipt.transactionHash?.toLowerCase()!==first.transaction||quantity(receipt.blockNumber)!==first.blockNumber||!HASH.test(receipt.blockHash)||!Array.isArray(receipt.logs)||receipt.logs.length>2000)return fail('The indexed first mint lacks a successful matching canonical receipt.');
  const blockHash=receipt.blockHash.toLowerCase(),sameReceipt=(l:Record<string,any>)=>l.removed===false&&l.transactionHash?.toLowerCase()===first.transaction&&quantity(l.blockNumber)===first.blockNumber&&l.blockHash?.toLowerCase()===blockHash&&quantity(l.logIndex)!==null;
  const mint=receipt.logs.filter((v:unknown)=>{const l=object(v);return sameReceipt(l)&&l.address?.toLowerCase()===token&&quantity(l.logIndex)===first.logIndex&&typeof l.data==='string'&&HASH.test(l.data)&&BigInt(l.data)===BigInt(first.amountRaw)&&Array.isArray(l.topics)&&l.topics.length===3&&l.topics[0]?.toLowerCase()===TRANSFER&&wordAddress(l.topics[1])===ZERO&&wordAddress(l.topics[2])===curve;});
  const launch=receipt.logs.filter((v:unknown)=>{const l=object(v);return sameReceipt(l)&&l.address?.toLowerCase()===PONS_FACTORY&&Array.isArray(l.topics)&&l.topics.length===4&&l.topics[0]?.toLowerCase()===LAUNCH&&wordAddress(l.topics[1])===token&&wordAddress(l.topics[2])===curve&&wordAddress(l.topics[3])===launcher&&typeof l.data==='string'&&/^0x[0-9a-f]{192}$/i.test(l.data);});
  if(mint.length!==1||launch.length!==1)return fail('Actual receipt logs did not uniquely match the indexed mint and official Pons TokenLaunched binding.');
  stage='block-proof';const creationHex='0x'+first.blockNumber.toString(16);
  const [rawCreation,rawAnchor]=await read([{method:'eth_getBlockByNumber',params:[creationHex,false]},{method:'eth_getBlockByNumber',params:[input.anchor.number,false]}]),creation=object(rawCreation),anchor=object(rawAnchor),time=quantity(creation.timestamp);
  if(quantity(creation.number)!==first.blockNumber||creation.hash?.toLowerCase()!==blockHash||time===null||time<=0||time>anchorTime||quantity(anchor.number)!==end||anchor.hash?.toLowerCase()!==input.anchor.hash.toLowerCase()||quantity(anchor.timestamp)!==anchorTime)return fail('Creation header or ending safe anchor was invalid or changed. The indexed ledger was withheld.');
  input.signal?.throwIfAborted();
  const candidates=[...balances].filter(([,n])=>n>0n).sort((a,b)=>a[1]>b[1]?-1:a[1]<b[1]?1:a[0].localeCompare(b[0])).map(([a])=>a);
  const excluded=new Set([token,curve,ZERO,DEAD,PONS_FACTORY,PONS_DEPLOYER,...(input.excludedAddresses||[])].map(a=>a.toLowerCase())),eligible=candidates.filter(a=>!excluded.has(a)).slice(0,50),rank=new Map(eligible.map((a,i)=>[a,i]));
  const nominated=ordered.filter(r=>r.from!==r.to&&BigInt(r.amountRaw)>0n&&rank.has(r.from)&&rank.has(r.to)).sort((a,b)=>Math.max(rank.get(a.from)!,rank.get(a.to)!)-Math.max(rank.get(b.from)!,rank.get(b.to)!)||a.blockNumber-b.blockNumber||a.logIndex-b.logIndex),transactions=new Set<string>(),directNominations:AlchemyDirectNomination[]=[];
  for(const row of nominated){if(directNominations.length>=32||!transactions.has(row.transaction)&&transactions.size>=4)continue;transactions.add(row.transaction);const {uniqueId,...nomination}=row;void uniqueId;directNominations.push(nomination);}
  const timestamp=new Date(time*1000).toISOString();
  return {candidates,ledger:{balances:Object.fromEntries([...balances].map(([a,n])=>[a,n.toString()])),netSupplyRaw:netSupply.toString()},scope:{creationVerified:true,fromBlock:first.blockNumber,toBlock:end,eventCount:ordered.length,positiveCandidates:candidates.length,creationTransaction:first.transaction},identity:{address:launcher,role:'creator',transaction:first.transaction,timestamp,timestampBasis:'provider-event',label:'Launch initiator',source:ALCHEMY_PONS_SOURCE},indexProvenance:{kind:'alchemy-token-index',pages,exhausted:true,indexedEvents:ordered.length,canonicalReceiptCount:1},directNominations,source:{name:ALCHEMY_PONS_SOURCE,status:'available',fetchedAt:input.observedAt,detail:`${pages} configured-provider index pages exhausted from block 0 through safe block ${end}; ${ordered.length} unique indexed ERC20 events and ${candidates.length} positive ledger candidates. The first mint at block ${first.blockNumber}, ${timestamp}, transaction ${first.transaction}, was independently matched to its successful receipt, official Pons TokenLaunched event and canonical creation header; the ending anchor hash was rechecked. Remaining index rows are provider-indexed observations, not individually receipt-verified logs or trades. Index sums only rank candidate addresses; same-anchor balanceOf and totalSupply must independently verify holdings and supply. ${directNominations.length} direct-transfer nominations require separate receipt/header proof before becoming relationships. Pagination exhaustion does not establish complete trading, funding or sniper history.`}};
 }catch(error){input.signal?.throwIfAborted();if(error instanceof AlchemyIndexAccessDeniedError)return {...fail(`Configured Alchemy index access was denied during ${stage}; no further reads, retry or alternative route were used.`),accessDenied:true};if(error instanceof CandidateRpcRateLimitError){return {...fail(`Configured Alchemy index was rate limited during ${stage}; no retry or alternative route was used.`),rateLimited:true,rateLimit:{stage,...error.diagnostics}};}return fail(`Configured Alchemy token index or its creation proof was unavailable, malformed, conflicting, out of order or outside the bounded read budget after ${pages} page(s). No ledger/ranked candidates were accepted and no alternative route was used.`);}
}
