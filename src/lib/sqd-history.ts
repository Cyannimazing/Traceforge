export type SqdChain='ethereum'|'base';
export type SqdLogFilter={address:string[];topic0:string[];topic1?:string[];topic2?:string[];topic3?:string[]};
export type SqdHistoryRequest={fromBlock:number;toBlock:number;logs:SqdLogFilter[];includeAllTransactions?:boolean;includeAllBlocks?:boolean;parentBlockHash?:string};
export type SqdHeader={number:number;hash:string;parentHash:string;timestamp:number};
export type SqdLog={address:string;topics:string[];data:string;logIndex:number;transactionIndex:number;transactionHash:string;blockNumber:number;blockHash:string};
export type SqdTransaction={hash:string;from:string;status:0|1;transactionIndex:number;blockNumber:number;blockHash:string};
export type SqdBlock={header:SqdHeader;logs:SqdLog[];transactions:SqdTransaction[]};
export type SqdHistoryResult={status:'complete'|'partial'|'rate-limited'|'unavailable'|'invalid'|'response-limit';blocks:SqdBlock[];logs:SqdLog[];transactions:SqdTransaction[];through:number|null;complete:boolean;nextBlock:number;transactionLogsComplete:boolean;source:string;detail:string;retryAfterMs?:number};
const SOURCE='SQD Portal finalized history (public development/evaluation)';
const MAX_BYTES=2*1024*1024;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const uint=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const address=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^0x[\da-f]{64}$/i.test(value);
const invalid=():never=>{throw Error('Invalid SQD request or response schema.');};
function selectors(values:unknown,check:(value:unknown)=>boolean):string[]{if(!Array.isArray(values)||!values.length||values.length>100||!values.every(check))return invalid();return [...new Set((values as string[]).map(value=>value.toLowerCase()))];}
function normalize(request:SqdHistoryRequest):SqdHistoryRequest{
 if(!uint(request.fromBlock)||!uint(request.toBlock)||request.fromBlock>request.toBlock||request.toBlock>=Number.MAX_SAFE_INTEGER||!Array.isArray(request.logs)||request.logs.length>20)return invalid();
 if(request.includeAllTransactions&&request.fromBlock!==request.toBlock)throw Error('Full transaction log evidence requires a single block.');
 if(request.parentBlockHash!==undefined&&!hash(request.parentBlockHash))return invalid();
 return {...request,logs:request.logs.map(filter=>({address:selectors(filter.address,address),topic0:selectors(filter.topic0,hash),...(filter.topic1===undefined?{}:{topic1:selectors(filter.topic1,hash)}),...(filter.topic2===undefined?{}:{topic2:selectors(filter.topic2,hash)}),...(filter.topic3===undefined?{}:{topic3:selectors(filter.topic3,hash)})}))};
}
function parseBlock(value:unknown,request:SqdHistoryRequest):SqdBlock{
 const row=object(value),h=object(row.header);
 if(!uint(h.number)||h.number<request.fromBlock||h.number>request.toBlock||!hash(h.hash)||!hash(h.parentHash)||!uint(h.timestamp)||h.timestamp>8640000000000)return invalid();
 if(row.logs!==undefined&&!Array.isArray(row.logs)||row.transactions!==undefined&&!Array.isArray(row.transactions))return invalid();
 const header:SqdHeader={number:h.number,hash:h.hash.toLowerCase(),parentHash:h.parentHash.toLowerCase(),timestamp:h.timestamp};
 const transactions:SqdTransaction[]=[],byIndex=new Map<number,SqdTransaction>(),byHash=new Set<string>();
 for(const value of (row.transactions||[]) as unknown[]){const t=object(value);if(!hash(t.hash)||!address(t.from)||![0,1].includes(t.status as number)||!uint(t.transactionIndex))return invalid();const tx:SqdTransaction={hash:t.hash.toLowerCase(),from:t.from.toLowerCase(),status:t.status as 0|1,transactionIndex:t.transactionIndex,blockNumber:header.number,blockHash:header.hash};if(byIndex.has(tx.transactionIndex)||byHash.has(tx.hash))return invalid();byIndex.set(tx.transactionIndex,tx);byHash.add(tx.hash);transactions.push(tx);}
 const logs:SqdLog[]=[],indices=new Set<number>();
 for(const value of (row.logs||[]) as unknown[]){const l=object(value);if(!address(l.address)||!hash(l.transactionHash)||!uint(l.logIndex)||!uint(l.transactionIndex)||typeof l.data!=='string'||!/^0x(?:[\da-f]{2})*$/i.test(l.data)||!Array.isArray(l.topics)||l.topics.length>4||!l.topics.every(hash)||l.removed===true)return invalid();
  const log:SqdLog={address:l.address.toLowerCase(),transactionHash:l.transactionHash.toLowerCase(),logIndex:l.logIndex,transactionIndex:l.transactionIndex,data:l.data.toLowerCase(),topics:(l.topics as string[]).map(t=>t.toLowerCase()),blockNumber:header.number,blockHash:header.hash};
  const tx=byIndex.get(log.transactionIndex);if(!tx||tx.hash!==log.transactionHash||tx.status!==1||indices.has(log.logIndex))return invalid();indices.add(log.logIndex);
  if(!request.includeAllTransactions&&!request.logs.some(f=>f.address.includes(log.address)&&f.topic0.includes(log.topics[0])&&(!f.topic1||f.topic1.includes(log.topics[1]))&&(!f.topic2||f.topic2.includes(log.topics[2]))&&(!f.topic3||f.topic3.includes(log.topics[3]))))return invalid();logs.push(log);
 }
 if(!request.includeAllTransactions&&transactions.some(tx=>!logs.some(log=>log.transactionHash===tx.hash)))return invalid();
 return {header,logs,transactions};
}

