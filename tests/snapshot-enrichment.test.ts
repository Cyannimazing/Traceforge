import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {createSnapshotEnrichment} from '../src/lib/snapshot-enrichment';
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
