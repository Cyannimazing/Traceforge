import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeInvestigation,type InvestigationInput} from '../src/lib/investigation';
import type {InvestigationReport,PoolTimingProof} from '../src/lib/investigation-types';
import type {HistoryJob,HistoryPool} from '../src/lib/history-store';
import {mergeHistoryReport,retainVerifiedPoolHistory} from '../src/lib/history-merge';
import {computeRiskMetrics} from '../src/lib/risk-metrics';
import {trustRating} from '../src/lib/trust-rating';
const at=(n:number)=>new Date(Date.UTC(2026,0,1)+n*1000).toISOString();
function report():InvestigationReport{
 const input:InvestigationInput={chain:'ethereum',token:'token',holders:[{address:'buyer',share:12,balance:8}],trades:[{id:'feed',wallet:'buyer',timestamp:at(10),side:'buy',amount:99,transaction:'tx-p1',source:'Public feed'},{id:'other',wallet:'buyer',timestamp:at(300),side:'sell',amount:2,transaction:'sell',source:'Public feed'}],transfers:[{id:'fund',from:'creator',to:'buyer',timestamp:at(-1),amount:1,token:'ETH',native:true,transaction:'fundtx',source:'Explorer'}],identities:[{address:'creator',role:'creator',timestamp:at(-10),source:'Explorer'}],labels:[{address:'exchange',category:'exchange',label:'Known exchange',timestamp:at(0),source:'Explorer'}],launchVerified:false,complete:false,reasons:['Provider limited sample'],fetchedAt:at(600),holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true};
 const investigation=analyzeInvestigation(input);investigation.evidence.push({id:'holding:ethereum:buyer',kind:'holding',timestamp:at(500),description:'Snapshot',source:'Holders'},{id:'security:mint',kind:'label',timestamp:at(500),description:'Can mint',source:'GoPlus Security'});investigation.wallets.find(w=>w.address==='buyer')!.evidenceIds.push('holding:ethereum:buyer');investigation.findings.push({id:'security:mint',title:'Mint',description:'Can mint',level:'critical',certainty:'observed',wallets:[],evidenceIds:['security:mint']});
 return {chain:'ethereum',token:'token',name:'Token',symbol:'T',fetchedAt:at(600),market:null,holders:[{address:'buyer',share:12,contract:null,locked:null,tag:''}],holderCount:null,identities:input.identities,checks:[{key:'mint',title:'Mint',status:'critical',value:'Yes',description:'Can mint',source:'GoPlus Security',fetchedAt:at(600)}],sources:[{name:'GoPlus Security',status:'available',detail:'Current controls',fetchedAt:at(600)},{name:'Holders',status:'available',detail:'Current',fetchedAt:at(500)}],investigation};
}
function pool(name='p1',start=0):HistoryPool{
 const id=`ethereum:${name}:tx-${name}:1`,proof:PoolTimingProof={verified:true,scope:'selected-pool',chain:'ethereum',pool:name,token0:'token',token1:'other',factory:'factory',firstSwapAt:at(start),firstSwapTransaction:`tx-${name}`,firstSwapLogIndex:1,windowEndAt:at(start+60),through:{blockNumber:100,blockHash:'hash',timestamp:at(start+61)},creation:{blockNumber:1,blockHash:'createhash',transaction:'create'},eligibleTradeIds:[id],verifiedAt:at(700)};
 return {pool:name,status:'complete',checkpoint:null,message:'Complete',updatedAt:at(700),result:{status:'verified',scope:'selected-pool',pool:name,token:'token',proof,trades:[{id,wallet:'buyer',timestamp:at(start+10),side:'buy',amount:5,amountRaw:'5000000',decimals:6,transaction:`tx-${name}`,source:'Verified pool'}],reasons:[],sources:[{name:'Selected pool first minute',status:'available',fetchedAt:at(700),detail:'Canonical receipts verified'}]}};
}
function job(pools=[pool()]):HistoryJob{return {id:'job',chain:'ethereum',token:'token',status:'paused',createdAt:at(600),updatedAt:at(700),revision:4,message:'Paused',poolLimit:20,progress:null,result:null,leaseExpiresAt:null,pools,counts:{complete:pools.length,queued:0,running:0,paused:0,blocked:0}};}
test('historical evidence merge refreshes API decision output instead of retaining an obsolete allocation',()=>{
 const original=report();original.decisionOutput={version:'verdict-output-v2',decision:'CAUTION',p:{avoid:.1,caution:.8,ok:.1},selectedWeight:.8,basis:'uncertainty-allocation',score:null,explanation:'Old allocation'};
 const merged=mergeHistoryReport(original,job());assert.equal(merged.decisionOutput?.basis,'rule');assert.equal(merged.decisionOutput?.decision,'AVOID');assert.deepEqual(merged.decisionOutput?.p,{avoid:1,caution:0,ok:0});
});
test('quiet archive refresh preserves both client-applied verified pool windows',()=>{
 const previous=mergeHistoryReport(report(),job([pool(),pool('p2',100)])),next=report();
 next.fetchedAt=at(800);next.investigation.coverage.fetchedAt=at(800);
 next.holders[0].share=9;next.investigation.wallets.find(w=>w.address==='buyer')!.share=9;
 const refreshed=retainVerifiedPoolHistory(previous,next);
 assert.equal(refreshed.investigation.coverage.poolTimings?.length,2);
 assert.equal(refreshed.investigation.wallets.find(w=>w.address==='buyer')?.bought,10);
 assert.equal(refreshed.holders[0].share,9);
 assert.equal(refreshed.investigation.coverage.launchVerified,false);
});
test('completed pool evidence replaces overlapping feed totals while retaining sources, holdings, security and funding',()=>{
 const original=report(),merged=mergeHistoryReport(original,job());const buyer=merged.investigation.wallets.find(w=>w.address==='buyer')!;
 assert.equal(buyer.bought,5);assert.equal(buyer.sold,2);assert.equal(buyer.share,12);assert.equal(buyer.balance,8);assert(buyer.categories.includes('sniper'));assert(buyer.categories.includes('deployer-linked'));
 assert(merged.investigation.wallets.find(w=>w.address==='exchange')?.categories.includes('exchange'));assert.equal(merged.investigation.relationships.find(r=>r.kind==='funding')?.from,'creator');
 for(const evidence of original.investigation.evidence)assert.deepEqual(merged.investigation.evidence.find(e=>e.id===evidence.id),evidence);
 assert(buyer.evidenceIds.includes('holding:ethereum:buyer'));assert.equal(merged.investigation.assessment.status,'critical');assert.equal(merged.sources.find(s=>s.name==='Holders')?.fetchedAt,at(500));assert.equal(merged.fetchedAt,at(600));assert.equal(merged.investigation.coverage.launchVerified,false);
 assert.equal(original.investigation.wallets.find(w=>w.address==='buyer')?.bought,99);
});

