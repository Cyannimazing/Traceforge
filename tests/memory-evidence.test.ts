import test from 'node:test';
import assert from 'node:assert/strict';
import {crossTokenMemoryEvidence} from '../src/lib/cross-token-memory-evidence';
import type {InvestigationReport} from '../src/lib/investigation-types';
const a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),h=(n:number)=>'0x'+n.toString(16).padStart(64,'0'),at='2026-11-04T10:00:00Z';
function report():InvestigationReport{
 const block={number:'0xa',hash:h(10),timestamp:'2026-11-03T10:00:00Z'},token=a(9),event=(from:string,to:string,n:number)=>({kind:'erc20' as const,token,from,to,amountRaw:'100',transaction:h(n),block,logIndex:0,initiator:from});
 const holders=[1,2].map(n=>({address:a(n),share:10,contract:false,locked:null,tag:''}));
 return {chain:'ethereum',token:a(99),fetchedAt:at,holders,sources:[],crossTokenMemory:{version:1,chain:'ethereum',token:a(99),observedAt:at,status:'partial',scope:{selectedWallets:2,queriedWallets:2,candidateTokens:1,verifiedTransactions:3,truncated:true},reasons:[],records:[{chain:'ethereum',chainId:'1',token,source:'configured-rpc',verifiedAt:at,anchor:{...block,number:'0xb'},connections:[{event:event(a(1),a(2),11),participants:holders.map((w,i)=>({address:w.address,activity:event(w.address,a(8),20+i),holding:{block,balanceRaw:'100',totalSupplyRaw:'1000000',decimals:0},code:'0x'})),senderFanout:{complete:true,recipients:1}}]}]},investigation:{wallets:holders.map(w=>({address:w.address,share:w.share,categories:[],evidenceIds:[]})),relationships:[],evidence:[],coverage:{fetchedAt:at}}} as unknown as InvestigationReport;
}
test('historical evidence exposes canonical relation and voluntary material participation without current graph edges',()=>{
 const r=report(),before=JSON.stringify(r),e=crossTokenMemoryEvidence(r);assert.equal(e.length,3);assert.equal(new Set(e.map(row=>row.id)).size,3);assert(e.every(row=>row.kind==='label'&&row.timestamp.startsWith('2026-11-03')&&row.token===a(9)&&row.transaction&&row.source==='Independent cross-token memory'));assert.match(e[0].description,/0x0000000000000000000000000000000000000009/);assert(e.some(row=>row.description.includes('100 / 1000000')));assert.equal(JSON.stringify(r),before);
 r.crossTokenMemory!.records[0].connections[0].participants[1].activity.initiator=a(88);assert.deepEqual(crossTokenMemoryEvidence(r),[]);
});
test('a native funding transaction supporting two prior tokens keeps both evidence contexts',()=>{
 const r=report(),first=r.crossTokenMemory!.records[0];first.connections[0].event={...first.connections[0].event,kind:'native',token:'native',logIndex:null};
 const second=JSON.parse(JSON.stringify(first).replaceAll(a(9),a(10)));for(const p of second.connections[0].participants)p.activity.transaction=h(Number(BigInt(p.address))+70);r.crossTokenMemory!.records.push(second);
 const rows=crossTokenMemoryEvidence(r);assert.equal(rows.length,6);for(const token of [a(9),a(10)]){const funding=rows.find(e=>e.token===token&&e.transaction===h(11));assert(funding);assert(funding.description.includes(token));assert.match(funding.description,/native funding/);}
});
