import {validateToken,type Chain} from './analysis';
import type {TransferRecord} from './investigation';
import type {PublicHistoryOptions,PublicHistoryResult} from './public-history';

type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const address=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-fA-F]{40}$/.test(value)?value.toLowerCase():'';
const transaction=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value)?value.toLowerCase():'';
const hex=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-fA-F]+$/.test(value)?BigInt(value):null;
type Candidate=TransferRecord&{amountRaw:string;decimals:number;blockNumber:bigint;category:string};
type ParseOptions={token:string;native:boolean;receiver?:string;toBlock:bigint};

/** Raw units are authoritative; formatted `value` may be rounded or absent. */
export function parseAlchemyTransfers(payload:unknown,options:ParseOptions):{records:Candidate[];pageKey:string|null;rejected:number}{
 const value=object(payload);if(!Array.isArray(value.transfers))throw Error('Missing transfer dataset.');
 let rejected=0;const records:Candidate[]=[],seen=new Set<string>();
 for(const item of value.transfers.slice(0,100)){
  const row=object(item),raw=object(row.rawContract),metadata=object(row.metadata);
  const from=address(row.from),to=address(row.to),hash=transaction(row.hash),block=hex(row.blockNum),amountRaw=hex(raw.value),decimalRaw=hex(raw.decimal);
  const native=row.category==='external'||row.category==='internal',kindValid=options.native?native:row.category==='erc20';
  const timestamp=typeof metadata.blockTimestamp==='string'?metadata.blockTimestamp:'';
  const id=typeof row.uniqueId==='string'&&row.uniqueId.length<=256?row.uniqueId:'';
  const failed=row.status==='failed'||row.status==='error'||row.status==='0x0'||row.isError===true||row.success===false;
  const decimals=native?18:decimalRaw===null?NaN:Number(decimalRaw);
  if(!kindValid||!from||!to||!hash||!id||failed||block===null||block>options.toBlock||amountRaw===null||amountRaw<=0n||!Number.isInteger(decimals)||decimals<0||decimals>255||!Number.isFinite(Date.parse(timestamp))||(options.receiver&&to!==options.receiver.toLowerCase())||(!native&&address(raw.address)!==options.token.toLowerCase())||(native&&raw.address!=null)){
   rejected++;continue;
  }
  const amount=Number(amountRaw)/10**decimals;if(!Number.isFinite(amount)||amount<=0){rejected++;continue;}
  const key=`${hash}:${id}`;if(seen.has(key))continue;seen.add(key);
  records.push({id:`alchemy:${key}`,from,to,timestamp:new Date(timestamp).toISOString(),amount,amountRaw:amountRaw.toString(),decimals,token:native?'native':options.token.toLowerCase(),native,transaction:hash,blockNumber:block,category:String(row.category),
   source:`Alchemy ${native?'native funding':'ERC-20 transfer'} history; successful receipt verified; bounded sample${native?'':'; transfer is not a trade'}`});
 }
 if(value.transfers.length>100)rejected+=value.transfers.length-100;
 const page=value.pageKey;
 if(page!=null&&page!==''&&(typeof page!=='string'||page.length>2048))throw Error('Invalid pagination cursor.');
 return {records,pageKey:typeof page==='string'&&page?page:null,rejected};
}

type Dependencies={rpcUrls:Partial<Record<'ethereum'|'base'|'robinhood',string>>;fetcher?:typeof fetch;now?:()=>number;maxRequests?:number;deadlineMs?:number;fundingWalletLimit?:number;pagesPerQuery?:number;fundingTransfersPerWallet?:number};
/** Independent transaction evidence, not a provider verdict or full-launch attestation.
 * API schema: https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers
 */
