import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,parseAbiItem} from 'viem';
import {createPoolLaunch,decodePoolSwap,decodePoolCreationEvent,SUPPORTED_POOL_FACTORIES,type PoolCheckpoint} from '../src/lib/pool-launch';

const pool='0x1111111111111111111111111111111111111111',token='0x2222222222222222222222222222222222222222',other='0x3333333333333333333333333333333333333333',sender='0x4444444444444444444444444444444444444444';
const factory='0x1f98431c8ad98523631ae4a59f267346ea31f984';
const hash=(n:number)=>`0x${n.toString(16).padStart(64,'0')}`;
const hex=(n:number)=>`0x${n.toString(16)}`;
const swapEvent=parseAbiItem('event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)');
const creationEvent=parseAbiItem('event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)');
function swap(block:number,index:number,amount0=-2000000n,amount1=1n){return {address:pool,transactionHash:hash(block+1000),blockNumber:hex(block),blockHash:hash(block),transactionIndex:'0x0',logIndex:hex(index),removed:false,topics:encodeEventTopics({abi:[swapEvent],eventName:'Swap',args:{sender,recipient:other}}),data:encodeAbiParameters([{type:'int256'},{type:'int256'},{type:'uint160'},{type:'uint128'},{type:'int24'}],[amount0,amount1,1n,1n,0])};}
function fixture(options:{logs?:ReturnType<typeof swap>[];head?:number;times?:Partial<Record<number,number>>;factory?:string;receiptMismatch?:boolean;logsFailure?:boolean;capped?:boolean;creationFallback?:boolean;explorerUnavailable?:boolean;rpcHistory?:boolean}={}){
 const calls:string[]=[];const logs=options.logs||[swap(110,1),swap(170,2),swap(171,3)];
 const creation={address:options.factory||factory,transactionHash:hash(999),blockNumber:'0x64',blockHash:hash(100),transactionIndex:'0x0',logIndex:'0x0',removed:false,topics:encodeEventTopics({abi:[creationEvent],eventName:'PoolCreated',args:{token0:token,token1:other,fee:3000}}),data:encodeAbiParameters([{type:'int24'},{type:'address'}],[60,pool])};
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);calls.push(url);
  if(init?.method==='POST'){
   const r=JSON.parse(String(init.body));let result:unknown;
   if(r.method==='eth_chainId')result='0x1';
   else if(r.method==='eth_getBlockByNumber'){const n=r.params[0]==='finalized'?(options.head||200):Number(r.params[0]);result={number:hex(n),hash:hash(n),timestamp:hex(options.times?.[n]??1700000000+n)};}
   else if(r.method==='eth_call')result='0x'+(6).toString(16).padStart(64,'0');
   else if(options.rpcHistory&&r.method==='eth_getLogs'){
    const q=r.params[0],from=Number(q.fromBlock),to=Number(q.toBlock);
    result=(q.address===pool?logs:[creation]).filter(l=>l.address===q.address&&Number(l.blockNumber)>=from&&Number(l.blockNumber)<=to&&q.topics.every((t:string|null,i:number)=>t===null||l.topics[i]===t));
   }
   else if(r.method==='eth_getTransactionReceipt'){
    const tx=r.params[0],chosen=tx===hash(999)?[creation]:logs.filter(l=>l.transactionHash===tx),block=tx===hash(999)?100:Number(chosen[0]?.blockNumber);
    result={transactionHash:tx,status:'0x1',from:sender,blockNumber:hex(block),blockHash:options.receiptMismatch&&tx!==hash(999)?hash(12345):hash(block),logs:chosen};
   }else throw Error(`Unexpected RPC ${r.method}`);
   return Response.json({jsonrpc:'2.0',id:r.id,result});
  }
  if(options.explorerUnavailable)return new Response('unavailable',{status:403});
  if(url.includes('/api/v2/addresses/'))return options.creationFallback?new Response('down',{status:500}):Response.json({creation_transaction_hash:hash(999)});
  const q=new URL(url).searchParams;
  if(q.get('action')==='getcontractcreation')return Response.json({status:'1',result:[{contractAddress:pool,txHash:hash(999)}]});
  if(q.get('action')==='getLogs'){
   if(options.logsFailure)return Response.json({status:'0',message:'unavailable',result:[]});
   const from=Number(q.get('fromBlock')),to=Number(q.get('toBlock'));
   if(options.capped&&to-from>50)return Response.json({status:'1',result:Array.from({length:1000},()=>logs[0])});
   return Response.json({status:'1',result:logs.filter(l=>Number(l.blockNumber)>=from&&Number(l.blockNumber)<=to)});
  }
  throw Error('Unexpected URL');
 };
 return {fetcher,calls,logs,creation};
}