test('completed history recomputes stale derived metrics and decision including the independent rating',()=>{
 const original=report();original.riskMetrics={version:'evidence-metrics-v1',metrics:[],gaps:['stale snapshot']};original.trustRating={version:'evidence-v3',score:80,decision:'OK',basis:'stale',reasons:[],components:[],ceiling:null};
 const merged=mergeHistoryReport(original,job());
 assert.equal(merged.riskMetrics?.metrics.find(metric=>metric.id==='largest-holder-supply')?.value,12);
 assert.equal(merged.trustRating?.decision,'AVOID');assert.equal(merged.trustRating?.score,null);
 assert.deepEqual(original.riskMetrics.gaps,['stale snapshot']);assert.equal(original.trustRating.decision,'OK');
});

test('history reconstruction scores freshly computed holder metrics rather than an earlier derived snapshot',()=>{
 const original=report();original.checks=['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'].map(key=>({key,title:key,status:'clear',value:'No',description:''}));original.investigation.findings=[];
 original.sources.push({name:'GoPlus Security',status:'available',detail:'Current controls',fetchedAt:at(600)});
 const small=structuredClone(original);small.holders[0].share=3;small.investigation.wallets.find(w=>w.address==='buyer')!.share=3;
 original.riskMetrics=computeRiskMetrics(small);
 const merged=mergeHistoryReport(original,job()),distribution=merged.trustRating!.components.find(c=>c.id==='concentration')!;
 assert.equal(merged.riskMetrics!.metrics.find(m=>m.id==='largest-holder-adjusted-float')!.value,12);
 assert.equal(distribution.state,'unknown');assert.equal(distribution.lower,0);assert.equal(distribution.upper,15);assert.match(distribution.detail,/12\.0000%/);
 assert.equal(merged.investigation.assessment.status,'caution');
 assert.deepEqual(merged.trustRating,trustRating(merged));assert.equal(original.riskMetrics.metrics.find(m=>m.id==='largest-holder-adjusted-float')?.value,3);
});
test('repeat merge is idempotent and different canonical pool logs in one transaction remain distinct',()=>{
 const a=pool(),b=pool('p2',100);const result=b.result as any;result.trades[0].transaction='tx-p1';result.trades[0].id='ethereum:p2:tx-p1:2';result.proof.eligibleTradeIds=[result.trades[0].id];
 const history=job([a,b]),once=mergeHistoryReport(report(),history),twice=mergeHistoryReport(once,history);
 assert.equal(twice.investigation.wallets.find(w=>w.address==='buyer')?.bought,10);assert.equal(twice.investigation.timeline.filter(e=>e.kind==='buy').length,2);assert.deepEqual(twice,once);assert.equal(twice.investigation.coverage.poolTimings?.length,2);assert.equal(twice.investigation.coverage.launchVerified,false);
});
test('partial, wrong-scope or malformed pool data cannot add proof or trades',()=>{
 const original=report();for(const mutate of [(p:HistoryPool)=>{p.status='paused';},(p:HistoryPool)=>{(p.result as any).status='partial';},(p:HistoryPool)=>{(p.result as any).token='other';},(p:HistoryPool)=>{(p.result as any).proof.chain='base';},(p:HistoryPool)=>{(p.result as any).proof.through=null;},(p:HistoryPool)=>{(p.result as any).trades[0].id='unverified-feed-id';}]){const p=pool();mutate(p);assert.deepEqual(mergeHistoryReport(original,job([p])),original);}
 assert.equal(mergeHistoryReport(original,{...job(),chain:'base'}),original);assert.equal(mergeHistoryReport(original,{...job(),token:'wrong'}),original);
});
test('a partial overall job exposes only completed pool proof and never claims an exhaustive registry',()=>{
 const unfinished=pool('p2',100);unfinished.status='paused';const merged=mergeHistoryReport(report(),job([pool(),unfinished]));assert.equal(merged.investigation.coverage.poolTimings?.length,1);assert.equal(merged.investigation.wallets.find(w=>w.address==='buyer')?.bought,5);assert.notEqual(merged.investigation.coverage.status,'complete');assert.match(merged.investigation.coverage.reasons.join(' '),/not.*exhaustive|not.*complete.*registry/i);
});
test('raw-only historical amounts keep totals unknown through repeat reconstruction',()=>{
 const p=pool(),result=p.result as any;delete result.trades[0].amount;delete result.trades[0].decimals;
 const merged=mergeHistoryReport(report(),job([p]));assert.equal(merged.investigation.wallets.find(w=>w.address==='buyer')?.bought,undefined);assert.equal(merged.investigation.wallets.find(w=>w.address==='buyer')?.sold,undefined);
 const again=mergeHistoryReport(merged,job([p]));assert.equal(again.investigation.wallets.find(w=>w.address==='buyer')?.bought,undefined);assert.equal(again.investigation.evidence.find(e=>e.id.includes('ethereum:p1:'))?.amountRaw,'5000000');
});

test('a fresh report quorum takes precedence over an expired persisted job clock without shifting events',()=>{
 const current=report(),p=pool('p1',10000),history=job([p]);current.investigation.coverage.fetchedAt=at(700);
 const quorum=(local:number,reference:number)=>({basis:'provider-quorum' as const,localCapturedAt:at(local),referenceAt:at(reference),offsetMs:(reference-local)*1000,sources:[{name:'A',date:'',age:null,cache:null},{name:'B',date:'',age:null,cache:null}],detail:'Comparison clock'});
 history.progress={clock:quorum(0,10800)};current.investigation.coverage.clock=quorum(700,11500);
 const merged=mergeHistoryReport(current,history);assert.equal(merged.investigation.coverage.poolTimings?.length,1);assert.equal(merged.investigation.coverage.clock?.referenceAt,at(11500));assert.equal(merged.investigation.timeline.find(t=>t.kind==='buy')?.timestamp,at(10010));
});
