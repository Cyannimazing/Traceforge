import {validateToken,type Report} from './analysis';
import type {PublicHistoryResult} from './public-history';

export const EVM_HOLDER_SOURCE='EVM RPC holder balances';
type Chain='ethereum'|'base'|'robinhood';
const networks={ethereum:{id:'0x1',name:'Ethereum',finality:'finalized'},base:{id:'0x2105',name:'Base',finality:'safe'},robinhood:{id:'0x1237',name:'Robinhood Chain',finality:'safe'}} as const;
// Published chain-specific deployment, independently code-checked below.
// https://developers.uniswap.org/docs/protocols/v4/deployments
const ROBINHOOD_POOL_MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
type Balance={address:string;status:'observed'|'unknown';amountRaw?:string};
export type EvmHolderResult=PublicHistoryResult&{snapshot?:{chain:Chain;finality:'safe'|'finalized';blockNumber:number;blockHash:string;blockTimestamp:string;observedAt:string;decimals:number;totalSupplyRaw:string;balances:Balance[];candidateCount:number}};
type Dependencies={rpcUrls?:Partial<Record<Chain,string>>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number};
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i,HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const address=(v:unknown)=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)?v.toLowerCase():null;
const word=(v:unknown)=>typeof v==='string'&&HASH.test(v)?BigInt(v):null;
const quantity=(v:unknown)=>typeof v==='string'&&HEX.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

/** Candidate verification, not holder enumeration. Standard ERC-20 balanceOf
 * reads are pinned to Base safe / Ethereum finalized state. Recent trade
 * senders merely nominate addresses; zero/failed reads never become holders. */
