import test from 'node:test';
import assert from 'node:assert/strict';
import {selectDirectTransferCandidates,verifyDirectTransferCandidates} from '../src/lib/evm-direct-transfer-proof';
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),token='0x'+'3'.repeat(40),infra='0x'+'4'.repeat(40),hash='0x'+'a'.repeat(64),tx='0x'+'b'.repeat(64),anchorHash='0x'+'c'.repeat(64);
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',aw=(v:string)=>'0x'+v.slice(2).padStart(64,'0');
const log={address:token,topics:[topic,aw(a),aw(b)],data:'0x'+'1'.padStart(64,'0'),blockNumber:'0x10',blockHash:hash,transactionHash:tx,transactionIndex:'0x0',logIndex:'0x1',removed:false};
const anchor={number:'0x20',hash:anchorHash,timestamp:'0x200'};
function fixture(change?:(method:string,params:unknown[])=>unknown){let calls=0;return {count:()=>calls,read:async(queries:{method:string;params:unknown[]}[])=>{calls++;return queries.map(q=>change?.(q.method,q.params)??(q.method==='eth_getTransactionReceipt'?{status:'0x1',transactionHash:tx,blockNumber:'0x10',blockHash:hash,logs:[log]}:q.params[0]==='0x20'?anchor:{number:'0x10',hash,timestamp:'0x100'}));}};}
const args={token,anchor,decimals:18,observedAt:'2026-11-04T00:00:00Z',candidates:[log],eligibleAddresses:[a,b],excludedAddresses:[infra]};
test('selects only direct positive-holder links, excluding infrastructure, self and zero-value transfers',()=>{
 const rows=[log,log,{...log,topics:[topic,aw(infra),aw(b)]},{...log,topics:[topic,aw(a),aw(a)]},{...log,data:'0x'+'0'.repeat(64)}];const selected=selectDirectTransferCandidates(rows,[a,b,infra],[infra]);assert.equal(selected.candidates.length,1);assert.equal(selected.eligibleEvents,1);
});
test('proof selection prioritizes current holder rank and stops at four transactions',()=>{
 const holders=Array.from({length:12},(_,i)=>'0x'+(i+10).toString(16).padStart(40,'0'));const rows=Array.from({length:10},(_,i)=>({...log,transactionHash:'0x'+(i+1).toString(16).padStart(64,'0'),topics:[topic,aw(holders[i]),aw(holders[i+1])]})).reverse();
 const result=selectDirectTransferCandidates(rows,holders);assert.equal(result.selectedTransactions,4);assert.equal(result.candidates.length,4);assert.equal(result.eligibleEvents,10);assert.equal(result.truncated,true);assert.equal(result.candidates[0].topics[1],aw(holders[0]));
});
test('matching canonical receipt retains exact raw units, timestamp, unique log identity and no trade classification',async()=>{
 const f=fixture(),r=await verifyDirectTransferCandidates(args,f.read);assert.equal(r.transfers.length,1);assert.equal(r.transfers[0].amountRaw,'1');assert.equal(r.transfers[0].amount,1e-18);assert.equal(r.transfers[0].timestamp,new Date(256000).toISOString());assert.match(r.transfers[0].source,/receipt.*canonical/i);assert.equal(r.transfers[0].native,false);assert.equal(f.count(),2);
});
test('malicious receipt and canonical-header mismatches withhold links',async()=>{
 for(const bad of [{...log,data:'0x'+'2'.padStart(64,'0')},{...log,address:infra},{...log,removed:true},{...log,transactionHash:anchorHash},{...log,topics:[topic,aw(b),aw(a)]}]){
  const f=fixture(method=>method==='eth_getTransactionReceipt'?{status:'0x1',transactionHash:tx,blockNumber:'0x10',blockHash:hash,logs:[bad]}:undefined);assert.equal((await verifyDirectTransferCandidates(args,f.read)).transfers.length,0);
 }
 for(const block of [{number:'0x10',hash:anchorHash,timestamp:'0x100'},{number:'0x10',hash,timestamp:'0x201'},{number:'0x10',hash,timestamp:'0x0'}]){const f=fixture((method,params)=>method==='eth_getBlockByNumber'&&params[0]==='0x10'?block:undefined);assert.equal((await verifyDirectTransferCandidates(args,f.read)).transfers.length,0);}
});
test('ending-anchor reorganization withholds all links and cancellation propagates',async()=>{
 const f=fixture((method,params)=>method==='eth_getBlockByNumber'&&params[0]==='0x20'?{...anchor,hash}:undefined);assert.equal((await verifyDirectTransferCandidates(args,f.read)).transfers.length,0);
 await assert.rejects(verifyDirectTransferCandidates({...args,signal:AbortSignal.abort()},f.read),{name:'AbortError'});
});
test('no eligible or no remaining-budget candidates make no proof requests; completed proofs survive later unavailable receipts',async()=>{
 const f=fixture();assert.equal((await verifyDirectTransferCandidates({...args,eligibleAddresses:[]},f.read)).transfers.length,0);assert.equal(f.count(),0);
 assert.equal((await verifyDirectTransferCandidates({...args,canRead:()=>false},f.read)).transfers.length,0);assert.equal(f.count(),0);
 const second={...log,transactionHash:anchorHash,logIndex:'0x2'};const fail=fixture(method=>undefined);let batches=0;
 const r=await verifyDirectTransferCandidates({...args,candidates:[log,second]},async q=>{batches++;if(batches===2)throw Error('unavailable');return fail.read(q);});assert.equal(r.transfers.length,1);assert.equal(r.truncated,true);
});
test('rate denial stops proof reads immediately without an ending-anchor retry',async()=>{
 let calls=0;const f=fixture();const r=await verifyDirectTransferCandidates({...args,candidates:[log,{...log,transactionHash:anchorHash,logIndex:'0x2'}]},async q=>{calls++;if(calls===2)throw Error('RPC rate limit reached; no retry was made.');return f.read(q);});assert.equal(calls,2);assert.equal(r.transfers.length,0);assert.match(r.detail,/denied further reads/);
});
