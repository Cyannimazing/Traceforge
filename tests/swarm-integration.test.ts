import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSwarmReport, type SwarmReport, type SwarmResult} from '../src/lib/swarm';
import {bridgeSwarmReport} from '../src/lib/swarm-bridge';
import {createProviderInvestigationService} from '../src/lib/provider-investigation-service';
import {mergeReportRefresh,mergeDeepReport} from '../src/lib/report-refresh';
import {mergeHistoryReport} from '../src/lib/history-merge';
import type {InvestigationReport, ScanEvent, PoolTimingProof} from '../src/lib/investigation-types';
import type {HistoryJob} from '../src/lib/history-store';

const token='0x'+'1'.repeat(40), creator='0x'+'2'.repeat(40), buyer='0x'+'3'.repeat(40), other='0x'+'4'.repeat(40);
const at=(seconds:number)=>new Date(Date.UTC(2026,0,1)+seconds*1000).toISOString();
function sample(overrides:Partial<SwarmReport>={}):SwarmReport{
 const report=normalizeSwarmReport({chain:'ethereum',token,score:59,band:'RISKY',reason:'Provider warning',scanned_at:Date.parse(at(100))/1000,creator,header:{name:'Sample',symbol:'S',holders_count:1000},holders:[{address:buyer,share:.4,share_supply:.02,signals:{dev:true,sniper:true,contract:true,from_dev:true}},{address:creator,share:.1,share_supply:.001,signals:{}}],links:[{a:buyer,b:creator,kind:'direct',level:'proven'}],clusters:[{id:'g',wallets:[buyer,creator],share:.5}],security:{checks:[{id:'owner',title:'Active owner',detail:'Provider warning',level:'warn'}]}},'ethereum',token,at(600));
 return {...report,...overrides};
}
function independent():InvestigationReport{
 const report=bridgeSwarmReport(sample());delete report.providerAnalysis;
 report.name='Independent';report.sources=[{name:'DEX Screener',status:'available',fetchedAt:at(700),detail:'Market snapshot'}];report.market={chainId:'ethereum',baseToken:{address:token},priceUsd:'1.25'};report.fetchedAt=at(700);
 return report;
}

