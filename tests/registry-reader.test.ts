import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegistryReader} from '../src/lib/registry-reader';
const range={from:1,to:10,address:'0x'+'1'.repeat(40),topics:['0x'+'2'.repeat(64)]};
test('registry RPC empty logs attest only the exact successful range; missing results fail closed',async()=>{
 const reader=createRegistryReader({fetcher:async(_u,init)=>{const q=JSON.parse(String(init?.body));return Response.json({id:q.id,result:[]});}});
 assert.equal((await reader.logs('ethereum',range)).through,10);
 const unavailable=createRegistryReader({fetcher:async()=>Response.json({id:1,result:null})});await assert.rejects(()=>unavailable.logs('ethereum',range),/did not supply/);
});
test('registry rate limits stop repeated calls and range caps require subdivision',async()=>{
 let calls=0;const reader=createRegistryReader({fetcher:async()=>{calls++;return new Response('{}',{status:429,headers:{'Retry-After':'60'}});}});
 await assert.rejects(()=>reader.logs('ethereum',range),/rate limit/);await assert.rejects(()=>reader.logs('ethereum',range),/cooldown/);assert.equal(calls,1);
 const large=createRegistryReader({fetcher:async()=>Response.json({id:1,error:{message:'block range is too large'}})});await assert.rejects(()=>large.logs('ethereum',range),(e:any)=>e.rangeTooLarge===true);
});
test('independent archive results must supply their own covered cursor; RPC network mismatch is rejected',async()=>{
 const reader=createRegistryReader({alternativeLogs:async()=>({logs:[],through:5,source:'archive'}),fetcher:async()=>{throw Error('should not call');}});assert.equal((await reader.logs('ethereum',range)).through,5);
 const wrong=createRegistryReader({fetcher:async()=>Response.json({id:1,result:'0x2105'})});await assert.rejects(()=>wrong.head('ethereum'),/chain mismatch/);
});
test('fallback failure preserves the alternative provider cooldown for durable scheduling',async()=>{
 const reader=createRegistryReader({alternativeLogs:async()=>{throw Object.assign(Error('rate'),{retryAfterMs:90000});},fetcher:async()=>Response.json({id:1,error:{message:'historical record unavailable'}})});
 await assert.rejects(()=>reader.logs('ethereum',range),(error:any)=>error.retryAfterMs===90000);
});
test('HTTP origin cooldown applies to headers too and honors date-form Retry-After',async()=>{
 let calls=0;const reader=createRegistryReader({fetcher:async()=>{calls++;return new Response('{}',{status:429,headers:{Date:'Sun, 01 Nov 2026 10:00:00 GMT','Retry-After':'Sun, 01 Nov 2026 10:02:00 GMT'}});}});
 await assert.rejects(()=>reader.logs('ethereum',range),(e:any)=>e.retryAfterMs===120000);await assert.rejects(()=>reader.head('ethereum'),/cooldown/);assert.equal(calls,1);
});
