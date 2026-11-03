import {test} from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/alchemy-solana-pump-history.json';
import {createAlchemySolanaHistory,parseAlchemySolanaTransactions} from '../src/lib/alchemy-solana-history';
import type {Report} from '../src/lib/analysis';

const mint='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump';
const pump='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const report:Report={chain:'solana',token:mint,name:'Fixture',symbol:'FIXTURE',fetchedAt:'2026-11-02T00:00:00Z',market:null,holders:[],holderCount:null,checks:[],sources:[]};
const options={report,mode:'deep' as const,limit:100};
test('funding checks use three parallel requests while retaining all six wallet checks',async()=>{
 let pending=0,peak=0,started=0,released=false;const releases:Array<()=>void>=[];
 const fetcher:typeof fetch=async(_url,init)=>{
  const [wallet]=JSON.parse(String(init?.body)).params;
  if(wallet===mint)return Response.json({result:{data:fixture,paginationToken:null}});
  started++;pending++;peak=Math.max(peak,pending);
  if(!released)await new Promise<void>(resolve=>releases.push(resolve));
  pending--;return Response.json({result:{data:[],paginationToken:null}});
 };
 const run=createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher})({...options,walletAddresses:['3'.repeat(32),'4'.repeat(32),'5'.repeat(32),'6'.repeat(32)]});
 await new Promise(resolve=>setImmediate(resolve));const initial=started;released=true;releases.forEach(resolve=>resolve());const result=await run;
 assert.equal(initial,3);assert.equal(peak,3);assert.equal(result.coverage.fundingWallets,6);assert.equal(started,6);
});
test('finalized real Pump V2 create/buy and nested aggregator CPI expose transaction-backed creator and exact buys',()=>{
 const value=parseAlchemySolanaTransactions(fixture,mint);
 assert.equal(value.trades.length,2);assert.equal(value.identities.length,1);
 assert.equal(value.identities[0].address,'69z4qTgQ5DBRTJvnQzx2h8jZhNsv5UgADotEwwKUm2JS');
 assert.deepEqual(value.trades.map(t=>t.amountRaw),['31176944462916','29713833593864']);
 assert.equal(value.trades[1].wallet,'142qcczyeBVfxqNJp7b7RzGBUdbYKjk9E8x9T1Cm3ASz');
 assert.equal(value.trades[0].timestamp,'2026-10-28T06:29:08.000Z');
 assert.equal(value.labels[0].category,'pool');
 assert.ok(value.transfers.every(t=>t.transaction&&t.timestamp&&t.source));
});
test('duplicate signatures, failed transactions, and missing timestamps never inflate evidence',()=>{
 assert.equal(parseAlchemySolanaTransactions([...fixture,...fixture],mint).trades.length,2);
 const failed=fixture.map(t=>({...t,meta:{...t.meta,err:{InstructionError:[1,'Failure']}}}));
 assert.equal(parseAlchemySolanaTransactions(failed,mint).trades.length,0);
 assert.equal(parseAlchemySolanaTransactions(fixture.map(t=>({...t,blockTime:null})),mint).transfers.length,0);
});
test('token balance deltas, minting and arbitrary token transfers do not establish buys',()=>{
 const altered=JSON.parse(JSON.stringify(fixture).replaceAll(pump,'11111111111111111111111111111111'));
 const result=parseAlchemySolanaTransactions(altered,mint);
 assert.equal(result.trades.length,0);assert.equal(result.identities.length,0);
 assert.ok(result.transfers.some(t=>!t.native));
});
test('unverified account owner and absent CPI stack boundaries withhold trade attribution',()=>{
 const altered=structuredClone(fixture);
 altered[1].meta.preTokenBalances.forEach(b=>{b.owner='11111111111111111111111111111111';});
 altered[1].meta.postTokenBalances.forEach(b=>{b.owner='11111111111111111111111111111111';});
 // Remove initialization mappings as well, so there is no alternative owner proof.
 altered[1].meta.innerInstructions=[];
 assert.equal(parseAlchemySolanaTransactions([altered[1]],mint).trades.length,0);
 const missingHeight=JSON.parse(JSON.stringify(fixture[1]));
 for(const group of missingHeight.meta.innerInstructions)for(const i of group.instructions)delete i.stackHeight;
 assert.equal(parseAlchemySolanaTransactions([missingHeight],mint).trades.length,0);
});
test('adapter follows pagination, deduplicates oldest/latest overlap, and never calls incomplete history a verified launch',async()=>{
 const requests:Record<string,unknown>[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body)),query=body.params[1];requests.push(query);
  assert.equal(query.maxSupportedTransactionVersion,1);assert.equal(query.commitment,'finalized');
  return Response.json({result:query.sortOrder==='desc'?{data:fixture,paginationToken:null}:query.paginationToken?{data:[fixture[1]],paginationToken:null}:{data:[fixture[0]],paginationToken:'next-page'}});
 };
 const fetchHistory=createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:0});
 const value=await fetchHistory(options);
 assert.equal(value.trades.length,2);assert.equal(value.coverage.earlyTransactions,2);assert.equal(value.coverage.launchVerified,false);assert.equal(value.coverage.complete,false);
 assert.ok(requests.some(r=>r.paginationToken==='next-page'));
 const calls=requests.length;await fetchHistory(options);assert.equal(requests.length,calls);
});
test('partial latest-page failure preserves early actual evidence and records unavailable coverage',async()=>{
 const fetcher:typeof fetch=async(_url,init)=>{const query=JSON.parse(String(init?.body)).params[1];return Response.json(query.sortOrder==='desc'?{error:{code:-32005}}:{result:{data:fixture,paginationToken:'more'}});};
 const value=await createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:0})({...options,limit:2});
 assert.equal(value.trades.length,2);assert.ok(value.reasons.some(r=>r.includes('failed')));assert.equal(value.coverage.historicalCursorRemaining,true);
});
test('a later page failure retains the already retrieved oldest transactions',async()=>{
 const fetcher:typeof fetch=async(_url,init)=>{const query=JSON.parse(String(init?.body)).params[1];return Response.json(query.sortOrder==='desc'||query.paginationToken?{error:{code:-32005}}:{result:{data:[fixture[0]],paginationToken:'next-page'}});};
 const value=await createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:0})(options);
 assert.equal(value.trades.length,1);assert.equal(value.coverage.earlyTransactions,1);assert.ok(value.reasons.some(r=>r.includes('failed')));
});
test('rent and tipping destinations are not exposed as native funding recipients for candidate token wallets',async()=>{
 const fetcher:typeof fetch=async()=>Response.json({result:{data:fixture,paginationToken:null}});
 const value=await createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:0})(options);
 const wallets=new Set(value.trades.map(t=>t.wallet));
 assert.ok(value.transfers.filter(t=>t.native).every(t=>wallets.has(t.to)));
 assert.ok(!value.transfers.some(t=>t.native&&t.to===mint));
});
test('cancelled caller never receives a cached or late historical result',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(()=>createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test'})({...options,signal:controller.signal}),{name:'AbortError'});
});
test('only pre-buy incoming movements without target-token activity are eligible acquisition funding',async()=>{
 const actualWallet=parseAlchemySolanaTransactions([fixture[0]],mint).trades[0].wallet;
 const native=(signature:string,seconds:number,touchesToken=false)=>({blockTime:seconds,transaction:{signatures:[signature],message:{accountKeys:[],instructions:[{programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:'142qcczyeBVfxqNJp7b7RzGBUdbYKjk9E8x9T1Cm3ASz',destination:actualWallet,lamports:1e9}}}]}},meta:{err:null,preTokenBalances:touchesToken?[{mint}]:[],postTokenBalances:[],innerInstructions:[]}});
 const before=fixture[0].blockTime-10;
 const records=[native('funding-before',before),native('same-second-refund',fixture[0].blockTime),native('later-proceeds',fixture[0].blockTime+10),native('unsupported-token-sale',before,true)];
 const fetcher:typeof fetch=async(_url,init)=>{const [account]=JSON.parse(String(init?.body)).params;return Response.json({result:{data:account===mint?fixture:records,paginationToken:null}});};
 const value=await createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:2})(options);
 for(const record of records){const signature=record.transaction.signatures[0],observed=value.transfers.find(t=>t.transaction===signature);assert.ok(observed,`Keep ${signature} as actual transfer evidence`);assert.equal(observed.fundingEligible,signature==='funding-before');}
 assert.ok(parseAlchemySolanaTransactions(fixture,mint).transfers.filter(t=>t.native).every(t=>t.fundingEligible===false));
});
test('current holders without a known first buy keep incoming native receipts but no funding inference',async()=>{
 const holder='HeZVpHj9jLwTVtMMbzQRf6mLtFPkWNSg11o68qrbUBa3';
 const receipt={blockTime:fixture[0].blockTime-100,transaction:{signatures:['unknown-buy-holder'],message:{accountKeys:[],instructions:[{programId:'11111111111111111111111111111111',parsed:{type:'transfer',info:{source:'142qcczyeBVfxqNJp7b7RzGBUdbYKjk9E8x9T1Cm3ASz',destination:holder,lamports:1e9}}}]}},meta:{err:null,preTokenBalances:[],postTokenBalances:[],innerInstructions:[]}};
 const fetcher:typeof fetch=async(_url,init)=>{const [account]=JSON.parse(String(init?.body)).params;return Response.json({result:{data:account===mint?fixture:account===holder?[receipt]:[],paginationToken:null}});};
 const value=await createAlchemySolanaHistory({rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',fetcher,fundingWalletLimit:2})({...options,walletAddresses:[holder]});
 const observed=value.transfers.find(t=>t.transaction==='unknown-buy-holder');assert.ok(observed);assert.equal(observed.fundingEligible,false);
});
