import {validateToken,type Report} from './analysis';
import type {PublicHistoryResult} from './public-history';
import {PONS_FACTORY,PONS_DEPLOYER,type PonsLaunchSnapshot} from './pons-launch-record';
import {readRobinhoodPonsCandidates,CandidateRpcRateLimitError,CandidateRpcLogLimitError,type PonsCandidateResult} from './robinhood-pons-candidates';
import {verifyDirectTransferCandidates,verifyIndexedTransferCandidates,DIRECT_TRANSFER_SOURCE} from './evm-direct-transfer-proof';
import {readAlchemyPonsCandidates,AlchemyIndexAccessDeniedError,type AlchemyPonsCandidateResult} from './alchemy-pons-candidates';

export const EVM_HOLDER_SOURCE='EVM RPC holder balances';
type Chain='ethereum'|'base'|'robinhood'|'bsc';
const networks={ethereum:{id:'0x1',name:'Ethereum',finality:'finalized'},base:{id:'0x2105',name:'Base',finality:'safe'},robinhood:{id:'0x1237',name:'Robinhood Chain',finality:'safe'},bsc:{id:'0x38',name:'BNB Chain',finality:'finalized'}} as const;
/** Raw balance ranks considered when selecting real holders (EVM). */
export const REAL_HOLDER_RAW_LIMIT=50;
/** Candidate balances read per scan outside a full creation ledger. */
export const REAL_HOLDER_CANDIDATE_LIMIT=400;
// Published chain-specific deployment, independently code-checked below.
// https://developers.uniswap.org/docs/protocols/v4/deployments
const ROBINHOOD_POOL_MANAGER='0x8366a39cc670b4001a1121b8f6a443a643e40951';
const DEAD='0x000000000000000000000000000000000000dead';
const ROBINHOOD_LOG_RPC='https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_PONS_LOCKER='0x267444d099b10fb5ed7c3cc7b7c767adca574952'; // https://docs.ponsfamily.com/v2#contracts
type Balance={address:string;status:'observed'|'unknown';amountRaw?:string};
export type HolderEnumeration={kind:'pons-creation-ledger';recordedAccounts:number;verifiedAccounts:number;complete:boolean;indexProvenance?:AlchemyPonsCandidateResult['indexProvenance'];ranked?:{rawLimit:50;addresses:string[];verified:true}}
 /** Largest independently verified balances among the nominated candidates
  * (provider holder list, transfer-window recipients, identities, activity).
  * Holders outside the candidate set are unknown, not zero. */
 |{kind:'real-holder-prefix';recordedAccounts:number;verifiedAccounts:number;complete:false;candidates:number;windowCandidates:number;indexProvenance?:never;ranked:{rawLimit:50;addresses:string[];verified:true}};
export type EvmHolderResult=PublicHistoryResult&{snapshot?:{chain:Chain;finality:'safe'|'finalized';blockNumber:number;blockHash:string;blockTimestamp:string;observedAt:string;decimals:number;totalSupplyRaw:string;balances:Balance[];candidateCount:number;holderEnumeration?:HolderEnumeration}};
type Dependencies={rpcUrls?:Partial<Record<Chain,string>>;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number;monotonic?:()=>number;wait?:(milliseconds:number,signal:AbortSignal)=>Promise<void>};
export type EvmHolderOptions={candidateAddresses?:string[];priorityCandidateAddresses?:string[];windowCandidates?:string[];ponsSnapshot?:PonsLaunchSnapshot;signal?:AbortSignal};
const HASH=/^0x[0-9a-f]{64}$/i,ADDRESS=/^0x[0-9a-f]{40}$/i,HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const address=(v:unknown)=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)?v.toLowerCase():null;
const word=(v:unknown)=>typeof v==='string'&&HASH.test(v)?BigInt(v):null;
const quantity=(v:unknown)=>typeof v==='string'&&HEX.test(v)&&BigInt(v)<=BigInt(Number.MAX_SAFE_INTEGER)?Number(BigInt(v)):null;
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

/** Candidate verification, not holder enumeration. Standard ERC-20 balanceOf
 * reads are pinned to Base safe / Ethereum finalized state. Recent trade
 * senders merely nominate addresses; zero/failed reads never become holders. */