test('pool proof anchors actual first swap and includes the 60-second boundary only',async()=>{
 const f=fixture();const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.scope,'selected-pool');
 assert.equal(result.proof?.firstSwapAt,new Date(1700000110*1000).toISOString());
 assert.equal(result.trades.length,2);assert(result.trades.every(t=>t.wallet===sender&&t.amount===2&&t.side==='buy'));
 assert.equal(result.proof?.creation.blockNumber,100);assert.equal(result.proof?.through.blockNumber,200);
 assert(!('launchVerified' in result));
});

test('wrong trusted factory and token cannot establish a pool proof',async()=>{
 const wrong=await createPoolLaunch({fetcher:fixture({factory:sender}).fetcher})('ethereum',token,pool);
 assert.notEqual(wrong.status,'verified');assert.equal(wrong.trades.length,0);
 const mismatch=await createPoolLaunch({fetcher:fixture().fetcher})('ethereum',sender,pool);
 assert.notEqual(mismatch.status,'verified');
});

test('missing log range or unclosed first minute withholds all timing proof',async()=>{
 for(const options of [{logsFailure:true},{head:160}]){
  const result=await createPoolLaunch({fetcher:fixture(options).fetcher})('ethereum',token,pool);
  assert.notEqual(result.status,'verified');assert.equal(result.proof,undefined);assert.equal(result.trades.length,0);
 }
});

test('capped log ranges split and duplicate events cannot inflate first-minute totals',async()=>{
 const first=swap(110,1),f=fixture({capped:true,logs:[first,first,swap(170,2),swap(171,3)]});
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.trades.length,2);
 assert(f.calls.filter(u=>u.includes('getLogs')).length>1);
});

test('receipt reorg mismatch rejects proof and legacy creation fallback is verified',async()=>{
 const mismatch=await createPoolLaunch({fetcher:fixture({receiptMismatch:true}).fetcher})('ethereum',token,pool);
 assert.notEqual(mismatch.status,'verified');
 const fallback=await createPoolLaunch({fetcher:fixture({creationFallback:true}).fetcher})('ethereum',token,pool);
 assert.equal(fallback.status,'verified');
});

test('v3 target signed deltas determine side and reject ambiguous same-direction values',()=>{
 assert.deepEqual(decodePoolSwap('v3',swap(1,0),true),{side:'buy',amountRaw:2000000n});
 assert.deepEqual(decodePoolSwap('v3',swap(1,0,4n,-2n),true),{side:'sell',amountRaw:4n});
 assert.equal(decodePoolSwap('v3',swap(1,0,4n,2n),true),undefined);
});

test('pre-cancellation never performs pool RPC requests',async()=>{
 const controller=new AbortController();controller.abort();const f=fixture();
 await assert.rejects(()=>createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool,{signal:controller.signal}));assert.equal(f.calls.length,0);
});

test('v2 target flow rejects flash ambiguity and handles either token position',()=>{
 const event=parseAbiItem('event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)');
 const encode=(values:[bigint,bigint,bigint,bigint])=>({topics:encodeEventTopics({abi:[event],eventName:'Swap',args:{sender,to:other}}),data:encodeAbiParameters([{type:'uint256'},{type:'uint256'},{type:'uint256'},{type:'uint256'}],values)});
 assert.deepEqual(decodePoolSwap('v2',encode([0n,1n,2n,0n]),true),{side:'buy',amountRaw:2n});
 assert.deepEqual(decodePoolSwap('v2',encode([0n,1n,2n,0n]),false),{side:'sell',amountRaw:1n});
 assert.equal(decodePoolSwap('v2',encode([1n,1n,2n,0n]),true),undefined);
});

