import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeInvestigation,type InvestigationInput,type TradeRecord,type TransferRecord} from '../src/lib/investigation';
import {classifyWalletRoles} from '../src/lib/wallet-role-presentation';
import type {PoolTimingProof} from '../src/lib/investigation-types';

const at='2026-11-09T01:00:00.000Z',a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),tx=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const token=a(1),alice=a(4),bob=a(5),carol=a(6),router=a(9),dave=a(7);
const plus=(seconds:number)=>new Date(Date.parse(at)+seconds*1000).toISOString();
const buy=(id:string,wallet:string,transaction:string,timestamp=at):TradeRecord=>({id,wallet,side:'buy',amount:10,timestamp,transaction,source:'Synthetic receipts'});
const send=(id:string,from:string,to:string,transaction:string):TransferRecord=>({id,from,to,amount:5,timestamp:at,token,native:false,transaction,source:'Synthetic receipts'});
function input(patch:Partial<InvestigationInput>={}):InvestigationInput{
 return {chain:'ethereum',token,holders:[alice,bob,carol,dave].map(address=>({address,share:5})),trades:[],transfers:[],identities:[],labels:[],launchVerified:false,complete:false,reasons:[],fetchedAt:plus(3600),holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true,...patch};
}
const cats=(r:ReturnType<typeof analyzeInvestigation>,w:string)=>r.wallets.find(x=>x.address===w)?.categories||[];

test('holders buying in the same transaction are linked as a bundled buy',()=>{
 const r=analyzeInvestigation(input({trades:[buy('1',alice,tx(1)),buy('2',bob,tx(1)),buy('3',carol,tx(2))]}));
 assert.ok(cats(r,alice).includes('bundled')&&cats(r,bob).includes('bundled'));
 assert.ok(!cats(r,carol).includes('bundled'),'a separate transaction is not bundled');
 assert.ok(r.relationships.some(x=>x.kind==='bundle'&&[x.from,x.to].sort().join()===[alice,bob].sort().join()));
 assert.ok(r.findings.some(f=>f.title==='Bundled buy observed'));
});

test('entering together needs a verified first-minute window',()=>{
 const trades=[buy('1',alice,tx(1),plus(5)),buy('2',bob,tx(2),plus(9))];
 const untimed=analyzeInvestigation(input({trades}));
 assert.ok(!cats(untimed,alice).includes('pack'),'no verified window: no entered-together link');
 const proof:PoolTimingProof={verified:true,scope:'selected-pool',pool:a(3),chain:'ethereum',firstSwapAt:at,firstSwapTransaction:tx(9),firstSwapLogIndex:0,windowEndAt:plus(60),creation:{transaction:tx(8),blockNumber:1,blockHash:tx(7)},through:{blockNumber:9,blockHash:tx(6),timestamp:plus(120)},factory:a(2),token0:token,token1:a(8),eligibleTradeIds:['1','2'],verifiedAt:plus(3600)};
 const timed=analyzeInvestigation(input({trades,poolTiming:proof,poolTimings:[proof]}));
 assert.ok(cats(timed,alice).includes('pack')&&cats(timed,bob).includes('pack'));
 assert.ok(timed.relationships.some(x=>x.kind==='pack'));
});

test('a distributor must be a proven real wallet, so routers never link buyers',()=>{
 const transfers=[send('1',dave,alice,tx(1)),send('2',dave,bob,tx(2)),send('3',router,carol,tx(3)),send('4',router,alice,tx(4))];
 const r=analyzeInvestigation(input({transfers,eoaAddresses:[dave]}));
 assert.ok(cats(r,alice).includes('distributed')&&cats(r,bob).includes('distributed'));
 assert.ok(!cats(r,carol).includes('distributed'),'the router (not a proven wallet) creates no distributor link');
 assert.ok(r.relationships.some(x=>x.kind==='distributor'));
 const none=analyzeInvestigation(input({transfers}));
 assert.ok(!none.relationships.some(x=>x.kind==='distributor'),'without proven wallets there are no distributor links');
});

test('every established fact is shown as a flag, not just "Holder"',()=>{
 const holder=classifyWalletRoles(['accumulator','contract','fresh','seller'],[],true,false);
 assert.equal(holder.label,'Holder');
 assert.deepEqual(holder.badges.sort(),['Accumulator','Contract address','Fresh wallet','Seller'].sort());
 const bundled=classifyWalletRoles(['bundled','accumulator'],[],true,false);
 assert.equal(bundled.label,'Bundled buy');assert.deepEqual(bundled.badges,['Accumulator']);
 const sniper=classifyWalletRoles(['sniper'],[],true,false);
 assert.ok(!sniper.badges.includes('Possible sniper'),'a sniper flag needs verified timing');
});
