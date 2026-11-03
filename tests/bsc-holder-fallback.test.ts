import test from 'node:test';import assert from 'node:assert/strict';
import {createBscHolderFallback} from '../src/lib/bsc-holder-fallback';
import type {Report} from '../src/lib/analysis';
const token='0x'+'1'.repeat(40),creator='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0'),topic=(a:string)=>'0x'+a.slice(2).padStart(64,'0');
const report={chain:'bsc',token,holders:[],identities:[{address:creator,role:'creator'}]} as unknown as Report;
const log={address:token,removed:false,topics:[transfer,topic(creator),topic(other)],data:word(1n),transactionHash:hash,blockNumber:'0xff'};
function mock(options:{logs?:unknown;failBalance?:boolean;reorg?:boolean;chain?:string;timestamp?:string;otherBalance?:bigint}={}){const calls:any[]=[];let heads=0;const fetcher:typeof fetch=async(_,init)=>{const raw=JSON.parse(String(init?.body)),requests=Array.isArray(raw)?raw:[raw];const responses=requests.map((r:any)=>{calls.push(r);let result:unknown;if(r.method==='eth_chainId')result=options.chain||'0x38';else if(r.method==='eth_getBlockByNumber')result={number:'0x100',timestamp:options.timestamp||'0x6553f100',hash:options.reorg&&++heads>1?'0x'+'b'.repeat(64):hash};else if(r.method==='eth_getLogs')result=options.logs??[log,log];else if(r.params[0].data==='0x18160ddd')result=word(1000n*10n**18n);else if(r.params[0].data==='0x313ce567')result=word(18n);else if(r.params[0].data.endsWith(other.slice(2))&&options.failBalance)return {id:r.id,error:{code:-1}};else result=word((r.params[0].data.endsWith(creator.slice(2))?880n:(options.otherBalance??120n))*10n**18n);return {jsonrpc:'2.0',id:r.id,result};});return Response.json(Array.isArray(raw)?responses:responses[0]);};return {fetcher,calls,now:()=>1700000000000};}
test('recovers nonzero sampled BSC holders and preserves exact balances with one finalized anchor',async()=>{
 const m=mock(),r=await createBscHolderFallback(m)(report);assert.equal(r.holders?.length,2);assert.equal(r.holders?.[0].share,88);assert.equal(r.snapshot?.balances[0].amountRaw,'880000000000000000000');assert.equal(r.holderCount,null);assert.equal(r.truncated,true);assert.equal(r.trades.length,0);assert.equal(r.transfers.length,0);assert.equal(r.totalSupply,1000);assert.equal(m.calls.filter(c=>c.method==='eth_call'&&c.params[0].data.startsWith('0x70a08231')).length,2);assert.ok(m.calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x100'));
});
test('missing logs still verify known creator; failed balances do not become zero',async()=>{
 const failedLogs=await createBscHolderFallback(mock({logs:{error:'not available'}}))(report);assert.equal(failedLogs.holders?.length,1);assert.match(failedLogs.reasons.join(' '),/logs were unavailable/);
 const r=await createBscHolderFallback(mock({failBalance:true}))(report);assert.equal(r.holders?.length,1);assert.match(r.reasons.join(' '),/1 reads unavailable/);assert.equal(r.holderCount,null);
});
test('removed, wrong token and malformed candidate logs are ignored',async()=>{
 const logs=[{...log,removed:true},{...log,address:other},{...log,topics:[transfer,'bad',topic(other)]},{...log,blockNumber:'0x101'}];const r=await createBscHolderFallback(mock({logs}))(report);assert.equal(r.holders?.length,1);
 assert.match(r.reasons.join(' '),/4 invalid or removed rows/);
});
test('known dead holder is labeled but ordinary addresses are not excluded',async()=>{
 const dead='0x000000000000000000000000000000000000dead';const r=await createBscHolderFallback(mock({logs:[{...log,topics:[transfer,topic(creator),topic(dead)]}]}))(report);
 assert.equal(r.holders?.length,2);assert.deepEqual(r.labels.map(l=>[l.address,l.category]),[[dead,'burn']]);assert.equal(r.holders?.find(h=>h.address===creator)?.share,88);
});
test('inconsistent aggregate supply and stale or future finalized heads are rejected',async()=>{
 for(const options of [{otherBalance:121n},{otherBalance:1001n},{timestamp:'0x'+(1700000000-901).toString(16)},{timestamp:'0x'+(1700000000+121).toString(16)}]){
  const r=await createBscHolderFallback(mock(options))(report);assert.equal(r.holders?.length,0);assert.equal(r.snapshot,undefined);assert.equal(r.totalSupply,undefined);assert.equal(r.sources[0].status,'unavailable');
 }
});
test('wrong chain, changed finalized anchor and abort never leak unverified balances',async()=>{
 for(const options of [{chain:'0x1'},{reorg:true}]){const r=await createBscHolderFallback(mock(options))(report);assert.equal(r.holders?.length,0);assert.equal(r.snapshot,undefined);assert.equal(r.sources[0].status,'unavailable');}
 const signal=AbortSignal.abort();await assert.rejects(createBscHolderFallback(mock())(report,{signal}),{name:'AbortError'});
});