test('equal-block event ordering is canonical and a pre-creation swap cannot anchor proof',async()=>{
 const f=fixture({logs:[swap(110,4),swap(110,1),swap(110,2)]});
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.proof?.firstSwapLogIndex,1);
 assert.deepEqual(result.trades.map(t=>t.id.split(':').at(-1)),['1','2','4']);
 const early=await createPoolLaunch({fetcher:fixture({logs:[swap(100,0)]}).fetcher})('ethereum',token,pool);
 assert.notEqual(early.status,'verified');
});

test('saturated single block and wrong chain cannot establish proof',async()=>{
 const f=fixture();
 const capped:typeof fetch=async(u,i)=>String(u).includes('action=getLogs')?Response.json({status:'1',result:Array.from({length:1000},()=>f.logs[0])}):f.fetcher(u,i);
 const result=await createPoolLaunch({fetcher:capped})('ethereum',token,pool);
 assert.notEqual(result.status,'verified');assert(result.reasons.some(r=>r.includes('One block')));
 const wrong:typeof fetch=async(u,i)=>i?.body&&JSON.parse(String(i.body)).method==='eth_chainId'?Response.json({id:JSON.parse(String(i.body)).id,result:'0x2105'}):f.fetcher(u,i);
 assert.notEqual((await createPoolLaunch({fetcher:wrong})('ethereum',token,pool)).status,'verified');
});

test('missing canonical receipt event and removed events withhold proof',async()=>{
 const f=fixture();
 const missing:typeof fetch=async(u,i)=>{
  const response=await f.fetcher(u,i);
  if(i?.body){const request=JSON.parse(String(i.body));if(request.method==='eth_getTransactionReceipt'&&request.params[0]!==hash(999)){const body=await response.json();body.result.logs=[];return Response.json(body);}}
  return response;
 };
 assert.notEqual((await createPoolLaunch({fetcher:missing})('ethereum',token,pool)).status,'verified');
 const removed=swap(110,1);removed.removed=true;
 assert.notEqual((await createPoolLaunch({fetcher:fixture({logs:[removed]}).fetcher})('ethereum',token,pool)).status,'verified');
});

test('pruned primary receipt uses a chain-checked explorer RPC fallback',async()=>{
 const f=fixture();let fallbacks=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(String(u).endsWith('/api/eth-rpc'))fallbacks++;else if(q.method==='eth_getTransactionReceipt')return Response.json({id:q.id,result:null});}
  return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert(fallbacks>=4);
});

test('in-flight cancellation propagates while provider chain authentication is pending',async()=>{
 const controller=new AbortController();let started=0;
 const fetcher:typeof fetch=async(_u,i)=>new Promise((_resolve,reject)=>{
  started++;const signal=i!.signal!;
  signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  queueMicrotask(()=>controller.abort(new Error('cancelled by user')));
 });
 await assert.rejects(()=>createPoolLaunch({fetcher})('ethereum',token,pool,{signal:controller.signal}),/cancelled by user/);
 assert.equal(started,1);
});

test('Blockscout four-topic null padding normalizes without accepting interior missing topics',async()=>{
 const f=fixture();
 const padding=(interior:boolean):typeof fetch=>async(u,i)=>{
  const response=await f.fetcher(u,i);
  if(String(u).includes('action=getLogs')){const body=await response.json();for(const log of body.result)log.topics=interior?[log.topics[0],null,log.topics[2],null]:[...log.topics,null];return Response.json(body);}
  return response;
 };
 assert.equal((await createPoolLaunch({fetcher:padding(false)})('ethereum',token,pool)).status,'verified');
 assert.notEqual((await createPoolLaunch({fetcher:padding(true)})('ethereum',token,pool)).status,'verified');
});

test('canonical receipts expose an omitted indexed pool swap but unrelated anonymous logs are harmless',async()=>{
 const f=fixture();
 const extra=(missingPoolSwap:boolean):typeof fetch=>async(u,i)=>{
  const response=await f.fetcher(u,i);
  if(i?.body){const request=JSON.parse(String(i.body));if(request.method==='eth_getTransactionReceipt'&&request.params[0]===hash(1110)){
   const body=await response.json();body.result.logs.push(missingPoolSwap?swap(110,9):{address:other,topics:[],data:'0x'});return Response.json(body);
  }}
  return response;
 };
 assert.notEqual((await createPoolLaunch({fetcher:extra(true)})('ethereum',token,pool)).status,'verified');
 assert.equal((await createPoolLaunch({fetcher:extra(false)})('ethereum',token,pool)).status,'verified');
});

