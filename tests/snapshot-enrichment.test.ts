import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {createSnapshotEnrichment} from '../src/lib/snapshot-enrichment';
const fastScheduler=()=>{let clock=0;return {now:()=>clock,wait:async(ms:number,signal:AbortSignal)=>{signal.throwIfAborted();clock+=ms;}};};
test('cancellation during qualified pacing stops queued RPC work promptly',async()=>{
 const controller=new AbortController();let calls=0;const scheduler={now:()=>0,wait:async(_ms:number,signal:AbortSignal)=>{controller.abort(Error('cancelled'));signal.throwIfAborted();}};
 const run=createSnapshotEnrichment({rpcUrls:{robinhood:'https://rpc.example.test'},activityScheduler:scheduler,fetcher:async()=>{calls++;throw Error('Unexpected network call');}});
 await assert.rejects(()=>run({...fixtureReport,chain:'robinhood'},{signal:controller.signal,activityScope:{kind:'pons-creation-ledger',maxAddresses:239}}),/cancelled/);assert.equal(calls,0);
});
test('qualified Robinhood enrichment batches the entire holder set and matches unordered response IDs',async()=>{
 const now=Date.parse('2026-11-04T02:00:00Z'),hash='0x'+'1'.repeat(64),scheduler=fastScheduler();let batches=0,active=0,peak=0;
 const holders=Array.from({length:239},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),share:.1,contract:false,locked:null,tag:''}));
 const run=createSnapshotEnrichment({now:()=>now,activityScheduler:scheduler,rpcUrls:{robinhood:'https://rpc.example.test'},fetcher:async(_url,init)=>{
  const q=JSON.parse(String(init?.body));const answer=(r:{id:number;method:string;params:unknown[]})=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?'0x1237':r.method==='eth_getBlockByNumber'?{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)}:r.method==='eth_getCode'?'0x':r.method==='eth_getTransactionCount'?'0x2':null});
  if(Array.isArray(q)){batches++;peak=Math.max(peak,++active);assert(q.length<=10);await new Promise(resolve=>setTimeout(resolve,1));active--;return new Response(JSON.stringify(q.map(answer).reverse()));}
  return new Response(JSON.stringify(answer(q)));
 }});
 const r=await run({...fixtureReport,chain:'robinhood',market:null,holders},{activityScope:{kind:'pons-creation-ledger',maxAddresses:239}});
 assert.equal(batches,48);assert.equal(peak,1);assert.equal(r.walletActivity?.wallets.length,239);assert.equal(r.walletActivity?.readableAccounts,239);assert.equal(r.walletActivity?.truncated,false);assert(r.walletActivity?.wallets.every(w=>w.count===2&&w.fresh===null));assert(scheduler.now()>=239*40*4,'code+nonce CU cost must be paced, not burst');assert(scheduler.now()<60000,'the qualified stage fits its bounded sixty-second budget before network latency');
});

