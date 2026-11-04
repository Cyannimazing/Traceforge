import test from 'node:test';
import assert from 'node:assert/strict';
import {createAlchemyReadLane} from '../src/lib/alchemy-read-lane';

const endpoint='https://robinhood-mainnet.g.alchemy.com/v2/private-key';
const request=(method='eth_getCode'):RequestInit=>({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});
const answer=()=>Response.json({jsonrpc:'2.0',id:1,result:'0x1'});
function clock(){let tick=0;const waits:number[]=[];return {now:()=>tick,advance:(ms:number)=>{tick+=ms;},waits,wait:async(ms:number,signal:AbortSignal)=>{signal.throwIfAborted();waits.push(ms);tick+=ms;}};}

test('configured Alchemy hosts and different app keys share aggregate account cost without exposing credentials',async()=>{
 const time=clock(),starts:number[]=[];
 const lane=createAlchemyReadLane({...time,fetcher:async()=>{starts.push(time.now());return answer();}});
 const batch=['eth_chainId','eth_call','alchemy_getAssetTransfers','eth_getCode'].map((method,id)=>({jsonrpc:'2.0',id,method,params:[]}));
 await Promise.all([lane(endpoint,{...request(),body:JSON.stringify(batch)}),lane('https://eth-mainnet.g.alchemy.com/v2/private-key',request())]);
 assert.equal(starts.length,2);assert(starts[1]-starts[0]>=171/250*1000,'batch cost5+26+120+20 must reserve one account budget');
 const before=time.waits.length;await lane('https://base-mainnet.g.alchemy.com/v2/different-key',request());assert(time.waits.length>before,'different app keys can belong to the same provider account');assert(starts[2]-starts[1]>=80);
});

test('start reservations permit overlapping responses while preserving the configured capacity',async()=>{
 const time=clock(),starts:number[]=[];let release:()=>void=()=>{};
 const firstResponse=new Promise<void>(resolve=>{release=resolve;});
 const lane=createAlchemyReadLane({...time,capacity:100,fetcher:async()=>{starts.push(time.now());if(starts.length===1)await firstResponse;return answer();}});
 const first=lane(endpoint,request('eth_call')),second=lane(endpoint,request('eth_chainId'));
 await second;assert.equal(starts.length,2);assert(starts[1]-starts[0]>=260);release();await first;
});

test('log reads and mixed batches reserve audited EVM costs rather than the generic state-read cost',async()=>{
 for(const [methods,cost] of [[['eth_getLogs'],75],[['eth_getLogs','alchemy_getAssetTransfers','eth_chainId','eth_call','eth_getTransactionReceipt'],246]] as const){
  const time=clock(),starts:number[]=[],lane=createAlchemyReadLane({...time,fetcher:async()=>{starts.push(time.now());return answer();}});
  await lane(endpoint,{...request(),body:JSON.stringify(methods.map((method,id)=>({jsonrpc:'2.0',id,method,params:[]})))});await lane(endpoint,request());
  assert(starts[1]-starts[0]>=cost/250*1000,methods.join(','));
 }
});

test('shared Solana history methods use their audited costs and unknown RPC methods cannot bypass the budget',async()=>{
 for(const [method,cost] of [['getTransaction',40],['getSignaturesForAddress',40],['getTransactionsForAddress',100]] as const){
  const time=clock(),starts:number[]=[],lane=createAlchemyReadLane({...time,fetcher:async()=>{starts.push(time.now());return answer();}});
  await lane('https://solana-mainnet.g.alchemy.com/v2/private-key',request(method));await lane(endpoint,request());assert(starts[1]-starts[0]>=cost/250*1000,method);
 }
 let calls=0;const lane=createAlchemyReadLane({fetcher:async()=>{calls++;return answer();}});await assert.rejects(lane(endpoint,request('debug_traceTransaction')));assert.equal(calls,0);
});

test('queued cancellation exits promptly without fetching or consuming a later reservation',async()=>{
 const time=clock();let blocked=true,calls=0;
 const wait=async(ms:number,signal:AbortSignal)=>{if(blocked)await new Promise<void>((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal.aborted)reject(signal.reason);});else time.advance(ms);};
 const lane=createAlchemyReadLane({now:time.now,wait,fetcher:async()=>{calls++;return answer();}});
 await lane(endpoint,request());
 const controller=new AbortController(),queued=lane(endpoint,{...request(),signal:controller.signal});controller.abort();
 await assert.rejects(queued,{name:'AbortError'});assert.equal(calls,1);
 blocked=false;await lane(endpoint,request());assert.equal(calls,2);assert.equal(time.now(),80,'the canceled request must not reserve an extra cost interval');
});

test('rate denial cancels its body, honors Retry-After and never retries through another host',async()=>{
 const time=clock();let calls=0,canceled=0;
 const lane=createAlchemyReadLane({...time,fetcher:async()=>{calls++;return calls===1?new Response(new ReadableStream({cancel(){canceled++;}}),{status:429,headers:{'retry-after':'2'}}):answer();}});
 for(const url of [endpoint,'https://eth-mainnet.g.alchemy.com/v2/different-key'])await assert.rejects(lane(url,request()),error=>error instanceof Error&&!/private-key|different-key|alchemy\.com/.test(error.message)&&/rate|cooldown/i.test(error.message));
 assert.equal(calls,1);assert.equal(canceled,1);time.advance(1999);await assert.rejects(lane(endpoint,request()));assert.equal(calls,1);time.advance(1);await lane(endpoint,request());assert.equal(calls,2);
});

