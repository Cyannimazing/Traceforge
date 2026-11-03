import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDeepReport, mergeReportRefresh } from '../src/lib/report-refresh';
import { fixtureReport } from '../src/lib/investigation-fixture';
import type { InvestigationReport, InvestigatedWallet } from '../src/lib/investigation-types';
import { identityEvidence } from '../src/lib/investigation';
import {computeRiskMetrics} from '../src/lib/risk-metrics';
import {trustRating} from '../src/lib/trust-rating';
const at='2026-01-02T12:00:00Z';
const wallet=(address:string,share:number|null,balance?:number):InvestigatedWallet=>({address,share,balance,categories:['unclassified'],evidenceIds:[]});
function report():InvestigationReport {const r=structuredClone(fixtureReport);r.fixture=false;r.sources=[{name:'Bitquery Holders',status:'available',detail:'Snapshot',fetchedAt:r.fetchedAt},{name:'Bitquery Recent trades',status:'available',detail:'Historical sample',fetchedAt:r.fetchedAt}];return r;}
function fresh(old:InvestigationReport):InvestigationReport {const r=structuredClone(old);r.fetchedAt=at;r.holders=[];r.investigation.wallets=[];r.investigation.evidence=[];r.investigation.timeline=[];r.investigation.relationships=[];r.investigation.findings=[];r.sources=[{name:'Bitquery Holders',status:'available',detail:'Fresh snapshot',fetchedAt:at}];return r;}

test('holder and deep merges recompute metrics and categorical verdict from the resulting evidence',()=>{
 const old=report();old.chain='solana';old.holders=[{address:'holder',share:3,contract:false,locked:null,tag:''}];old.investigation.wallets=[wallet('holder',3)];old.investigation.findings=[];old.investigation.evidence=[];old.investigation.coverage.reasons=[];
 old.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'',source:'Solana RPC authorities',fetchedAt:old.fetchedAt}));
 old.sources=[{name:'Solana RPC authorities',status:'available',fetchedAt:old.fetchedAt,detail:''},{name:'Solana RPC Holders',status:'available',fetchedAt:old.fetchedAt,detail:''}];old.riskMetrics=computeRiskMetrics(old);old.trustRating=trustRating(old);
 const next=structuredClone(old);next.holders[0].share=12;next.investigation.wallets[0].share=12;next.checks[1].status='critical';next.checks[1].value='Active';
 // Deliberately stale derived fields must never survive either merge path.
 for(const merge of [(a:InvestigationReport,b:InvestigationReport)=>mergeReportRefresh(a,b,'holders'),mergeDeepReport]){
  const result=merge(old,next);
  assert.equal(result.holders[0].share,12);assert.equal(result.riskMetrics?.metrics.find(m=>m.id==='largest-holder-supply')?.value,12);
  assert.equal(result.trustRating?.decision,'AVOID');assert.equal(result.trustRating?.score,null);
 }
 assert.equal(old.riskMetrics.metrics.find(m=>m.id==='largest-holder-supply')?.value,3);assert.equal(old.trustRating.decision,'CAUTION');
 assert(old.trustRating.reasons.some(reason=>reason==='Creator-linked exposure is not fully evaluated.'));assert(old.trustRating.reasons.some(reason=>reason==='Fresh wallets is not fully evaluated.'));
});

