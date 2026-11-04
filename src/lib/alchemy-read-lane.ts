type Options={fetcher?:typeof fetch;capacity?:number;now?:()=>number;wait?:(ms:number,signal:AbortSignal)=>Promise<void>};
type Account={tail:Promise<void>;nextStart:number;pending:number;blockedUntil:number;denial:'rate'|'access'|null;interruption:AbortController};
const MAX_PENDING=64,MAX_COST=6000,MAX_REQUEST_BYTES=262144,MAX_RESPONSE_BYTES=8388608;
// Audited server callers: https://www.alchemy.com/docs/reference/compute-unit-costs
// Logs reserve75 conservatively; the table lists60 as of2026-11-04. Unknown
// methods fail closed instead of silently receiving a cheap state-read cost.
const COSTS:Readonly<Record<string,number>>={alchemy_getAssetTransfers:120,eth_chainId:5,eth_call:26,eth_getLogs:75,eth_getBlockByNumber:20,eth_getCode:20,eth_getStorageAt:20,eth_getTransactionCount:20,eth_getTransactionByHash:20,eth_getTransactionReceipt:20,getAccountInfo:10,getMultipleAccounts:20,getTokenSupply:20,getTokenLargestAccounts:20,getSignaturesForAddress:40,getTransaction:40,getTransactionsForAddress:100};
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const failure=(message:string)=>new Error(`Configured RPC ${message}`);
function abortable<T>(task:Promise<T>,signal:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};signal.addEventListener('abort',abort,{once:true});task.then(value=>{signal.removeEventListener('abort',abort);resolve(value);},error=>{signal.removeEventListener('abort',abort);reject(error);});if(signal.aborted)abort();});
}
const defaultWait=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);},timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.min(2147483647,Math.max(0,ms)));signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});

/** One bounded lane across all configured Alchemy hosts and app keys: provider
 * throughput is account-wide. No credential identity is inferred or stored.
 * Starts reserve aggregate CU, responses may overlap. No retries. */
