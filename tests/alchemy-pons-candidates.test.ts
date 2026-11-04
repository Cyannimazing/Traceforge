import test from 'node:test';import assert from 'node:assert/strict';
import {readAlchemyPonsCandidates,ALCHEMY_PONS_SOURCE,AlchemyIndexAccessDeniedError} from '../src/lib/alchemy-pons-candidates';
import {PONS_FACTORY} from '../src/lib/pons-launch-record';
import {CandidateRpcRateLimitError} from '../src/lib/robinhood-pons-candidates';
const token='0x'+'1'.repeat(40),curve='0x'+'2'.repeat(40),launcher='0x'+'3'.repeat(40),a='0x'+'4'.repeat(40),b='0x'+'5'.repeat(40),zero='0x'+'0'.repeat(40),tx='0x'+'a'.repeat(64),hash='0x'+'b'.repeat(64),anchorHash='0x'+'c'.repeat(64);
const word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0'),aw=(a:string)=>word(BigInt(a)),TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',LAUNCH='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const indexed=(from:string,to:string,value:bigint,index:number,block=16)=>({category:'erc20',from,to,hash:tx,blockNum:'0x'+block.toString(16),uniqueId:tx+':log:'+index,rawContract:{address:token,value:'0x'+value.toString(16),decimal:'0x12'}});
const mint=indexed(zero,curve,100n,1),rows=[mint,indexed(curve,a,60n,2),indexed(curve,b,20n,3),indexed(a,b,5n,4)];
const mintLog={address:token,topics:[TRANSFER,aw(zero),aw(curve)],data:word(100n),blockNumber:'0x10',blockHash:hash,transactionHash:tx,transactionIndex:'0x0',logIndex:'0x1',removed:false};
const event={...mintLog,address:PONS_FACTORY,topics:[LAUNCH,aw(token),aw(curve),aw(launcher)],data:'0x'+'0'.repeat(192),logIndex:'0x5'};
const anchor={number:'0x20',hash:anchorHash,timestamp:'0x200'},input={token,curve,launcher,anchor,decimals:18,observedAt:'2026-11-04T00:00:00Z'};
function mock(pages:any[]=[{transfers:rows}],change?:(method:string,params:any[])=>unknown){const calls:any[]=[];let page=0;return {calls,read:async(queries:{method:string;params:unknown[]}[],maxBytes?:number)=>{calls.push(...queries);return queries.map(q=>{const custom=change?.(q.method,q.params);if(custom!==undefined)return custom;if(q.method==='alchemy_getAssetTransfers'){assert.equal(maxBytes,8*1024*1024);return pages[Math.min(page++,pages.length-1)];}if(q.method==='eth_getTransactionReceipt')return {status:'0x1',transactionHash:tx,blockNumber:'0x10',blockHash:hash,logs:[mintLog,event]};if(q.method==='eth_getBlockByNumber')return q.params[0]==='0x10'?{number:'0x10',hash,timestamp:'0x100'}:anchor;throw Error('unexpected');});}};}
test('exhausts fixed-anchor pages, derives raw ledger, and independently verifies actual mint receipt plus factory and headers',async()=>{
 const m=mock([{transfers:rows.slice(0,2),pageKey:'next'},{transfers:rows.slice(2)}]);const r=await readAlchemyPonsCandidates(input,m.read);assert.deepEqual(r.candidates,[a,b,curve]);assert.equal(r.ledger?.balances[a],'55');assert.equal(r.ledger?.netSupplyRaw,'100');assert.equal(r.scope?.creationVerified,true);assert.equal(r.source.name,ALCHEMY_PONS_SOURCE);assert.equal(r.indexProvenance?.pages,2);assert.equal(r.indexProvenance?.exhausted,true);assert.equal(r.identity?.transaction,tx);assert.equal((r as any).trades,undefined);assert.equal(r.directTransfers,undefined);assert.equal(r.directNominations?.length,1);assert.equal((r.directNominations![0] as any).blockHash,undefined);
 const queries=m.calls.filter(c=>c.method==='alchemy_getAssetTransfers').map(c=>c.params[0]);assert.equal(queries[0].fromBlock,'0x0');assert.equal(queries[0].toBlock,anchor.number);assert.deepEqual(queries[0].contractAddresses,[token]);assert.equal(queries[0].maxCount,'0x3e8');assert.equal(queries[1].pageKey,'next');assert(!m.calls.some(c=>c.method==='eth_getLogs'));
});
test('identical overlapping page rows deduplicate but conflicting IDs fail without a ledger',async()=>{
 const good=mock([{transfers:rows.slice(0,2),pageKey:'next'},{transfers:[rows[1],...rows.slice(2)]}]);assert.equal((await readAlchemyPonsCandidates(input,good.read)).scope?.eventCount,4);
 const bad=mock([{transfers:rows.slice(0,2),pageKey:'next'},{transfers:[{...rows[1],rawContract:{...rows[1].rawContract,value:'0x1'}}]}]);assert.equal((await readAlchemyPonsCandidates(input,bad.read)).ledger,undefined);
});
test('same-block events are sorted by actual global log index without relying on provider within-block order',async()=>{
 const m=mock([{transfers:[rows[3],mint,rows[2],rows[1]]}]);const r=await readAlchemyPonsCandidates(input,m.read);assert.equal(r.ledger?.balances[a],'55');assert.equal(r.ledger?.netSupplyRaw,'100');
 const conflicting=mock([{transfers:[mint,{...rows[1],uniqueId:anchorHash+':log:1',hash:anchorHash}]}]);assert.equal((await readAlchemyPonsCandidates(input,conflicting.read)).ledger,undefined);
});
test('nonterminal empty pages, repeated cursors and exhausted page budget never produce ranked ledger',async()=>{
 for(const pages of [[{transfers:[mint],pageKey:'n'},{transfers:[],pageKey:'x'}],[{transfers:[mint],pageKey:'n'},{transfers:[rows[1]],pageKey:'n'}]]){const m=mock(pages),r=await readAlchemyPonsCandidates(input,m.read);assert.equal(r.scope,undefined);assert.equal(r.ledger,undefined);assert(m.calls.length<=2);}
 const pages=Array.from({length:64},(_,i)=>({transfers:i===0?[mint]:[indexed(curve,curve,0n,i+1,16+i)],pageKey:'p'+i}));const m=mock(pages),r=await readAlchemyPonsCandidates({...input,anchor:{...anchor,number:'0xff'}},m.read);assert.equal(r.ledger,undefined);assert.equal(m.calls.length,64);
});
test('oversized pages and more than50000 unique events cannot produce an exhausted ledger',async()=>{
 const tooWide=mock([{transfers:Array(1001).fill(mint)}]);assert.equal((await readAlchemyPonsCandidates(input,tooWide.read)).ledger,undefined);assert.equal(tooWide.calls.length,1);
 const pages=Array.from({length:51},(_,page)=>({transfers:Array.from({length:1000},(_,i)=>page===0&&i===0?mint:indexed(curve,curve,0n,page*1000+i+1)),pageKey:'next'+page}));const m=mock(pages),r=await readAlchemyPonsCandidates(input,m.read);assert.equal(r.ledger,undefined);assert.equal(m.calls.length,51);assert(!m.calls.some(c=>c.method==='eth_getTransactionReceipt'));
});
test('malformed rows, missing decimals, wrong token, impossible units and backwards blocks fail closed',async()=>{
 const bads=[{...mint,category:'external'},{...mint,from:'bad'},{...mint,uniqueId:tx+':log:NaN'},{...mint,hash:anchorHash},{...mint,rawContract:{...mint.rawContract,address:a}},{...mint,rawContract:{...mint.rawContract,decimal:null}},{...mint,rawContract:{...mint.rawContract,decimal:'0x6'}},{...mint,rawContract:{...mint.rawContract,value:'0x1'+'0'.repeat(64)}},{...mint,blockNum:'0x21'}];
 for(const row of bads){const m=mock([{transfers:[row]}]);assert.equal((await readAlchemyPonsCandidates(input,m.read)).ledger,undefined);}
 const m=mock([{transfers:[mint,{...rows[1],blockNum:'0xf'}]}]);assert.equal((await readAlchemyPonsCandidates(input,m.read)).scope,undefined);
});
test('negative or overflowing ledgers and missing initial mint fail without receipt requests',async()=>{
 for(const transfers of [[rows[1]],[mint,indexed(curve,a,101n,2)],[{...mint,rawContract:{...mint.rawContract,value:'0x'+'f'.repeat(64)}},indexed(zero,curve,1n,2)]]){const m=mock([{transfers}]);const r=await readAlchemyPonsCandidates(input,m.read);assert.equal(r.ledger,undefined);assert.equal(m.calls.length,1);}
});
test('missing/mismatched mint, factory, canonical creation or ending anchor withholds all candidates',async()=>{
 for(const change of [(method:string)=>method==='eth_getTransactionReceipt'?{status:'0x0',logs:[mintLog,event]}:undefined,(method:string)=>method==='eth_getTransactionReceipt'?{status:'0x1',transactionHash:tx,blockNumber:'0x10',blockHash:hash,logs:[{...mintLog,data:word(99n)},event]}:undefined,(method:string)=>method==='eth_getTransactionReceipt'?{status:'0x1',transactionHash:tx,blockNumber:'0x10',blockHash:hash,logs:[mintLog,{...event,topics:[LAUNCH,aw(token),aw(curve),aw(a)]}]}:undefined,(method:string,params:any[])=>method==='eth_getBlockByNumber'?{number:params[0],hash:'0x'+'d'.repeat(64),timestamp:'0x100'}:undefined]){const m=mock(undefined,change);assert.equal((await readAlchemyPonsCandidates(input,m.read)).ledger,undefined);}
});
test('provider errors expose no secrets, rate denial stops immediately, cancellation propagates',async()=>{
 const r=await readAlchemyPonsCandidates(input,async()=>{throw new CandidateRpcRateLimitError({httpStatus:429,retryAfterSeconds:30});});assert.equal(r.rateLimited,true);assert.equal(r.ledger,undefined);
 const error=await readAlchemyPonsCandidates(input,async()=>{throw Error('https://secret.invalid/key');});assert.doesNotMatch(JSON.stringify(error),/secret|invalid\/key/);
 await assert.rejects(readAlchemyPonsCandidates({...input,signal:AbortSignal.abort()},mock().read),{name:'AbortError'});
 const controller=new AbortController();await assert.rejects(readAlchemyPonsCandidates({...input,signal:controller.signal},async()=>{controller.abort();throw controller.signal.reason;}),{name:'AbortError'});
});
test('reader deadline failure after a saved index page yields no partial ledger or unverified nominations',async()=>{
 let calls=0;const r=await readAlchemyPonsCandidates(input,async()=>{if(++calls===1)return [{transfers:[mint],pageKey:'next'}];throw new DOMException('deadline','TimeoutError');});assert.equal(calls,2);assert.equal(r.ledger,undefined);assert.equal(r.directNominations,undefined);assert.equal(r.source.status,'unavailable');
});
test('typed access denial stops pagination, mint receipt or header proof and exposes no partial ledger',async()=>{
 for(const deniedMethod of ['alchemy_getAssetTransfers','eth_getTransactionReceipt','eth_getBlockByNumber']){
  const m=mock([{transfers:[mint],pageKey:'next'},{transfers:rows.slice(1)}]);let denied=false,calls=0;
  const r=await readAlchemyPonsCandidates(input,async(queries,maxBytes)=>{assert.equal(denied,false,'must stop after denial');calls++;if(queries.some(q=>q.method===deniedMethod)&&(deniedMethod!=='alchemy_getAssetTransfers'||calls===2)){denied=true;const error=new AlchemyIndexAccessDeniedError();(error as any).providerMessage='https://secret.invalid/key';throw error;}return m.read(queries,maxBytes);});
  assert.equal(r.accessDenied,true);assert.equal(r.ledger,undefined);assert.equal(r.scope,undefined);assert.equal(r.directNominations,undefined);assert.equal(r.source.status,'unavailable');assert.doesNotMatch(JSON.stringify(r),/secret|invalid\/key/);assert.match(r.source.detail,/access.*denied/i);
 }
});
