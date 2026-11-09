import test from 'node:test';import assert from 'node:assert/strict';
import {createEvmHolderFallback} from '../src/lib/evm-holder-fallback';

const token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),now=1700000000000;
const word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0');
/** Base RPC that answers normally but fails every balance batch after the first. */
function rpc(contract?:string){
 let balanceBatches=0;
 const fetcher:typeof fetch=async(_,init)=>{const payload=JSON.parse(String(init?.body)),requests=Array.isArray(payload)?payload:[payload];
  if(requests.some((c:any)=>c.method==='eth_call'&&c.params[0].data.startsWith('0x70a08231'))&&++balanceBatches>1)return new Response('',{status:503});
  const rows=requests.map((c:any)=>{let result:unknown;
   if(c.method==='eth_chainId')result='0x2105';
   if(c.method==='eth_getBlockByNumber')result={number:c.params[0]==='latest'?'0x100':'0xf0',hash,timestamp:'0x'+(1700000000-(c.params[0]==='latest'?0:60)).toString(16)};
   if(c.method==='eth_getCode')result=c.params[0]===token||c.params[0]===contract?'0x6001':'0x';
   if(c.method==='eth_call'){const data=c.params[0].data;result=data==='0x18160ddd'?word(10000n):data==='0x313ce567'?word(0n):word(10n);}
   return {jsonrpc:'2.0',id:c.id,result};});
  return Response.json(Array.isArray(payload)?rows:rows[0]);};
 return fetcher;
}
const addresses=(base:number)=>Array.from({length:40},(_,i)=>'0x'+(i+base).toString(16).padStart(40,'0'));
const holderRows=(list:string[])=>list.map(address=>({address,share:.1,contract:null,locked:null,tag:''}));

test('a provider failure mid-read keeps verified balances and records code proof',async()=>{
 const holders=addresses(0x100),contract=holders[3];
 const report={chain:'base',token,holders:holderRows(holders.slice(0,10)),identities:[],market:{pairAddress:pool}} as any;
 const r=await createEvmHolderFallback({fetcher:rpc(contract),now:()=>now,rpcUrls:{base:'https://rpc.invalid'}})(report,{candidateAddresses:holders});
 assert.equal(r.snapshot?.balances.filter(b=>b.status==='observed').length,15,'the first batch is kept');
 assert.ok(r.snapshot!.balances.some(b=>b.status==='unknown'),'unread accounts stay unknown, never zero');
 const e=r.snapshot?.holderEnumeration;assert.equal(e?.kind,'real-holder-prefix');
 if(e?.kind==='real-holder-prefix'){assert.equal(e.accountKinds[contract],'contract');assert.equal(e.accountKinds[holders[0]],'eoa');assert.ok(e.unread>0);}
});

test('the real-holder ranking is withheld when the provider top ranks were not all read',async()=>{
 const holders=addresses(0x200);
 // All 40 are provider-listed; the second batch fails, so provider ranks 16+ are unread.
 const report={chain:'base',token,holders:holderRows(holders),identities:[],market:{pairAddress:pool}} as any;
 const r=await createEvmHolderFallback({fetcher:rpc(),now:()=>now,rpcUrls:{base:'https://rpc.invalid'}})(report,{});
 assert.ok(r.snapshot,'verified balances are still returned');
 assert.equal(r.snapshot?.holderEnumeration,undefined,'no ranking without the provider top ranks');
});