export function createAlchemyReadLane(options:Options={}):typeof fetch{
 const fetcher=options.fetcher||fetch,now=options.now||Date.now,wait=options.wait||defaultWait,capacity=options.capacity??250;
 if(!Number.isFinite(capacity)||capacity<=0)throw failure('lane capacity is invalid.');
 const state:Account={tail:Promise.resolve(),nextStart:now(),pending:0,blockedUntil:0,denial:null,interruption:new AbortController()},unaborted=new AbortController().signal;
 return async(input,init)=>{
  const request=typeof Request!=='undefined'&&input instanceof Request?input:undefined;
  let alchemy=false;
  try{const url=new URL(request?.url||String(input));alchemy=url.protocol==='https:'&&(url.hostname==='alchemy.com'||url.hostname.endsWith('.alchemy.com'));}catch{/* A nonmatching URL retains native fetch behavior. */}
  if(!alchemy||(init?.method||request?.method||'GET').toUpperCase()!=='POST')return fetcher(input,init);
  const signal=init?.signal||request?.signal||unaborted;signal.throwIfAborted();
  const body=init?.body;if(typeof body!=='string'||body.length>MAX_REQUEST_BYTES||new TextEncoder().encode(body).byteLength>MAX_REQUEST_BYTES)throw failure('request body cannot be scheduled.');
  let rows:unknown[];
  try{const parsed:unknown=JSON.parse(body);rows=Array.isArray(parsed)?parsed:[parsed];}catch{throw failure('request body cannot be scheduled.');}
  if(!rows.length||rows.length>1200)throw failure('request exceeds the bounded lane cost.');
  let cost=0;
  for(const row of rows){const r=object(row);if(r.jsonrpc!=='2.0'||typeof r.method!=='string'||!r.method.length||r.method.length>128)throw failure('request body cannot be scheduled.');if(!Object.hasOwn(COSTS,r.method))throw failure('method is outside the bounded lane cost table.');cost+=COSTS[r.method];}
  // One indivisible request must fit the provider's ten-second bucket even
  // when its reserved start is the first request after an idle period.
  if(cost>Math.min(MAX_COST,capacity*10))throw failure('request exceeds the bounded lane cost.');
  const check=()=>{signal.throwIfAborted();if(now()<state.blockedUntil)throw failure(state.denial==='rate'?'rate limit cooldown is active.':'access denial cooldown is active.');};
  check();if(state.interruption.signal.aborted)state.interruption=new AbortController();if(state.pending>=MAX_PENDING)throw failure('lane queue is full.');state.pending++;
  const queuedSignal=AbortSignal.any([signal,state.interruption.signal]),queuedCheck=()=>{queuedSignal.throwIfAborted();check();};
  const scheduled=state.tail.then(async()=>{
   try{queuedCheck();while(now()<state.nextStart){await wait(state.nextStart-now(),queuedSignal);queuedCheck();}queuedCheck();state.nextStart=now()+cost/capacity*1000;
    let response:Promise<Response>;try{response=fetcher(input,init);}catch{throw failure('transport was unavailable.');}void response.catch(()=>{});return {response};
   }finally{state.pending--;}
  });
  state.tail=scheduled.then(()=>{},()=>{});
  const reserved=await abortable(scheduled,queuedSignal);let response:Response;
  try{response=await abortable(reserved.response,signal);}catch{signal.throwIfAborted();throw failure('transport was unavailable.');}
  const deny=(kind:'rate'|'access'):never=>{
   const retry=response.headers.get('retry-after'),seconds=retry!==null&&/^\d+(?:\.\d+)?$/.test(retry)?Number(retry):NaN,dated=retry===null?NaN:Date.parse(retry),duration=Number.isFinite(seconds)?seconds*1000:Number.isFinite(dated)?dated-now():NaN;
   const minimum=kind==='access'?300000:1000,fallback=kind==='access'?300000:60000;
   state.blockedUntil=Math.max(state.blockedUntil,now()+Math.max(minimum,Number.isFinite(duration)?duration:fallback));state.denial=kind;
   const error=failure(kind==='rate'?'rate limit stopped this request; no retry was made.':'access was denied; no retry was made.');
   state.interruption.abort(error);void response.body?.cancel().catch(()=>{});throw error;
  };
  if(response.status===401||response.status===403)return deny('access');if(response.status===429)return deny('rate');
  // Inspect a bounded clone so callers retain the original response body.
  let payload:unknown,reader:ReadableStreamDefaultReader<Uint8Array>|undefined;
  try{
   const copy=response.clone();reader=copy.body?.getReader();if(reader){const decoder=new TextDecoder();let text='',bytes=0;for(;;){const chunk=await abortable(reader.read(),signal);if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_RESPONSE_BYTES)throw failure('response exceeded the bounded lane inspection size.');text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();try{payload=JSON.parse(text);}catch{/* Downstream adapters validate malformed/non-JSON responses. */}}
  }catch{void reader?.cancel().catch(()=>{});void response.body?.cancel().catch(()=>{});signal.throwIfAborted();throw failure('response inspection was unavailable or outside its bound.');}
  finally{reader?.releaseLock();}
  const errors=(Array.isArray(payload)?payload:[payload]).flatMap(row=>{const error=object(object(row).error);return Object.keys(error).length?[error]:[];});
  const access=errors.some(e=>[401,403].includes(Number(e.code))||/unauthori[sz]ed|forbidden|access[\s_-]*denied|not authori[sz]ed|invalid api[\s_-]*key/i.test(String(e.message||'')));
  if(access)return deny('access');
  if(errors.some(e=>Number(e.code)===429||/rate[\s_-]*limit|throughput|compute[\s_-]*units?|too many requests/i.test(String(e.message||''))))return deny('rate');
  return response;
 };
}