test('holder refresh and deep merge score the newly concentrated snapshot instead of stale cached metrics',()=>{
 const old=report();old.chain='solana';old.holders=[{address:'holder',share:3,contract:false,locked:null,tag:''}];old.investigation.wallets=[wallet('holder',3)];old.investigation.findings=[];old.investigation.evidence=[];old.investigation.coverage.reasons=[];
 old.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'',source:'Solana RPC authorities',fetchedAt:old.fetchedAt}));
 old.sources=[{name:'Solana RPC authorities',status:'available',fetchedAt:old.fetchedAt,detail:''},{name:'Solana RPC Holders',status:'available',fetchedAt:old.fetchedAt,detail:''}];old.riskMetrics=computeRiskMetrics(old);old.trustRating=trustRating(old);
 const next=structuredClone(old);next.holders[0].share=60;next.investigation.wallets[0].share=60;
 for(const merge of [(a:InvestigationReport,b:InvestigationReport)=>mergeReportRefresh(a,b,'holders'),mergeDeepReport]){
  const result=merge(old,next),distribution=result.trustRating!.components.find(c=>c.id==='concentration')!;
  assert.equal(result.riskMetrics!.metrics.find(m=>m.id==='largest-holder-adjusted-float')!.value,60);
  assert.equal(distribution.state,'unknown');assert.equal(distribution.lower,0);assert.ok(Math.abs(distribution.upper!-6)<1e-8);assert.match(distribution.detail,/60\.0000%/);
  assert.equal(result.investigation.assessment.status,'caution');assert.match(result.investigation.assessment.summary,/six-factor/);
  assert.deepEqual(result.trustRating,trustRating(result));
 }
 assert.equal(old.trustRating.components.find(c=>c.id==='concentration')?.upper,15);
});
test('Bitquery refresh updates null shares and balances, adds wallets and marks absent wallets unknown while preserving history',()=>{
 const old=report(),next=fresh(old),address=old.investigation.wallets[0].address;
 next.investigation.wallets=[wallet(address,null,123),wallet('0xnew',3,8)];
 const result=mergeReportRefresh(old,next,'holders');
 assert.equal(result.investigation.wallets.find(w=>w.address===address)?.share,null);
 assert.equal(result.investigation.wallets.find(w=>w.address===address)?.balance,123);
 assert.equal(result.investigation.wallets.find(w=>w.address==='0xnew')?.share,3);
 assert.equal(result.investigation.wallets[1].share,null);assert.equal(result.investigation.wallets[1].balance,undefined);
 assert.deepEqual(result.investigation.timeline,old.investigation.timeline);assert.deepEqual(result.investigation.evidence,old.investigation.evidence);
 assert.equal(result.sources.find(s=>s.name==='Bitquery Recent trades')?.fetchedAt,old.fetchedAt);
 assert.equal(old.investigation.wallets[0].share,24);
});