test('future finalized, creation and swap timestamps withhold timing proof beyond the 120-second tolerance',async()=>{
 const now=()=>1700000200*1000;
 for(const number of [200,100,110]){
  const result=await createPoolLaunch({fetcher:fixture({times:{[number]:1700000321}}).fetcher,now})('ethereum',token,pool);
  assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);
  assert(result.reasons.some(reason=>reason.includes('verification clock')));
 }
 const boundary=await createPoolLaunch({fetcher:fixture().fetcher,now:()=>1700000080*1000})('ethereum',token,pool);
 assert.equal(boundary.status,'verified');
});

test('nonmonotonic canonical block timestamps withhold the entire first-minute proof',async()=>{
 for(const times of [{100:1700000150},{110:1700000090},{170:1700000109}]){
  const result=await createPoolLaunch({fetcher:fixture({times}).fetcher,now:()=>1700000300*1000})('ethereum',token,pool);
  assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);
  assert(result.reasons.some(reason=>reason.includes('nonmonotonic')));
 }
});

test('corroborated validation clock does not rewrite retrieval time or block timestamps',async()=>{
 const result=await createPoolLaunch({fetcher:fixture().fetcher,now:()=>1600000000000})('ethereum',token,pool,{validationTime:1700000200000});
 assert.equal(result.status,'verified');assert.equal(result.proof?.verifiedAt,new Date(1600000000000).toISOString());
 assert.equal(result.proof?.firstSwapAt,new Date(1700000110000).toISOString());
});

test('RPC history recovers the exact swap range when explorer logs fail',async()=>{
 const f=fixture({logsFailure:true,rpcHistory:true});
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.trades.length,2);
});

test('indexed official factory events establish proof without explorer or historical contract state',async()=>{
 const f=fixture({explorerUnavailable:true,rpcHistory:true});
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.proof?.creation.blockNumber,100);assert.equal(result.trades.length,2);
 assert(f.calls.length<=60);
});

test('factory discovery without a matching creation event or receipt fails closed',async()=>{
 for(const missing of ['factory','receipt']){
  const f=fixture({explorerUnavailable:true,rpcHistory:true});
  const fetcher:typeof fetch=async(u,i)=>{
   if(i?.body){const q=JSON.parse(String(i.body));if(missing==='receipt'&&q.method==='eth_getTransactionReceipt')return Response.json({id:q.id,result:null});if(missing==='factory'&&q.method==='eth_getLogs'&&q.params[0].address!==pool)return Response.json({id:q.id,result:[]});}
   return f.fetcher(u,i);
  };
  const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
  assert.notEqual(result.status,'verified');assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);
 }
});

test('factory discovery resumes the remaining token-position query after a rate pause',async()=>{
 const f=fixture({explorerUnavailable:true,rpcHistory:true});let limited=true,factoryReads=0,codeReads=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getCode')codeReads++;
   if(q.method==='eth_getLogs'&&q.params[0].address!==pool){factoryReads++;if(limited&&q.params[0].address===factory&&q.params[0].topics[1]===null)return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});}
  }return f.fetcher(u,i);
 };
 const first=await createPoolLaunch({fetcher,now:()=>1700000300000,monotonic:()=>0})('ethereum',other,pool);
 assert.equal(first.proof,undefined);assert.equal(first.progress?.retryAfterMs,60000);
 assert.equal(first.checkpoint?.discovery?.pending[0].position,2);
 limited=false;factoryReads=0;
 const next=await createPoolLaunch({fetcher,now:()=>1700000360001,monotonic:()=>0})('ethereum',other,pool,{checkpoint:JSON.parse(JSON.stringify(first.checkpoint))});
 assert.equal(next.status,'verified');assert.equal(factoryReads,1);assert.equal(codeReads,0);
});

test('a checkpoint bound to another token is discarded instead of reusing its evidence',async()=>{
 const f=fixture(),first=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 const checkpoint=JSON.parse(JSON.stringify(first.checkpoint));checkpoint.token=other;f.calls.length=0;
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool,{checkpoint});
 assert.equal(result.status,'verified');assert(result.reasons.some(r=>r.includes('checkpoint was invalid')));
 assert(f.calls.some(u=>u.includes('action=getLogs')));
});

