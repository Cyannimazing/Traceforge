import type {InvestigationReport} from './investigation-types';
import type {CrossTokenMemory,MemoryBlock,MemoryEvent,MemoryParticipant,MemoryConnection,VerifiedMemoryRecord} from './cross-token-memory';
import {topHolderCohort} from './top-holder-cohort';
import {holderScope} from './holder-scope';

type Supported='ethereum'|'base'|'robinhood';
type ObjectRow=Record<string,unknown>;
type Call={method:string;params:unknown[]};
type Indexed={token:string;from:string;to:string;transaction:string;blockNumber:string;logIndex:number|null;amountRaw:string;kind:'erc20'|'native'};
type Profile={rows:Indexed[];complete:boolean};
type Candidate={token:string;from:string;to:string;row?:Indexed;nativeTransaction?:string;cached?:MemoryConnection};
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,QUANTITY=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i,WORD=/^0x[0-9a-f]{64}$/i;
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const ids:Record<Supported,string>={ethereum:'0x1',base:'0x2105',robinhood:'0x1237'};
const normalize=(s:string)=>s.toLowerCase();
const object=(v:unknown):ObjectRow=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as ObjectRow:{};
const quantity=(v:unknown):bigint|null=>typeof v==='string'&&QUANTITY.test(v)&&v.length<=66?BigInt(v):null;
const uintData=(v:unknown):bigint|null=>typeof v==='string'&&/^0x[0-9a-f]{1,64}$/i.test(v)?BigInt(v):null;
const address=(v:unknown):v is string=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)&&normalize(v)!=='0x000000000000000000000000000000000000dead';
const hex=(v:bigint)=>'0x'+v.toString(16);
const topicAddress=(v:unknown)=>typeof v==='string'&&/^0x0{24}[0-9a-f]{40}$/i.test(v)?normalize('0x'+v.slice(-40)):'';
const equal=(a:unknown,b:string)=>typeof a==='string'&&normalize(a)===normalize(b);
class Stop extends Error{}
class Invalid extends Error{}

/** A bounded independent search, not a global memory corpus. Index rows only
 * nominate events. Every admitted event, voluntary participant and holding is
 * checked against the exact configured node's canonical chain and state. */
