import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/grok-observed-inputs.json';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {observedDecision} from '../src/lib/observed-decision';
import {trustRating} from '../src/lib/trust-rating';
const report=()=>structuredClone(fixture.report) as InvestigationReport;

test('public Grok observations produce independently calculated87 and80.1% with explicit conditional scope',()=>{
 const r=report(),before=JSON.stringify(r),strict=trustRating(r),strictBefore=JSON.stringify(strict),result=observedDecision(r,strict);
 assert(result);assert.equal(result.score,87);assert.equal(result.scoreBand,'OK');assert.equal(result.judge.decision,'OK');assert.equal(result.judge.confidence,.801);
 assert.deepEqual(result.judge.p,{avoid:.003,caution:.196,ok:.801});assert.equal(result.scope.holderCount,19);assert.equal(result.scope.readableFreshWallets,5);assert.equal(result.scope.unreadFreshWallets,13);
 assert(Math.abs(result.impact-.2565026058564499)<1e-10);assert(result.scope.notes.some(n=>/cross-token/i.test(n)));assert(result.scope.notes.some(n=>/hook/i.test(n)));
 assert.equal(result.factors.find(f=>f.id==='snipers')!.basis,'observed-none');assert.equal(result.factors.find(f=>f.id==='swarm')!.basis,'conditional-scenario');
 assert.equal(r.poolReserves!.snapshot!.constantProductEligible,false);assert.equal(JSON.stringify(r),before);assert.equal(JSON.stringify(strict),strictBefore);assert.equal(strict.score,null);
});
test('missing core controls, creator proof, readable activity or canonical history abstains',()=>{
 const cases=[
  (r:InvestigationReport)=>{r.checks=[];},
  (r:InvestigationReport)=>{r.investigation.evidence=r.investigation.evidence.filter(e=>!e.id.startsWith('identity:creator:'));},
  (r:InvestigationReport)=>{for(const w of r.walletActivity!.wallets){w.count=null;w.fresh=null;}},
  (r:InvestigationReport)=>{r.investigation.evidence=r.investigation.evidence.filter(e=>e.kind!=='trade');},
  (r:InvestigationReport)=>{for(const s of r.sources.filter(s=>s.name.includes('transaction history')))s.status='unavailable';},
  (r:InvestigationReport)=>{for(const e of r.investigation.evidence.filter(e=>e.kind==='trade'))e.attribution='provider-reported';},
 ];
 for(const mutate of cases){const r=report();mutate(r);assert.equal(observedDecision(r),null);}
});
test('a readable creator alone and short or stale activity pages cannot create a freshness denominator',()=>{
 const r=report(),creator=r.investigation.wallets.find(w=>w.categories.includes('creator'))!.address;
 for(const w of r.walletActivity!.wallets)if(w.address!==creator){w.count=2;w.fresh=true;w.exact=true;}
 assert.equal(observedDecision(r),null);
 for(const w of r.walletActivity!.wallets)if(w.address!==creator){w.count=11;w.fresh=false;w.observedAt='2026-11-02T00:00:00Z';}
 assert.equal(observedDecision(r),null);
});
test('pool mismatch, stale reserve or account rows, unknown source and conflicting raw balances abstain',()=>{
 const cases=[
  (r:InvestigationReport)=>{r.poolReserves!.snapshot!.pool=r.token;},
  (r:InvestigationReport)=>{r.poolReserves!.snapshot!.program=r.token;},
  (r:InvestigationReport)=>{r.poolReserves!.snapshot!.observedAt='2026-11-02T00:00:00Z';},
  (r:InvestigationReport)=>{r.poolReserves!.snapshot!.base.amountRaw='0';},
  (r:InvestigationReport)=>{r.poolReserves!.snapshot!.source='';},
  (r:InvestigationReport)=>{for(const s of r.sources.filter(s=>s.name.includes('reserve accounts')))s.status='unavailable';},
  (r:InvestigationReport)=>{for(const a of r.solana!.tokenAccounts)a.timestamp='2026-11-02T00:00:00Z';},
  (r:InvestigationReport)=>{for(const a of r.solana!.tokenAccounts)if(a.owner===r.holders[1].address)a.amountRaw='1';},
 ];
 for(const mutate of cases){const r=report();mutate(r);assert.equal(observedDecision(r),null);}
});
test('verified critical controls override the conditional numeric model without confidence',()=>{
 const r=report();r.checks.find(c=>c.key==='solana_freeze_authority')!.status='warning';r.checks.find(c=>c.key==='solana_freeze_authority')!.value='Active';
 const result=observedDecision(r);assert(result);assert.equal(result.scoreBand,'AVOID');assert.equal(result.judge.decision,'AVOID');assert.equal(result.judge.p,null);assert.equal(result.judge.confidence,null);
});
test('conditional nominal impact cannot manufacture a new verified hard stop',()=>{
 const r=report();r.poolReserves!.snapshot!.base.amountRaw='29663790552070';
 const strict=trustRating(r);assert.equal(strict.hard!.length,0);const result=observedDecision(r,strict);assert(result);assert(result.impact>=.5);
 assert.equal(strict.hard!.length,0);assert(!result.judge.reasons.some(reason=>/verified.*impact/i.test(reason)));
});
test('new observed prelaunch exposure changes the calculation instead of pinning the Grok score',()=>{
 const r=report();r.investigation.coverage.launchVerified=true;r.investigation.coverage.earliestTradeAt='2026-10-28T06:29:08Z';
 const holder=r.holders.find(h=>h.address!==r.market!.pairAddress)!.address;
 r.investigation.evidence.push({id:'new-observed-transfer',kind:'transfer',transaction:'observed-tx',source:'Alchemy finalized Solana transaction history',timestamp:'2026-10-28T06:29:00Z',from:'other',to:holder,token:r.token,amount:100,description:'Observed prelaunch transfer'});
 const result=observedDecision(r);assert(result);assert(result.factors.find(f=>f.id==='insiders')!.value>0);assert(result.score<87);
});