test('archive access failures give a safe configuration remedy without echoing credentials or provider error URLs',async()=>{
 const f=fixture({logsFailure:true});
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getLogs')return Response.json({id:q.id,error:{code:-32602,message:'Archive requests require a personal token. https://private.invalid/?key=do-not-leak'}},{status:400});}
  return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher,rpcUrls:{ethereum:'https://private.invalid/?key=secret-config'}})('ethereum',token,pool);
 assert.equal(result.proof,undefined);assert(result.reasons.some(r=>r.includes('authorized archive RPC')));
 assert(!JSON.stringify(result).includes('do-not-leak'));assert(!JSON.stringify(result).includes('secret-config'));assert(!JSON.stringify(result).includes('private.invalid'));
});

test('public RPC request limits remain distinct from archive authorization and do not trigger retries',async()=>{
 const f=fixture({logsFailure:true});let requests=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getLogs'){requests++;return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});}}
  return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.proof,undefined);assert.equal(requests,2);assert(result.reasons.some(r=>r.includes('rate limited')));
});

test('a process restart resumes after the last checked receipt without repeating completed log ranges',async()=>{
 const f=fixture();let blocked=true;const receiptCalls:string[]=[],saved:PoolCheckpoint[]=[];
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getTransactionReceipt'){receiptCalls.push(q.params[0]);if(blocked&&q.params[0]===hash(1170))return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});}}
  return f.fetcher(u,i);
 };
 const first=await createPoolLaunch({fetcher,now:()=>1700000300000,monotonic:()=>0})('ethereum',token,pool,{onCheckpoint:cp=>{saved.push(cp);}});
 assert.equal(first.proof,undefined);assert.equal(first.checkpoint?.receipts.length,1);
 assert(saved.some(cp=>cp.receipts.length===1));assert.equal(first.progress?.retryAfterMs,60000);
 blocked=false;receiptCalls.length=0;f.calls.length=0;
 const resumed=await createPoolLaunch({fetcher,now:()=>1700000360001,monotonic:()=>0})('ethereum',token,pool,{checkpoint:JSON.parse(JSON.stringify(first.checkpoint))});
 assert.equal(resumed.status,'verified');assert.equal(resumed.trades.length,2);
 assert(!receiptCalls.includes(hash(1110)));assert(receiptCalls.includes(hash(1170)));assert(!f.calls.some(u=>u.includes('action=getLogs')));
});

test('more than 64 first-minute transactions complete across bounded slices without partial timing proof',async()=>{
 const logs=Array.from({length:80},(_,i)=>({...swap(110,i+1),transactionHash:hash(2000+i)})),f=fixture({logs});
 let checkpoint:PoolCheckpoint|undefined,final;const statuses:string[]=[];
 for(let slice=0;slice<4;slice++){
  const before=f.calls.length;
  const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool,{checkpoint});
  assert(f.calls.length-before<=60);statuses.push(result.status);checkpoint=result.checkpoint;
  if(result.status==='verified'){final=result;break;}
  assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);assert(result.progress?.verifiedTransactions!>0);
 }
 assert.equal(statuses[0],'partial');assert(final);assert.equal(final.trades.length,80);
 assert.equal(new Set(final.trades.map(t=>t.id)).size,80);assert.equal(final.progress?.verifiedTransactions,80);
});

test('factory range subdivision and both indexed-token positions survive a rate interruption',async()=>{
 const f=fixture({explorerUnavailable:true,rpcHistory:true});let blocked=true;const successful:string[]=[];
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getLogs'&&q.params[0].address!==pool){
   const filter=q.params[0],from=Number(filter.fromBlock),to=Number(filter.toBlock);
   if(to-from>30)return Response.json({id:q.id,error:{code:-32005,message:'block range is too wide'}});
   if(blocked&&filter.address===factory&&filter.topics[1]===null&&from<=100&&to>=100)return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});
   successful.push(JSON.stringify(filter));
  }}return f.fetcher(u,i);
 };
 let checkpoint:PoolCheckpoint|undefined,partial;
 // Discovery may need several request-budget slices before reaching token1.
 for(let i=0;i<5;i++){partial=await createPoolLaunch({fetcher,now:()=>1700000300000,monotonic:()=>0})('ethereum',other,pool,{checkpoint});checkpoint=partial.checkpoint;if(partial.progress?.retryAfterMs)break;}
 assert(partial?.progress?.retryAfterMs);assert.equal(checkpoint?.discovery?.pending[0].position,2);
 const prior=new Set(successful);successful.length=0;blocked=false;
 const result=await createPoolLaunch({fetcher,now:()=>1700000360001,monotonic:()=>0})('ethereum',other,pool,{checkpoint:JSON.parse(JSON.stringify(checkpoint))});
 assert.equal(result.status,'verified');assert(successful.every(key=>!prior.has(key)));
});

