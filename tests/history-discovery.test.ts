import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoryCandidates} from '../src/lib/history-discovery';
import {historyMutationAllowed,parseHistoryRequest} from '../src/lib/history-request';
const token='0x'+'a'.repeat(40),pool='0x'+'b'.repeat(40),other='0x'+'c'.repeat(40);
test('candidate discovery matches exact chain and either token side, deduplicates and rejects unsupported IDs',()=>{
 const row={chainId:'ethereum',pairAddress:pool,baseToken:{address:other},quoteToken:{address:token},dexId:'uniswap'};
 const result=parseHistoryCandidates([row,{...row,pairAddress:pool.toUpperCase().replace('0X','0x')},{...row,chainId:'base'},{...row,pairAddress:'0x'+'1'.repeat(64)},{...row,quoteToken:{address:other}}],'ethereum',token);
 assert.equal(result.candidates.length,1);assert.equal(result.excluded,3);assert.equal(result.completeRegistry,false);
});
test('candidate scope is bounded even when the feed returns more pools',()=>{
 const result=parseHistoryCandidates(Array.from({length:25},(_,i)=>({chainId:'base',pairAddress:'0x'+i.toString(16).padStart(40,'0'),baseToken:{address:token},pairCreatedAt:100+i})),'base',token);
 assert.equal(result.candidates.length,20);assert.equal(result.observedCandidates,25);assert.equal(result.truncated,true);assert.equal(result.completeRegistry,false);
});
test('history API binds supported chain and address and requires same-origin mutation',()=>{
 const url='http://127.0.0.1:3101/api/history?chain=ethereum&token='+token;
 assert.equal(parseHistoryRequest(new URL(url)).token,token);
 assert.throws(()=>parseHistoryRequest(new URL(url.replace('ethereum','solana'))));
 assert.equal(historyMutationAllowed({url,headers:new Headers({origin:'http://127.0.0.1:3101'})}),true);
 assert.equal(historyMutationAllowed({url,headers:new Headers({origin:'https://foreign.example'})}),false);
 assert.equal(historyMutationAllowed({url,headers:new Headers()}),false);
 assert.equal(historyMutationAllowed({url:url.replace('127.0.0.1','localhost'),headers:new Headers({origin:'http://127.0.0.1:3101',host:'127.0.0.1:3101','sec-fetch-site':'same-origin'})}),true);
 assert.equal(historyMutationAllowed({url,headers:new Headers({origin:'https://foreign.example',host:'127.0.0.1:3101','sec-fetch-site':'cross-site'})}),false);
});