test('public explorer holder refresh replaces balances while preserving trade timestamps',()=>{
 const old=report(),next=fresh(old),address=old.investigation.wallets[0].address;
 next.sources=[{name:'Blockscout Holders',status:'available',detail:'Bounded public snapshot',fetchedAt:at}];
 next.investigation.wallets=[wallet(address,5,25)];
 const result=mergeReportRefresh(old,next,'holders');
 assert.equal(result.investigation.wallets.find(w=>w.address===address)?.balance,25);
 assert.equal(result.investigation.wallets.find(w=>w.address===address)?.share,5);
 assert.deepEqual(result.investigation.timeline,old.investigation.timeline);
 assert(!result.investigation.coverage.reasons.some(r=>r.startsWith('Holder snapshot is stale:')));
});
test('Solana holder refresh needs no GoPlus holders and preserves address case',()=>{
 const old=report();old.chain='solana';old.token='TokenCase';old.investigation.wallets=[wallet('AbCase',5),wallet('abCase',7)];
 const next=fresh(old);next.investigation.wallets=[wallet('AbCase',null,100),wallet('NewCase',null,55)];
 const result=mergeReportRefresh(old,next,'holders');assert.equal(result.investigation.wallets.length,3);
 assert.equal(result.investigation.wallets.find(w=>w.address==='AbCase')?.balance,100);
 assert.equal(result.investigation.wallets.find(w=>w.address==='abCase')?.balance,undefined);
 assert.equal(result.investigation.wallets.find(w=>w.address==='abCase')?.share,null);
});
test('only an all-holder-source outage preserves last balances with an explicit stale reason and timestamps',()=>{
 const old=report(),next=fresh(old);next.sources=[{name:'Bitquery Holders',status:'unavailable',detail:'Rate limited'},{name:'GoPlus Security',status:'unavailable',detail:'Unavailable'}];
 const result=mergeReportRefresh(old,next,'holders');assert.equal(result.investigation.wallets[0].share,24);
 assert(result.investigation.coverage.reasons.some(r=>r.startsWith('Holder snapshot is stale:')));
 assert.equal(result.sources.find(s=>s.name==='Bitquery Holders')?.fetchedAt,old.fetchedAt);
 assert.equal(result.fetchedAt,old.fetchedAt);
});
test('fresh critical security flags are merged into deep history and escalate verdict; cleared flags are removed',()=>{
 const old=report(),next=fresh(old);next.sources.push({name:'GoPlus Security',status:'available',detail:'Current checks',fetchedAt:at});
 next.checks=[{key:'sell',title:'Sell blocked',description:'Provider reports sell restriction.',status:'critical',value:'Yes',source:'GoPlus Security',fetchedAt:at}];
 const critical=mergeReportRefresh(old,next,'holders');assert.equal(critical.investigation.assessment.status,'critical');
 assert(critical.investigation.findings.some(f=>f.id==='security:sell'));assert.equal(critical.investigation.evidence.find(e=>e.id==='security:sell')?.timestamp,at);
 assert.equal(critical.investigation.timeline.length,old.investigation.timeline.length);
 const cleared=structuredClone(next);cleared.checks[0].status='clear';cleared.checks[0].value='No';cleared.investigation=structuredClone(critical.investigation);
 const result=mergeReportRefresh(critical,cleared,'holders');assert(!result.investigation.findings.some(f=>f.id==='security:sell'));assert.notEqual(result.investigation.assessment.status,'critical');
});
test('market-only refresh preserves deep object identity and keeps old successful market on failure',()=>{
 const old=report(),next=fresh(old);next.market=null;next.sources=[{name:'DEX Screener',status:'unavailable',detail:'Timeout'},{name:'GoPlus Security',status:'unavailable',detail:'Security refresh was not requested.'}];
 const result=mergeReportRefresh(old,next,'market');assert.equal(result.market,old.market);assert.equal(result.investigation,old.investigation);assert.equal(result.fetchedAt,old.fetchedAt);assert(!result.sources.some(s=>s.name==='GoPlus Security'));
});
test('refresh ignores another chain or case-distinct Solana token',()=>{
 const old=report(),next=fresh(old);next.chain='base';assert.equal(mergeReportRefresh(old,next,'holders'),old);
 old.chain='solana';old.token='AbCase';next.chain='solana';next.token='abCase';assert.equal(mergeReportRefresh(old,next,'holders'),old);
});
test('successful empty GoPlus snapshot clears prior shares without inventing zero balances',()=>{
 const old=report(),next=fresh(old);next.sources=[{name:'GoPlus Security',status:'available',detail:'Empty holder sample',fetchedAt:at},{name:'Bitquery Holders',status:'unavailable',detail:'Unavailable'}];
 const result=mergeReportRefresh(old,next,'holders');assert(result.investigation.wallets.every(w=>w.share===null&&w.balance===undefined));assert.equal(result.holders.length,0);assert(!result.investigation.coverage.reasons.some(r=>r.startsWith('Holder snapshot is stale:')));
});
test('EVM address case differences update the same wallet and exact zero remains zero',()=>{
 const old=report();old.investigation.wallets=[wallet('0xAbC',3,9)];const next=fresh(old);next.investigation.wallets=[wallet('0xabc',0,0)];
 const result=mergeReportRefresh(old,next,'holders');assert.equal(result.investigation.wallets.length,1);assert.equal(result.investigation.wallets[0].share,0);assert.equal(result.investigation.wallets[0].balance,0);
});
test('warning contract flags have supporting evidence and a caution assessment',()=>{
 const old=report();old.investigation.findings=[];const next=fresh(old);next.sources.push({name:'GoPlus Security',status:'available',detail:'Current checks',fetchedAt:at});next.checks=[{key:'mint',title:'Supply expansion',description:'Additional supply can be minted.',status:'warning',value:'Yes'}];
 const result=mergeReportRefresh(old,next,'holders');assert.equal(result.investigation.assessment.status,'caution');assert.equal(result.investigation.findings.find(f=>f.id==='security:mint')?.level,'warning');assert.equal(result.investigation.evidence.find(e=>e.id==='security:mint')?.timestamp,at);
});
test('fresh authority changes remove only the current label from prior owner while retaining timestamped history',()=>{
 const old=report();old.investigation.wallets=[{...wallet('0xOld',4),categories:['creator','authority'],evidenceIds:['identity:authority:0xold']}];old.investigation.evidence=[{id:'identity:authority:0xold',kind:'authority',timestamp:old.fetchedAt,description:'Prior observed authority',source:'GoPlus Security'}];
 const next=fresh(old);next.sources.push({name:'GoPlus Security',status:'available',detail:'Current checks',fetchedAt:at});next.identities=[{address:'0xNew',role:'authority',source:'GoPlus Security',timestamp:at}];
 const result=mergeReportRefresh(old,next,'holders');const prior=result.investigation.wallets.find(w=>w.address==='0xOld')!,current=result.investigation.wallets.find(w=>w.address==='0xNew')!;
 assert(!prior.categories.includes('authority'));assert(prior.categories.includes('creator'));assert(current.categories.includes('authority'));assert.equal(current.share,null);assert(current.evidenceIds.includes('identity:authority:0xnew'));
 assert.equal(result.investigation.evidence.find(e=>e.id==='identity:authority:0xold')?.timestamp,old.fetchedAt);assert.equal(result.investigation.evidence.find(e=>e.id==='identity:authority:0xnew')?.timestamp,at);
});
test('repeated refreshes replace snapshot notices rather than growing coverage reasons',()=>{
 const old=report(),next=fresh(old);next.investigation.coverage.reasons.push('Holder snapshot refreshed at 2026-01-01T00:00:00Z. Historical evidence retained.');
 const once=mergeReportRefresh(old,next,'holders'),later=structuredClone(next);later.fetchedAt='2026-01-02T12:05:00Z';const twice=mergeReportRefresh(once,later,'holders');
 const notices=twice.investigation.coverage.reasons.filter(r=>r.startsWith('Current holder snapshot refreshed at')||r.startsWith('Holder snapshot refreshed at'));
 assert.equal(notices.length,1);assert(notices[0].includes(later.fetchedAt));assert.equal(twice.investigation.coverage.reasons.length,once.investigation.coverage.reasons.length);
});

