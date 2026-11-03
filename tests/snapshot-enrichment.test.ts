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
