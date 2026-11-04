import {toFunctionSelector} from 'viem';
import {readFourMemeHistory,FOUR_MEME_MANAGER,FOUR_MEME_HISTORY_SOURCE} from './four-meme-history';
import type {CurveTimingProof} from './investigation-types';
import type {PersistentLaunchProofs} from './launch-proof-store';
export {FOUR_MEME_MANAGER} from './four-meme-history';
import {validateToken,type Report} from './analysis';
import type {PublicHistoryResult} from './public-history';
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const FOUR_MEME_HELPER='0xf251f83e40a78868fcfa3fa4599dad6494e46034';
export const isBscCustodyOnly=(report:Report)=>report.chain==='bsc'&&report.holders.length>0&&report.holders.every(h=>h.address.toLowerCase()===FOUR_MEME_MANAGER);
const DEAD='0x000000000000000000000000000000000000dead';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/,WORD=/^0x[0-9a-fA-F]{64}$/,HEX=/^0x[0-9a-fA-F]+$/;
const addr=(v:unknown)=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)?v.toLowerCase():null;
class RpcReadError extends Error {constructor(readonly kind:'transient'|'range'|'unavailable'){super(kind);}}
const word=(v:unknown)=>typeof v==='string'&&WORD.test(v)?BigInt(v):null;
export type BscHolderFallbackResult=PublicHistoryResult&{curveTiming?:CurveTimingProof;snapshot?:{block:number;blockHash:string;blockTimestamp:string;decimals:number;totalSupplyRaw:string;balances:{address:string;amountRaw:string}[]}};

/** Candidate discovery is bounded, never a holder census. Balances and supply
 * are independently read at one finalized block, then its hash is rechecked.
 * RPC semantics: ethereum.org/developers/docs/apis/json-rpc/.
 * Public endpoint: bsc.publicnode.com. No archive entitlement is assumed. */