test('Robinhood batch throttling stops new batches and never promotes an unchecked anchor',async()=>{
 const now=Date.parse('2026-11-04T02:00:00Z'),hash='0x'+'1'.repeat(64);let batches=0;
 const holders=Array.from({length:239},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),share:.1,contract:false,locked:null,tag:''}));
 const run=createSnapshotEnrichment({now:()=>now,activityScheduler:fastScheduler(),rpcUrls:{robinhood:'https://rpc.example.test'},fetcher:async(_url,init)=>{const q=JSON.parse(String(init?.body));if(Array.isArray(q)){batches++;return new Response('Limited',{status:429});}return new Response(JSON.stringify({id:q.id,result:q.method==='eth_chainId'?'0x1237':q.method==='eth_getBlockByNumber'?{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)}:null}));}});
 const r=await run({...fixtureReport,chain:'robinhood',market:null,holders},{activityScope:{kind:'pons-creation-ledger',maxAddresses:239}});assert(batches<=2);assert.equal(r.walletActivity?.wallets.length,239);assert(r.walletActivity?.wallets.every(w=>w.count===null));assert.equal(r.walletActivity?.failure,'rate-limit');
});
test('missing and duplicate batch IDs cannot borrow another wallet nonce',async()=>{
 const now=Date.parse('2026-11-04T02:00:00Z'),hash='0x'+'1'.repeat(64),holders=[1,2,3].map(i=>({address:'0x'+i.toString(16).padStart(40,'0'),share:1,contract:false,locked:null,tag:''}));
 const run=createSnapshotEnrichment({now:()=>now,activityScheduler:fastScheduler(),rpcUrls:{robinhood:'https://rpc.example.test'},fetcher:async(_url,init)=>{const q=JSON.parse(String(init?.body));if(Array.isArray(q)){const rows=q.map(r=>({jsonrpc:'2.0',id:r.id,result:r.method==='eth_getCode'?'0x':'0x2'}));rows.splice(1,1);rows.push({...rows[2]});return new Response(JSON.stringify(rows));}return new Response(JSON.stringify({id:q.id,result:q.method==='eth_chainId'?'0x1237':q.method==='eth_getBlockByNumber'?{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)}:null}));}});
 const r=await run({...fixtureReport,chain:'robinhood',market:null,holders},{activityScope:{kind:'pons-creation-ledger',maxAddresses:3}});assert.deepEqual(r.walletActivity?.wallets.map(w=>w.count),[null,null,2]);
});
test('bounded batch envelopes reject oversized data and invalid version or ID types, and stop on RPC throughput limits',async()=>{
 for(const failure of ['version','id','bytes','rows','rpc-rate','throughput'] as const){
  const now=Date.parse('2026-11-04T02:00:00Z'),hash='0x'+'1'.repeat(64);let batches=0;
  const holders=Array.from({length:failure==='rpc-rate'||failure==='throughput'?239:3},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),share:.1,contract:false,locked:null,tag:''}));
  const run=createSnapshotEnrichment({now:()=>now,activityScheduler:fastScheduler(),rpcUrls:{robinhood:'https://rpc.example.test'},fetcher:async(_url,init)=>{const q=JSON.parse(String(init?.body));if(Array.isArray(q)){batches++;if(failure==='bytes')return new Response(' '.repeat(1048577));if(failure==='rpc-rate'||failure==='throughput')return new Response(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:failure==='rpc-rate'?-32005:-32600,message:'Throughput compute units exceeded'}}));const rows=q.map(r=>({jsonrpc:failure==='version'?'1.0':'2.0',id:failure==='id'?String(r.id):r.id,result:r.method==='eth_getCode'?'0x':'0x1'}));if(failure==='rows')rows.push(rows[0]);return new Response(JSON.stringify(rows));}return new Response(JSON.stringify({id:q.id,result:q.method==='eth_chainId'?'0x1237':q.method==='eth_getBlockByNumber'?{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)}:null}));}});
  const r=await run({...fixtureReport,chain:'robinhood',market:null,holders},{activityScope:{kind:'pons-creation-ledger',maxAddresses:holders.length}});assert(batches<=2);assert(r.walletActivity?.wallets.every(w=>w.count===null));
 }
});
test('no configured endpoint preserves unknown and does not issue a request',async()=>{
 let calls=0;const run=createSnapshotEnrichment({fetcher:async()=>{calls++;throw Error('unexpected');}});
 const r=await run(fixtureReport,{});assert.equal(calls,0);assert.equal(r.walletActivity,undefined);assert.equal(r.controlProbes,undefined);
});
test('configured Solana enrichment fetches bounded activity and never sends transactions',async()=>{
 const methods:string[]=[];const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{const q=JSON.parse(String(init?.body));methods.push(q.method);return new Response(JSON.stringify({jsonrpc:'2.0',id:q.id,result:[]}));}});
 const r=await run(report,{});assert.deepEqual(methods,['getSignaturesForAddress']);assert.equal(r.walletActivity?.wallets[0].fresh,null);assert.equal(r.controlProbes,undefined);
});
test('malformed and provider errors are not fabricated clean observations',async()=>{
 const run=createSnapshotEnrichment({rpcUrls:{ethereum:'https://rpc.example.test'},fetcher:async()=>new Response(JSON.stringify({error:{message:'private endpoint refused'}}))});
 const r=await run({...fixtureReport,chain:'ethereum'},{});assert.equal(r.controlProbes?.status,'unavailable');assert(r.walletActivity?.wallets.every(w=>w.fresh===null));assert(!JSON.stringify(r).includes('private endpoint refused'));
});

test('one temporary rate limit is retried within the bounded scan without inventing observations',async()=>{
 let calls=0;const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{calls++;const q=JSON.parse(String(init?.body));return calls===1?new Response('Rate limited',{status:429}):new Response(JSON.stringify({id:q.id,result:[]}));}});
 const r=await run(report);assert.equal(calls,2);assert.equal(r.walletActivity?.wallets[0].count,0);assert.equal(r.walletActivity?.wallets[0].fresh,null);
});

