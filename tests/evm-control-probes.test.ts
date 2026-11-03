import test from 'node:test';
import assert from 'node:assert/strict';
import {runEvmControlProbes,type EvmProbeRpc} from '../src/lib/evm-control-probes';
const token='0x'+'1'.repeat(40),holder='0x'+'2'.repeat(40),recipient='0x'+'3'.repeat(40),owner='0x'+'4'.repeat(40);
const hash='0x'+'a'.repeat(64),word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0');
const block={number:'0x64',hash,timestamp:'0x67270000'};
const input={chain:'ethereum' as const,token,recipient,holders:[{address:holder}],now:()=>Date.parse('2026-11-03T08:00:00Z')};
function transport(patch?:(method:string,params:unknown[])=>unknown|Promise<unknown>){
 const calls:{method:string;params:unknown[]}[]=[];
 const rpc:EvmProbeRpc=async(method,params)=>{calls.push({method,params});const override=await patch?.(method,params);if(override!==undefined)return override;
 if(method==='eth_chainId')return '0x1';if(method==='eth_getBlockByNumber')return block;if(method==='eth_getCode')return '0x60006000';if(method==='eth_getStorageAt')return word(0n);
 if(method==='eth_call'){const call=params[0] as {data:string};if(call.data==='0x8da5cb5b')return '0x'+'0'.repeat(24)+owner.slice(2);if(call.data.startsWith('0x70a08231'))return word(123n);if(call.data.startsWith('0xa9059cbb'))return word(1n);}
 throw Error('Unexpected RPC');};return {rpc,calls};
}
test('pins observations and bounded transfer simulations to one checked block without sending a transaction',async()=>{
 const {rpc,calls}=transport();const result=await runEvmControlProbes(input,rpc);
 assert.equal(result.status,'complete');assert.equal(result.anchor?.hash,hash);assert.equal(result.anchor?.finality,'finalized');
 assert.equal(result.observations.find(o=>o.key==='owner')?.address,owner);
 const transfer=result.observations.find(o=>o.key==='transfer:'+holder)!;assert.equal(transfer.outcome,'returned-true');assert.equal(transfer.balanceRaw,'123');assert.equal(transfer.amountRaw,'1');
 assert.equal(calls.filter(c=>c.method==='eth_sendTransaction'||c.method==='eth_sendRawTransaction').length,0);
 for(const c of calls.filter(c=>['eth_call','eth_getStorageAt','eth_getCode'].includes(c.method)))assert.equal(c.params.at(-1),'0x64');
 assert.equal(result.evidence.length,6);assert.ok(result.evidence.every(e=>e.source==='EVM RPC control probes'&&e.timestamp==='2026-11-03T08:00:00.000Z'));
});
test('wrong chain or malformed address cannot probe an unrelated contract',async()=>{
 const {rpc,calls}=transport((m)=>m==='eth_chainId'?'0x38':undefined);const r=await runEvmControlProbes(input,rpc);assert.equal(r.status,'unavailable');assert.equal(calls.length,1);assert.equal(r.evidence.length,0);
 await assert.rejects(runEvmControlProbes({...input,token:'0x123'},rpc),/address/);assert.equal(calls.length,1);
});
test('owner revert and zero proxy slots do not assert absent privileges or non-proxy status',async()=>{
 const {rpc}=transport((m,p)=>{if(m==='eth_call'&&(p[0] as {data:string}).data==='0x8da5cb5b')throw Error('secret provider URL');});
 const r=await runEvmControlProbes(input,rpc);assert.equal(r.status,'partial');assert.equal(r.observations.find(o=>o.key==='owner')?.status,'unknown');
 assert.equal(r.observations.find(o=>o.key==='proxy-implementation')?.outcome,'empty-slot');assert.ok(r.limitations.some(l=>l.includes('other proxy')));assert.ok(!JSON.stringify(r).includes('secret provider'));
});
test('transfer false, empty return, zero balance and RPC rejection are distinct from a passing transfer',async()=>{
 for(const [value,outcome,status] of [[word(0n),'returned-false','observed'],['0x','empty-return','observed'],['0x02','malformed-return','unknown']] as const){
 const {rpc}=transport((m,p)=>m==='eth_call'&&(p[0] as {data:string}).data.startsWith('0xa9059cbb')?value:undefined);
 const r=await runEvmControlProbes(input,rpc),t=r.observations.find(o=>o.key==='transfer:'+holder)!;assert.equal(t.outcome,outcome);assert.equal(t.status,status);}
 const {rpc,calls}=transport((m,p)=>m==='eth_call'&&(p[0] as {data:string}).data.startsWith('0x70a08231')?word(0n):undefined);
 const r=await runEvmControlProbes(input,rpc);assert.equal(r.observations.find(o=>o.key==='transfer:'+holder)?.outcome,'zero-balance');assert.equal(calls.filter(c=>c.method==='eth_call'&&(c.params[0] as {data:string}).data.startsWith('0xa9059cbb')).length,0);
});
test('deduplicates holders and caps simulation work at three independently read balances',async()=>{
 const holders=Array.from({length:6},(_,i)=>({address:'0x'+(i+4).toString(16).repeat(40),balanceRaw:'1'}));const {rpc,calls}=transport();
 const r=await runEvmControlProbes({...input,holders:[holders[0],holders[0],...holders]},rpc);assert.equal(r.observations.filter(o=>o.key.startsWith('transfer:')).length,3);assert.ok(calls.length<=14);
 for(const t of r.observations.filter(o=>o.key.startsWith('transfer:')))assert.equal(t.amountRaw,'1');
});
test('reorg invalidates all results instead of mixing block states',async()=>{
 let n=0;const {rpc}=transport(m=>m==='eth_getBlockByNumber'&&++n===2?{...block,hash:'0x'+'b'.repeat(64)}:undefined);const r=await runEvmControlProbes(input,rpc);
 assert.equal(r.status,'unavailable');assert.equal(r.evidence.length,0);assert.ok(r.observations.every(o=>o.status==='unknown'));assert.ok(r.limitations.some(l=>l.includes('changed')));
});
test('latest anchor is marked provisional and unavailable bytecode does not create clean probes',async()=>{
 const {rpc}=transport(m=>m==='eth_getCode'?'0x':undefined);const r=await runEvmControlProbes({...input,blockTag:'latest'},rpc);
 assert.equal(r.anchor?.finality,'provisional');assert.equal(r.observations.find(o=>o.key==='code')?.outcome,'no-code');assert.equal(r.observations.some(o=>o.key==='owner'),false);assert.equal(r.status,'partial');
});
test('an already aborted call never reaches the provider',async()=>{
 const abort=new AbortController();abort.abort();const {rpc,calls}=transport();await assert.rejects(runEvmControlProbes({...input,signal:abort.signal},rpc),{name:'AbortError'});assert.equal(calls.length,0);
});
test('a reorg during an empty-code observation invalidates that observation too',async()=>{
 let headers=0;const {rpc}=transport(m=>m==='eth_getCode'?'0x':m==='eth_getBlockByNumber'&&++headers===2?{...block,hash:'0x'+'b'.repeat(64)}:undefined);
 const r=await runEvmControlProbes(input,rpc);assert.equal(r.status,'unavailable');assert.equal(r.evidence.length,0);assert.equal(r.observations[0]?.status,'unknown');
});
test('a slow provider is bounded by the total read deadline',async()=>{
 const rpc:EvmProbeRpc=()=>new Promise(resolve=>setTimeout(()=>resolve('0x1'),120));
 const r=await runEvmControlProbes({...input,timeoutMs:50},rpc);assert.equal(r.status,'unavailable');assert.equal(r.requests,1);assert.equal(r.evidence.length,0);
});
test('malformed proxy address padding stays unknown and supported chain IDs are checked',async()=>{
 for(const [chain,chainId] of [['base','0x2105'],['bsc','0x38']] as const){
  const {rpc}=transport(m=>m==='eth_chainId'?chainId:m==='eth_getStorageAt'?'0x'+'f'.repeat(64):undefined);
  const r=await runEvmControlProbes({...input,chain},rpc);assert.equal(r.status,'partial');assert.ok(r.observations.filter(o=>o.key.startsWith('proxy-')).every(o=>o.status==='unknown'));assert.equal(r.observations.find(o=>o.key==='owner')?.address,owner);
 }
});
