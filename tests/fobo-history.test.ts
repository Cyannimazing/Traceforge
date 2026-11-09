import test from 'node:test';
import assert from 'node:assert/strict';
import {readFoboHistory,FOBO_HOOK,FOBO_HISTORY_SOURCE,TAX_PAID} from '../src/lib/fobo-history';
import {analyzeInvestigation} from '../src/lib/investigation';
import {rpc,token,creator,poolId,launchTx,buyers,buyReceipt,defaultReceipts,header,blockHash,time,pad,LAUNCH_BLOCK,type ChainOptions} from './fobo-fixture';

function setup(options:ChainOptions&{anchorTime?:number}={}){
 const respond=rpc(options),safe=LAUNCH_BLOCK+20_000;
 return {token,poolId,decimals:18,launch:{transaction:launchTx,blockNumber:LAUNCH_BLOCK,blockHash:blockHash(LAUNCH_BLOCK),transactionIndex:1},anchor:{number:safe,hash:blockHash(safe),timestamp:options.anchorTime??time(safe)},observedAt:new Date(time(safe)*1000).toISOString(),batch:async(calls:{method:string;params:unknown[]}[])=>calls.map(c=>respond(c))};
}

test('dev buy, direct, routed and multi-hop buys resolve with a sixty-second window from the first purchase',async()=>{
 const r=await readFoboHistory(setup());
 assert.equal(r.proof?.protocol,'fobo-v1');assert.equal(r.proof?.chain,'robinhood');assert.equal(r.proof?.scope,'selected-launchpad');
 assert.equal(r.proof?.firstPurchaseTransaction,launchTx);assert.equal(r.proof?.firstPurchaseAt,new Date(time(LAUNCH_BLOCK)*1000).toISOString());
 assert.deepEqual(r.trades.map(t=>t.wallet),[creator,buyers.a,buyers.b,'0x'+'9'.repeat(40),buyers.e]);
 assert(r.trades.every(t=>t.source===FOBO_HISTORY_SOURCE&&t.side==='buy'));
 // The buy at seventy seconds is a verified trade but outside the first minute.
 assert.equal(r.proof?.eligibleTradeIds.length,4);assert(!r.proof?.eligibleTradeIds.includes(r.trades[4].id));
 assert(r.proof!.through.blockNumber>LAUNCH_BLOCK+600);
});

test('sells inside the window are covered but never become buys',async()=>{
 const receipts=[...defaultReceipts(),buyReceipt(9,LAUNCH_BLOCK+200,'0x'+'4'.repeat(40),'direct',false)];
 const r=await readFoboHistory(setup({receipts}));assert.ok(r.proof);assert(!r.trades.some(t=>t.wallet==='0x'+'4'.repeat(40)));
});

test('missing receipts, unindexed receipt events, undelivered buys and unfinished windows withhold timing',async()=>{
 const missing=await readFoboHistory(setup({receiptOverride:h=>h===defaultReceipts()[2].transactionHash?null:undefined}));
 assert.equal(missing.proof,undefined);assert.equal(missing.trades.length,0);
 const gap=await readFoboHistory(setup({indexedFilter:l=>l.address!==FOBO_HOOK||l.transactionHash!==defaultReceipts()[1].transactionHash}));
 assert.equal(gap.proof,undefined);
 const forged=await readFoboHistory(setup({receipts:[...defaultReceipts(),buyReceipt(8,LAUNCH_BLOCK+150,'0x'+'5'.repeat(40),'undelivered')]}));
 assert.equal(forged.proof,undefined);assert.match(forged.reasons.join(' '),/could not be fully verified/);
 const early=await readFoboHistory(setup({anchorTime:time(LAUNCH_BLOCK)+30}));
 assert.equal(early.proof,undefined);
 const doubleTax=defaultReceipts();const extra=structuredClone(doubleTax[1].logs[0]);extra.logIndex='0x20';doubleTax[1].logs.push(extra);
 assert.equal((await readFoboHistory(setup({receipts:doubleTax}))).proof,undefined);
});

test('changed launch block hash during verification withholds timing',async()=>{
 const input=setup();let calls=0;const original=input.batch;
 input.batch=async c=>{const rows=await original(c);if(c.length===2&&c.every(x=>x.method==='eth_getBlockByNumber')&&++calls===1)return rows.map((v,i)=>i===0?{...header(LAUNCH_BLOCK),hash:'0x'+'1'.repeat(64)}:v);return rows;};
 assert.equal((await readFoboHistory(input)).proof,undefined);
});

test('FOBO launchpad proof yields first-minute sniper roles in the investigation',async()=>{
 const s=setup(),r=await readFoboHistory(s);
 const result=analyzeInvestigation({chain:'robinhood',token,holders:r.trades.map(t=>({address:t.wallet,share:1})),trades:r.trades,transfers:[],identities:[],labels:[{address:FOBO_HOOK,category:'pool',label:'FOBO hook',source:'test',timestamp:s.observedAt}],curveTiming:r.proof,launchVerified:false,complete:false,reasons:r.reasons,fetchedAt:s.observedAt,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true});
 const snipers=result.wallets.filter(w=>w.categories.includes('sniper')).map(w=>w.address).sort();
 assert.deepEqual(snipers,[creator,buyers.a,buyers.b,'0x'+'9'.repeat(40)].sort());
 assert.equal(result.coverage.curveTiming?.protocol,'fobo-v1');assert.equal(result.coverage.launchVerified,false);
 assert(result.evidence.some(e=>e.id===`curve-timing:${token}:window`&&/FOBO hook TaxPaid/.test(e.description)));
 void TAX_PAID;void pad;
});