function solanaReport():InvestigationReport {
 const r=report();r.chain='solana';r.token='TokenCase';r.holders=[];r.holderCount=null;r.totalSupply=100;
 r.sources=[{name:'Solana RPC Holders',status:'available',detail:'Owner snapshot',fetchedAt:r.fetchedAt},{name:'Solana RPC authorities',status:'available',detail:'Mint roles',fetchedAt:r.fetchedAt}];
 r.identities=(['mint','freeze'] as const).map(kind=>({address:'AuthorityCase',role:'authority' as const,authorityKind:kind,label:`${kind==='mint'?'Mint':'Freeze'} authority`,slot:100,timestamp:r.fetchedAt,source:'Solana RPC authorities'}));
 r.investigation.wallets=[{...wallet('AuthorityCase',5,5),label:'Mint authority / Freeze authority',categories:['authority'],evidenceIds:r.identities.map(i=>identityEvidence(i,i.address).id)}];
 r.investigation.evidence=r.identities.map(i=>identityEvidence(i,i.address));r.investigation.findings=[];r.investigation.timeline=[];r.investigation.relationships=[];
 r.checks=r.identities.map(i=>({key:`solana_${i.authorityKind}_authority`,title:i.label!,description:'Capability observed',status:'warning' as const,value:i.address,source:i.source,fetchedAt:i.timestamp}));
 r.solana={authorities:{mint:{address:'AuthorityCase',slot:100,timestamp:r.fetchedAt},freeze:{address:'AuthorityCase',slot:100,timestamp:r.fetchedAt}},extensions:['transferFeeConfig'],tokenAccounts:[{address:'TokenAccount',owner:'AuthorityCase',mint:r.token,amountRaw:'5',decimals:0,slot:100,timestamp:r.fetchedAt,state:'initialized',extensions:[]}],snapshot:{commitment:'finalized',mintSlot:100,ownersSlot:100,largestAccountsSlot:99,supplySlot:100,selectedTokenAccounts:1,unresolvedTokenAccounts:0,fetchedAt:r.fetchedAt}};
 return r;
}
function solanaFresh(old:InvestigationReport):InvestigationReport {
 const r=fresh(old);r.identities=[];r.checks=[];r.sources=[{name:'Solana RPC Holders',status:'available',detail:'Current owners',fetchedAt:at},{name:'Solana RPC authorities',status:'available',detail:'Current mint roles',fetchedAt:at}];
 r.solana={authorities:{mint:{},freeze:{}},tokenAccounts:[],extensions:[],snapshot:{commitment:'finalized',mintSlot:200,ownersSlot:200,largestAccountsSlot:199,selectedTokenAccounts:0,unresolvedTokenAccounts:0,fetchedAt:at}};
 return r;
}