export function createEvmCrossTokenMemory(deps:{rpcUrls:Partial<Record<Supported,string>>;fetcher?:typeof fetch;now?:()=>number;maxRequests?:number;deadlineMs?:number;intervalMs?:number;cache?:{get:(chain:InvestigationReport['chain'],addresses:string[])=>VerifiedMemoryRecord[];set:(records:VerifiedMemoryRecord[])=>void}}){
 return async(report:InvestigationReport,options:{signal?:AbortSignal;deadlineMs?:number;onProgress?:(detail:string)=>void}={}):Promise<CrossTokenMemory>=>{
  options.signal?.throwIfAborted();
  const now=deps.now||Date.now,started=Date.now(),observedAt=new Date(now()).toISOString(),reasons=new Set<string>();
  const output:CrossTokenMemory={version:1,chain:report.chain,token:report.token,observedAt,status:'unavailable',records:[],scope:{selectedWallets:0,queriedWallets:0,candidateTokens:0,verifiedTransactions:0,truncated:true},reasons:[]};
  const finish=()=>{output.reasons=[...reasons];return output;};
  if(!(report.chain in ids)||report.fixture||report.providerAnalysis||!address(report.token)){reasons.add('Independent configured EVM discovery is unavailable for this report.');return finish();}
  const chain=report.chain as Supported,url=deps.rpcUrls[chain];
  try{const parsed=new URL(url||'');if(parsed.protocol!=='https:'||!parsed.hostname.endsWith('.g.alchemy.com')||parsed.username||parsed.password||!/^\/v2\/[^/]+$/.test(parsed.pathname))throw Error();}catch{reasons.add('A configured Alchemy endpoint is required for this chain.');return finish();}
  const excluded=new Set(holderScope(report).infrastructureAddresses.map(normalize));
  const wallets=topHolderCohort(report).holders.map(h=>normalize(h.address)).filter(a=>address(a)&&!excluded.has(a)).slice(0,50),eligible=new Set(wallets);
  output.scope.selectedWallets=wallets.length;
  if(wallets.length<2){reasons.add('Fewer than two eligible current holders are available.');return finish();}
  const deadline=Math.min(45_000,Math.max(1,Math.min(deps.deadlineMs??45_000,options.deadlineMs??45_000))),limit=Math.min(240,Math.max(1,deps.maxRequests??180)),interval=Math.max(0,deps.intervalMs??500);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),deadline),signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
  const fetcher=deps.fetcher||fetch;let requests=0,nextRequestAt=0,terminal=false,id=0,anchor:MemoryBlock|undefined;
  const verifiedTransactions=new Set<string>(),profiledWallets=new Set<string>(),readCache=new Map<string,Promise<unknown>>(),profiles=new Map<string,Promise<Profile>>(),canonicalHeaders=new Map<string,MemoryBlock>();
  const check=()=>{options.signal?.throwIfAborted();if(terminal)throw new Stop('Configured provider stopped this search.');if(signal.aborted||Date.now()-started>=deadline)throw new Stop('The bounded cross-token search deadline was reached.');};
  const batch=async(calls:Call[]):Promise<unknown[]>=>{
   check();if(requests+calls.length>limit)throw new Stop('The cross-token RPC request limit was reached.');
   const wait=Math.max(0,nextRequestAt-Date.now());if(wait)await new Promise<void>((resolve,reject)=>{const done=()=>{clearTimeout(t);signal.removeEventListener('abort',abort);resolve();},abort=()=>{clearTimeout(t);signal.removeEventListener('abort',abort);reject(new Stop('Cross-token search interrupted.'));},t=setTimeout(done,wait);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
   check();requests+=calls.length;
   // An index call costs substantially more than a header/state read. The
   // spacing is charged per logical method, including methods in a batch.
   nextRequestAt=Date.now()+interval*Math.max(1,calls.reduce((n,c)=>n+(c.method==='alchemy_getAssetTransfers'?1:0.26),0));
   const qs=calls.map(c=>({jsonrpc:'2.0',id:++id,...c}));let response:Response;
   try{response=await fetcher(url!,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(qs.length===1?qs[0]:qs),signal,redirect:'error'});}catch{check();terminal=true;throw new Stop('Configured RPC transport failed; no alternate endpoint was used.');}
   if(!response.ok){terminal=true;throw new Stop(response.status===429?'Configured RPC rate limited this search; no retry or alternate endpoint was used.':[401,403].includes(response.status)?'Configured RPC denied access; no alternate endpoint was used.':'Configured RPC request failed.');}
   const text=await response.text();if(text.length>8_388_608){terminal=true;throw new Stop('Configured RPC response exceeded the bounded response size.');}
   let payload:unknown;try{payload=JSON.parse(text);}catch{terminal=true;throw new Stop('Configured RPC returned malformed JSON.');}
   const list=Array.isArray(payload)?payload:[payload];if(list.length!==qs.length)throw new Invalid('RPC response count mismatch.');
   const seen=new Set<unknown>(),byId=new Map<unknown,ObjectRow>();for(const item of list){const row=object(item);if(seen.has(row.id))throw new Invalid('RPC response ID conflict.');seen.add(row.id);byId.set(row.id,row);}
   return qs.map(q=>{const row=byId.get(q.id);if(!row)throw new Invalid('RPC response ID missing.');if(row.error){const e=object(row.error),msg=String(e.message||'');if([-32601,401,403,429].includes(Number(e.code))||/unsupported|not supported|not authorized|unauthorized|forbidden|rate.limit|too many requests/i.test(msg)){terminal=true;throw new Stop('Configured RPC capability or access is unavailable; no alternate endpoint was used.');}throw new Invalid('A configured RPC proof read failed.');}if(!('result'in row))throw new Invalid('RPC result missing.');return row.result;});
  };
  const readMany=async(calls:Call[])=>{
   const missing:Call[]=[],keys=calls.map(c=>JSON.stringify(c));for(let i=0;i<calls.length;i++)if(!readCache.has(keys[i])&&!missing.some(c=>JSON.stringify(c)===keys[i]))missing.push(calls[i]);
   if(missing.length){const task=batch(missing);missing.forEach((c,i)=>readCache.set(JSON.stringify(c),task.then(values=>values[i])));}
   return Promise.all(keys.map(k=>readCache.get(k)!));
  };
  const header=(raw:unknown,expected?:string):MemoryBlock=>{
   const r=object(raw),n=quantity(r.number),time=quantity(r.timestamp);if(n===null||time===null||n>BigInt(Number.MAX_SAFE_INTEGER)||time>BigInt(Number.MAX_SAFE_INTEGER)||typeof r.hash!=='string'||!HASH.test(r.hash)||(expected&&n!==quantity(expected)))throw new Invalid('Canonical block header is malformed.');
   const timestamp=Number(time)*1000;if(timestamp<=0||timestamp>now()+120_000||(anchor&&(n>BigInt(anchor.number)||timestamp>Date.parse(anchor.timestamp))))throw new Invalid('Block falls outside the canonical anchor.');
   const h={number:hex(n),hash:normalize(r.hash),timestamp:new Date(timestamp).toISOString()},previous=canonicalHeaders.get(h.number);if(previous&&(previous.hash!==h.hash||previous.timestamp!==h.timestamp))throw new Invalid('Canonical block conflict.');canonicalHeaders.set(h.number,h);return h;
  };
  const profile=(wallet:string,direction:'from'|'to',token?:string,native=false):Promise<Profile>=>{
   const key=[wallet,direction,token||'',native].join(':');let promise=profiles.get(key);if(promise)return promise;
   promise=(async()=>{
    const params={fromBlock:'0x0',toBlock:anchor!.number,[direction+'Address']:wallet,...(token?{contractAddresses:[token]}:{}),category:[native?'external':'erc20'],order:'asc',withMetadata:false,excludeZeroValue:true,maxCount:'0x3e8'};
    const [raw]=await batch([{method:'alchemy_getAssetTransfers',params:[params]}]),r=object(raw);if(!Array.isArray(r.transfers)||r.transfers.length>1000||(r.pageKey!==undefined&&r.pageKey!==null&&(typeof r.pageKey!=='string'||r.pageKey.length>2048)))throw new Invalid('Transfer index page shape is invalid.');
    const rows:Indexed[]=[],seen=new Map<string,string>();let previous=-1n;
    for(const rawRow of r.transfers){const v=object(rawRow),c=object(v.rawContract),height=quantity(v.blockNum),amount=uintData(c.value),id=typeof v.uniqueId==='string'?v.uniqueId:'',match=/^(0x[0-9a-f]{64}):log:(0|[1-9][0-9]*)$/i.exec(id),decimals=uintData(c.decimal);
     if(height===null||height>BigInt(anchor!.number)||height<previous||typeof v.from!=='string'||!ADDRESS.test(v.from)||typeof v.to!=='string'||!ADDRESS.test(v.to)||!HASH.test(String(v.hash))||v.category!==(native?'external':'erc20')||amount===null||amount<0n||(!native&&(!address(c.address)||!match||!equal(match[1],String(v.hash))||!Number.isSafeInteger(Number(match[2]))||decimals===null||decimals>255n))||(native&&c.address!=null)||!equal(v[direction],wallet)||(token&&!equal(c.address,token)))throw new Invalid('Transfer index row failed validation.');
     previous=height;if(amount===0n||equal(v.from,String(v.to)))continue;
     const row:Indexed={kind:native?'native':'erc20',token:native?'native':normalize(String(c.address)),from:normalize(v.from),to:normalize(v.to),transaction:normalize(String(v.hash)),blockNumber:hex(height),logIndex:native?null:Number(match![2]),amountRaw:amount.toString()},identity=row.transaction+':'+row.logIndex,serialized=JSON.stringify(row),old=seen.get(identity);if(old&&old!==serialized)throw new Invalid('Conflicting index rows were withheld.');if(!old)rows.push(row);seen.set(identity,serialized);
    }
    if(eligible.has(wallet)){profiledWallets.add(wallet);output.scope.queriedWallets=profiledWallets.size;}if(r.pageKey)reasons.add('At least one earliest-activity profile has unread pages.');return {rows,complete:!r.pageKey};
   })();profiles.set(key,promise);return promise;
  };
  const verify=async(row:Indexed):Promise<MemoryEvent>=>{
   if(!address(row.from)||!address(row.to)||row.from===row.to||!HASH.test(row.transaction)||quantity(row.blockNumber)===null||BigInt(row.blockNumber)>BigInt(anchor!.number)||!/^\d{1,78}$/.test(row.amountRaw)||BigInt(row.amountRaw)<=0n||BigInt(row.amountRaw)>=2n**256n||(row.kind==='erc20'&&(!address(row.token)||!Number.isSafeInteger(row.logIndex)||row.logIndex!<0)))throw new Invalid('Event nomination is malformed.');
   const [txRaw,receiptRaw,blockRaw]=await readMany([{method:'eth_getTransactionByHash',params:[row.transaction]},{method:'eth_getTransactionReceipt',params:[row.transaction]},{method:'eth_getBlockByNumber',params:[row.blockNumber,false]}]);
   const tx=object(txRaw),receipt=object(receiptRaw),h=header(blockRaw,row.blockNumber),index=quantity(receipt.transactionIndex);
   if(!equal(tx.hash,row.transaction)||!equal(receipt.transactionHash,row.transaction)||!equal(tx.blockHash,h.hash)||!equal(receipt.blockHash,h.hash)||quantity(tx.blockNumber)!==BigInt(h.number)||quantity(receipt.blockNumber)!==BigInt(h.number)||quantity(receipt.status)!==1n||index===null||index>BigInt(Number.MAX_SAFE_INTEGER)||quantity(tx.transactionIndex)!==index||!address(tx.from))throw new Invalid('Transaction and successful canonical receipt do not agree.');
   if(row.kind==='native'){
    if(!equal(tx.from,row.from)||!equal(tx.to,row.to)||quantity(tx.value)!==BigInt(row.amountRaw))throw new Invalid('Native funding value or endpoints do not agree.');
   }else{
    if(!Array.isArray(receipt.logs)||receipt.logs.length>5000)throw new Invalid('Receipt logs are unavailable.');
    const matches=receipt.logs.filter(v=>quantity(object(v).logIndex)===BigInt(row.logIndex!));if(matches.length!==1)throw new Invalid('Exact transfer log is missing or duplicated.');
    const log=object(matches[0]),topics=log.topics;
    if(!equal(log.address,row.token)||!Array.isArray(topics)||topics.length!==3||!equal(topics[0],TRANSFER)||topicAddress(topics[1])!==row.from||topicAddress(topics[2])!==row.to||!WORD.test(String(log.data))||uintData(log.data)!==BigInt(row.amountRaw)||log.removed!==false||!equal(log.transactionHash,row.transaction)||!equal(log.blockHash,h.hash)||quantity(log.blockNumber)!==BigInt(h.number)||quantity(log.transactionIndex)!==index)throw new Invalid('Canonical Transfer log does not match the indexed nomination.');
   }
   verifiedTransactions.add(row.transaction);return {kind:row.kind,token:row.token,from:row.from,to:row.to,transaction:row.transaction,amountRaw:row.amountRaw,logIndex:row.logIndex,block:h,initiator:normalize(tx.from)};
  };
  const outgoing=new Map<string,Profile>(),incoming=new Map<string,Profile>();
  const asIndex=(event:MemoryEvent):Indexed=>({kind:event.kind,token:normalize(event.token),from:normalize(event.from),to:normalize(event.to),transaction:normalize(event.transaction),blockNumber:event.block.number,logIndex:event.logIndex,amountRaw:event.amountRaw});
  const participant=async(wallet:string,token:string,connection:MemoryEvent,cached?:MemoryConnection):Promise<MemoryParticipant>=>{
   const [codeRaw]=await readMany([{method:'eth_getCode',params:[wallet,anchor!.number]}]);if(typeof codeRaw!=='string'||!(codeRaw==='0x'||/^0xef0100[0-9a-f]{40}$/i.test(codeRaw)))throw new Invalid('Participant is not a verified EOA or exact EIP-7702 designator.');
   const cachedActivity=cached?.participants.find(p=>p.address.toLowerCase()===wallet)?.activity;
   const nominations=[...(cachedActivity?[asIndex(cachedActivity)]:[]),...(outgoing.get(wallet)?.rows||[]),...(incoming.get(wallet)?.rows||[])].filter(r=>r.kind==='erc20'&&r.token===token&&(r.from===wallet||r.to===wallet)&&(connection.kind!=='native'||connection.to!==wallet||BigInt(r.blockNumber)>=BigInt(connection.block.number))),activities:MemoryEvent[]=[];
   if(connection.kind==='erc20'&&connection.initiator===wallet)activities.push(connection);
   const attempt=async(rows:Indexed[])=>{for(const row of rows.slice(0,4)){try{const e=await verify(row);if(e.initiator===wallet){activities.push(e);break;}}catch(e){if(e instanceof Stop)throw e;}}};
   if(!activities.length)await attempt(nominations);
   if(!activities.length)await attempt((await profile(wallet,'from',token)).rows.filter(r=>connection.kind!=='native'||connection.to!==wallet||BigInt(r.blockNumber)>=BigInt(connection.block.number)));
   for(const activity of activities){
    if(connection.kind==='native'&&connection.to===wallet&&BigInt(activity.block.number)<BigInt(connection.block.number))continue;
    const at=async(block:MemoryBlock)=>{const [balance,supply,decimals]=await readMany([{method:'eth_call',params:[{to:token,data:'0x70a08231'+wallet.slice(2).padStart(64,'0')},block.number]},{method:'eth_call',params:[{to:token,data:'0x18160ddd'},block.number]},{method:'eth_call',params:[{to:token,data:'0x313ce567'},block.number]}]);if(![balance,supply,decimals].every(v=>typeof v==='string'&&WORD.test(v)))throw new Invalid('Historical ERC20 state returned malformed ABI words.');const b=uintData(balance),s=uintData(supply),d=uintData(decimals);return b!==null&&s!==null&&d!==null&&s>0n&&b<=s&&b*10000n>=s&&d<=255n?{block,balanceRaw:b.toString(),totalSupplyRaw:s.toString(),decimals:Number(d)}:null;};
    let holding=await at(activity.block);
    if(!holding&&activity.from===wallet&&BigInt(activity.block.number)>0n){const n=hex(BigInt(activity.block.number)-1n),[raw]=await readMany([{method:'eth_getBlockByNumber',params:[n,false]}]);holding=await at(header(raw,n));}
    if(holding)return {address:wallet,activity,holding,code:codeRaw};
   }
   throw new Invalid('No voluntary material prior-token participation was verified.');
  };
  try{
   const [chainId,rawAnchor]=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:[chain==='ethereum'?'finalized':'safe',false]}]);if(typeof chainId!=='string'||quantity(chainId)!==BigInt(ids[chain]))throw new Invalid('Configured RPC chain does not match this report.');anchor=header(rawAnchor);if(Date.parse(anchor.timestamp)<now()-600_000)reasons.add(`The safe anchor is dated ${anchor.timestamp}. History after that timestamp was not searched; historical event timestamps are unchanged.`);output.status='partial';
   const candidates:Candidate[]=[],nativePairs:Array<{from:string;to:string;transaction:string;amountRaw:string}>=[],seenPairs=new Set<string>();
   try{for(const record of (deps.cache?.get(chain,wallets)||[]).slice(0,64)){if(record.chain!==chain||!address(record.token)||normalize(record.token)===normalize(report.token))continue;for(const cached of record.connections.slice(0,16)){const event=cached.event,from=normalize(event.from),to=normalize(event.to);if(!eligible.has(from)||!eligible.has(to)||from===to||!['erc20','native'].includes(event.kind))continue;candidates.push({token:normalize(record.token),from,to,...(event.kind==='erc20'?{row:asIndex(event)}:{nativeTransaction:event.transaction}),cached});}}}catch{reasons.add('Saved proof nominations were unavailable; independent discovery continued.');}
   // Report evidence is a nomination only. Reverification below deliberately
   // does not depend on labels, inferred current groups or another service.
   for(const e of report.investigation.evidence){const from=normalize(e.from||''),to=normalize(e.to||'');if(e.kind!=='transfer'||e.attribution==='provider-reported'||!['native','ETH'].includes(e.token||'')||!eligible.has(from)||!eligible.has(to)||from===to||!HASH.test(e.transaction||'')||!/^\d{1,78}$/.test(e.amountRaw||'')||BigInt(e.amountRaw!)<=0n||!/receipt.*verified|receipt.*canonical|canonical.*receipt/i.test(e.source))continue;const key=from+':'+to;if(!seenPairs.has(key)){nativePairs.push({from,to,transaction:normalize(e.transaction!),amountRaw:e.amountRaw!});seenPairs.add(key);}if(nativePairs.length===4)break;}
   const unique=new Set<string>(),candidateTokens=new Set<string>(),records=new Map<string,VerifiedMemoryRecord>();let admitted=0;
   const tryCandidate=async(candidate:Candidate)=>{
    check();if(admitted>=2)return;if(requests>=limit-12){reasons.add('Further candidate verification was withheld at the request budget.');return;}
    const key=[candidate.token,candidate.from,candidate.to,candidate.nativeTransaction?'native':'erc20'].join(':');if(unique.has(key))return;unique.add(key);candidateTokens.add(candidate.token);output.scope.candidateTokens=candidateTokens.size;
    try{
     let event:MemoryEvent;
     if(candidate.row)event=await verify(candidate.row);else {const [raw]=await readMany([{method:'eth_getTransactionByHash',params:[candidate.nativeTransaction!]}]),tx=object(raw),height=quantity(tx.blockNumber),amount=quantity(tx.value);if(height===null||height>BigInt(anchor!.number)||amount===null||amount<=0n)throw new Invalid('Native nomination is not a mined positive transfer.');event=await verify({kind:'native',token:'native',from:candidate.from,to:candidate.to,transaction:candidate.nativeTransaction!,blockNumber:hex(height),amountRaw:amount.toString(),logIndex:null});}
     if(event.initiator!==candidate.from)throw new Invalid('Connection was not initiated by its sender.');
     const fanout=await profile(candidate.from,'from',event.kind==='erc20'?candidate.token:undefined,event.kind==='native'),recipients=new Set(fanout.rows.map(r=>r.to));if(!fanout.complete||recipients.size<1||recipients.size>20)throw new Invalid('Sender activity is incomplete or exceeds the low-fanout admission scope.');
     const participants=[await participant(candidate.from,candidate.token,event,candidate.cached),await participant(candidate.to,candidate.token,event,candidate.cached)];
     const connection:MemoryConnection={event,participants,senderFanout:{recipients:recipients.size,complete:true}},record=records.get(candidate.token)||{chain,chainId:ids[chain],token:candidate.token,anchor:anchor!,verifiedAt:new Date(now()).toISOString(),source:'configured-rpc' as const,connections:[]};record.connections.push(connection);records.set(candidate.token,record);
     // Two overlapping pair edges are one prior connected component, not two
     // model contributions. Stop only after two distinct components qualify.
     admitted=0;for(const r of records.values()){const graph=new Map<string,Set<string>>();for(const c of r.connections)for(const [from,to]of [[c.event.from,c.event.to],[c.event.to,c.event.from]]){const neighbors=graph.get(from)||new Set<string>();neighbors.add(to);graph.set(from,neighbors);}const seen=new Set<string>();for(const start of graph.keys())if(!seen.has(start)){admitted++;const todo=[start];while(todo.length){const a=todo.pop()!;if(seen.has(a))continue;seen.add(a);todo.push(...graph.get(a)!);}}}
    }catch(e){if(e instanceof Stop)throw e;reasons.add(e instanceof Invalid?e.message:'A prior-token candidate failed canonical proof checks.');}
   };
   for(const candidate of candidates)await tryCandidate(candidate);
   // Funding-linked endpoints get an incoming profile before broad discovery.
   // This priority derives only from independently observed current evidence.
   for(const pair of nativePairs){if(admitted>=2)break;try{for(const wallet of [pair.from,pair.to])if(!incoming.has(wallet))incoming.set(wallet,await profile(wallet,'to'));const left=new Set(incoming.get(pair.from)!.rows.map(r=>r.token));for(const token of new Set(incoming.get(pair.to)!.rows.map(r=>r.token)))if(token!==normalize(report.token)&&left.has(token))await tryCandidate({token,from:pair.from,to:pair.to,nativeTransaction:pair.transaction});}catch(e){if(e instanceof Stop)throw e;reasons.add('A funding-pair activity profile could not be verified.');}}
   for(const wallet of wallets){if(admitted>=2)break;check();if(requests>=limit-40||Date.now()-started>=deadline-5000){reasons.add('Discovery stopped with time and request budget reserved for the canonical anchor check.');break;}options.onProgress?.(`Checking prior-token activity across ${wallets.length} eligible current holders; ${output.scope.queriedWallets} profiled.`);try{const p=await profile(wallet,'from');outgoing.set(wallet,p);for(const row of p.rows)if(row.token!==normalize(report.token)&&eligible.has(row.to)&&row.from!==row.to)await tryCandidate({token:row.token,from:row.from,to:row.to,row});}catch(e){if(e instanceof Stop)throw e;reasons.add('An activity profile failed validation and was withheld.');}}
   // Even already verified proof batches are withheld if the pinned anchor
   // changes. No cached/index-supplied block hash can substitute this read.
   const [last,lastChain]=await batch([{method:'eth_getBlockByNumber',params:[anchor.number,false]},{method:'eth_chainId',params:[]}]);if(quantity(lastChain)!==BigInt(ids[chain]))throw new Invalid('Configured RPC chain changed during evidence verification.');header(last,anchor.number);output.records=[...records.values()];
   if(output.records.length)try{deps.cache?.set(output.records);}catch{reasons.add('Verified evidence could not be saved to the optional nomination cache.');}
  }catch(e){options.signal?.throwIfAborted();output.records=[];
   // A recognized network is not a successful historical search. Access or
   // transport failure, and contradictory/malformed canonical anchors, cannot
   // be displayed as an available source with zero matching relationships.
   // A bounded deadline after actual history reads can still describe partial
   // search coverage, while all unanchored relationship claims stay withheld.
   if(terminal||e instanceof Invalid||(!output.scope.queriedWallets&&!verifiedTransactions.size))output.status='unavailable';
   reasons.add(e instanceof Stop||e instanceof Invalid?e.message:'Cross-token evidence could not be completed within its bounded scope.');}
  finally{clearTimeout(timer);}
  if(!output.scope.queriedWallets&&!verifiedTransactions.size)output.status='unavailable';
  output.scope.verifiedTransactions=verifiedTransactions.size;
  reasons.add(`Searched ${output.scope.queriedWallets} of ${wallets.length} eligible current holders; ${requests} of ${limit} RPC methods used. Earliest index pages and at most two qualified connections are searched; this is not a complete global history.`);
  reasons.add('Material participation requires self-initiated prior-token activity and at least 0.01% of canonical same-block supply. Low observed sender fanout is not proof of ownership or absence of services.');
  return finish();
 };
}