/** Explicit evaluation adapter; callers must opt in, never a commercial default.
 * One request, 20s and 2MiB maximum. No retries or endpoint rotation.
 * Current schema/semantics: https://docs.sqd.dev/en/api/evm/introduction and
 * https://docs.sqd.dev/en/api/evm/finalized-stream ; https://sqd.dev/openapi.json
 * Filtered streams include their first/last covered blocks. Clean EOF may be
 * before toBlock: advance only through the last parsed boundary, never toBlock
 * merely because the response ended. Empty/204 responses prove no coverage.
 * Full transaction logs use documented transactions:[{logs:true}] for ONE block.
 * These are provider-indexed records, not cryptographic receipt proofs; verify
 * block identity independently before adopting them as canonical evidence.
 */
export async function queryEvmHistory(chain:SqdChain,input:SqdHistoryRequest,options:{signal?:AbortSignal;fetcher?:typeof fetch}={}):Promise<SqdHistoryResult>{
 if(typeof window!=='undefined')throw Error('SQD history adapter is server-only.');
 options.signal?.throwIfAborted();if(chain!=='ethereum'&&chain!=='base')return invalid();const request=normalize(input);
 const empty=(status:SqdHistoryResult['status'],detail:string):SqdHistoryResult=>({status,blocks:[],logs:[],transactions:[],through:null,complete:false,nextBlock:request.fromBlock,transactionLogsComplete:false,source:SOURCE,detail});
 const signal=AbortSignal.any([AbortSignal.timeout(20000),...(options.signal?[options.signal]:[])]);
 const body={type:'evm',fromBlock:request.fromBlock,toBlock:request.toBlock,includeAllBlocks:!!request.includeAllBlocks,...(request.parentBlockHash?{parentBlockHash:request.parentBlockHash}:{}),fields:{block:{number:true,hash:true,parentHash:true,timestamp:true},log:{address:true,data:true,topics:true,logIndex:true,transactionIndex:true,transactionHash:true},transaction:{hash:true,from:true,status:true,transactionIndex:true}},logs:request.logs.map(filter=>({...filter,transaction:true})),...(request.includeAllTransactions?{transactions:[{logs:true}]}:{})};
 let reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
 try{
  const response=await(options.fetcher||fetch)(`https://portal.sqd.dev/datasets/${chain==='ethereum'?'ethereum-mainnet':'base-mainnet'}/finalized-stream`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/jsonl'},body:JSON.stringify(body),signal,redirect:'error',cache:'no-store'});
  if(response.status===429||response.status===529){await response.body?.cancel();const seconds=Number(response.headers.get('retry-after')),retryAfterMs=Number.isSafeInteger(seconds)&&seconds>=1&&seconds<=Number.MAX_SAFE_INTEGER/1000?seconds*1000:60000;return {...empty('rate-limited','Public evaluation endpoint is rate limited. No historical coverage was accepted.'),retryAfterMs};}
  if(response.status===204){await response.body?.cancel();return empty('partial','Dataset has no returned boundary for this range. Coverage remains unverified.');}
  if(!response.ok){await response.body?.cancel();return empty('unavailable',response.status===409?'Provider block identity conflict; restart from a verified anchor.':'Public evaluation endpoint did not serve this request.');}
  const declared=Number(response.headers.get('content-length'));if(declared>MAX_BYTES){await response.body?.cancel();return empty('response-limit','Response exceeds 2MiB; request a smaller range.');}
  if(!response.body)return empty('invalid','Response body is missing.');
  reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,pending='';const blocks:SqdBlock[]=[];
  const accept=(line:string)=>{if(!line.trim())return;const block=parseBlock(JSON.parse(line),request),previous=blocks.at(-1);if(!previous&&block.header.number!==request.fromBlock)invalid();if(previous&&(block.header.number<=previous.header.number||(request.includeAllBlocks&&block.header.number!==previous.header.number+1)||(block.header.number===previous.header.number+1&&block.header.parentHash!==previous.header.hash)))invalid();if(!previous&&request.parentBlockHash&&block.header.parentHash!==request.parentBlockHash.toLowerCase())invalid();blocks.push(block);};
  while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();return empty('response-limit','Response exceeds 2MiB; request a smaller range.');}pending+=decoder.decode(value,{stream:true});let end=pending.indexOf('\n');while(end>=0){accept(pending.slice(0,end));pending=pending.slice(end+1);end=pending.indexOf('\n');}}
  pending+=decoder.decode();if(pending.trim())accept(pending);options.signal?.throwIfAborted();signal.throwIfAborted();
  const through=blocks.at(-1)?.header.number??null,complete=through===request.toBlock;
  return {status:complete?'complete':'partial',blocks,logs:blocks.flatMap(block=>block.logs),transactions:blocks.flatMap(block=>block.transactions),through,complete,nextBlock:through===null?request.fromBlock:through+1,transactionLogsComplete:complete&&!!request.includeAllTransactions,source:SOURCE,detail:through===null?'No boundary witness returned; no coverage accepted.':`Provider-covered finalized interval ${request.fromBlock}..${through}. ${complete?'Requested boundary reached.':'Stream ended early; resume at the returned nextBlock.'} Independent canonical block verification is still required.`};
 }catch(error){options.signal?.throwIfAborted();if(reader)try{await reader.cancel();}catch{/* Transport already closed. */}return empty(error instanceof SyntaxError||!!reader&&error instanceof TypeError||error instanceof Error&&/Invalid SQD/.test(error.message)?'invalid':'unavailable','Response was interrupted, unavailable or invalid; no cursor advance was accepted.');}
 finally{reader?.releaseLock();}
}