test('Solana RPC refresh replaces holder snapshot and installs distinct mint/freeze evidence for one current address',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.investigation.wallets=[wallet('NewAuthority',8,8)];next.totalSupply=200;
 next.solana!.authorities={mint:{address:'NewAuthority',slot:200,timestamp:at},freeze:{address:'NewAuthority',slot:200,timestamp:at}};
 next.identities=(['mint','freeze'] as const).map(kind=>({address:'NewAuthority',role:'authority' as const,authorityKind:kind,label:`${kind==='mint'?'Mint':'Freeze'} authority`,source:'Solana RPC authorities',timestamp:at,slot:200}));
 const result=mergeReportRefresh(old,next,'holders');
 assert.equal(result.investigation.wallets.find(w=>w.address==='NewAuthority')?.balance,8);
 assert(!result.investigation.wallets.find(w=>w.address==='AuthorityCase')?.categories.includes('authority'));
 for(const kind of ['mint','freeze'])assert.equal(result.investigation.evidence.find(e=>e.id===`identity:authority:NewAuthority:${kind}`)?.timestamp,at);
 assert.equal(result.identities?.filter(i=>i.address==='NewAuthority').length,2);assert.equal(result.totalSupply,200);
 assert.equal(result.solana?.snapshot.ownersSlot,200);assert.deepEqual(result.solana?.tokenAccounts,[]);
});

test('revoking only mint preserves unknown freeze authority and its original evidence timestamp',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.solana!.authorities.mint={address:null,slot:200,timestamp:at};
 next.checks=[{key:'solana_mint_authority',title:'Mint authority',description:'Revoked at slot 200',status:'clear',value:'Revoked',source:'Solana RPC authorities',fetchedAt:at},{key:'solana_freeze_authority',title:'Freeze authority',description:'Not returned',status:'unknown',value:'Not reported',source:'Solana RPC authorities',fetchedAt:at}];
 const result=mergeReportRefresh(old,next,'holders');
 assert.deepEqual(result.identities?.map(i=>i.authorityKind),['freeze']);
 assert(result.investigation.wallets.find(w=>w.address==='AuthorityCase')?.categories.includes('authority'));
 assert.equal(result.solana?.authorities.mint.address,null);assert.equal(result.solana?.authorities.freeze.slot,100);
 assert.equal(result.checks.find(c=>c.key==='solana_freeze_authority')?.status,'warning');
 assert.equal(result.checks.find(c=>c.key==='solana_freeze_authority')?.fetchedAt,old.fetchedAt);
 assert.equal(result.investigation.evidence.find(e=>e.id==='identity:authority:AuthorityCase:freeze')?.timestamp,old.fetchedAt);
});

test('missing mint role retains its identity while fresh freeze role changes independently',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.solana!.authorities.freeze={address:'FreezeNew',slot:200,timestamp:at};
 next.identities=[{address:'FreezeNew',role:'authority',authorityKind:'freeze',label:'Freeze authority',slot:200,timestamp:at,source:'Solana RPC authorities'}];
 const result=mergeReportRefresh(old,next,'holders');
 assert(result.identities?.some(i=>i.address==='AuthorityCase'&&i.authorityKind==='mint'&&i.timestamp===old.fetchedAt));
 assert(!result.identities?.some(i=>i.address==='AuthorityCase'&&i.authorityKind==='freeze'));
 assert(result.investigation.wallets.find(w=>w.address==='FreezeNew')?.categories.includes('authority'));
 assert.equal(result.solana?.authorities.mint.slot,100);assert.equal(result.solana?.authorities.freeze.slot,200);
});

test('RPC outage retains known slot/account/role records and flags with their original source timestamps',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.sources=next.sources.map(source=>({...source,status:'unavailable' as const,fetchedAt:undefined}));
 next.checks=old.checks.map(check=>({...check,status:'unknown',value:'Not reported',fetchedAt:at}));
 const result=mergeReportRefresh(old,next,'holders');
 assert.deepEqual(result.solana,old.solana);assert.deepEqual(result.identities,old.identities);assert.deepEqual(result.checks,old.checks);
 assert.equal(result.investigation.wallets[0].balance,5);assert.equal(result.fetchedAt,old.fetchedAt);
 assert(result.investigation.coverage.reasons.some(reason=>reason.startsWith('Holder snapshot is stale:')));
 assert.equal(result.sources.find(source=>source.name==='Solana RPC authorities')?.fetchedAt,old.fetchedAt);
});

