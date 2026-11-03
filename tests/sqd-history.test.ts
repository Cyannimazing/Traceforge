import {test} from 'node:test';
import assert from 'node:assert/strict';
import {queryEvmHistory} from '../src/lib/sqd-history';
const hash=(n:string)=>'0x'+n.repeat(64),address='0x'+'1'.repeat(40),sender='0x'+'2'.repeat(40),topic=hash('a'),txhash=hash('b');
const request={fromBlock:10,toBlock:20,logs:[{address:[address],topic0:[topic]}]};
const block=(number:number,withLog=false)=>({header:{number,hash:hash('c'),parentHash:hash('d'),timestamp:1700000000+number},logs:withLog?[{address,topics:[topic],data:'0x',logIndex:0,transactionIndex:1,transactionHash:txhash}]:[],transactions:withLog?[{hash:txhash,from:sender,status:1,transactionIndex:1}]:[]});
const response=(rows:unknown[])=>new Response(rows.map(row=>JSON.stringify(row)).join('\n')+'\n',{headers:{'Content-Type':'application/jsonl'}});
test('finalized boundary witnesses produce exact coverage and canonical joined log/transaction scope',async()=>{
 let body:any,url='';const result=await queryEvmHistory('ethereum',request,{fetcher:async(input,init)=>{url=String(input);body=JSON.parse(String(init?.body));return response([block(10),block(15,true),block(20)]);}});
 assert.equal(url,'https://portal.sqd.dev/datasets/ethereum-mainnet/finalized-stream');assert.equal(body.logs[0].transaction,true);assert.equal(result.through,20);assert.equal(result.complete,true);assert.equal(result.transactionLogsComplete,false);assert.equal(result.logs[0].blockNumber,15);assert.equal(result.transactions[0].from,sender);assert.equal(result.nextBlock,21);
});
test('clean early EOF retains only proved prefix; empty body and204 never claim completion',async()=>{
 const partial=await queryEvmHistory('base',request,{fetcher:async()=>response([block(10),block(15,true)])});assert.equal(partial.complete,false);assert.equal(partial.through,15);assert.equal(partial.nextBlock,16);
 for(const res of [response([]),new Response(null,{status:204})]){const result=await queryEvmHistory('base',request,{fetcher:async()=>res});assert.equal(result.through,null);assert.equal(result.complete,false);assert.equal(result.nextBlock,10);}
});
test('schema, missing start boundary, ordering, removed logs and cross-transaction contamination fail closed',async()=>{
 const variants=[()=>[block(11),block(20)],()=>[block(10),block(9)],()=>[{...block(10),header:{...block(10).header,number:10.5}}],()=>[{...block(10,true),logs:[{...block(10,true).logs[0],removed:true}]}],()=>[{...block(10,true),transactions:[{...block(10,true).transactions[0],hash:hash('f')}]}],()=>[{...block(10,true),logs:[{...block(10,true).logs[0],address:sender}]}]];
 for(const variant of variants){const result=await queryEvmHistory('ethereum',request,{fetcher:async()=>response(variant())});assert.equal(result.status,'invalid');assert.equal(result.through,null);assert.equal(result.logs.length,0);}
 const broken=await queryEvmHistory('ethereum',request,{fetcher:async()=>new Response(JSON.stringify(block(10))+'\n{broken',{headers:{'Content-Type':'application/jsonl'}})});assert.equal(broken.status,'invalid');assert.equal(broken.through,null);
});
test('documented one-block all-transaction mode exposes complete log capability only after full success',async()=>{
 let body:any;const result=await queryEvmHistory('ethereum',{...request,toBlock:10,includeAllTransactions:true},{fetcher:async(_url,init)=>{body=JSON.parse(String(init?.body));return response([block(10,true)]);}});
 assert.deepEqual(body.transactions,[{logs:true}]);assert.equal(result.transactionLogsComplete,true);assert.equal(result.complete,true);
 await assert.rejects(()=>queryEvmHistory('ethereum',{...request,includeAllTransactions:true}),/single block/);
});
test('rate limits exposeRetryAfter without retry, while HTTP failures never return empty complete ranges',async()=>{
 let calls=0;for(const code of [429,529]){const result=await queryEvmHistory('ethereum',request,{fetcher:async()=>{calls++;return new Response('{}',{status:code,headers:{'Retry-After':'120'}});}});assert.equal(result.status,'rate-limited');assert.equal(result.retryAfterMs,120000);assert.equal(result.through,null);}assert.equal(calls,2);
 const denied=await queryEvmHistory('base',request,{fetcher:async()=>new Response('denied',{status:403})});assert.equal(denied.status,'unavailable');assert.equal(denied.complete,false);
});
test('response cap, timed-out streams and explicit cancellation cannot advance coverage',async()=>{
 const tooLarge=await queryEvmHistory('ethereum',request,{fetcher:async()=>new Response(' '.repeat(2*1024*1024+1))});assert.equal(tooLarge.status,'response-limit');assert.equal(tooLarge.through,null);
 const timeout=await queryEvmHistory('ethereum',request,{fetcher:async()=>{throw new DOMException('timedout','TimeoutError');}});assert.equal(timeout.status,'unavailable');
 const abort=new AbortController();abort.abort();let called=false;await assert.rejects(()=>queryEvmHistory('ethereum',request,{signal:abort.signal,fetcher:async()=>{called=true;return response([]);}}));assert.equal(called,false);
});
test('request bounds and selectors are validated before any outbound query',async()=>{
 for(const value of [{...request,fromBlock:-1},{...request,toBlock:9},{...request,logs:[{address:['bad'],topic0:[topic]}]},{...request,logs:[{address:[address],topic0:[]}]}])await assert.rejects(()=>queryEvmHistory('ethereum',value),/Invalid/);
});
test('full block mode keeps other transaction logs, while missing status and parent conflicts fail closed',async()=>{
 const other=block(10,true);other.logs[0].address=sender;
 const full=await queryEvmHistory('ethereum',{...request,toBlock:10,includeAllTransactions:true},{fetcher:async()=>response([other])});assert.equal(full.transactionLogsComplete,true);assert.equal(full.logs[0].address,sender);
 const missing={...block(10,true),transactions:[{hash:txhash,from:sender,transactionIndex:1}]};
 for(const rows of [[missing],[block(10),block(11)]]){const invalid=await queryEvmHistory('ethereum',request,{fetcher:async()=>response(rows)});assert.equal(invalid.status,'invalid');assert.equal(invalid.through,null);}
 const wrongParent=await queryEvmHistory('ethereum',{...request,parentBlockHash:hash('f')},{fetcher:async()=>response([block(10)])});assert.equal(wrongParent.status,'invalid');
 const gap=await queryEvmHistory('ethereum',{...request,includeAllBlocks:true},{fetcher:async()=>response([block(10),block(20)])});assert.equal(gap.status,'invalid');
});
test('transport errors remain retryable unavailable and cancellation during streaming propagates',async()=>{
 const network=await queryEvmHistory('ethereum',request,{fetcher:async()=>{throw new TypeError('fetch failed');}});assert.equal(network.status,'unavailable');
 const controller=new AbortController();let pulls=0;
 const body=new ReadableStream<Uint8Array>({pull(stream){if(pulls++===0)stream.enqueue(new TextEncoder().encode(JSON.stringify(block(10))+'\n'));else{controller.abort();stream.close();}}});
 await assert.rejects(()=>queryEvmHistory('ethereum',request,{signal:controller.signal,fetcher:async()=>new Response(body)}));
});
