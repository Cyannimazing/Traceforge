import test from 'node:test';
import assert from 'node:assert/strict';
import {readRobinhoodPonsCandidates,CandidateRpcRateLimitError,CandidateRpcLogLimitError} from '../src/lib/robinhood-pons-candidates';
import {PONS_FACTORY} from '../src/lib/pons-launch-record';
const token='0x'+'1'.repeat(40),curve='0x'+'2'.repeat(40),launcher='0x'+'3'.repeat(40),buyer='0x'+'4'.repeat(40),oldBuyer='0x'+'5'.repeat(40),zero='0x'+'0'.repeat(40);
const hash='0x'+'a'.repeat(64),anchorHash='0x'+'b'.repeat(64),tx='0x'+'c'.repeat(64),laterTx='0x'+'d'.repeat(64),word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0'),aw=(a:string)=>word(BigInt(a)),hex=(n:number)=>'0x'+n.toString(16);
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',LAUNCH='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
function setup(age:number,{failOlder=false,rate=false,capped=false,cappedError=false,wrongFactory=false}:{failOlder?:boolean;rate?:boolean;capped?:boolean;cappedError?:boolean;wrongFactory?:boolean}={}){
 const creation=100,end=creation+age,input={token,curve,launcher,anchor:{number:hex(end),hash:anchorHash,timestamp:'0x68000000'},observedAt:'2026-11-04T00:00:00Z'},queries:{address:string;topics:string[];fromBlock:string;toBlock:string}[]=[];
 const log=(from:string,to:string,amount:bigint,block:number,index:number)=>({address:token,topics:[TRANSFER,aw(from),aw(to)],data:word(amount),blockNumber:hex(block),blockHash:hash,transactionHash:block===creation?tx:laterTx,transactionIndex:'0x0',logIndex:hex(index),removed:false});
 const logs=[log(zero,curve,100n,creation,0),log(curve,oldBuyer,60n,creation,1),log(curve,buyer,20n,end-5,0)];
 const launched={...logs[0],address:PONS_FACTORY,topics:[LAUNCH,aw(token),aw(curve),aw(wrongFactory?buyer:launcher)],data:'0x'+'0'.repeat(192),logIndex:'0x3'};
 const read=async(calls:{method:string;params:unknown[]}[])=>calls.map(c=>{
  if(c.method==='eth_getLogs'){
   const q=c.params[0] as typeof queries[number],from=Number(BigInt(q.fromBlock)),to=Number(BigInt(q.toBlock));queries.push(q);assert(to-from<10000000);
   if(rate&&q.address===PONS_FACTORY)throw new CandidateRpcRateLimitError({httpStatus:429});
   if(failOlder&&q.address===token&&from===creation)return undefined;
   const rows=(q.address===PONS_FACTORY?[launched]:logs).filter(l=>Number(BigInt(l.blockNumber))>=from&&Number(BigInt(l.blockNumber))<=to);
   if(capped&&q.address===token&&from<=creation&&to>=end-5&&to-from>1)return Array(10000).fill(logs[0]);
   if(cappedError&&q.address===token&&from<=creation&&to>=end-5&&to-from>1)throw new CandidateRpcLogLimitError();
   return rows;
  }
  if(c.method==='eth_getTransactionReceipt')return {status:'0x1',transactionHash:tx,blockNumber:hex(creation),blockHash:hash,logs:[logs[0],logs[1],launched]};
  if(c.method==='eth_getBlockByNumber')return c.params[0]===hex(creation)?{number:hex(creation),hash,timestamp:'0x67000000'}:input.anchor;
  throw Error('Unexpected RPC');
 });
 return {input,queries,read};
}
test('creation discovery recovers inactive holders beyond the old ten-million-block window for multiple token ages',async()=>{
 for(const age of [12000000,25000000]){const m=setup(age),r=await readRobinhoodPonsCandidates(m.input,m.read);assert.equal(r.scope?.creationVerified,true);assert.equal(r.scope?.fromBlock,100);assert.equal(r.scope?.toBlock,100+age);assert.deepEqual(r.candidates,[oldBuyer,curve,buyer]);assert.equal(r.ledger?.netSupplyRaw,'100');assert.equal(r.ledger?.balances[oldBuyer],'60');assert(m.queries.some(q=>q.address===PONS_FACTORY));const transfers=m.queries.filter(q=>q.address===token);assert(transfers.length>=2);}
});
test('unavailable old interval cannot silently promote the recent subset into a qualified inventory',async()=>{const m=setup(12000000,{failOlder:true}),r=await readRobinhoodPonsCandidates(m.input,m.read);assert.equal(r.scope,undefined);assert.equal(r.ledger,undefined);assert.equal(r.source.status,'unavailable');});
test('an inactive old token with no recent transfers is still discovered from its factory creation',async()=>{const m=setup(12000000),base=m.read;const r=await readRobinhoodPonsCandidates(m.input,async calls=>{const result=await base(calls);return result.map((rows,i)=>{const q=calls[i].params[0] as {address?:string;fromBlock?:string};return calls[i].method==='eth_getLogs'&&q.address===token&&Number(BigInt(q.fromBlock!))>100?[]:rows;});});assert.equal(r.scope?.creationVerified,true);assert(r.candidates.includes(oldBuyer));});
test('provider row caps are subdivided and every interval must be read before a ledger qualifies',async()=>{const m=setup(200,{capped:true}),r=await readRobinhoodPonsCandidates(m.input,m.read);assert.equal(r.scope?.creationVerified,true);assert.equal(r.scope?.eventCount,3);assert(m.queries.filter(q=>q.address===token).length>1);});
test('an explicit provider log-size error narrows the query instead of discarding older holders',async()=>{const m=setup(200,{cappedError:true}),r=await readRobinhoodPonsCandidates(m.input,m.read);assert.equal(r.scope?.creationVerified,true);assert.equal(r.scope?.eventCount,3);assert(m.queries.filter(q=>q.address===token).length>1);});
test('factory identity mismatch and rate denial never create a qualified launch or retry denied requests',async()=>{
 for(const flags of [{wrongFactory:true},{rate:true}]){const m=setup(12000000,flags),r=await readRobinhoodPonsCandidates(m.input,m.read);assert.equal(r.scope,undefined);if('rate'in flags){assert.equal(r.rateLimited,true);assert.equal(m.queries.filter(q=>q.address===PONS_FACTORY).length,1);}}
});