export function createEvmHolderFallback(deps:Dependencies={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,monotonic=deps.monotonic||(()=>performance.now());
 const wait=deps.wait||((milliseconds:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,milliseconds));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();}));
 const lanes=new Map<string,{tail:Promise<unknown>;lastStart:number}>();
 const paceBalance=async<T>(endpoint:string,signal:AbortSignal,execute:()=>Promise<T>):Promise<T>=>{
  let lane=lanes.get(endpoint);if(!lane){lane={tail:Promise.resolve(),lastStart:-Infinity};lanes.set(endpoint,lane);}const selectedLane=lane;
  const queued=selectedLane.tail.then(async()=>{signal.throwIfAborted();const delay=Math.max(0,600-(monotonic()-selectedLane.lastStart));if(delay)await wait(delay,signal);signal.throwIfAborted();selectedLane.lastStart=monotonic();return execute();});selectedLane.tail=queued.then(()=>undefined,()=>undefined);
  return new Promise<T>((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});queued.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted)abort();});
 };
 // The shared public candidate route is separate from the configured state
 // provider. Pace each JSON-RPC method, including batched header checks, so
 // pagination and concurrent scans cannot burst through its public allowance.
 const publicLane={tail:Promise.resolve() as Promise<unknown>,nextStart:-Infinity};let publicCooldownUntil=0;
 const pacePublic=async<T>(methods:number,signal:AbortSignal,execute:()=>Promise<T>):Promise<T>=>{
  const check=()=>{signal.throwIfAborted();if(monotonic()<publicCooldownUntil)throw new CandidateRpcRateLimitError({retryAfterSeconds:(publicCooldownUntil-monotonic())/1000});};
  const queued=publicLane.tail.then(async()=>{check();const delay=Math.max(0,publicLane.nextStart-monotonic());if(delay)await wait(delay,signal);check();publicLane.nextStart=monotonic()+Math.max(1,methods)*750;return execute();});publicLane.tail=queued.then(()=>undefined,()=>undefined);
  return new Promise<T>((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});queued.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));if(signal.aborted)abort();});
 };
 return async(report:Report,options:EvmHolderOptions={}):Promise<EvmHolderResult>=>{
  options.signal?.throwIfAborted();const result:EvmHolderResult={trades:[],transfers:[],identities:[],labels:[],sources:[],reasons:[],truncated:true,holderCount:null};
  if(!Object.hasOwn(networks,report.chain)||validateToken(report.chain,report.token))return result;
  const chain=report.chain as Chain,token=report.token.toLowerCase(),url=deps.rpcUrls?.[chain],finality=networks[chain].finality;
  const fail=(detail:string)=>{result.reasons.push(detail);result.sources.push({name:EVM_HOLDER_SOURCE,status:'unavailable',fetchedAt:new Date(now()).toISOString(),detail});return result;};
  if(!url)return fail('A configured chain RPC is required for candidate holder verification; balances remain unknown.');
  const indexedPrimary=chain==='robinhood'&&new URL(url).protocol==='https:'&&new URL(url).hostname==='robinhood-mainnet.g.alchemy.com';
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const discoveryBudget=chain==='robinhood'?(indexedPrimary?35000:20000):20000;
  const started=monotonic();let budgetMs=Math.max(50,Math.min(discoveryBudget,deps.timeoutMs??(chain==='robinhood'?discoveryBudget:15000))),deadline=started+budgetMs;
  let timer=setTimeout(abort,budgetMs);let requestCount=0,id=0,maxRequests=chain==='robinhood'?72:30;
  const rateError=(response:Response,rpcCode?:unknown,publicRoute=false)=>{const retry=response.headers.get('retry-after'),seconds=retry===null?undefined:/^\d+(?:\.\d+)?$/.test(retry)?Number(retry):Number.isFinite(Date.parse(retry))?Math.max(0,(Date.parse(retry)-now())/1000):undefined;if(publicRoute)publicCooldownUntil=monotonic()+(typeof seconds==='number'&&Number.isFinite(seconds)?Math.max(1000,seconds*1000):60000);return new CandidateRpcRateLimitError({httpStatus:response.status,rpcCode:typeof rpcCode==='number'?rpcCode:undefined,retryAfterSeconds:seconds});};
  const batch=async(calls:{method:string;params:unknown[]}[],endpoint=url,maxBytes=1000000,timeoutMs?:number):Promise<unknown[]>=>{
   const signal=timeoutMs===undefined?controller.signal:AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,Math.floor(timeoutMs)))]);
   if(!calls.length)return [];signal.throwIfAborted();if(++requestCount>maxRequests)throw Error('RPC request budget exceeded.');
   const requests=calls.map(c=>({jsonrpc:'2.0',id:++id,...c}));let rejectAbort:(()=>void)|undefined;
   const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(Error('RPC deadline reached.'));signal.addEventListener('abort',rejectAbort,{once:true});});
   try{return await Promise.race([cancelled,(async()=>{
    const execute=()=>fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requests.length===1?requests[0]:requests),signal,cache:'no-store',redirect:'error'});
    const response=endpoint===ROBINHOOD_LOG_RPC?await pacePublic(requests.length,signal,execute):await execute();
    if(!response.ok){await response.body?.cancel();if(response.status===429)throw rateError(response,undefined,endpoint===ROBINHOOD_LOG_RPC);if(response.status===401||response.status===403)throw new AlchemyIndexAccessDeniedError();throw Error('RPC endpoint unavailable.');}
    if(Number(response.headers.get('content-length'))>maxBytes){await response.body?.cancel();throw Error('RPC response bound exceeded.');}
    if(!response.body)throw Error('RPC response unavailable.');const reader=response.body.getReader(),decoder=new TextDecoder();let text='',bytes=0;
    while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>maxBytes){await reader.cancel();throw Error('RPC response bound exceeded.');}text+=decoder.decode(chunk.value,{stream:true});}
    text+=decoder.decode();const body=JSON.parse(text),rows=Array.isArray(body)?body:[body];
    const denied=rows.find(r=>r?.error&&(r.error.code===429||/rate.?limit|throughput|compute units/i.test(String(r.error.message||''))));
    if(denied)throw rateError(response,denied.error.code,endpoint===ROBINHOOD_LOG_RPC);
    if(rows.some(r=>r?.error&&([401,403].includes(r.error.code)||/unauthorized|forbidden|access denied/i.test(String(r.error.message||'')))))throw new AlchemyIndexAccessDeniedError();
    const oversized=rows.some(r=>r?.error&&requests.some(q=>q.id===r.id&&q.method==='eth_getLogs')&&/logs?.*(?:exceeds?|exceeded|limit).*(?:10000|10,000)|query returned more than.*(?:10000|10,000)|too many (?:results|logs)/i.test(String(r.error.message||'')));
    if(oversized)throw new CandidateRpcLogLimitError();
    return requests.map(q=>{const matches=rows.filter(r=>r?.id===q.id&&r.jsonrpc==='2.0');return matches.length===1&&!matches[0].error?matches[0].result:undefined;});
   })()]);}finally{if(rejectAbort)signal.removeEventListener('abort',rejectAbort);}
  };
  try{
   const identity=(await batch([{method:'eth_chainId',params:[]}]))[0];if(identity!==networks[chain].id)return fail('Configured RPC chain identity did not match; holder balances withheld.');
   const [rawHead,rawAnchor]=await batch(['latest',finality].map(tag=>({method:'eth_getBlockByNumber',params:[tag,false]}))),head=object(rawHead),anchor=object(rawAnchor),headNumber=quantity(head.number),headTime=quantity(head.timestamp),blockNumber=quantity(anchor.number),blockTime=quantity(anchor.timestamp);
   if(headNumber===null||headTime===null||!HASH.test(head.hash)||blockNumber===null||blockTime===null||!HASH.test(anchor.hash)||blockNumber>headNumber||blockTime>headTime||headTime*1000>now()+120000||headTime*1000<now()-900000)return fail('Current RPC head or selected finality anchor is invalid, future or stale; balances remain unknown.');
   const [code,supplyValue,decimalValue,managerCode,lockerCode]=await batch([{method:'eth_getCode',params:[token,anchor.number]},...['0x18160ddd','0x313ce567'].map(data=>({method:'eth_call',params:[{to:token,data},anchor.number]})),...(chain==='robinhood'?[ROBINHOOD_POOL_MANAGER,ROBINHOOD_PONS_LOCKER].map(address=>({method:'eth_getCode',params:[address,anchor.number]})):[])]);
   if(typeof code!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(code))return fail(`Token code is not available at the ${finality} anchor ${blockNumber} (${new Date(blockTime*1000).toISOString()}); the endpoint may lack historical state, or the anchor may precede deployment. No later state was substituted.${chain==='robinhood'?' Configure ROBINHOOD_RPC_URL with an authorized archive-capable endpoint to read safe historical state. The public RPC may expose safe headers without retaining their contract state.':''}`);
   const supply=word(supplyValue),rawDecimals=word(decimalValue);if(supply===null||supply<=0n||rawDecimals===null||rawDecimals>255n)return fail('Same-block token supply or decimals could not be verified; balances remain unknown.');
   const decimals=Number(rawDecimals),totalSupply=Number(supply)/10**decimals;if(!Number.isFinite(totalSupply)||totalSupply<=0)return fail('Token supply cannot be represented without losing its units.');
   let ledger:AlchemyPonsCandidateResult|undefined;const transferCandidates:string[]=[];let discovery='No transfer-recipient index is configured; candidates come from supplied snapshots, identities, pool and observed activity.';
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
    // Choose the authenticated primary before any public-provider request.
    // Provider denial never triggers route failover or a second index query.
    const pons=options.ponsSnapshot;
    if(indexedPrimary){
     if(pons?.basis==='safe'&&pons.factory.toLowerCase()===PONS_FACTORY&&pons.deployerContract.toLowerCase()===PONS_DEPLOYER){
      ledger=await readAlchemyPonsCandidates({token,curve:pons.curve,launcher:pons.launcher,anchor:{number:anchor.number,hash:anchor.hash,timestamp:anchor.timestamp},observedAt:new Date(now()).toISOString(),decimals,signal:controller.signal,excludedAddresses:[ROBINHOOD_POOL_MANAGER,ROBINHOOD_PONS_LOCKER,DEAD,PONS_DEPLOYER,...report.holders.filter(h=>['pool','exchange','bridge','burn'].includes(h.tag||'')).map(h=>h.address)]},(calls,maxBytes)=>paceBalance(url,controller.signal,()=>batch(calls,url,maxBytes)));
      result.sources.push(ledger.source);
      if(ledger.rateLimited)throw new CandidateRpcRateLimitError(ledger.rateLimit);
      if(ledger.accessDenied)throw new AlchemyIndexAccessDeniedError();
      discovery=ledger.source.detail;
     }else discovery='The configured Alchemy index requires a token-bound safe Pons launch record. No public RPC failover was attempted; supplied candidates remain eligible for independent balance reads.';
    }else{
    const first=Math.max(0,blockNumber-19999),topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';let accepted=0,rejected=0,gaps=0,capped=0,publicMatched=false,limited=false;
    try{const [id,header]=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:[anchor.number,false]}],ROBINHOOD_LOG_RPC),b=object(header);publicMatched=id===networks[chain].id&&b.number===anchor.number&&b.hash?.toLowerCase()===anchor.hash.toLowerCase()&&b.timestamp===anchor.timestamp;}catch{options.signal?.throwIfAborted();if(controller.signal.aborted)throw Error('RPC deadline reached.');}
    if(publicMatched&&pons?.basis==='safe'&&pons.factory.toLowerCase()===PONS_FACTORY&&pons.deployerContract.toLowerCase()===PONS_DEPLOYER){ledger=await readRobinhoodPonsCandidates({token,curve:pons.curve,launcher:pons.launcher,anchor:{number:anchor.number,hash:anchor.hash,timestamp:anchor.timestamp},observedAt:new Date(now()).toISOString(),signal:controller.signal,excludedAddresses:[ROBINHOOD_POOL_MANAGER,ROBINHOOD_PONS_LOCKER,DEAD,PONS_DEPLOYER,...report.holders.filter(h=>['pool','exchange','bridge','burn'].includes(h.tag||'')).map(h=>h.address)]},(calls,maxBytes)=>batch(calls,ROBINHOOD_LOG_RPC,maxBytes));result.sources.push(ledger.source);limited ||= ledger.rateLimited===true;}
    for(let from=first;publicMatched&&!ledger?.scope&&!limited&&from<=blockNumber;from+=5000){const to=Math.min(blockNumber,from+4999);
     try{const rows=(await batch([{method:'eth_getLogs',params:[{address:token,topics:[topic],fromBlock:'0x'+from.toString(16),toBlock:'0x'+to.toString(16)}]}],ROBINHOOD_LOG_RPC))[0];
      if(!Array.isArray(rows)||rows.length>2000){gaps++;continue;}if(rows.length===2000)capped++;
      for(const raw of rows){const row=object(raw),height=quantity(row.blockNumber);if(address(row.address)!==token||row.removed!==false||height===null||height<from||height>to||!HASH.test(row.transactionHash)||!HASH.test(row.blockHash)||quantity(row.logIndex)===null||!HASH.test(row.data)||!Array.isArray(row.topics)||row.topics.length!==3||row.topics[0]?.toLowerCase()!==topic||!row.topics.slice(1).every((v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v))){rejected++;continue;}accepted++;for(const t of row.topics.slice(1)){const a=address('0x'+t.slice(-40));if(a)transferCandidates.push(a);}}
     }catch(error){options.signal?.throwIfAborted();if(controller.signal.aborted)throw error;gaps++;if(error instanceof Error&&error.message==='RPC rate limit reached; no retry was made.'){limited=true;break;}}
    }
    discovery=ledger?.scope?ledger.source.detail:`Official public RPC candidate-only log leg ${publicMatched?'matched chain and anchor hash':'could not match chain and anchor hash; no logs requested'}.${limited?' Public log route was rate limited; no retry or alternate log route was used.':''} Bounded ERC-20 Transfer candidate discovery at safe blocks ${first}-${blockNumber}: ${accepted} valid rows, ${rejected} rejected rows, ${gaps} unavailable ranges, ${capped} potentially capped ranges. At most four 5,000-block requests were made. Failed ranges and earlier inactive holders remain unknown; this is not a complete holder census or trade history. Log recipients only nominate addresses; balances are independently read below.`;
    }
   }
   result.reasons.push(discovery);
   const fullLedger=!!(ledger?.scope&&ledger.ledger),required=[report.market?.pairAddress,...(chain==='robinhood'?[ROBINHOOD_POOL_MANAGER,ROBINHOOD_PONS_LOCKER]:[]),DEAD,...(report.identities||[]).map(i=>i.address),...(options.priorityCandidateAddresses||[])];
   const candidates=[...new Set([...required,...(ledger?.candidates||[]),...(fullLedger?[]:[...report.holders.map(h=>h.address),...(options.windowCandidates||[]),...transferCandidates,...(options.candidateAddresses||[])])].map(address).filter((a):a is string=>!!a))],selected=fullLedger?candidates:candidates.slice(0,REAL_HOLDER_CANDIDATE_LIMIT),balances:Balance[]=selected.map(address=>({address,status:'unknown'}));
   const groupSize=fullLedger?5:25;
   if(fullLedger){const totalBudget=ledger?.indexProvenance?60000:38000;budgetMs=Math.max(50,Math.min(totalBudget,deps.timeoutMs??totalBudget));deadline=started+budgetMs;clearTimeout(timer);timer=setTimeout(abort,Math.max(1,deadline-monotonic()));maxRequests=Math.max(maxRequests,requestCount+Math.ceil(selected.length/groupSize)+6);}
   // Preserve a small proof/anchor reserve when current-holder links were
   // nominated. Unread lower-ranked balances remain explicit; a transfer
   // candidate never becomes a graph edge merely because its ledger was read.
   const balanceReserve=Math.min(ledger?.directTransfers?.candidates.length||ledger?.directNominations?.length?4000:2000,budgetMs/5);
   let cursor=0,stopBalances=false,fatal:unknown;
   await Promise.all(Array.from({length:1},async()=>{
    while(!stopBalances){const start=cursor;cursor+=groupSize;if(start>=selected.length)return;
     const group=selected.slice(start,start+groupSize),remaining=deadline-monotonic()-balanceReserve;
     if(fullLedger&&remaining<=0){stopBalances=true;return;}
     try{const calls=group.map(a=>({method:'eth_call',params:[{to:token,data:'0x70a08231'+a.slice(2).padStart(64,'0')},anchor.number]}));
      const balanceSignal=fullLedger?AbortSignal.any([controller.signal,AbortSignal.timeout(Math.max(1,Math.floor(remaining)))]):controller.signal;
      const values=fullLedger?await paceBalance(url,balanceSignal,()=>batch(calls,url,1000000,Math.max(1,deadline-monotonic()-balanceReserve))):await batch(calls);
      for(let i=0;i<group.length;i++){const value=word(values[i]);if(value!==null&&value>supply)throw Error('Distinct candidate balances exceed supply.');balances[start+i]=value===null?{address:group[i],status:'unknown'}:{address:group[i],status:'observed',amountRaw:value.toString()};}
     }catch(error){options.signal?.throwIfAborted();stopBalances=true;if(!fullLedger||controller.signal.aborted||error instanceof Error&&['RPC rate limit reached; no retry was made.','Distinct candidate balances exceed supply.'].includes(error.message))fatal=error;}
    }
   }));
   if(fatal)throw fatal;
   const observed=balances.filter(b=>b.status==='observed');if(!observed.length)return fail('No candidate balances could be verified; missing values remain unknown, not zero.');
   if(observed.reduce((sum,b)=>sum+BigInt(b.amountRaw!),0n)>supply)throw Error('Distinct candidate balances exceed supply.');
   const checked=object((await batch([{method:'eth_getBlockByNumber',params:[anchor.number,false]}]))[0]);if(checked.number!==anchor.number||checked.hash?.toLowerCase()!==anchor.hash.toLowerCase()||checked.timestamp!==anchor.timestamp)return fail('Pinned holder block changed or could not be rechecked; all candidate balances withheld.');
   const observedAt=new Date(now()).toISOString(),blockTimestamp=new Date(blockTime*1000).toISOString();
   if(ledger?.identity)result.identities.push(ledger.identity);
   let holderEnumeration:HolderEnumeration|undefined;
   if(ledger?.scope&&ledger.ledger){
    const reconciled=ledger.ledger.netSupplyRaw===supply.toString()&&observed.every(b=>b.amountRaw===(ledger.ledger!.balances[b.address]??'0'));
    const verifiedAccounts=observed.filter(b=>BigInt(b.amountRaw!)>0n).length,complete=reconciled&&observed.length===selected.length&&observed.reduce((sum,b)=>sum+BigInt(b.amountRaw!),0n)===supply;
    holderEnumeration={kind:'pons-creation-ledger',recordedAccounts:ledger.scope.positiveCandidates,verifiedAccounts,complete,...(ledger.indexProvenance?{indexProvenance:ledger.indexProvenance}:{})};
    const rankedAddresses=ledger.candidates.slice(0,50);
    if(reconciled&&rankedAddresses.length===Math.min(50,ledger.scope.positiveCandidates)&&rankedAddresses.every(a=>observed.some(b=>b.address===a&&BigInt(b.amountRaw!)>0n&&b.amountRaw===ledger.ledger!.balances[a]))){holderEnumeration.ranked={rawLimit:50,addresses:rankedAddresses,verified:true};ledger.source.detail+=` The first ${rankedAddresses.length} raw ledger-ranked holders were all independently verified at this same anchor; this ranked-prefix proof does not imply that the remaining inventory was read.`;}
    if(reconciled){result.holderCount=ledger.scope.positiveCandidates;ledger.source.detail+=` Transfer-ledger count: ${result.holderCount} recorded holder accounts at this safe anchor. Net minted-minus-burned supply matches independently read totalSupply, and every successful sampled balanceOf agrees with the ledger. ${complete?`All ${verifiedAccounts} recorded positive holder accounts and required infrastructure/creator accounts were independently balanceOf-verified; aggregate balances reconcile 100% of same-block totalSupply.`:`Current balances independently checked for ${observed.length} of ${selected.length} selected accounts; not all accounts are RPC-verified.`}`;}
    else ledger.source.detail+=' Recorded holder count withheld: ledger supply or sampled balances did not reconcile with independent same-block contract reads.';
   }
   if(!holderEnumeration){
    // Real-holder ranking: the largest verified balances among all nominated
    // candidates. It never claims that unread addresses hold less.
    const positive=observed.filter(b=>BigInt(b.amountRaw!)>0n).sort((a,b)=>{const d=BigInt(b.amountRaw!)-BigInt(a.amountRaw!);return d>0n?1:d<0n?-1:a.address.localeCompare(b.address);});
    if(positive.length)holderEnumeration={kind:'real-holder-prefix',recordedAccounts:positive.length,verifiedAccounts:positive.length,complete:false,candidates:selected.length,windowCandidates:new Set((options.windowCandidates||[]).map(address).filter(Boolean)).size,ranked:{rawLimit:REAL_HOLDER_RAW_LIMIT,addresses:positive.slice(0,REAL_HOLDER_RAW_LIMIT).map(b=>b.address),verified:true}};
   }
   result.holders=observed.filter(b=>BigInt(b.amountRaw!)>0n).map(b=>({address:b.address,balance:Number(BigInt(b.amountRaw!))/10**decimals,share:Number(BigInt(b.amountRaw!))/Number(supply)*100})).sort((a,b)=>b.share-a.share||a.address.localeCompare(b.address));
   if(chain==='robinhood'&&typeof managerCode==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(managerCode)&&result.holders.some(h=>h.address===ROBINHOOD_POOL_MANAGER)){
    const source='Uniswap V4 deployment registry + RPC code';
    result.labels.push({address:ROBINHOOD_POOL_MANAGER,category:'pool',label:'Uniswap V4 shared PoolManager custody (aggregate across pools)',source,timestamp:observedAt,timestampBasis:'local-observation'});
    result.sources.push({name:source,status:'available',fetchedAt:observedAt,detail:`Robinhood chain 4663 published PoolManager ${ROBINHOOD_POOL_MANAGER}, with nonempty code and positive token balance checked at safe block ${blockNumber}. https://developers.uniswap.org/docs/protocols/v4/deployments . This is aggregate shared custody, not selected pool reserves or an impact estimate.`});
   }
   if(chain==='robinhood'&&typeof lockerCode==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(lockerCode)&&result.holders.some(h=>h.address===ROBINHOOD_PONS_LOCKER)){
    const source='Pons deployment registry + RPC code';
    result.labels.push({address:ROBINHOOD_PONS_LOCKER,category:'pool',label:'Pons launch locker shared infrastructure custody',source,timestamp:observedAt,timestampBasis:'local-observation'});
    result.sources.push({name:source,status:'available',fetchedAt:observedAt,detail:`Robinhood chain 4663 published Pons launch locker ${ROBINHOOD_PONS_LOCKER}, with nonempty code and positive token balance checked at safe block ${blockNumber}. https://docs.ponsfamily.com/v2#contracts . The registry describes shared custody of graduated positions and excess supply. This excludes documented infrastructure only; it is not a token-specific lock audit or selected pool reserve measurement.`});
   }
   if(result.holders.some(h=>h.address===DEAD))result.labels.push({address:DEAD,category:'burn',label:'Known dead burn address; measured token balance',source:'Known burn address + RPC balance',timestamp:observedAt,timestampBasis:'local-observation'});
   // Reuse already retrieved ledger logs. Proof failures cannot discard the
   // independently completed holder snapshot or silently create relationships.
   if(chain==='robinhood'&&ledger?.directTransfers?.candidates.length){
    const excluded=[token,options.ponsSnapshot?.curve||'',PONS_FACTORY,PONS_DEPLOYER,...result.labels.filter(l=>['pool','exchange','bridge','burn'].includes(l.category)).map(l=>l.address),...report.holders.filter(h=>['pool','exchange','bridge','burn'].includes(h.tag||'')).map(h=>h.address)];
    const proofs=await verifyDirectTransferCandidates({token,anchor:{number:anchor.number,hash:anchor.hash,timestamp:anchor.timestamp},decimals,observedAt,candidates:ledger.directTransfers.candidates,eligibleAddresses:result.holders.map(h=>h.address),excludedAddresses:excluded,signal:options.signal,canRead:()=>!controller.signal.aborted&&deadline-monotonic()>250&&requestCount<maxRequests},calls=>paceBalance(url,controller.signal,()=>batch(calls,url,1000000,Math.max(1,deadline-monotonic()-150))));
    result.transfers.push(...proofs.transfers);result.reasons.push(proofs.detail);result.sources.push({name:DIRECT_TRANSFER_SOURCE,status:proofs.transfers.length?'available':'unavailable',fetchedAt:new Date(now()).toISOString(),detail:proofs.detail+` ${ledger.directTransfers.eligibleEvents} eligible ledger events before the 4-transaction/32-log proof cap.`});
   }
   if(chain==='robinhood'&&ledger?.directNominations?.length){
    const excluded=[token,options.ponsSnapshot?.curve||'',PONS_FACTORY,PONS_DEPLOYER,...result.labels.filter(l=>['pool','exchange','bridge','burn'].includes(l.category)).map(l=>l.address),...report.holders.filter(h=>['pool','exchange','bridge','burn'].includes(h.tag||'')).map(h=>h.address)];
    const proofs=await verifyIndexedTransferCandidates({token,anchor:{number:anchor.number,hash:anchor.hash,timestamp:anchor.timestamp},decimals,observedAt,nominations:ledger.directNominations,eligibleAddresses:result.holders.map(h=>h.address),excludedAddresses:excluded,signal:options.signal,canRead:()=>!controller.signal.aborted&&deadline-monotonic()>250&&requestCount<maxRequests},calls=>paceBalance(url,controller.signal,()=>batch(calls,url,1000000,Math.max(1,deadline-monotonic()-150))));
    result.transfers.push(...proofs.transfers);result.reasons.push(proofs.detail);result.sources.push({name:DIRECT_TRANSFER_SOURCE,status:proofs.transfers.length?'available':'unavailable',fetchedAt:new Date(now()).toISOString(),detail:proofs.detail});
   }
   result.totalSupply=totalSupply;result.snapshot={chain,finality,blockNumber,blockHash:anchor.hash.toLowerCase(),blockTimestamp,observedAt,decimals,totalSupplyRaw:supply.toString(),balances,candidateCount:selected.length,...(holderEnumeration?{holderEnumeration}:{})};
   const detail=`${result.holders.length} positive balances from ${selected.length} candidates at ${networks[chain].name} ${finality} block ${blockNumber} (${anchor.hash}); block time ${blockTimestamp}, retrieved ${observedAt}. Same-block balanceOf, totalSupply and decimals, followed by block-hash revalidation.${fullLedger?' Qualified full-holder reads use batches of five, one shared endpoint lane and at least 600ms between starts; no rate-limit retries.':''} ${balances.length-observed.length} reads unavailable; ${observed.filter(b=>b.amountRaw==='0').length} verified zero balances excluded; ${fullLedger?`All ${ledger!.scope!.positiveCandidates} recorded positive holder accounts were selected; ${selected.length-observed.length} selected accounts remain unread or unavailable.`:`${Math.max(0,candidates.length-selected.length)} candidates outside the ${REAL_HOLDER_CANDIDATE_LIMIT}-address bound.`} ${holderEnumeration?.complete?`All ${holderEnumeration.verifiedAccounts} positive holder accounts verified and reconciled to 100% of totalSupply at this anchor.`:result.holderCount===null?'This sampled snapshot is not a complete holder census; full holder count is unknown.':`Separate Transfer-ledger count: ${result.holderCount} recorded holder accounts; the sampled balance checks do not independently verify every account.`}${finality==='safe'?' Safe means posted L1 data, not finalized L1 data; a reorganization can still change this snapshot.':''}`;
   result.reasons.push(detail);result.sources.push({name:EVM_HOLDER_SOURCE,status:'available',fetchedAt:observedAt,detail});return result;
  }catch(error){options.signal?.throwIfAborted();return fail(controller.signal.aborted?'Candidate holder verification reached its bounded deadline; no unverified balances were returned.':error instanceof Error&&['RPC rate limit reached; no retry was made.','Distinct candidate balances exceed supply.'].includes(error.message)?error.message:'Candidate holder RPC verification was unavailable; missing values remain unknown.');}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 };
}
