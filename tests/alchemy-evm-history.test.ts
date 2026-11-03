import test from 'node:test';
import assert from 'node:assert/strict';
import {createAlchemyEvmHistory,parseAlchemyTransfers} from '../src/lib/alchemy-evm-history';
import type {Report} from '../src/lib/analysis';

const token='0x1111111111111111111111111111111111111111',holder='0x2222222222222222222222222222222222222222',funder='0x3333333333333333333333333333333333333333';
const hash=`0x${'a'.repeat(64)}`,blockHash=`0x${'b'.repeat(64)}`,at='2026-01-01T00:00:00.000Z';
const report:Report={chain:'ethereum',token,name:'Test',symbol:'T',fetchedAt:at,market:null,holders:[{address:holder,share:10,contract:false,locked:null,tag:''}],holderCount:1,checks:[],sources:[]};
const native={uniqueId:`${hash}:external`,hash,blockNum:'0x10',from:funder,to:holder,category:'external',value:999,rawContract:{value:'0xde0b6b3a7640000',address:null,decimal:'0x12'},metadata:{blockTimestamp:at}};
const receipt={transactionHash:hash,status:'0x1',blockNumber:'0x10',blockHash};
function mock(overrides:(method:string,params:any[])=>unknown=()=>undefined){
 const calls:{method:string;params:any[]}[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));calls.push(request);const override=overrides(request.method,request.params);if(override instanceof Response)return override;
  const result=override!==undefined?override:request.method==='eth_chainId'?'0x1':request.method==='eth_getBlockByNumber'?{number:'0x20',hash:blockHash,timestamp:'0x6955b900'}:request.method==='eth_getTransactionReceipt'?receipt:request.params[0].category[0]==='erc20'?{transfers:[]}:{transfers:[native]};
  return Response.json({jsonrpc:'2.0',id:request.id,result});};
 return {fetcher,calls};
}
test('raw units, category, timestamp and matching token constrain parsed transfers',()=>{
 const rows=parseAlchemyTransfers({transfers:[native,{...native,uniqueId:'badtime',metadata:{}},{...native,uniqueId:'failed',status:'failed'},{...native,uniqueId:'wrongto',to:funder},{...native,uniqueId:'zero',rawContract:{...native.rawContract,value:'0x0'}}]},{token,native:true,receiver:holder,toBlock:32n});
 assert.equal(rows.records.length,1);assert.equal(rows.records[0].amount,1);assert.equal(rows.records[0].amountRaw,'1000000000000000000');assert.equal(rows.records[0].decimals,18);assert.equal(rows.records[0].native,true);assert(rows.rejected>=3);
 const erc={...native,uniqueId:'erc',category:'erc20',rawContract:{value:'0x1',decimal:'0x12',address:token}};
 assert.equal(parseAlchemyTransfers({transfers:[erc]},{token,native:false,toBlock:32n}).records[0].amount,1e-18);
 assert.equal(parseAlchemyTransfers({transfers:[{...erc,rawContract:{...erc.rawContract,address:funder}}]},{token,native:false,toBlock:32n}).records.length,0);
});
test('Alchemy funding is anchored, receipt-verified, never classified as a trade',async()=>{
 const m=mock(),load=createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test/rpc'},fetcher:m.fetcher,now:()=>Date.parse(at)});
 const result=await load('ethereum',token,{report,mode:'deep',limit:100});
 assert.equal(result.transfers.length,1);assert.equal(result.transfers[0].transaction,hash);assert.equal(result.transfers[0].amount,1);assert.equal(result.trades.length,0);assert(result.sources.some(s=>s.status==='available'));
 const query=m.calls.find(c=>c.method==='alchemy_getAssetTransfers'&&c.params[0].toAddress===holder)!.params[0];
 assert.equal(query.withMetadata,true);assert.equal(query.toBlock,'0x20');assert.equal(query.order,'asc');assert.equal(query.excludeZeroValue,true);assert(result.reasons.some(reason=>reason.includes('launch')));
});
test('failed receipts and receipt block mismatches withhold transfer claims',async()=>{
 for(const changed of [{...receipt,status:'0x0'},{...receipt,blockNumber:'0x11'},{...receipt,transactionHash:`0x${'c'.repeat(64)}`}]){
  const m=mock(method=>method==='eth_getTransactionReceipt'?changed:undefined);
  const result=await createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test/rpc'},fetcher:m.fetcher})('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(result.transfers.length,0);assert.equal(result.truncated,true);
 }
});
test('duplicate transfers deduplicate, and later failed pages retain verified evidence',async()=>{
 const m=mock((method,params)=>{if(method!=='alchemy_getAssetTransfers'||params[0].category[0]==='erc20')return undefined;return params[0].pageKey?new Response('',{status:503}):{transfers:[native,native],pageKey:'next-page'};});
 const result=await createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test/rpc'},fetcher:m.fetcher,pagesPerQuery:2,fundingTransfersPerWallet:2})('ethereum',token,{report,mode:'deep',limit:100});
 assert.equal(result.transfers.length,1);assert.equal(result.truncated,true);assert(result.reasons.some(reason=>reason.includes('incomplete')));
});
test('rate limits stop further provider requests and never retry within the scan',async()=>{
 const m=mock(method=>method==='alchemy_getAssetTransfers'?new Response('',{status:429,headers:{'retry-after':'60'}}):undefined);
 const result=await createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test/rpc'},fetcher:m.fetcher})('ethereum',token,{report,mode:'deep',limit:100});
 assert.equal(m.calls.filter(c=>c.method==='alchemy_getAssetTransfers').length,1);assert.equal(result.transfers.length,0);assert(result.reasons.some(r=>r.includes('rate limit')));
});
test('Retry-After cooldown persists between scans without exposing the endpoint',async()=>{
 let stamp=Date.parse(at);
 const m=mock(method=>method==='alchemy_getAssetTransfers'?new Response('',{status:429,headers:{'retry-after':'60'}}):undefined);
 const load=createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test/private-key'},fetcher:m.fetcher,now:()=>stamp});
 await load('ethereum',token,{report,mode:'deep',limit:100});const count=m.calls.length;
 const blocked=await load('ethereum',token,{report,mode:'deep',limit:100});assert.equal(m.calls.length,count);assert.equal(blocked.sources[0].status,'unavailable');assert(!JSON.stringify(blocked).includes('private-key'));
 stamp+=61000;await load('ethereum',token,{report,mode:'deep',limit:100});assert(m.calls.length>count);
});
test('wrong-chain configuration cannot supply token history',async()=>{
 const m=mock(method=>method==='eth_chainId'?'0x89':undefined);
 const result=await createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test'},fetcher:m.fetcher})('ethereum',token,{report,mode:'deep',limit:100});
 assert.equal(result.transfers.length,0);assert.equal(result.sources[0].status,'unavailable');assert.equal(m.calls.length,1);
});
test('missing configuration and holder refresh issue no RPC calls',async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('unexpected');};
 const load=createAlchemyEvmHistory({rpcUrls:{},fetcher});
 assert.equal((await load('ethereum',token,{report,mode:'deep',limit:100})).sources[0].status,'unavailable');
 await createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test'},fetcher})('ethereum',token,{report,mode:'holders',limit:100});assert.equal(calls,0);
});
test('abort propagates; the RPC request budget is never exceeded',async()=>{
 const controller=new AbortController();controller.abort();const m=mock(),load=createAlchemyEvmHistory({rpcUrls:{ethereum:'https://example.test'},fetcher:m.fetcher,maxRequests:3});
 await assert.rejects(load('ethereum',token,{report,mode:'deep',limit:100,signal:controller.signal}),{name:'AbortError'});
 const result=await load('ethereum',token,{report,mode:'deep',limit:100});assert(m.calls.length<=3);assert.equal(result.truncated,true);
});