export function createBscHolderFallback(deps:{rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number;requestTimeoutMs?:number;proofStore?:PersistentLaunchProofs}={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,url=deps.rpcUrl||'https://bsc-rpc.publicnode.com';
 return async(report:Report,options:{signal?:AbortSignal;history?:boolean;candidateAddresses?:string[]}={}):Promise<BscHolderFallbackResult>=>{
  const result:BscHolderFallbackResult={holders:[],holderCount:null,trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:true};
  if(report.chain!=='bsc'||validateToken('bsc',report.token))return result;
  const signal=AbortSignal.any([AbortSignal.timeout(deps.timeoutMs??10000),...(options.signal?[options.signal]:[])]);
  const source='BSC RPC finalized holder balances',token=report.token.toLowerCase();let id=0,requests=0,archiveAccessRequired=false;
  const batch=async(calls:{method:string;params:unknown[]}[])=>{
   if(!calls.length)return [];
   signal.throwIfAborted();if(++requests>28)throw Error('Request budget reached.');
   const payload=calls.map(call=>({jsonrpc:'2.0',id:++id,...call}));
   const requestSignal=calls.some(c=>c.method==='eth_getLogs')?AbortSignal.any([signal,AbortSignal.timeout(deps.requestTimeoutMs??2000)]):signal;
   const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload.length===1?payload[0]:payload),signal:requestSignal,cache:'no-store',redirect:'error'});
   if(!response.ok)throw new RpcReadError(response.status===429||response.status>=500?'transient':'unavailable');if(Number(response.headers.get('Content-Length'))>4000000){await response.body?.cancel();throw Error('Response bound exceeded.');}
   const text=await response.text();if(text.length>4000000)throw Error('Response bound exceeded.');const data=JSON.parse(text),rows=Array.isArray(data)?data:[data];
   // Classify access denial without retaining raw provider messages or URLs.
   // A denied historical receipt is unknown, never an absent transaction.
   if(rows.some((row:any)=>row?.error&&/archive.*(?:require|unauthor|forbidden|access denied)|personal token/i.test(String(row.error.message||''))))archiveAccessRequired=true;
   if(calls.length===1&&calls[0].method==='eth_getLogs'&&rows.length===1&&rows[0]?.error){const error=rows[0].error,message=String(error.message||'');throw new RpcReadError(/archive|personal token|unauthor|forbidden/i.test(message)?'unavailable':/rate|busy|timeout|temporary|capacity/i.test(message)?'transient':/range|too many|exceed/i.test(message)||error.code===-32005?'range':'unavailable');}
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
   const at=new Date(timestamp).toISOString(),anchor=head.number;
   const [supplyValue,decimalsValue]=await batch([{method:'eth_call',params:[{to:token,data:'0x18160ddd'},anchor]},{method:'eth_call',params:[{to:token,data:'0x313ce567'},anchor]}]);
   const supply=word(supplyValue),decimalRaw=word(decimalsValue);
   if(supply===null||supply<=0n||decimalRaw===null||decimalRaw>255n)throw Error('Token units unavailable.');
   const decimals=Number(decimalRaw),supplyNumber=Number(supply)/10**decimals;
   if(!Number.isFinite(supplyNumber)||supplyNumber<=0)throw Error('Token supply cannot be represented.');
   const candidates=new Set<string>(),candidateLogs:unknown[]=[];
   for(const candidate of [...(report.identities||[]).map(i=>i.address),report.market?.pairAddress,...report.holders.map(h=>h.address),...(options.candidateAddresses||[]).slice(0,100)]){const a=addr(candidate);if(a)candidates.add(a);}
   try{
    const first=Math.max(0,block-19999),queue:{lo:number;hi:number}[]=[],completed:{lo:number;hi:number;rows:any[]}[]=[],gaps:{lo:number;hi:number}[]=[];let cursor=0,reduced=false;
    for(let lo=first;lo<=block;lo+=5000)queue.push({lo,hi:Math.min(block,lo+4999)});
    await Promise.all(Array.from({length:Math.min(2,queue.length)},async()=>{
     for(;;){if(cursor>=queue.length)return;const index=cursor++,range=queue[index];let rows:unknown,error:unknown;
      for(let attempt=0;attempt<2;attempt++){
       try{rows=await rpc('eth_getLogs',[{address:token,topics:[TRANSFER],fromBlock:'0x'+range.lo.toString(16),toBlock:'0x'+range.hi.toString(16)}]);error=undefined;break;}
       catch(e){options.signal?.throwIfAborted();error=e;if(signal.aborted)break;const transient=e instanceof RpcReadError?e.kind==='transient':e instanceof Error&&['TimeoutError','TypeError'].includes(e.name);if(!transient||attempt===1)break;}
      }
      if(Array.isArray(rows)&&rows.length<=2000)completed.push({...range,rows});
      else if((error instanceof RpcReadError&&error.kind==='range'||Array.isArray(rows)&&rows.length>2000)&&range.lo<range.hi&&queue.length+2<=12&&!signal.aborted){const mid=Math.floor((range.lo+range.hi)/2);queue.push({lo:range.lo,hi:mid},{lo:mid+1,hi:range.hi});reduced=true;}
      else gaps.push(range);
     }
    }));
    if(reduced)result.reasons.push('The provider rejected a wider log request; candidate discovery uses reduced ranges with explicit gaps where any request failed.');
    if(gaps.length)result.reasons.push(`Recent Transfer logs were unavailable in ${gaps.length} bounded ranges (${gaps.map(g=>g.lo+'-'+g.hi).join(', ')}). Those ranges are unknown, not empty or complete; only successful ranges and known candidates are used.`);
    let rejected=0,accepted=0;
    for(const range of completed.sort((a,b)=>a.lo-b.lo))for(const log of range.rows){
     if(log?.removed!==false||addr(log.address)!==token||!Array.isArray(log.topics)||log.topics.length!==3||typeof log.topics[0]!=='string'||log.topics[0].toLowerCase()!==TRANSFER||!log.topics.slice(1).every((topic:unknown)=>typeof topic==='string'&&/^0x0{24}[0-9a-fA-F]{40}$/.test(topic))||!WORD.test(log.data)||!WORD.test(log.transactionHash)||!HEX.test(log.blockNumber)||BigInt(log.blockNumber)<BigInt(range.lo)||BigInt(log.blockNumber)>BigInt(range.hi)){rejected++;continue;}
     accepted++;candidateLogs.push(log);
     for(const topic of log.topics.slice(1)){const a=addr('0x'+topic.slice(-40));if(a)candidates.add(a);}
    }
    result.reasons.push(`Holder candidates came from ${accepted} valid Transfer log rows in successful ranges within blocks ${first}-${block}, plus reported identities and the market pair. ${rejected} invalid or removed rows were withheld. Earlier inactive holders and failed ranges can be absent.`);
   }catch{options.signal?.throwIfAborted();result.reasons.push('Recent Transfer logs were unavailable or exceeded the bounded response size. Only known identity, pair and existing holder candidates were checked.');}
   const selected=[...candidates].slice(0,100),balances:{address:string;amountRaw:string}[]=[];let failed=0,inconsistent=false;
   for(let start=0;start<selected.length;start+=25){
    try{
     const group=selected.slice(start,start+25),values=await batch(group.map(address=>({method:'eth_call',params:[{to:token,data:'0x70a08231'+address.slice(2).padStart(64,'0')},anchor]})));
     for(let index=0;index<group.length;index++){const amount=word(values[index]);if(amount===null){failed++;continue;}if(amount>supply){inconsistent=true;continue;}if(amount===0n)continue;balances.push({address:group[index],amountRaw:amount.toString()});}
    }catch{options.signal?.throwIfAborted();failed+=selected.length-start;break;}
   }
   if(inconsistent||balances.reduce((sum,b)=>sum+BigInt(b.amountRaw),0n)>supply)throw Error('Verified balances exceed total supply.');
   let verifiedCustody=false,launchTimeHint:number|undefined;
   if(balances.some(b=>b.address===FOUR_MEME_MANAGER)){
    // Published chain-specific deployment, then verify token membership and code at the same anchor.
    // https://github.com/four-meme-community/fourmeme-docs/blob/main/docs/trade-guide.md
    try{const [code,info]=await batch([{method:'eth_getCode',params:[FOUR_MEME_MANAGER,anchor]},{method:'eth_call',params:[{to:FOUR_MEME_HELPER,data:toFunctionSelector('getTokenInfo(address)')+token.slice(2).padStart(64,'0')},anchor]}]);
     if(typeof code==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(code)&&typeof info==='string'&&/^0x[0-9a-fA-F]{768}$/.test(info)){const fields=info.slice(2).match(/.{64}/g)!;verifiedCustody=BigInt('0x'+fields[0])===2n&&fields[1].toLowerCase()==='0'.repeat(24)+FOUR_MEME_MANAGER.slice(2)&&/^0{24}[0-9a-fA-F]{40}$/.test(fields[2])&&BigInt('0x'+fields[11])<=1n;const launch=Number(BigInt('0x'+fields[6]));if(verifiedCustody&&Number.isSafeInteger(launch)&&launch>0&&launch<=timestamp/1000)launchTimeHint=launch;}
    }catch{options.signal?.throwIfAborted();}
   }
   const checked=await rpc('eth_getBlockByNumber',[anchor,false]);
   if(checked?.hash?.toLowerCase()!==head.hash.toLowerCase()||checked?.number!==anchor)throw Error('Finalized anchor changed.');
   result.holders=balances.map(b=>({address:b.address,balance:Number(BigInt(b.amountRaw))/10**decimals,share:Number(BigInt(b.amountRaw))/Number(supply)*100})).sort((a,b)=>(b.share||0)-(a.share||0));
   result.totalSupply=supplyNumber;
   result.snapshot={block,blockHash:head.hash.toLowerCase(),blockTimestamp:at,decimals,totalSupplyRaw:supply.toString(),balances};
   if(verifiedCustody){const custodySource='BSC RPC Four.Meme custody verification';result.labels.push({address:FOUR_MEME_MANAGER,category:'pool',label:'Four.Meme shared launchpad custody - canonical TokenManager2; not an individual holder or V2 pair',source:custodySource,timestamp:at,timestampBasis:'provider-event'});result.sources.push({name:custodySource,status:'available',fetchedAt:new Date(now()).toISOString(),detail:`Published BSC TokenManager2 address plus Helper3.getTokenInfo token membership and nonempty manager code verified at finalized block ${block}. Protocol reference: https://github.com/four-meme-community/fourmeme-docs/blob/main/docs/trade-guide.md . Shared custody does not establish private ownership. Bonding-curve sell impact is not evaluated.`});}
   else if(balances.some(b=>b.address===FOUR_MEME_MANAGER))result.reasons.push('Known Four.Meme manager candidate could not be independently qualified for this token; infrastructure exclusion is withheld.');
   if(balances.some(b=>b.address===DEAD))result.labels.push({address:DEAD,category:'burn',label:'Known dead address',source:'Deterministic known dead-address label; positive balance verified by BSC RPC',timestamp:at,timestampBasis:'provider-event'});
   result.reasons.push(`${result.holders.length} positive balances verified from ${selected.length} candidates; ${failed} reads unavailable, ${Math.max(0,candidates.size-selected.length)} candidates outside the 100-address bound. This is a sampled finalized snapshot, not a complete holder count or historical launch reconstruction.`);
   result.sources.push({name:source,status:result.holders.length?'available':'unavailable',fetchedAt:new Date(now()).toISOString(),detail:`balanceOf, totalSupply and decimals verified at finalized block ${block} (${head.hash}); block time ${at}. ${result.reasons.join(' ')}`});
   if(verifiedCustody&&options.history!==false&&!signal.aborted){
    // A public launchpad market timestamp is another untrusted search hint, not
    // event evidence. Require the exact chain/token/pseudo-pair before using it.
    const market=report.market;
    if(!launchTimeHint&&market?.chainId==='bsc'&&market.dexId==='fourmeme'&&market.baseToken?.address.toLowerCase()===token&&market.pairAddress?.toLowerCase()===token+':4meme'&&typeof market.pairCreatedAt==='number'&&Number.isSafeInteger(market.pairCreatedAt)&&market.pairCreatedAt>0&&market.pairCreatedAt<=timestamp)launchTimeHint=Math.floor(market.pairCreatedAt/1000);
    let savedProof:CurveTimingProof|null=null;try{savedProof=deps.proofStore?.get('bsc',token)??null;}catch{}
    const history=await readFourMemeHistory({token,decimals,candidateLogs,savedProof,launchTimeHint,anchor:{number:block,hash:head.hash,timestamp:timestamp/1000},observedAt:new Date(now()).toISOString(),batch,signal:options.signal});
    if(archiveAccessRequired&&!history.proof)history.reasons.push('Historical receipt verification requires authorized archive access. Configure server-only BSC_RPC_URL with an endpoint authorized for historical receipts and logs. Current verified balances remain available; first-minute flags are withheld until the launch proof can be reverified.');
    try{if(history.savedProofInvalid)deps.proofStore?.delete('bsc',token);if(history.proof)deps.proofStore?.set(history.proof);}catch{}
    result.trades=history.trades;result.identities=history.identities;result.curveTiming=history.proof;result.reasons.push(...history.reasons);
    result.sources.push({name:FOUR_MEME_HISTORY_SOURCE,status:history.trades.length||history.identities.length?'available':'unavailable',fetchedAt:new Date(now()).toISOString(),detail:history.reasons.join(' ')});
    // Canonical receipts can reveal recipients missing from a failed candidate range.
    // Re-read only their addresses at the same finalized anchor; never import old balances.
    const seen=new Set(selected),extra=[...new Set([...history.trades.map(t=>t.wallet),...history.identities.map(i=>i.address)].map(addr).filter((a):a is string=>!!a&&!seen.has(a)))];
    const pending=extra.slice(0,Math.max(0,100-selected.length));
    if(extra.length>pending.length)result.reasons.push(`${extra.length-pending.length} canonical-history candidate addresses are outside the remaining 100-address balance bound.`);
    if(pending.length){
     try{
      const additions:{address:string;amountRaw:string}[]=[];let missing=0;
      for(let offset=0;offset<pending.length;offset+=25){const group=pending.slice(offset,offset+25),values=await batch(group.map(address=>({method:'eth_call',params:[{to:token,data:'0x70a08231'+address.slice(2).padStart(64,'0')},anchor]})));
       for(let i=0;i<group.length;i++){const amount=word(values[i]);if(amount===null){missing++;continue;}if(amount>supply)throw Error('Post-history supply inconsistency');if(amount>0n)additions.push({address:group[i],amountRaw:amount.toString()});}
      }
      if([...balances,...additions].reduce((sum,b)=>sum+BigInt(b.amountRaw),0n)>supply)throw Error('Post-history supply inconsistency');
      const final=await rpc('eth_getBlockByNumber',[anchor,false]);
      if(!final?.hash||!final?.number)throw Error('Post-history anchor unavailable');
      if(final.hash.toLowerCase()!==head.hash.toLowerCase()||final.number!==anchor){
       result.holders=[];delete result.snapshot;delete result.totalSupply;result.labels=[];
       for(const item of result.sources)if(item.name===source||item.name==='BSC RPC Four.Meme custody verification'){item.status='unavailable';item.detail='The finalized anchor changed during canonical-history candidate balance verification; current balances and infrastructure labels are withheld.';}
       result.reasons.push('Finalized anchor changed after history; holder snapshot withheld.');return result;
      }
      balances.push(...additions);selected.push(...pending);failed+=missing;
      result.holders=balances.map(b=>({address:b.address,balance:Number(BigInt(b.amountRaw))/10**decimals,share:Number(BigInt(b.amountRaw))/Number(supply)*100})).sort((a,b)=>(b.share||0)-(a.share||0));
      result.snapshot!.balances=balances;
      result.reasons.push(`${pending.length} additional canonical-history addresses checked at the original finalized block; ${additions.length} positive balances added, ${missing} reads unavailable. Zero balances remain absent.`);
     }catch{options.signal?.throwIfAborted();result.reasons.push(`Post-history balance verification for ${pending.length} additional canonical-history addresses was unavailable or exceeded its bounded request/time budget. These addresses remain unknown; the already verified snapshot retains its original block time.`);}
     const summary=result.reasons.findIndex(reason=>/^\d+ positive balances verified from /.test(reason));
     if(summary>=0)result.reasons[summary]=`${result.holders!.length} positive balances verified from ${selected.length} candidates; ${failed} reads unavailable, ${Math.max(0,candidates.size-selected.length)} candidates outside the 100-address bound. This is a sampled finalized snapshot, not a complete holder count or historical launch reconstruction.`;
     const holderSource=result.sources.find(item=>item.name===source)!;holderSource.detail=`balanceOf, totalSupply and decimals verified at finalized block ${block} (${head.hash}); block time ${at}. ${result.reasons.join(' ')}`;
    }

   }
  }catch{options.signal?.throwIfAborted();result.sources.push({name:source,status:'unavailable',detail:'Finalized RPC holder verification failed or timed out. No missing balance was replaced with zero.'});result.reasons.push('Independent BSC holder snapshot unavailable. No complete holder count is established.');}
  return result;
 };
}