test('RPC contract flags retain source attribution and stale warnings when an available response leaves a check unknown',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.solana!.authorities.freeze={address:'FreezeNew',slot:200,timestamp:at};
 next.checks=[{key:'solana_freeze_authority',title:'Freeze authority',description:'Current role',status:'warning',value:'FreezeNew',source:'Solana RPC authorities',fetchedAt:at}];
 const result=mergeReportRefresh(old,next,'holders'),evidence=result.investigation.evidence.find(e=>e.id==='security:solana_freeze_authority');
 assert.equal(evidence?.source,'Solana RPC authorities');assert.equal(evidence?.timestamp,at);assert(!evidence?.description.includes('GoPlus'));
 const unknown=solanaFresh(result);unknown.checks=[{...next.checks[0],status:'unknown',value:'Unavailable'}];
 const retained=mergeReportRefresh(result,unknown,'holders');
 assert.equal(retained.checks.find(c=>c.key==='solana_freeze_authority')?.status,'warning');
 assert.equal(retained.investigation.evidence.find(e=>e.id==='security:solana_freeze_authority')?.timestamp,at);
});

test('authority-only RPC success retains old holder account slots instead of stamping old balances fresh',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.sources[0].status='unavailable';next.solana!.authorities.mint={address:null,slot:200,timestamp:at};
 const result=mergeReportRefresh(old,next,'holders');
 assert.deepEqual(result.solana?.tokenAccounts,old.solana?.tokenAccounts);assert.equal(result.solana?.snapshot.ownersSlot,100);
 assert.equal(result.solana?.snapshot.selectedTokenAccounts,1);assert.equal(result.solana?.snapshot.mintSlot,200);
 assert.equal(result.investigation.wallets[0].balance,5);assert.equal(result.solana?.authorities.mint.address,null);
});

test('a formerly clear check retained after an unknown response cannot produce a fresh all-clear',()=>{
 const old=report();old.investigation.findings=[];old.investigation.evidence=[];old.investigation.timeline=[];old.investigation.relationships=[];
 old.investigation.coverage={...old.investigation.coverage,status:'complete',launchVerified:true,truncated:false,reasons:[]};
 old.checks=[{key:'mint',title:'Minting',description:'No flag previously',status:'clear',value:'No',source:'GoPlus Security',fetchedAt:old.fetchedAt}];
 const next=fresh(old);next.sources.push({name:'GoPlus Security',status:'available',detail:'Response missing this field',fetchedAt:at});next.checks=[{...old.checks[0],status:'unknown',value:'Not reported',fetchedAt:at}];
 const result=mergeReportRefresh(old,next,'holders');assert.equal(result.checks[0].status,'clear');assert.equal(result.checks[0].fetchedAt,old.fetchedAt);assert.notEqual(result.investigation.assessment.status,'clear');
 assert(result.investigation.coverage.reasons.some(reason=>reason.includes('current check state was not verified')));
});

test('holder refresh retains selected-pool timing proof even without attributable timeline events',()=>{
 const old=report();old.investigation.timeline=[];old.investigation.relationships=[];
 old.investigation.coverage.poolTiming={verified:true,scope:'selected-pool',pool:'Pool',chain:'ethereum',firstSwapAt:at,firstSwapTransaction:'swap',firstSwapLogIndex:0,windowEndAt:at,creation:{transaction:'deploy',blockNumber:1,blockHash:'block1'},through:{blockNumber:2,blockHash:'block2',timestamp:at},factory:'Factory',token0:old.token,token1:'Other',eligibleTradeIds:[],verifiedAt:at};
 const next=fresh(old);next.investigation.coverage.poolTiming=undefined;
 assert.deepEqual(mergeReportRefresh(old,next,'holders').investigation.coverage.poolTiming,old.investigation.coverage.poolTiming);
 assert.equal(mergeDeepReport(old,next).investigation.coverage.poolTiming,undefined);
});