test('a denial releases queued callers promptly even if transport cancellation never resolves',async()=>{
 let calls=0,release:(response:Response)=>void=()=>{};
 const pending=new Promise<Response>(resolve=>{release=resolve;});
 const lane=createAlchemyReadLane({fetcher:async()=>{calls++;return pending;},wait:(_ms,signal)=>new Promise<void>((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});if(signal.aborted)reject(signal.reason);})});
 const first=lane(endpoint,request()),queued=lane(endpoint,request()),settled=Promise.allSettled([first,queued]);
 await new Promise(resolve=>setImmediate(resolve));release(new Response(new ReadableStream({cancel:()=>new Promise(()=>{})}),{status:429}));
 const result=await Promise.race([settled,new Promise<null>(resolve=>setTimeout(()=>resolve(null),100))]);
 assert(result,'known denial must not wait for a queued start slot or stuck body cancellation');assert(result.every(row=>row.status==='rejected'));assert.equal(calls,1);
});

test('default and HTTP-date Retry-After cooldowns allow only a fresh later caller',async()=>{
 for(const duration of [60000,15000]){const time=clock();let calls=0;const lane=createAlchemyReadLane({...time,fetcher:async()=>{calls++;return calls===1?new Response('',{status:429,headers:duration===15000?{'retry-after':new Date(duration).toUTCString()}:undefined}):answer();}});
  await assert.rejects(lane(endpoint,request()));time.advance(duration-1);await assert.rejects(lane(endpoint,request()));assert.equal(calls,1);time.advance(1);await lane(endpoint,request());assert.equal(calls,2);
 }
});

test('HTTP and JSON-RPC denial stop later account requests with sanitized bounded cooldowns',async()=>{
 for(const mode of ['http401','http403','rpc401','rpc403','rpc429','rpc-throughput'] as const){
  const time=clock();let calls=0;
  const lane=createAlchemyReadLane({...time,fetcher:async()=>{calls++;return mode.startsWith('http')?new Response('private provider failure',{status:Number(mode.slice(4))}):Response.json({jsonrpc:'2.0',id:1,error:{code:mode==='rpc-throughput'?-32005:Number(mode.slice(3)),message:'private provider throughput failure'}});}});
  await assert.rejects(lane(endpoint,request()),error=>error instanceof Error&&!/private-key|private provider|https?:/.test(error.message));
  await assert.rejects(lane('https://base-mainnet.g.alchemy.com/v2/private-key',request()));assert.equal(calls,1,mode);
  time.advance(mode==='rpc429'||mode==='rpc-throughput'?60000:300000);
  await assert.rejects(lane(endpoint,request()));assert.equal(calls,2,'a later caller can make a fresh attempt after cooldown; the wrapper never retries');
 }
});

test('a log-result size limit remains available for legitimate range splitting',async()=>{
 const time=clock();let calls=0;const body={jsonrpc:'2.0',id:1,error:{code:-32005,message:'query returned more than10000 results'}};
 const lane=createAlchemyReadLane({...time,fetcher:async()=>{calls++;return calls===1?Response.json(body):answer();}});
 assert.deepEqual(await (await lane(endpoint,request('eth_getLogs'))).json(),body);await lane(endpoint,request('eth_getLogs'));assert.equal(calls,2);
});

test('non-Alchemy requests pass through unchanged and opaque Alchemy POST streams are never consumed',async()=>{
 const input=new URL('https://public.example.test/rpc'),init=request(),response=answer();let calls=0;
 const lane=createAlchemyReadLane({fetcher:async(actualInput,actualInit)=>{calls++;assert.equal(actualInput,input);assert.equal(actualInit,init);return response;}});
 assert.equal(await lane(input,init),response);assert.equal(calls,1);
 const stream=new ReadableStream();await assert.rejects(lane(endpoint,{method:'POST',body:stream as unknown as BodyInit}));assert.equal(stream.locked,false);assert.equal(calls,1);
 await assert.rejects(lane(endpoint,{...request(),body:'{private provider body'}));assert.equal(calls,1);
});

test('queued work and aggregate request cost are bounded before provider calls',async()=>{
 const time=clock();let calls=0;const lane=createAlchemyReadLane({...time,fetcher:async()=>{calls++;return answer();}});
 const settled=await Promise.allSettled(Array.from({length:65},()=>lane(endpoint,request())));assert.equal(settled.filter(r=>r.status==='rejected').length,1);assert.equal(calls,64);
 const excessive=Array.from({length:51},(_,id)=>({jsonrpc:'2.0',id,method:'alchemy_getAssetTransfers',params:[]}));await assert.rejects(lane(endpoint,{...request(),body:JSON.stringify(excessive)}));assert.equal(calls,64);
 const exceedsBucket=excessive.slice(0,50);await assert.rejects(lane(endpoint,{...request(),body:JSON.stringify(exceedsBucket)}));assert.equal(calls,64,'an indivisible6000CU batch cannot fit the default2500CU ten-second bucket');
 const largest=excessive.slice(0,20);await lane(endpoint,{...request(),body:JSON.stringify(largest)});const before=time.now();await lane(endpoint,request());assert(time.now()-before>=9600);
});

test('indivisible batch rejection follows the configured ten-second bucket without splitting or retrying',async()=>{
 let calls=0;const time=clock(),lane=createAlchemyReadLane({...time,capacity:100,fetcher:async()=>{calls++;return answer();}});
 const batch=(count:number)=>({...request(),body:JSON.stringify(Array.from({length:count},(_,id)=>({jsonrpc:'2.0',id,method:'alchemy_getAssetTransfers',params:[]})))});
 await assert.rejects(lane(endpoint,batch(9)));assert.equal(calls,0,'1080CU exceeds a100CU/s ten-second bucket');await lane(endpoint,batch(8));assert.equal(calls,1);
});
