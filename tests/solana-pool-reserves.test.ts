import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/pumpswap-reserves.json';
import {createSolanaPoolReserves,parsePumpSwapPool} from '../src/lib/solana-pool-reserves';
const mint=fixture.refs.baseMint;
const mock=(change?:(value:any)=>void)=>{
 const payload=structuredClone(fixture);change?.(payload);const calls:any[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));calls.push(body);return Response.json({result:body.method==='getAccountInfo'?payload.first:payload.second});};
 return {calls,read:createSolanaPoolReserves({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,now:()=>Date.parse('2026-11-02T00:00:00Z')})};
};
test('actual PumpSwap account and same-bank vaults retain exact raw reserves, signed virtual adjustment and quote identity',async()=>{
 const {read,calls}=mock();const result=await read(fixture.pool,mint);
 assert.equal(result.status,'verified');const s=result.snapshot!;
 assert.equal(s.base.amountRaw,'201633628490029');assert.equal(s.quote.amountRaw,'70556726');assert.equal(s.quote.mint,'SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb');
 assert.equal(s.virtualQuoteReservesRaw,'12913182');assert.equal(s.effectiveQuoteAmountRaw,'83469908');assert.equal(s.slot,fixture.second.context.slot);
 assert.equal(s.protocolFeesRaw,'183');assert.equal(s.creatorFeesRaw,'7215');assert.equal(s.feeBps,null);assert.equal(s.constantProductEligible,false);
 assert.equal(calls.length,2);assert.equal(calls[1].params[1].minContextSlot,fixture.first.context.slot);assert.equal(calls[1].params[1].commitment,'finalized');
 assert.deepEqual(calls[1].params[0],[fixture.pool,fixture.refs.baseVault,fixture.refs.quoteVault,fixture.refs.baseMint,fixture.refs.quoteMint]);
});
test('signed negative virtual reserves subtract retained fees exactly once',()=>{
 const account=structuredClone(fixture.first.value),bytes=Buffer.from(account.data[0],'base64');bytes.writeBigInt64LE(-100n,245);bytes.writeBigInt64LE(-1n,253);account.data[0]=bytes.toString('base64');
 assert.equal(parsePumpSwapPool(account)?.virtualQuoteReservesRaw,'-100');
});
test('documented missing trailing fields default zero but partial fields and unfamiliar nonzero tails are rejected',()=>{
 const original=Buffer.from(fixture.first.value.data[0],'base64');
 const value=(bytes:Buffer)=>({...fixture.first.value,data:[bytes.toString('base64'),'base64']});
 assert.equal(parsePumpSwapPool(value(original.subarray(0,211)))?.virtualQuoteReservesRaw,'0');
 assert.equal(parsePumpSwapPool(value(original.subarray(0,250))),undefined);
 const unknown=Buffer.from(original);unknown[300]=1;assert.equal(parsePumpSwapPool(value(unknown)),undefined);
});
test('wrong program, discriminator, vault owner, mint, decimals, stale bank and unrelated token return unknown',async()=>{
 const cases=[
  (p:any)=>{p.first.value.owner='11111111111111111111111111111111';},
  (p:any)=>{const b=Buffer.from(p.first.value.data[0],'base64');b[0]=0;p.first.value.data[0]=b.toString('base64');},
  (p:any)=>{p.second.value[1].data.parsed.info.owner=fixture.refs.baseMint;},
  (p:any)=>{p.second.value[1].data.parsed.info.mint=fixture.refs.quoteMint;},
  (p:any)=>{p.second.value[1].data.parsed.info.tokenAmount.decimals=9;},
  (p:any)=>{p.second.context.slot=p.first.context.slot-1;},
  (p:any)=>{p.second.value[1].owner='11111111111111111111111111111111';},
 ];
 for(const change of cases){const result=await mock(change).read(fixture.pool,mint);assert.equal(result.status,'unknown');assert.equal(result.snapshot,undefined);}
 assert.equal((await mock().read(fixture.pool,'So11111111111111111111111111111111111111112')).status,'unknown');
});
test('plain verified tokens allow only a fee-unverified constant-product model and never invent a fee rate',async()=>{
 const {read}=mock(p=>{p.second.value[4].data.parsed.info.extensions=[];p.second.value[2].data.parsed.info.extensions=[];});
 const r=await read(fixture.pool,mint);assert.equal(r.snapshot?.constantProductEligible,true);assert.equal(r.snapshot?.feeBps,null);assert.match(r.snapshot?.feeAssumption||'',/not verified/);
});
test('cancelled reads reject and failed responses return unknown without RPC secrets',async()=>{
 const controller=new AbortController();controller.abort();await assert.rejects(()=>mock().read(fixture.pool,mint,{signal:controller.signal}),{name:'AbortError'});
 const read=createSolanaPoolReserves({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/SECRET',fetcher:async()=>{throw Error('SECRET');}});const r=await read(fixture.pool,mint);assert.equal(r.status,'unknown');assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('negative effective reserves and frozen vaults cannot produce a verified trading reserve model',async()=>{
 const negative=mock(p=>{const b=Buffer.from(p.second.value[0].data[0],'base64');b.writeBigInt64LE(-999999999n,245);b.writeBigInt64LE(-1n,253);p.second.value[0].data[0]=b.toString('base64');});
 assert.equal((await negative.read(fixture.pool,mint)).status,'unknown');
 const frozen=mock(p=>{p.second.value[2].data.parsed.info.state='frozen';});assert.equal((await frozen.read(fixture.pool,mint)).status,'unknown');
});
test('bounded deadline aborts the request instead of fabricating reserves',async()=>{
 const fetcher:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('Abort')),{once:true}));
 const read=createSolanaPoolReserves({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,timeoutMs:10});
 const result=await read(fixture.pool,mint);assert.equal(result.status,'unknown');assert.match(result.reasons[0],/deadline/);
});