test('a changed saved through-block resets logs and receipts before deriving a new proof',async()=>{
 const f=fixture(),first=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);let receiptReads=0;
 f.calls.length=0;
 const fetcher:typeof fetch=async(u,i)=>{
  const response=await f.fetcher(u,i);
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getTransactionReceipt')receiptReads++;
   if(q.method==='eth_getBlockByNumber'&&(q.params[0]==='finalized'||Number(q.params[0])===200)){const body=await response.json();body.result.hash=hash(9999);return Response.json(body);}
  }return response;
 };
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool,{checkpoint:first.checkpoint});
 assert.equal(result.status,'verified');assert(result.reasons.some(r=>r.includes('checkpoint history was discarded')));
 assert.equal(result.proof?.through.blockHash,hash(9999));assert(receiptReads>=3);assert(f.calls.some(u=>u.includes('action=getLogs')));
});

test('creation reorg mismatch invalidates persisted history and cannot reuse a prior proof',async()=>{
 const f=fixture(),first=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool);
 const fetcher:typeof fetch=async(u,i)=>{const response=await f.fetcher(u,i);if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_getBlockByNumber'&&Number(q.params[0])===100){const body=await response.json();body.result.hash=hash(8888);return Response.json(body);}}return response;};
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool,{checkpoint:first.checkpoint});
 assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);assert.equal(result.checkpoint?.receipts.length,0);assert.equal(result.checkpoint?.ranges.length,0);
});

test('unavailable decimals preserve exact raw units and timing without normalized token amounts',async()=>{
 const f=fixture();
 const fetcher:typeof fetch=async(u,i)=>{if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_call')return Response.json({id:q.id,error:{code:-32602,message:'historical state unavailable'}});}return f.fetcher(u,i);};
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.trades.length,2);
 assert(result.trades.every(t=>t.amount===undefined&&t.decimals===undefined&&t.amountRaw==='2000000'));
 assert(result.reasons.some(r=>r.includes('normalized token amounts are unknown')));
});

test('HTTP Retry-After numeric and date values use the validation clock and stop the slice',async()=>{
 for(const [header,expected] of [['120',120000],['Tue, 14 Nov 2023 22:18:10 GMT',90000]] as const){
  const f=fixture();let rpcLogs=0;
  const fetcher:typeof fetch=async(u,i)=>{if(String(u).includes('action=getLogs'))return new Response('limited',{status:429,headers:{'Retry-After':header}});if(i?.body&&JSON.parse(String(i.body)).method==='eth_getLogs')rpcLogs++;return f.fetcher(u,i);};
  const result=await createPoolLaunch({fetcher,now:()=>1600000000000,monotonic:()=>0})('ethereum',token,pool,{validationTime:1700000200000});
  assert.equal(result.proof,undefined);assert.equal(result.progress?.retryAfterMs,expected);assert.equal(rpcLogs,1);assert(result.checkpoint?.creation);
 }
});

test('a rate limit on optional decimals preserves complete timing proof and provides a cooldown',async()=>{
 const f=fixture();let decimalsFailed=false,callsAfter=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(decimalsFailed)callsAfter++;
  if(i?.body){const q=JSON.parse(String(i.body));if(q.method==='eth_call'){decimalsFailed=true;return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}},{headers:{'Retry-After':'120'}});}}
  return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher,now:()=>1700000300000,monotonic:()=>0})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(result.progress?.retryAfterMs,undefined);assert.equal(callsAfter,0);
 assert(result.providerIssues?.some(i=>i.family==='calls'&&i.kind==='rate'&&i.retryAfterMs===120000));
 assert(!result.reasons.some(r=>r.includes('rate limited')));assert(result.trades.every(t=>t.amount===undefined&&t.amountRaw==='2000000'));
 const later=await createPoolLaunch({fetcher:f.fetcher,now:()=>1700000420001,monotonic:()=>0})('ethereum',token,pool,{checkpoint:result.checkpoint});
 assert.equal(later.status,'verified');assert(later.trades.every(t=>t.amount===2&&t.decimals===6));
});

