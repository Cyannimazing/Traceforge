import type {RegistryReader} from './factory-registry';
type Chain='ethereum'|'base';
const endpoints={ethereum:'https://ethereum-rpc.publicnode.com',base:'https://mainnet.base.org'};
const hex=(n:number)=>'0x'+n.toString(16);
const safeError=(message:string,retryAfterMs?:number,rangeTooLarge=false)=>Object.assign(Error(message),{retryAfterMs,rangeTooLarge});
export function createRegistryReader(options:{rpcUrls?:Partial<Record<Chain,string>>;fetcher?:typeof fetch;alternativeLogs?:RegistryReader['logs']}={}):RegistryReader{
 let sequence=0;const cooldowns=new Map<string,number>();
 async function rpc(chain:Chain,method:string,params:unknown[],signal?:AbortSignal):Promise<any>{
  const key=chain+':'+method,remaining=Math.max(cooldowns.get(key)||0,cooldowns.get(chain+':*')||0)-Date.now();if(remaining>0)throw safeError('Registry RPC is in provider cooldown.',remaining);
  const id=++sequence,response=await(options.fetcher||fetch)(options.rpcUrls?.[chain]||endpoints[chain],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(7000),...(signal?[signal]:[])]),cache:'no-store'});
  const body=await response.json().catch(()=>null),message=String(body?.error?.message||'');
  if(response.status===429||/rate.?limit|too many requests/i.test(message)){
   const retry=response.headers.get('retry-after'),serverDate=Date.parse(response.headers.get('date')||''),retryDate=Date.parse(retry||'');
   const delay=retry&&/^\d+$/.test(retry)?Math.max(60000,Number(retry)*1000):Number.isFinite(retryDate)?Math.max(60000,retryDate-(Number.isFinite(serverDate)?serverDate:Date.now())):60000;
   cooldowns.set(response.status===429?chain+':*':key,Date.now()+delay);throw safeError('Registry RPC rate limit. Saved ranges are preserved.',delay);
  }
  if(/block range|range.{0,20}(large|wide|limit)|too many (results|logs)|query returned more|response size/i.test(message))throw safeError('Registry RPC requires a smaller log range.',undefined,true);
  if(!response.ok||body?.error||body?.id!==id||body.result===undefined||body.result===null)throw safeError('Registry RPC did not supply the requested historical record.');
  return body.result;
 }
 return {
  head:async(chain,signal)=>{const id=await rpc(chain,'eth_chainId',[],signal);if(Number(id)!==(chain==='ethereum'?1:8453))throw Error('Registry RPC chain mismatch.');const h=await rpc(chain,'eth_getBlockByNumber',['finalized',false],signal);return {number:Number(h.number),hash:h.hash};},
  blockHash:async(chain,n,signal)=>{const b=await rpc(chain,'eth_getBlockByNumber',[hex(n),false],signal);if(Number(b.number)!==n)throw Error('Registry anchor block mismatch.');return b.hash;},
  logs:async(chain,r,signal)=>{
   // An explicitly enabled independent archive may answer when RPC lacks history.
   // Its covered-block cursor is required; request termination never means empty.
   let alternativeDelay=0;
   if(options.alternativeLogs)try{return await options.alternativeLogs(chain,r,signal);}catch(error){signal?.throwIfAborted();alternativeDelay=Math.max(0,Number((error as {retryAfterMs?:number}).retryAfterMs)||0);}
   let logs:any;try{logs=await rpc(chain,'eth_getLogs',[{fromBlock:hex(r.from),toBlock:hex(r.to),address:r.address,topics:r.topics}],signal);}catch(error){const e=error as Error&{retryAfterMs?:number};if(alternativeDelay)e.retryAfterMs=Math.max(alternativeDelay,e.retryAfterMs||0);throw e;}
   if(!Array.isArray(logs))throw Error('Registry RPC logs are malformed.');if(logs.length>=1000)throw safeError('Registry log result reached the conservative cap.',undefined,true);
   return {logs,through:r.to,source:'Configured RPC factory logs; receipt verification pending'};
  },
 };
}