test('Solana activity requests are paced across concurrent enrichments instead of bursting',async()=>{
 let active=0,peak=0;const starts:number[]=[];
 const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{starts.push(Date.now());peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,20));active--;const q=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:q.id,result:[]}));}});
 await Promise.all([run(report),run(report)]);assert.equal(peak,1);assert(starts[1]-starts[0]>=200,'signature starts must be paced');
});

test('JSON-RPC rate limits are retried and HTTP Retry-After is respected',async()=>{
 for(const rpcError of [true,false]){
  const starts:number[]=[];const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
  const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{const q=JSON.parse(String(init?.body));starts.push(Date.now());if(starts.length===1)return rpcError?new Response(JSON.stringify({id:q.id,error:{code:429}})):new Response('Rate limit',{status:429,headers:{'retry-after':'1'}});return new Response(JSON.stringify({id:q.id,result:[]}));}});
  const result=await run(report);assert.equal(starts.length,2);assert(starts[1]-starts[0]>=950);assert.equal(result.walletActivity?.wallets[0].count,0);
 }
});

test('persistent rate limiting stops at the scan deadline and retains an explicit unknown reason',async()=>{
 let calls=0;const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({timeoutMs:100,rpcUrls:{solana:'https://rpc.example.test'},fetcher:async()=>{calls++;return new Response('Rate limit',{status:429,headers:{'retry-after':'10'}});}});
 const result=await run(report);assert.equal(calls,1);assert.equal(result.walletActivity?.wallets[0].count,null);assert.match(result.walletActivity!.wallets[0].reason,/rate limit|deadline/i);
});

test('finalized nonfresh proofs cache for five minutes with original timestamps and no mutable leaks',async()=>{
 let now=Date.parse('2026-11-03T00:00:00Z'),calls=0;
 const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const rows=Array.from({length:11},(_,i)=>({signature:'1'.repeat(63)+'ABCDEFGHJKL'[i],slot:100-i,confirmationStatus:'finalized'}));
 const run=createSnapshotEnrichment({now:()=>now,rpcUrls:{solana:'https://rpc.example.test',ethereum:'https://evm.example.test'},fetcher:async(_url,init)=>{calls++;const q=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:q.id,result:rows}));}});
 const first=await run(report);const original=first.walletActivity!.observedAt;first.walletActivity!.wallets[0].count=999;
 now+=60_000;const cached=await run(report);assert.equal(calls,1);assert.equal(cached.walletActivity?.wallets[0].count,11);assert.equal(cached.walletActivity?.observedAt,original);assert.equal(cached.walletActivity?.wallets[0].observedAt,original);
 cached.walletActivity!.wallets[0].count=555;assert.equal((await run(report)).walletActivity?.wallets[0].count,11);
 const controller=new AbortController();controller.abort();await assert.rejects(()=>run(report,{signal:controller.signal}));assert.equal(calls,1);
 await run({...report,chain:'ethereum'});assert(calls>1,'other chains must not use Solana proofs');
 const beforeExpiry=calls;now+=240_001;await run(report);assert.equal(calls,beforeExpiry+1,'expired proof must be retrieved again');
});

test('short Solana pages are not cached as verified nonfresh history',async()=>{
 let calls=0;const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{calls++;const q=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:q.id,result:[]}));}});
 await run(report);await run(report);assert.equal(calls,2);
});

test('a scan cancelled while queued exits promptly without sending another request',async()=>{
 let calls=0;const report={...fixtureReport,chain:'solana' as const,holders:[{address:'So11111111111111111111111111111111111111112',share:5,tag:'',locked:null,contract:false}]};
 const run=createSnapshotEnrichment({rpcUrls:{solana:'https://rpc.example.test'},fetcher:async(_url,init)=>{calls++;await new Promise(resolve=>setTimeout(resolve,250));const q=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:q.id,result:[]}));}});
 const first=run(report),controller=new AbortController(),second=run(report,{signal:controller.signal});controller.abort();
 const settled=assert.rejects(()=>second).then(()=>true);assert.equal(await Promise.race([settled,new Promise(resolve=>setTimeout(()=>resolve(false),100))]),true);
 await first;assert.equal(calls,1);
});