test('an unclosed minute or finalized history without a swap waits rather than repeating slices',async()=>{
 for(const options of [{head:160},{logs:[]}]){
  const result=await createPoolLaunch({fetcher:fixture(options).fetcher})('ethereum',token,pool);
  assert.equal(result.proof,undefined);assert.equal(result.progress?.retryable,false);assert.equal(result.progress?.retryAfterMs,60000);assert.equal(result.progress?.phase,'waiting-finalized-head');
 }
});

test('HTTP 200 explorer rate responses stop before alternate creation routes',async()=>{
 const f=fixture();let explorerCalls=0;
 const fetcher:typeof fetch=async(u,i)=>{if(!i?.body){explorerCalls++;return Response.json({status:'0',message:'request limit reached',result:[]},{headers:{'Retry-After':'90'}});}return f.fetcher(u,i);};
 const result=await createPoolLaunch({fetcher,monotonic:()=>0})('ethereum',token,pool);
 assert.equal(result.proof,undefined);assert.equal(explorerCalls,1);assert.equal(result.progress?.retryAfterMs,90000);
});

test('explorer metadata 429 does not block independently available RPC factory and swap history',async()=>{
 const f=fixture({rpcHistory:true});let explorerCalls=0;
 const fetcher:typeof fetch=async(u,i)=>{if(!i?.body){explorerCalls++;return new Response('limited',{status:429,headers:{'Retry-After':'120'}});}return f.fetcher(u,i);};
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(explorerCalls,1);assert.equal(result.progress?.retryAfterMs,undefined);
 assert(!result.reasons.some(r=>/rate.limit/i.test(r)));
});

test('primary header 429 can use a fixed independent explorer RPC after chain verification',async()=>{
 const f=fixture();let fallbackChainChecks=0,primaryLimitedCalls=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(i?.body){const q=JSON.parse(String(i.body)),fallback=String(u).endsWith('/api/eth-rpc');
   if(fallback&&q.method==='eth_chainId')fallbackChainChecks++;
   if(!fallback&&q.method==='eth_getBlockByNumber'){primaryLimitedCalls++;return new Response('limited',{status:429,headers:{'Retry-After':'120'}});}
  }return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.status,'verified');assert.equal(primaryLimitedCalls,1);assert.equal(fallbackChainChecks,1);
});

test('all providers denied withholds proof and a later slice skips an explorer origin still cooling down',async()=>{
 const f=fixture({rpcHistory:true});let limited=true,reference=1700000300000,explorerCalls=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(!i?.body){explorerCalls++;if(String(u).includes('action=getLogs'))return new Response('limited',{status:429,headers:{'Retry-After':'120'}});}
  if(i?.body){const q=JSON.parse(String(i.body));if(limited&&q.method==='eth_getLogs')return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});}
  return f.fetcher(u,i);
 };
 const first=await createPoolLaunch({fetcher,now:()=>reference,monotonic:()=>0})('ethereum',token,pool);
 assert.equal(first.proof,undefined);assert(first.checkpoint);assert.equal(first.progress?.retryAfterMs,60000);
 reference+=60001;limited=false;explorerCalls=0;
 const next=await createPoolLaunch({fetcher,now:()=>reference,monotonic:()=>0})('ethereum',token,pool,{checkpoint:JSON.parse(JSON.stringify(first.checkpoint))});
 assert.equal(next.status,'verified');assert.equal(explorerCalls,0);
});

test('a fallback on the wrong chain cannot supply a missing canonical header',async()=>{
 const f=fixture();
 const fetcher:typeof fetch=async(u,i)=>{if(i?.body){const q=JSON.parse(String(i.body));if(String(u).endsWith('/api/eth-rpc')&&q.method==='eth_chainId')return Response.json({id:q.id,result:'0x2105'});if(q.method==='eth_getBlockByNumber')return new Response('limited',{status:429});}return f.fetcher(u,i);};
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.proof,undefined);assert.deepEqual(result.trades,[]);
});

