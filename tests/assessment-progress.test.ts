import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/grok-observed-inputs.json';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {trustRating} from '../src/lib/trust-rating';
import {assessmentProgress} from '../src/lib/assessment-progress';
const report=()=>structuredClone(fixture.report) as InvestigationReport;

test('partial model counts resolved weighted points without filling unknown components with zero',()=>{
 const r=report(),rating=trustRating(r);
 rating.components=rating.components.map(c=>c.id==='fresh'?{...c,state:'clear',earned:20,lower:20,upper:20}:c.id==='concentration'?{...c,state:'flagged',earned:0,lower:0,upper:0}:{...c,state:'unknown',earned:0,lower:0,upper:c.maximum});
 const before=JSON.stringify(rating),p=assessmentProgress(r,rating);
 assert.equal(p.earned,20);assert.equal(p.maximum,35);assert.equal(p.resolvedFactors,2);assert.equal(p.totalFactors,6);assert.equal(p.modelCoverage,35);
 assert.equal(JSON.stringify(rating),before);assert.equal(rating.score,null);
});
test('a resolved zero-point risk counts as assessed while duplicate and invalid factors cannot inflate coverage',()=>{
 const r=report(),rating=trustRating(r),c=rating.components.find(c=>c.id==='concentration')!;
 rating.components=[{...c,state:'flagged',earned:0,lower:0,upper:0}];
 assert.equal(assessmentProgress(r,rating).maximum,15);
 rating.components.push({...rating.components[0]});assert.equal(assessmentProgress(r,rating).maximum,0);
 rating.components=[{...c,state:'clear',earned:100,lower:100,upper:100}];assert.equal(assessmentProgress(r,rating).maximum,0);
 rating.components=[{...c,state:'clear',earned:15,lower:0,upper:15}];assert.equal(assessmentProgress(r,rating).maximum,0);
});
test('current check completion is source qualified and separate from historical coverage',()=>{
 const r=report(),rating=trustRating(r),p=assessmentProgress(r,rating);
 assert.equal(r.investigation.coverage.status,'partial');assert(p.currentCompleted>=3);assert.equal(p.currentCompleted,p.currentTotal);
 r.checks[0].status='warning';assert.equal(assessmentProgress(r,rating).currentCompleted,p.currentCompleted);
 r.checks[0].status='unknown';assert.equal(assessmentProgress(r,rating).currentCompleted,p.currentCompleted-1);
 r.sources.find(s=>s.name==='Solana RPC authorities')!.status='unavailable';assert.equal(assessmentProgress(r,rating).currentCompleted,0);
});
test('stale, conflicting and provider-only controls never count as completed current checks',()=>{
 for(const mutate of [(r:InvestigationReport)=>{r.investigation.coverage.reasons.push('Contract check refresh is incomplete: Freeze authority.');},(r:InvestigationReport)=>{r.providerAnalysis={} as never;},(r:InvestigationReport)=>{for(const c of r.checks)c.fetchedAt='2026-10-01T00:00:00Z';}]){const r=report();mutate(r);assert.equal(assessmentProgress(r,trustRating(r)).currentCompleted,0);}
 const r=report();r.checks.push({...r.checks[0],status:'unknown'});assert.equal(assessmentProgress(r,trustRating(r)).currentCompleted,r.checks.length-2);
});

test('failed holder verification withholds retained point contributions from the current headline',()=>{
 const r=report(),rating=trustRating(r);rating.components=rating.components.map(c=>({...c,state:'clear',earned:c.maximum,lower:c.maximum,upper:c.maximum}));
 assert.equal(assessmentProgress(r,rating).maximum,100);
 r.investigation.coverage.reasons.push('Holder snapshot is stale: Last known balances retained.');
 assert.equal(assessmentProgress(r,rating).maximum,0);
});