test('bridge preserves provider scope, overlapping flags and supply denominator without inventing proof',()=>{
 const report=bridgeSwarmReport(sample()),wallet=report.investigation.wallets.find(w=>w.address===buyer)!;
 assert.equal(wallet.share,2);assert.equal(wallet.categories.includes('creator'),false);assert.deepEqual(new Set(wallet.categories),new Set(['sniper','contract','deployer-linked']));assert.equal(wallet.categorySources?.sniper,'swarm');
 assert.equal(report.investigation.wallets.find(w=>w.address===creator)?.categorySources?.creator,'swarm');
 assert.equal(report.investigation.wallets.some(w=>w.categories.includes('authority')),false);assert.equal(report.investigation.timeline.length,0);assert.equal(wallet.firstBuyAt,undefined);
 assert.equal(report.investigation.coverage.launchVerified,false);assert.equal(report.investigation.coverage.status,'partial');assert.equal(report.investigation.relationships[0].kind,'provider-reported');
 assert(report.investigation.evidence.every(e=>e.attribution==='provider-reported'&&!e.transaction&&e.timestamp===at(100)));
 assert.equal(report.providerAnalysis?.fetchedAt,at(600));assert.equal(report.providerAnalysis?.holders[0].shareFloat,.4);
});
test('clean upstream report cannot establish safe or complete; explicit danger remains danger',()=>{
 const clean=bridgeSwarmReport(sample({band:'CLEAN',security:[]}));assert.equal(clean.investigation.assessment.status,'insufficient');assert.equal(clean.investigation.coverage.launchVerified,false);
 const danger=bridgeSwarmReport(sample({band:'CLEAN',security:[{id:'mint',level:'danger',title:'Mint authority',detail:'Provider flags supply controls'}]}));assert.equal(danger.investigation.assessment.status,'critical');assert.equal(danger.checks[0].status,'critical');
});
test('missing scan timestamp is retrieval explicitly, never a fabricated event time',()=>{
 const report=bridgeSwarmReport(sample({providerTimestamp:null}));assert.equal(report.investigation.evidence[0].timestamp,at(600));assert.match(report.investigation.evidence[0].description,/timestamp records retrieval/);
});
test('provider primary adds market context but never imports independent authority or role assertions',async()=>{
 const calls:string[]=[],events:ScanEvent[]=[];
 const service=createProviderInvestigationService({provider:async(_c,_t,o)=>{assert.equal(o.allowScan,true);return{status:'available',cached:true,report:sample()};},independent:{scan:async(_c,_t,o)=>{calls.push(o?.mode||'deep');return independent();}}});
 const result=await service.scan('ethereum',token,{onEvent:e=>events.push(e)});
 assert.deepEqual(calls,['market']);assert.equal(result.market?.priceUsd,'1.25');assert.equal(result.name,'Sample');assert.equal(result.identities,undefined);assert.equal(result.providerAnalysis?.providerTimestamp,at(100));assert.equal(result.investigation.timeline.length,0);
 assert(events.some(e=>e.type==='stage'&&e.stage==='provider-report'&&e.status==='complete'));assert(events.some(e=>e.type==='stage'&&e.stage==='market-context'));assert(!events.some(e=>e.type==='stage'&&e.stage==='public-data'));
});
test('market refresh skips provider; holder refresh does not initiate provider scans',async()=>{
 let providerCalls=0;const modes:(string|undefined)[]=[];
 const service=createProviderInvestigationService({provider:async(_c,_t,o)=>{providerCalls++;assert.equal(o.allowScan,false);return{status:'available',cached:true,report:sample()};},independent:{scan:async(_c,_t,o)=>{modes.push(o?.mode);return independent();}}});
 await service.scan('ethereum',token,{mode:'market'});assert.equal(providerCalls,0);await service.scan('ethereum',token,{mode:'holders'});assert.equal(providerCalls,1);assert.deepEqual(modes,['market','market']);
});
test('explicit independent expanded scan bypasses provider and keeps larger-sample request',async()=>{
 let calls=0;const events:ScanEvent[]=[];
 const service=createProviderInvestigationService({provider:async()=>{throw Error('Provider should not run');},independent:{scan:async(_c,_t,o)=>{calls++;assert.equal(o?.expanded,true);return independent();}}});
 const result=await service.scan('ethereum',token,{expanded:true,onEvent:e=>events.push(e)});
 assert.equal(calls,1);assert.equal(result.providerAnalysis,undefined);assert(events.some(e=>e.type==='stage'&&e.stage==='independent-scan'&&e.detail.includes('not requested')));
});
test('pending, unavailable and rate-limited provider results use independent fallback with explicit source failure',async()=>{
 for(const status of ['pending','unavailable','rate-limited'] as const){
  let calls=0;const service=createProviderInvestigationService({provider:async()=>({status,cached:false}),independent:{scan:async(_c,_t,o)=>{calls++;assert.equal(o?.mode,'deep');return independent();}}});
  const report=await service.scan('ethereum',token,{mode:'deep'});assert.equal(calls,1);assert.equal(report.name,'Independent');assert.equal(report.providerAnalysis,undefined);assert.equal(report.sources.find(s=>s.name==='Swarm provider report')?.status,'unavailable');
 }
});
test('market failure preserves provider report while cancellation never falls back',async()=>{
 const service=createProviderInvestigationService({provider:async()=>({status:'available',cached:false,report:sample()}),independent:{scan:async()=>{throw Error('private diagnostics');}}});
 const result=await service.scan('ethereum',token);assert.equal(result.providerAnalysis?.score,59);assert.equal(result.market,null);assert(!JSON.stringify(result).includes('private diagnostics'));
 const controller=new AbortController();let calls=0;
 const cancelled=createProviderInvestigationService({provider:async()=>{controller.abort(Error('cancelled'));throw Error('provider');},independent:{scan:async()=>{calls++;return independent();}}});
 await assert.rejects(cancelled.scan('ethereum',token,{signal:controller.signal}),/cancelled/);assert.equal(calls,0);
});
test('provider snapshot refresh replaces classifications atomically; failures retain prior scan and do not merge independent labels',()=>{
 const original=bridgeSwarmReport(sample()),next=bridgeSwarmReport(sample({holders:[],relationships:[],groups:[],creator:null,security:[],band:'CLEAN'}));
 assert.equal(mergeReportRefresh(original,next,'holders').investigation.wallets.length,0);
 const failed=independent();failed.sources.push({name:'Swarm provider report',status:'unavailable',detail:'Rate limited'});failed.investigation.wallets[0].categories=['authority'];
 const retained=mergeReportRefresh(original,failed,'holders');assert.deepEqual(retained.investigation.wallets,original.investigation.wallets);assert.equal(retained.providerAnalysis?.providerTimestamp,at(100));assert.match(retained.investigation.coverage.reasons.join(' '),/retaining the last successful/);
 const market=mergeReportRefresh(original,independent(),'market');assert.equal(market.market?.priceUsd,'1.25');assert.deepEqual(market.investigation,original.investigation);assert.deepEqual(market.providerAnalysis,original.providerAnalysis);
 assert.equal(mergeDeepReport(original,next),next);
 assert.equal(retained.riskMetrics,original.riskMetrics);assert.equal(retained.trustRating,original.trustRating);
 assert.equal(market.riskMetrics,original.riskMetrics);assert.equal(market.trustRating,original.trustRating);
 const providerRefresh=mergeReportRefresh(original,next,'holders');
 assert.equal(providerRefresh.riskMetrics,next.riskMetrics);assert.equal(providerRefresh.trustRating,next.trustRating);
});
test('canonical pool history can coexist with provider roles without promoting other claims',()=>{
 const report=bridgeSwarmReport(sample()),pool='pool',transaction='tx',id=`ethereum:${pool}:${transaction}:1`;
 const proof:PoolTimingProof={verified:true,scope:'selected-pool',pool,chain:'ethereum',token0:token,token1:other,factory:'factory',firstSwapAt:at(0),firstSwapTransaction:transaction,firstSwapLogIndex:1,windowEndAt:at(60),through:{blockNumber:100,blockHash:'hash',timestamp:at(61)},creation:{blockNumber:1,blockHash:'created',transaction:'creation'},eligibleTradeIds:[id],verifiedAt:at(700)};
 const job:HistoryJob={id:'job',chain:'ethereum',token,status:'complete',createdAt:at(600),updatedAt:at(700),revision:1,message:'Complete',poolLimit:1,progress:null,result:null,leaseExpiresAt:null,pools:[{pool,status:'complete',checkpoint:null,message:'Complete',updatedAt:at(700),result:{status:'verified',scope:'selected-pool',pool,token,proof,trades:[{id,wallet:buyer,timestamp:at(10),side:'buy',amount:5,transaction,source:'Verified pool'}],sources:[],reasons:[]}}],counts:{complete:1,queued:0,running:0,paused:0,blocked:0}};
 const merged=mergeHistoryReport(report,job),wallet=merged.investigation.wallets.find(w=>w.address===buyer)!;
 assert.equal(merged.investigation.coverage.launchVerified,false);assert.equal(merged.investigation.timeline.length,1);assert.equal(wallet.categorySources?.sniper,undefined);assert.equal(wallet.categorySources?.contract,'swarm');assert.equal(wallet.categorySources?.['deployer-linked'],'swarm');assert.equal(merged.providerAnalysis?.score,59);
 assert(merged.investigation.relationships.some(e=>e.attribution==='provider-reported'));assert(merged.investigation.findings.some(f=>f.id==='swarm:verdict'&&f.attribution==='provider-reported'));
 assert.deepEqual(mergeHistoryReport(merged,job),merged);
 const newer=bridgeSwarmReport(sample({holders:[],creator:null,relationships:[],groups:[],security:[],band:'CLEAN'}));
 const refreshed=mergeReportRefresh(merged,newer,'holders');
 assert.equal(refreshed.investigation.timeline.length,1);assert.equal(refreshed.investigation.coverage.poolTimings?.length,1);
 assert(refreshed.investigation.wallets.find(w=>w.address===buyer)?.categories.includes('sniper'));
 assert(!refreshed.investigation.wallets.some(w=>w.categories.includes('creator')||w.categories.includes('contract')));
 assert(!refreshed.investigation.relationships.some(e=>e.attribution==='provider-reported'));
 const entries=sample();entries.holders[0].signals={...entries.holders[0].signals,kind:'buy',entryAt:at(20),entryTransaction:'0x'+'f'.repeat(64)};
 const withEntry=mergeHistoryReport(bridgeSwarmReport(entries),job);
 assert.equal(withEntry.investigation.wallets.find(w=>w.address===buyer)?.bought,5,'Provider entry without amount is not input to independent trade totals');
 assert.equal(withEntry.investigation.timeline.length,2,'The separate provider observation remains inspectable');
 assert.equal(withEntry.investigation.evidence.find(e=>e.id.startsWith('swarm:entry:'))?.attribution,'provider-reported');
});
