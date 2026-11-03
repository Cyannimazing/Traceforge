import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceClock} from '../src/lib/evidence-clock';
const local=Date.UTC(2026,10,1,12),remote=local+3*3600_000;
const body=(url:string)=>url.includes('blockscout')?{total_blocks:'22000000'}:{jsonrpc:'2.0',id:1,result:url.includes('solana')?'ok':'0x1'};
function response(url:string,time=remote,headers:Record<string,string>={},payload:unknown=body(url)) {return new Response(JSON.stringify(payload),{headers:{Date:new Date(time).toUTCString(),'CF-Cache-Status':'DYNAMIC',...headers}});}
test('corroborated provider reference preserves local capture and tolerates one outlier',async()=>{
 const clock=createEvidenceClock({now:()=>local,monotonic:()=>0,fetcher:async u=>response(String(u),String(u).includes('blockscout')?remote+600_000:remote)});
 const result=await clock();assert.equal(result.basis,'provider-quorum');assert.equal(result.sources.length,2);assert.equal(result.referenceAt,new Date(remote).toISOString());assert.equal(result.localCapturedAt,new Date(local).toISOString());assert.equal(result.offsetMs,3*3600_000);
});
test('cached, malformed age, invalid body and slow responses cannot establish quorum',async()=>{
 for(const [headers,payload] of [[{'CF-Cache-Status':'HIT'},undefined],[{Age:'1'},undefined],[{Age:'-1'},undefined],[{Age:'0, 0'},undefined],[{},{}]] as [Record<string,string>,unknown][]){
  const clock=createEvidenceClock({now:()=>local,monotonic:()=>0,fetcher:async u=>response(String(u),remote,headers,payload===undefined?body(String(u)):payload)});
  assert.equal((await clock()).basis,'local');
 }
 let mono=0;const slow=createEvidenceClock({now:()=>local,monotonic:()=>mono,fetcher:async u=>{mono+=6000;return response(String(u));}});assert.equal((await slow()).basis,'local');
});
test('cache advances only on monotonic time and expires after sixty seconds',async()=>{
 let mono=0,wall=local,calls=0,fail=false;
 const clock=createEvidenceClock({now:()=>wall,monotonic:()=>mono,fetcher:async u=>{calls++;if(fail)throw Error('offline');return response(String(u));}});
 await clock();wall+=3600_000;mono=1000;const next=await clock();assert.equal(calls,3);assert.equal(Date.parse(next.referenceAt),remote+1000);assert.equal(next.offsetMs,2*3600_000+1000);
 fail=true;mono=60_000;assert.equal((await clock()).basis,'local');assert.equal(calls,6);
});
test('ambiguous quorums, extreme offsets and missing dates fail closed',async()=>{
 for(const times of [[remote,remote+4000,remote+8000],[local+2*86_400_000,local+2*86_400_000,local+2*86_400_000]]){
  let i=0;const clock=createEvidenceClock({now:()=>local,monotonic:()=>0,fetcher:async u=>response(String(u),times[i++])});assert.equal((await clock()).basis,'local');
 }
 const invalid=createEvidenceClock({now:()=>local,fetcher:async()=>new Response('{}')});assert.equal((await invalid()).basis,'local');
});
test('pre-cancelled clock lookup makes no requests',async()=>{
 const controller=new AbortController();controller.abort();let calls=0;const clock=createEvidenceClock({fetcher:async()=>{calls++;return new Response('{}');}});
 await assert.rejects(()=>clock({signal:controller.signal}));assert.equal(calls,0);
});

test('intermediary cache hits are excluded even without a Cloudflare hit',async()=>{
 for(const headers of [{'Cache-Status':'proxy; hit'},{'X-Cache':'HIT from proxy'},{'X-Cache-Status':'REVALIDATED'},{'X-Proxy-Cache':'STALE'}] as Record<string,string>[]){
  const clock=createEvidenceClock({now:()=>local,monotonic:()=>0,fetcher:async u=>response(String(u),remote,headers)});
  const result=await clock();assert.equal(result.basis,'local');assert.equal(result.excluded?.length,3);
 }
});