export function createEvmHolderFallback(deps:Dependencies={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now;
 return async(report:Report,options:{candidateAddresses?:string[];signal?:AbortSignal}={}):Promise<EvmHolderResult>=>{
  options.signal?.throwIfAborted();const result:EvmHolderResult={trades:[],transfers:[],identities:[],labels:[],sources:[],reasons:[],truncated:true,holderCount:null};
  if(!Object.hasOwn(networks,report.chain)||validateToken(report.chain,report.token))return result;
  const chain=report.chain as Chain,token=report.token.toLowerCase(),url=deps.rpcUrls?.[chain],finality=networks[chain].finality;
  const fail=(detail:string)=>{result.reasons.push(detail);result.sources.push({name:EVM_HOLDER_SOURCE,status:'unavailable',fetchedAt:new Date(now()).toISOString(),detail});return result;};
  if(!url)return fail('A configured chain RPC is required for candidate holder verification; balances remain unknown.');
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.max(50,Math.min(12000,deps.timeoutMs??6000)));let requestCount=0,id=0;
  const batch=async(calls:{method:string;params:unknown[]}[]):Promise<unknown[]>=>{
   if(!calls.length)return [];controller.signal.throwIfAborted();if(++requestCount>12)throw Error('RPC request budget exceeded.');
   const requests=calls.map(c=>({jsonrpc:'2.0',id:++id,...c}));let rejectAbort:(()=>void)|undefined;
   const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(Error('RPC deadline reached.'));controller.signal.addEventListener('abort',rejectAbort,{once:true});});
   try{return await Promise.race([cancelled,(async()=>{const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requests.length===1?requests[0]:requests),signal:controller.signal,cache:'no-store',redirect:'error'});if(!response.ok){await response.body?.cancel();throw Error(response.status===429?'RPC rate limit reached; no retry was made.':'RPC endpoint unavailable.');}if(Number(response.headers.get('content-length'))>1000000){await response.body?.cancel();throw Error('RPC response bound exceeded.');}const text=await response.text();if(text.length>1000000)throw Error('RPC response bound exceeded.');const body=JSON.parse(text),rows=Array.isArray(body)?body:[body];if(rows.some(r=>r?.error&&(r.error.code===429||/rate.?limit|throughput|compute units/i.test(String(r.error.message||'')))))throw Error('RPC rate limit reached; no retry was made.');return requests.map(q=>{const matches=rows.filter(r=>r?.id===q.id&&r.jsonrpc==='2.0');return matches.length===1&&!matches[0].error?matches[0].result:undefined;});})()]);}finally{if(rejectAbort)controller.signal.removeEventListener('abort',rejectAbort);}
  };
  try{
   const identity=(await batch([{method:'eth_chainId',params:[]}]))[0];if(identity!==networks[chain].id)return fail('Configured RPC chain identity did not match; holder balances withheld.');
   const [rawHead,rawAnchor]=await batch(['latest',finality].map(tag=>({method:'eth_getBlockByNumber',params:[tag,false]}))),head=object(rawHead),anchor=object(rawAnchor),headNumber=quantity(head.number),headTime=quantity(head.timestamp),blockNumber=quantity(anchor.number),blockTime=quantity(anchor.timestamp);
   if(headNumber===null||headTime===null||!HASH.test(head.hash)||blockNumber===null||blockTime===null||!HASH.test(anchor.hash)||blockNumber>headNumber||blockTime>headTime||headTime*1000>now()+120000||headTime*1000<now()-900000)return fail('Current RPC head or selected finality anchor is invalid, future or stale; balances remain unknown.');
   const [code,supplyValue,decimalValue,managerCode]=await batch([{method:'eth_getCode',params:[token,anchor.number]},...['0x18160ddd','0x313ce567'].map(data=>({method:'eth_call',params:[{to:token,data},anchor.number]})),...(chain==='robinhood'?[{method:'eth_getCode',params:[ROBINHOOD_POOL_MANAGER,anchor.number]}]:[])]);
   if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(code))return fail(`Token code is not available at the ${finality} anchor ${blockNumber} (${new Date(blockTime*1000).toISOString()}); the endpoint may lack historical state, or the anchor may precede deployment. No later state was substituted.${chain==='robinhood'?' Configure ROBINHOOD_RPC_URL with an authorized archive-capable endpoint to read safe historical state. The public RPC may expose safe headers without retaining their contract state.':''}`);
   const supply=word(supplyValue),rawDecimals=word(decimalValue);if(supply===null||supply<=0n||rawDecimals===null||rawDecimals>255n)return fail('Same-block token supply or decimals could not be verified; balances remain unknown.');
   const decimals=Number(rawDecimals),totalSupply=Number(supply)/10**decimals;if(!Number.isFinite(totalSupply)||totalSupply<=0)return fail('Token supply cannot be represented without losing its units.');
   const transferCandidates:string[]=[];let discovery='No transfer-recipient index is configured; candidates come from supplied snapshots, identities, pool and observed activity.';
   // Provider index rows nominate addresses only. The one-page query is capped
   // at this same anchor; neither index amounts nor contract labels are trusted.
   // https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers
   if(chain!=='robinhood'&&new URL(url).hostname.endsWith('.alchemy.com')){
    try{const page=object((await batch([{method:'alchemy_getAssetTransfers',params:[{fromBlock:'0x0',toBlock:anchor.number,contractAddresses:[token],category:['erc20'],order:'desc',withMetadata:false,excludeZeroValue:true,maxCount:'0x64'}]}]))[0]);
     if(!Array.isArray(page.transfers)||page.transfers.length>100)throw Error('Candidate index unavailable');let accepted=0,rejected=0;
     for(const raw of page.transfers){const row=object(raw),number=quantity(row.blockNum),contract=object(row.rawContract);if(row.category!=='erc20'||address(contract.address)!==token||number===null||number>blockNumber||!HASH.test(row.hash)){rejected++;continue;}const from=address(row.from),to=address(row.to);if(!from&&!to){rejected++;continue;}if(from)transferCandidates.push(from);if(to)transferCandidates.push(to);accepted++;}
     discovery=`One Alchemy token-transfer candidate page through ${finality} block ${blockNumber}: ${accepted} matching rows, ${rejected} rejected rows. ${page.pageKey?'More indexed rows remain unread;':page.transfers.length===100?'The 100-row bound was reached;':'The provider returned no further page cursor;'} full holder enumeration is not established. Index rows only nominate addresses; all balances below come from independent same-block contract reads.`;
    }catch(error){options.signal?.throwIfAborted();if(controller.signal.aborted||error instanceof Error&&error.message==='RPC rate limit reached; no retry was made.')throw error;discovery='The bounded token-transfer candidate page was unavailable; recipients outside supplied candidates remain unknown. No index amount was used as a balance.';}
   }
   if(chain==='robinhood'){
    const first=Math.max(0,blockNumber-19999),topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';let accepted=0,rejected=0,gaps=0,capped=0;
    for(let from=first;from<=blockNumber;from+=5000){const to=Math.min(blockNumber,from+4999);
     try{const rows=(await batch([{method:'eth_getLogs',params:[{address:token,topics:[topic],fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}]}]))[0];
      if(!Array.isArray(rows)||rows.length>2000){gaps++;continue;}if(rows.length===2000)capped++;
      for(const raw of rows){const row=object(raw),height=quantity(row.blockNumber);if(address(row.address)!==token||row.removed!==false||height===null||height<from||height>to||!HASH.test(row.transactionHash)||!HASH.test(row.blockHash)||quantity(row.logIndex)===null||!HASH.test(row.data)||!Array.isArray(row.topics)||row.topics.length!==3||row.topics[0]?.toLowerCase()!==topic||!row.topics.slice(1).every((v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v))){rejected++;continue;}accepted++;for(const t of row.topics.slice(1)){const a=address('0x'+t.slice(-40));if(a)transferCandidates.push(a);}}
     }catch(error){options.signal?.throwIfAborted();if(controller.signal.aborted||error instanceof Error&&error.message==='RPC rate limit reached; no retry was made.')throw error;gaps++;}
    }
    discovery=`Bounded ERC-20 Transfer candidate discovery at safe blocks ${first}-${blockNumber}: ${accepted} valid rows, ${rejected} rejected rows, ${gaps} unavailable ranges, ${capped} potentially capped ranges. At most four 5,000-block requests were made. Failed ranges and earlier inactive holders remain unknown; this is not a complete holder census or trade history. Log recipients only nominate addresses; balances are independently read below.`;
   }
   result.reasons.push(discovery);
   const candidates=[...new Set([report.market?.pairAddress,...(chain==='robinhood'?[ROBINHOOD_POOL_MANAGER]:[]),...report.holders.map(h=>h.address),...(report.identities||[]).map(i=>i.address),...(options.candidateAddresses||[]),...transferCandidates].map(address).filter((a):a is string=>!!a))],selected=candidates.slice(0,100),balances:Balance[]=[];
   for(let start=0;start<selected.length;start+=25){const group=selected.slice(start,start+25),values=await batch(group.map(a=>({method:'eth_call',params:[{to:token,data:'0x70a08231'+a.slice(2).padStart(64,'0')},anchor.number]})));for(let i=0;i<group.length;i++){const value=word(values[i]);if(value!==null&&value>supply)throw Error('Distinct candidate balances exceed supply.');balances.push(value===null?{address:group[i],status:'unknown'}:{address:group[i],status:'observed',amountRaw:value.toString()});}}
   const observed=balances.filter(b=>b.status==='observed');if(!observed.length)return fail('No candidate balances could be verified; missing values remain unknown, not zero.');
   if(observed.reduce((sum,b)=>sum+BigInt(b.amountRaw!),0n)>supply)throw Error('Distinct candidate balances exceed supply.');
   const checked=object((await batch([{method:'eth_getBlockByNumber',params:[anchor.number,false]}]))[0]);if(checked.number!==anchor.number||checked.hash?.toLowerCase()!==anchor.hash.toLowerCase()||checked.timestamp!==anchor.timestamp)return fail('Pinned holder block changed or could not be rechecked; all candidate balances withheld.');
   const observedAt=new Date(now()).toISOString(),blockTimestamp=new Date(blockTime*1000).toISOString();
   result.holders=observed.filter(b=>BigInt(b.amountRaw!)>0n).map(b=>({address:b.address,balance:Number(BigInt(b.amountRaw!))/10**decimals,share:Number(BigInt(b.amountRaw!))/Number(supply)*100})).sort((a,b)=>b.share-a.share);
   if(chain==='robinhood'&&typeof managerCode==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(managerCode)&&result.holders.some(h=>h.address===ROBINHOOD_POOL_MANAGER)){
    const source='Uniswap V4 deployment registry + RPC code';
    result.labels.push({address:ROBINHOOD_POOL_MANAGER,category:'pool',label:'Uniswap V4 shared PoolManager custody (aggregate across pools)',source,timestamp:observedAt,timestampBasis:'local-observation'});
    result.sources.push({name:source,status:'available',fetchedAt:observedAt,detail:`Robinhood chain 4663 published PoolManager ${ROBINHOOD_POOL_MANAGER}, with nonempty code and positive token balance checked at safe block ${blockNumber}. https://developers.uniswap.org/docs/protocols/v4/deployments . This is aggregate shared custody, not selected pool reserves or an impact estimate.`});
   }
   result.totalSupply=totalSupply;result.snapshot={chain,finality,blockNumber,blockHash:anchor.hash.toLowerCase(),blockTimestamp,observedAt,decimals,totalSupplyRaw:supply.toString(),balances,candidateCount:selected.length};
   const detail=`${result.holders.length} positive balances from ${selected.length} candidates at ${networks[chain].name} ${finality} block ${blockNumber} (${anchor.hash}); block time ${blockTimestamp}, retrieved ${observedAt}. Same-block balanceOf, totalSupply and decimals, followed by block-hash revalidation. ${balances.length-observed.length} reads unavailable; ${observed.filter(b=>b.amountRaw==='0').length} verified zero balances excluded; ${Math.max(0,candidates.length-selected.length)} candidates outside the 100-address bound. This sampled snapshot is not a complete holder census; full holder count is unknown.${finality==='safe'?' Safe means posted L1 data, not finalized L1 data; a reorganization can still change this snapshot.':''}`;
   result.reasons.push(detail);result.sources.push({name:EVM_HOLDER_SOURCE,status:'available',fetchedAt:observedAt,detail});return result;
  }catch(error){options.signal?.throwIfAborted();return fail(controller.signal.aborted?'Candidate holder verification reached its bounded deadline; no unverified balances were returned.':error instanceof Error&&['RPC rate limit reached; no retry was made.','Distinct candidate balances exceed supply.'].includes(error.message)?error.message:'Candidate holder RPC verification was unavailable; missing values remain unknown.');}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 };
}