test('explorer origin cooldown prevents its RPC endpoint from bypassing a REST limit',async()=>{
 const f=fixture();let fallbackRequests=0,restRequests=0;
 const fetcher:typeof fetch=async(u,i)=>{
  if(!i?.body){restRequests++;return new Response('limited',{status:429,headers:{'Retry-After':'120'}});}
  if(String(u).endsWith('/api/eth-rpc'))fallbackRequests++;
  const q=JSON.parse(String(i.body));if(q.method==='eth_getLogs')return Response.json({id:q.id,error:{code:-32011,message:'request limit reached'}});
  return f.fetcher(u,i);
 };
 const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
 assert.equal(result.proof,undefined);assert.equal(restRequests,1);assert.equal(fallbackRequests,0);
});

test('persisted cooldowns reject invalid or incomparable clock values without network requests',async()=>{
 const f=fixture(),first=await createPoolLaunch({fetcher:f.fetcher,now:()=>1700000300000})('ethereum',token,pool);
 for(const values of [{recordedAt:1700000300000,until:1700000300000+31*86400000},{recordedAt:1700000600000,until:1700000660000}]){
  const checkpoint=JSON.parse(JSON.stringify(first.checkpoint));checkpoint.providerState=[{provider:'blockscout',family:'*',kind:'rate',basis:'validation-reference',...values}];f.calls.length=0;
  const result=await createPoolLaunch({fetcher:f.fetcher,now:()=>1700000300000})('ethereum',token,pool,{checkpoint});
  assert.equal(result.proof,undefined);assert.equal(f.calls.length,0);
 }
});

test('creation hints skip metadata but cannot bypass canonical factory authentication',async()=>{
 const f=fixture();
 const result=await createPoolLaunch({fetcher:f.fetcher})('ethereum',token,pool,{creationTransactionHint:hash(999)});
 assert.equal(result.status,'verified');assert(!f.calls.some(u=>u.includes('/api/v2/addresses/')||u.includes('getcontractcreation')));
 for(const hint of [hash(1110),'not-a-transaction']){
  const bad=fixture({factory:sender});
  const rejected=await createPoolLaunch({fetcher:bad.fetcher})('ethereum',token,pool,{creationTransactionHint:hint});
  assert.equal(rejected.proof,undefined);assert.deepEqual(rejected.trades,[]);
 }
});

test('exported factory decoder recognizes official Base V2 and rejects cross-chain or foreign factories',()=>{
 const event=parseAbiItem('event PairCreated(address indexed token0,address indexed token1,address pair,uint256 count)');
 const log={...fixture().creation,address:SUPPORTED_POOL_FACTORIES.base.v2,topics:encodeEventTopics({abi:[event],eventName:'PairCreated',args:{token0:token,token1:other}}),data:encodeAbiParameters([{type:'address'},{type:'uint256'}],[pool,1n])};
 const decoded=decodePoolCreationEvent('base',log);
 assert.equal(decoded?.protocol,'v2');assert.equal(decoded?.pool,pool);assert.equal(decoded?.transaction,hash(999));
 assert.equal(decodePoolCreationEvent('ethereum',log),undefined);assert.equal(decodePoolCreationEvent('base',{...log,address:sender}),undefined);
});

test('a fallback chain check never authenticates unchecked primary evidence',async()=>{
 for(const failedChain of ['unavailable','wrong']){
  const f=fixture();let primaryEvidence=0;
  const fetcher:typeof fetch=async(u,i)=>{
   if(i?.body&&!String(u).endsWith('/api/eth-rpc')){const q=JSON.parse(String(i.body));
    if(q.method==='eth_chainId')return Response.json(failedChain==='wrong'?{id:q.id,result:'0x2105'}:{id:q.id,error:{code:-32000,message:'unavailable'}});
    primaryEvidence++;
   }return f.fetcher(u,i);
  };
  const result=await createPoolLaunch({fetcher})('ethereum',token,pool);
  assert.equal(result.status,'verified');assert.equal(primaryEvidence,0);assert(result.trades.every(t=>t.amount===undefined));
 }
});
