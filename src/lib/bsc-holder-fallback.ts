import {validateToken,type Report} from './analysis';
import type {PublicHistoryResult} from './public-history';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DEAD='0x000000000000000000000000000000000000dead';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/,WORD=/^0x[0-9a-fA-F]{64}$/,HEX=/^0x[0-9a-fA-F]+$/;
const addr=(v:unknown)=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)?v.toLowerCase():null;
const word=(v:unknown)=>typeof v==='string'&&WORD.test(v)?BigInt(v):null;
export type BscHolderFallbackResult=PublicHistoryResult&{snapshot?:{block:number;blockHash:string;blockTimestamp:string;decimals:number;totalSupplyRaw:string;balances:{address:string;amountRaw:string}[]}};

/** Candidate discovery is bounded, never a holder census. Balances and supply
 * are independently read at one finalized block, then its hash is rechecked.
 * RPC semantics: ethereum.org/developers/docs/apis/json-rpc/.
 * Public endpoint: bsc.publicnode.com. No archive entitlement is assumed. */
export function createBscHolderFallback(deps:{rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number}={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,url=deps.rpcUrl||'https://bsc-rpc.publicnode.com';
 return async(report:Report,options:{signal?:AbortSignal}={}):Promise<BscHolderFallbackResult>=>{
  const result:BscHolderFallbackResult={holders:[],holderCount:null,trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:true};
  if(report.chain!=='bsc'||validateToken('bsc',report.token))return result;
  const signal=AbortSignal.any([AbortSignal.timeout(deps.timeoutMs??10000),...(options.signal?[options.signal]:[])]);
  const source='BSC RPC finalized holder balances',token=report.token.toLowerCase();let id=0,requests=0;
  const batch=async(calls:{method:string;params:unknown[]}[])=>{
   signal.throwIfAborted();if(++requests>12)throw Error('Request budget reached.');
   const payload=calls.map(call=>({jsonrpc:'2.0',id:++id,...call}));
   const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.length===1?payload[0]:payload),signal,cache:'no-store',redirect:'error'});
   if(!response.ok)throw Error('RPC unavailable.');if(Number(response.headers.get('Content-Length'))>4000000){await response.body?.cancel();throw Error('Response bound exceeded.');}
   const text=await response.text();if(text.length>4000000)throw Error('Response bound exceeded.');const data=JSON.parse(text),rows=Array.isArray(data)?data:[data];
   return payload.map(request=>{const matches=rows.filter((r:any)=>r?.id===request.id);return matches.length===1&&!matches[0].error?matches[0].result:undefined;});
  };
  const rpc=async(method:string,params:unknown[]) => (await batch([{method,params}]))[0];
  try{
   const [chain,head]=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:['finalized',false]}]);
   if(chain!=='0x38'||!HEX.test(head?.number)||!WORD.test(head?.hash)||!HEX.test(head?.timestamp))throw Error('Invalid finalized chain anchor.');
   const block=Number(BigInt(head.number)),timestamp=Number(BigInt(head.timestamp))*1000;
   // Small clock skew is tolerated; a stale provider head is not a current
   // snapshot. These bounds are observation freshness, not chain finality.
   if(!Number.isSafeInteger(block)||!Number.isSafeInteger(timestamp)||timestamp<=0||timestamp>now()+120000||timestamp<now()-900000)throw Error('Finalized block timestamp is invalid, future or stale.');
   const at=new Date(timestamp).toISOString(),anchor=head.number,fromBlock='0x'+Math.max(0,block-19999).toString(16);
   const [supplyValue,decimalsValue]=await batch([{method:'eth_call',params:[{to:token,data:'0x18160ddd'},anchor]},{method:'eth_call',params:[{to:token,data:'0x313ce567'},anchor]}]);
   const supply=word(supplyValue),decimalRaw=word(decimalsValue);
   if(supply===null||supply<=0n||decimalRaw===null||decimalRaw>255n)throw Error('Token units unavailable.');
   const decimals=Number(decimalRaw),supplyNumber=Number(supply)/10**decimals;
   if(!Number.isFinite(supplyNumber)||supplyNumber<=0)throw Error('Token supply cannot be represented.');
   const candidates=new Set<string>();
   for(const candidate of [...(report.identities||[]).map(i=>i.address),report.market?.pairAddress,...report.holders.map(h=>h.address)]){const a=addr(candidate);if(a)candidates.add(a);}
   try{
    const logs=await rpc('eth_getLogs',[{address:token,topics:[TRANSFER],fromBlock,toBlock:anchor}]);
    if(!Array.isArray(logs)||logs.length>2000)throw Error('Log candidate window unavailable or exceeded.');
    let rejected=0;
    for(const log of logs){
     if(log?.removed!==false||addr(log.address)!==token||!Array.isArray(log.topics)||log.topics.length!==3||typeof log.topics[0]!=='string'||log.topics[0].toLowerCase()!==TRANSFER||!log.topics.slice(1).every((topic:unknown)=>typeof topic==='string'&&/^0x0{24}[0-9a-fA-F]{40}$/.test(topic))||!WORD.test(log.data)||!WORD.test(log.transactionHash)||!HEX.test(log.blockNumber)||BigInt(log.blockNumber)<BigInt(fromBlock)||BigInt(log.blockNumber)>BigInt(anchor)){rejected++;continue;}
     for(const topic of log.topics.slice(1)){if(typeof topic!=='string'||!/^0x0{24}[0-9a-fA-F]{40}$/.test(topic))continue;const a=addr('0x'+topic.slice(-40));if(a)candidates.add(a);}
    }
    result.reasons.push(`Holder candidates came from ${logs.length-rejected} valid Transfer log rows in blocks ${Number(BigInt(fromBlock))}-${block}, plus reported identities and the market pair. ${rejected} invalid or removed rows were withheld. Earlier inactive holders can be absent.`);
   }catch{options.signal?.throwIfAborted();result.reasons.push('Recent Transfer logs were unavailable or exceeded the bounded response size. Only known identity, pair and existing holder candidates were checked.');}
   const selected=[...candidates].slice(0,100),balances:{address:string;amountRaw:string}[]=[];let failed=0,inconsistent=false;
   for(let start=0;start<selected.length;start+=25){
    try{
     const group=selected.slice(start,start+25),values=await batch(group.map(address=>({method:'eth_call',params:[{to:token,data:'0x70a08231'+address.slice(2).padStart(64,'0')},anchor]})));
     for(let index=0;index<group.length;index++){const amount=word(values[index]);if(amount===null){failed++;continue;}if(amount>supply){inconsistent=true;continue;}if(amount===0n)continue;balances.push({address:group[index],amountRaw:amount.toString()});}
    }catch{options.signal?.throwIfAborted();failed+=selected.length-start;break;}
   }
   if(inconsistent||balances.reduce((sum,b)=>sum+BigInt(b.amountRaw),0n)>supply)throw Error('Verified balances exceed total supply.');
   const checked=await rpc('eth_getBlockByNumber',[anchor,false]);
   if(checked?.hash?.toLowerCase()!==head.hash.toLowerCase()||checked?.number!==anchor)throw Error('Finalized anchor changed.');
   result.holders=balances.map(b=>({address:b.address,balance:Number(BigInt(b.amountRaw))/10**decimals,share:Number(BigInt(b.amountRaw))/Number(supply)*100})).sort((a,b)=>(b.share||0)-(a.share||0));
   result.totalSupply=supplyNumber;
   result.snapshot={block,blockHash:head.hash.toLowerCase(),blockTimestamp:at,decimals,totalSupplyRaw:supply.toString(),balances};
   if(balances.some(b=>b.address===DEAD))result.labels.push({address:DEAD,category:'burn',label:'Known dead address',source:'Deterministic known dead-address label; positive balance verified by BSC RPC',timestamp:at,timestampBasis:'provider-event'});
   result.reasons.push(`${result.holders.length} positive balances verified from ${selected.length} candidates; ${failed} reads unavailable, ${Math.max(0,candidates.size-selected.length)} candidates outside the 100-address bound. This is a sampled finalized snapshot, not a complete holder count or historical launch reconstruction.`);
   result.sources.push({name:source,status:result.holders.length?'available':'unavailable',fetchedAt:new Date(now()).toISOString(),detail:`balanceOf, totalSupply and decimals verified at finalized block ${block} (${head.hash}); block time ${at}. ${result.reasons.join(' ')}`});
  }catch{options.signal?.throwIfAborted();result.sources.push({name:source,status:'unavailable',detail:'Finalized RPC holder verification failed or timed out. No missing balance was replaced with zero.'});result.reasons.push('Independent BSC holder snapshot unavailable. No complete holder count is established.');}
  return result;
 };
}