test('partial deep scan recovers failed balances and flags without resurrecting old trading labels or evidence',()=>{
 const old=report();old.investigation.wallets=[{...wallet('OldHolder',24,24),bought:99,sold:2,firstBuyAt:old.fetchedAt,categories:['sniper','accumulator'],evidenceIds:['old-trade']}];
 old.checks=[{key:'sell',title:'Sell restriction',description:'Earlier restriction',status:'critical',value:'Yes',source:'GoPlus Security',fetchedAt:old.fetchedAt}];
 old.investigation.evidence=[{id:'old-trade',kind:'trade',timestamp:old.fetchedAt,description:'Older sample',source:'Old pool'},{id:'security:sell',kind:'label',timestamp:old.fetchedAt,description:'Earlier restriction',source:'GoPlus Security'}];
 old.investigation.findings=[{id:'selling:old',title:'Old related selling',description:'Older sample',level:'warning',certainty:'inferred',wallets:['OldHolder'],evidenceIds:['old-trade']},{id:'security:sell',title:'Sell restriction',description:'Earlier restriction',level:'critical',certainty:'observed',wallets:[],evidenceIds:['security:sell']}];
 const next=fresh(old);next.market={chainId:'ethereum',baseToken:{address:old.token},priceUsd:'1'};next.checks=[{...old.checks[0],status:'unknown',value:'Unavailable',fetchedAt:at}];
 next.sources=[{name:'DEX Screener',status:'available',detail:'Current price',fetchedAt:at},{name:'Bitquery Holders',status:'unavailable',detail:'Timeout'},{name:'GoPlus Security',status:'unavailable',detail:'Timeout'}];
 next.investigation.wallets=[{...wallet('NewTrader',null),bought:8,categories:['accumulator'],evidenceIds:['new-trade']}];
 next.investigation.timeline=[{id:'new-trade',timestamp:at,kind:'buy',wallet:'NewTrader',amount:8,evidenceId:'new-trade'}];next.investigation.evidence=[{id:'new-trade',kind:'trade',timestamp:at,description:'New sample',source:'Current pool'}];
 const result=mergeDeepReport(old,next),retained=result.investigation.wallets.find(wallet=>wallet.address==='OldHolder');
 assert.equal(retained?.balance,24);assert.equal(retained?.bought,undefined);assert(!retained?.categories.includes('sniper'));assert(!retained?.evidenceIds.includes('old-trade'));
 assert.deepEqual(result.investigation.timeline,next.investigation.timeline);assert.deepEqual(result.investigation.relationships,next.investigation.relationships);
 assert(!result.investigation.findings.some(finding=>finding.id==='selling:old'));assert(!result.investigation.evidence.some(evidence=>evidence.id==='old-trade'));
 assert.equal(result.investigation.evidence.find(evidence=>evidence.id==='security:sell')?.timestamp,old.fetchedAt);assert.equal(result.checks[0].status,'critical');
 assert.equal(result.market,next.market);assert.equal(result.fetchedAt,at);assert(result.investigation.coverage.reasons.some(reason=>reason.startsWith('Holder snapshot is stale:')));
});

test('successful deep holder scope replaces old holders instead of retaining unrelated prior snapshot wallets',()=>{
 const old=report();old.identities=[];old.investigation.wallets=[wallet('OldOnly',24,24)];old.investigation.evidence=[];old.investigation.findings=[];
 const next=fresh(old);next.investigation.wallets=[wallet('NewOnly',5,5)];
 const result=mergeDeepReport(old,next);assert.deepEqual(result.investigation.wallets.map(wallet=>wallet.address),['NewOnly']);assert.equal(result.investigation.wallets[0].balance,5);
});

test('partial deep RPC scan retains failed account snapshot and unknown mint role while applying fresh freeze revocation',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.sources[0].status='unavailable';next.solana!.authorities.freeze={address:null,slot:200,timestamp:at};
 next.checks=[{...old.checks[0],status:'unknown',value:'Not reported',fetchedAt:at},{...old.checks[1],status:'clear',value:'Revoked',fetchedAt:at}];
 const result=mergeDeepReport(old,next);
 assert.deepEqual(result.solana?.tokenAccounts,old.solana?.tokenAccounts);assert.equal(result.solana?.snapshot.ownersSlot,100);
 assert.deepEqual(result.identities?.map(identity=>identity.authorityKind),['mint']);assert.equal(result.solana?.authorities.freeze.address,null);
 assert.equal(result.investigation.evidence.find(evidence=>evidence.id==='identity:authority:AuthorityCase:mint')?.timestamp,old.fetchedAt);
 assert(!result.investigation.evidence.some(evidence=>evidence.id==='identity:authority:AuthorityCase:freeze'));
});