export function createAlchemyEvmHistory(deps:Dependencies){
 const now=deps.now||Date.now,fetcher=deps.fetcher||fetch;
 let cooldownUntil=0;
 const pageLimit=Math.max(1,Math.min(3,deps.pagesPerQuery??2)),perWallet=Math.max(1,Math.min(5,deps.fundingTransfersPerWallet??1));
 return async(chain:Chain,token:string,options:PublicHistoryOptions):Promise<PublicHistoryResult>=>{
  options.signal?.throwIfAborted();
  const result:PublicHistoryResult={trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false};
  if(options.mode==='holders')return result;
  const robinhood=chain==='robinhood',finality=robinhood?'safe':'finalized';
  const requestLimit=Math.max(2,Math.min(robinhood?80:40,deps.maxRequests??(robinhood?72:20))),walletLimit=Math.max(1,Math.min(robinhood?15:10,deps.fundingWalletLimit??(robinhood?15:6)));
  const endpoint=chain==='ethereum'||chain==='base'||robinhood?deps.rpcUrls[chain]:undefined;
  const sourceName='Alchemy EVM historical transfers';
  if(!endpoint||validateToken(chain,token)){
   result.sources.push({name:sourceName,status:chain==='ethereum'||chain==='base'||robinhood?'unavailable':'unsupported',detail:'A configured Ethereum, Base or Robinhood endpoint is required for this adapter.'});
   return result;
  }
  if(now()<cooldownUntil){result.truncated=true;result.reasons.push('Alchemy rate limit cooldown is active; no provider requests were made.');result.sources.push({name:sourceName,status:'unavailable',detail:'Waiting for the provider Retry-After cooldown.'});return result;}
  const signal=AbortSignal.any([AbortSignal.timeout(Math.max(1000,Math.min(30000,deps.deadlineMs??15000))),...(options.signal?[options.signal]:[])]);
  let requests=0,limited=false,failed=false,rejected=0,unavailable=false;
  const receipts=new Map<string,Row|null>(),seen=new Set<string>(),proofReads=new Map<string,Promise<Row>>();
  const rpc=async(method:string,params:unknown[])=>{
   options.signal?.throwIfAborted();signal.throwIfAborted();
   if(limited||unavailable||requests>=requestLimit)throw Error('budget');
   const requestId=++requests;
   const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal,redirect:'error',cache:'no-store'});
   if(response.status===429){
    limited=true;const retry=response.headers.get('retry-after'),seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Number(retry):NaN;
    const until=retry?Date.parse(retry):NaN,providerNow=Date.parse(response.headers.get('date')||'');
    const duration=Number.isFinite(seconds)?seconds*1000:Number.isFinite(until)?Math.max(0,until-(Number.isFinite(providerNow)?providerNow:now())):60000;
    cooldownUntil=now()+Math.max(1000,Number.isFinite(duration)?duration:60000);
    await response.body?.cancel();throw Error('rate-limit');
   }
   if(!response.ok){if(response.status===401||response.status===403)unavailable=true;await response.body?.cancel();throw Error('rpc');}
   const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>1_000_000){await response.body?.cancel();throw Error('oversized');}
   const text=await response.text();if(text.length>1_000_000)throw Error('oversized');
   const body=object(JSON.parse(text));if(body.error){const code=Number(object(body.error).code);if(code===429){limited=true;cooldownUntil=now()+60000;}if(code===-32601||code===401||code===403)unavailable=true;throw Error('rpc');}if(body.id!==requestId||!Object.hasOwn(body,'result'))throw Error('rpc');return body.result;
  };
  let anchor:bigint;
  try{
   if(await rpc('eth_chainId',[])!==(chain==='ethereum'?'0x1':robinhood?'0x1237':'0x2105'))throw Error('network');
   const block=object(await rpc('eth_getBlockByNumber',[finality,false]));const number=hex(block.number);
   if(number===null||!transaction(block.hash))throw Error('anchor');anchor=number;
  }catch{
   options.signal?.throwIfAborted();result.truncated=true;result.reasons.push(`Alchemy network or ${finality} block verification failed; historical transfer evidence was withheld.`);
   result.sources.push({name:sourceName,status:'unavailable',detail:`Unable to verify the configured network and ${finality} history anchor.`});return result;
  }
  const proofRead=(method:string,params:unknown[])=>{const key=method+JSON.stringify(params);let pending=proofReads.get(key);if(!pending){pending=rpc(method,params).then(object);proofReads.set(key,pending);}return pending;};
  const verify=async(candidate:Candidate)=>{
   // One external native-value transfer exists per transaction, regardless of
   // how many index row identifiers a provider returns for it.
   const evidenceKey=robinhood?candidate.transaction:candidate.id;
   if(seen.has(evidenceKey))return false;
   if(robinhood){
    if(!candidate.native||candidate.category!=='external'){rejected++;return false;}
    try{
     const [receipt,tx,block]=await Promise.all([proofRead('eth_getTransactionReceipt',[candidate.transaction]),proofRead('eth_getTransactionByHash',[candidate.transaction]),proofRead('eth_getBlockByNumber',['0x'+candidate.blockNumber.toString(16),false])]);
     const timestamp=hex(block.timestamp),at=timestamp===null?NaN:Number(timestamp)*1000,canonical=transaction(block.hash);
     if(receipt.status!=='0x1'||transaction(receipt.transactionHash)!==candidate.transaction||hex(receipt.blockNumber)!==candidate.blockNumber||!canonical||transaction(receipt.blockHash)!==canonical||transaction(tx.hash)!==candidate.transaction||hex(tx.blockNumber)!==candidate.blockNumber||transaction(tx.blockHash)!==canonical||hex(block.number)!==candidate.blockNumber||address(tx.from)!==candidate.from||address(tx.to)!==candidate.to||hex(tx.value)!==BigInt(candidate.amountRaw)||!Number.isSafeInteger(at)||at!==Date.parse(candidate.timestamp)){rejected++;return false;}
     seen.add(evidenceKey);const {blockNumber,category,...record}=candidate;void blockNumber;void category;
     result.transfers.push({...record,source:'Alchemy Robinhood external native transfer; transaction value, successful receipt and canonical block header verified; bounded earliest indexed sample, not first-ever funding'});return true;
    }catch{options.signal?.throwIfAborted();failed=true;return false;}
   }
   let receipt=receipts.get(candidate.transaction);
   if(receipt===undefined){try{receipt=object(await rpc('eth_getTransactionReceipt',[candidate.transaction]));receipts.set(candidate.transaction,receipt);}catch{options.signal?.throwIfAborted();failed=true;return false;}}
   if(!receipt||receipt.status!=='0x1'||transaction(receipt.transactionHash)!==candidate.transaction||hex(receipt.blockNumber)!==candidate.blockNumber||!transaction(receipt.blockHash)){rejected++;return false;}
   seen.add(candidate.id);const {blockNumber,category,...record}=candidate;void blockNumber;void category;result.transfers.push(record);return true;
  };
  const query=async(params:Row,native:boolean,receiver:string|undefined,maxRecords:number)=>{
   let pageKey:string|null=null,count=0,pages=0;const cursors=new Set<string>();
   do{
    if(signal.aborted||limited||unavailable||requests>=requestLimit){failed=true;break;}
    let parsed:ReturnType<typeof parseAlchemyTransfers>;
    try{const payload=await rpc('alchemy_getAssetTransfers',[{fromBlock:'0x0',toBlock:`0x${anchor.toString(16)}`,order:'asc',withMetadata:true,excludeZeroValue:true,maxCount:'0xc',...params,...(pageKey?{pageKey}:{})}]);parsed=parseAlchemyTransfers(payload,{token,native,receiver,toBlock:anchor});}
    catch{options.signal?.throwIfAborted();failed=true;break;}
    pages++;rejected+=parsed.rejected;
    for(const candidate of parsed.records){
     if(count>=maxRecords){result.truncated=true;break;}
     if(await verify(candidate))count++;
     if(signal.aborted||limited||unavailable||requests>=requestLimit){failed=true;break;}
    }
    pageKey=parsed.pageKey;
    if(pageKey&&(count>=maxRecords||pages>=pageLimit||cursors.has(pageKey))){result.truncated=true;break;}
    if(pageKey)cursors.add(pageKey);
   }while(pageKey);
  };
  const excluded=new Set(options.report.holders.filter(h=>['pool','exchange','bridge','burn'].includes(h.tag.toLowerCase())).map(h=>h.address.toLowerCase()));
  const ranked=options.report.holders.filter(h=>h.contract!==true||robinhood).slice().sort((a,b)=>(b.share??0)-(a.share??0)).map(h=>h.address);
  const allWallets=[...new Set((options.walletAddresses?.length?options.walletAddresses:ranked).map(address).filter(a=>a&&a!==token.toLowerCase()&&!excluded.has(a)&&a!==address(options.report.market?.pairAddress)&&!/^0x0{40}$/.test(a)&&a!=='0x000000000000000000000000000000000000dead'))];
  const wallets=allWallets.slice(0,walletLimit);if(allWallets.length>wallets.length)result.truncated=true;
  let queriedWallets=0;
  // Native funding first reserves useful one-hop evidence before token-wide volume.
  for(const wallet of wallets){if(limited||unavailable||signal.aborted||requests>=requestLimit){failed=true;break;}queriedWallets++;await query({toAddress:wallet,category:chain==='ethereum'?['external','internal']:['external']},true,wallet,perWallet);}
  if(!robinhood){if(!limited&&!unavailable&&!signal.aborted&&requests<requestLimit)await query({contractAddresses:[token.toLowerCase()],category:['erc20']},false,undefined,Math.min(24,Math.max(1,options.limit)));else failed=true;}
  options.signal?.throwIfAborted();
  result.truncated||=failed||rejected>0;
  const captured=new Date(now()).toISOString();
  result.reasons.push(`Alchemy queried ${queriedWallets} of ${wallets.length} selected wallets from ${allWallets.length} eligible supplied wallets (cap ${walletLimit}); up to ${perWallet} verified incoming native transfer(s) per selected wallet${robinhood?'':', plus a bounded earliest token-transfer sample'}. This is one-hop funding evidence, not a complete funding census, first-ever origin or verified launch history.`);
  result.reasons.push('ERC-20 transfers do not establish buys, sells, first-minute snipers, or beneficial ownership. Alchemy returns transaction records; TraceForge computes findings from their stated scope.');
  if(chain==='base'||robinhood)result.reasons.push(`This ${robinhood?'Robinhood':'Base'} funding pass includes external native transfers only; internal native-value calls are not covered by this Transfers API query. Shared transfers do not prove common ownership; an unlabeled exchange, bridge or service can explain them.`);
  if(limited)result.reasons.push('Alchemy rate limit reached. No retry was made in this scan; previously verified records were preserved.');
  if(unavailable)result.reasons.push('The configured RPC denied access or does not support the requested method. Further funding queries were stopped; no alternate credential destination was used.');
  if(failed||signal.aborted)result.reasons.push('Alchemy historical retrieval is incomplete because a page, receipt, deadline or request budget could not be completed. Previously verified records were preserved.');
  if(rejected)result.reasons.push(`${rejected} transfer record(s) were withheld for missing or conflicting units, timestamps, identity, block or receipt evidence.`);
  result.sources.push({name:sourceName,status:result.transfers.length||!failed?'available':'unavailable',fetchedAt:captured,detail:`${result.transfers.length} receipt-verified transfers; ${finality} anchor ${anchor}; ${requests}/${requestLimit} RPC requests. ${queriedWallets}/${wallets.length} selected wallets queried; ${allWallets.length} eligible supplied wallets. Native and token transfers are observations, not provider risk ratings. The token-wide launch and all funders remain outside this bounded result.`});
  return result;
 };
}