test('deep replacement refuses to carry snapshots between tokens or from synthetic examples',()=>{
 const old=report(),next=fresh(old);next.token='different';assert.equal(mergeDeepReport(old,next),next);
 next.token=old.token;old.fixture=true;assert.equal(mergeDeepReport(old,next),next);
});

test('successful Solana selection source transitions replace ranking provenance while outages retain it',()=>{
 for(const source of ['rpc-largest-accounts','goplus-token-accounts'] as const){
  const old=solanaReport(),next=solanaFresh(old);
  old.solana!.snapshot.selectionSource=source;old.solana!.snapshot.selectionTimestamp=old.fetchedAt;
  next.solana!.snapshot.selectionSource=source==='rpc-largest-accounts'?'goplus-token-accounts':'rpc-largest-accounts';
  next.solana!.snapshot.selectionTimestamp=at;
  if(next.solana!.snapshot.selectionSource==='goplus-token-accounts')next.solana!.snapshot.largestAccountsSlot=undefined;
  const merged=mergeReportRefresh(old,next,'holders');
  assert.equal(merged.solana?.snapshot.selectionSource,next.solana!.snapshot.selectionSource);
  assert.equal(merged.solana?.snapshot.selectionTimestamp,at);
  assert.equal(merged.solana?.snapshot.largestAccountsSlot,next.solana!.snapshot.largestAccountsSlot);
  next.sources[0].status='unavailable';
  const stale=mergeReportRefresh(old,next,'holders');
  assert.equal(stale.solana?.snapshot.selectionSource,source);
  assert.equal(stale.solana?.snapshot.selectionTimestamp,old.fetchedAt);
  assert.equal(stale.solana?.snapshot.largestAccountsSlot,old.solana!.snapshot.largestAccountsSlot);
 }
});

test('synthesized RPC authority identities retain local observation timestamp basis',()=>{
 const old=solanaReport(),next=solanaFresh(old);next.identities=[];
 next.solana!.authorities.mint={address:'NewAuthority',slot:200,timestamp:at};
 const merged=mergeReportRefresh(old,next,'holders');
 assert.equal(merged.identities?.find(i=>i.address==='NewAuthority')?.timestampBasis,'local-observation');
});

test('holding evidence follows successful snapshots and retains original records only on holder outages',()=>{
 const old=solanaReport(),next=solanaFresh(old),id='holding:solana:AuthorityCase';
 old.investigation.evidence.push({id,kind:'holding',timestamp:old.fetchedAt,source:'Solana RPC Holders',description:'Old finalized slot 100'});
 old.investigation.wallets[0].evidenceIds.push(id);
 next.investigation.evidence.push({id,kind:'holding',timestamp:at,source:'Solana RPC Holders',description:'New finalized slot 200'});
 next.investigation.wallets=[{address:'AuthorityCase',share:20,balance:10,categories:['unclassified'],evidenceIds:[id]}];
 for(const merge of [(a:InvestigationReport,b:InvestigationReport)=>mergeReportRefresh(a,b,'holders'),mergeDeepReport]){
  const success=merge(old,next);
  assert.equal(success.investigation.evidence.find(e=>e.id===id)?.timestamp,at);
  assert(success.investigation.wallets.find(w=>w.address==='AuthorityCase')?.evidenceIds.includes(id));
  const missing=structuredClone(next);missing.investigation.evidence=[];missing.investigation.wallets=[];
  const replaced=merge(old,missing);
  assert(!replaced.investigation.evidence.some(e=>e.id===id));assert(!replaced.investigation.wallets.some(w=>w.evidenceIds.includes(id)));
  missing.sources[0].status='unavailable';
  const failed=merge(old,missing);
  assert.equal(failed.investigation.evidence.find(e=>e.id===id)?.timestamp,old.fetchedAt);
  assert(failed.investigation.wallets.find(w=>w.address==='AuthorityCase')?.evidenceIds.includes(id));
 }
});
