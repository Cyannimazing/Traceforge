import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/grok-observed-inputs.json';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {assessmentReadiness} from '../src/lib/assessment-readiness';
const report=()=>structuredClone(fixture.report) as InvestigationReport;
const partial={score:null,coreVerified:true,hard:[],soft:[]};

test('missing market data explains the unscored issued snapshot without implying more work is running',()=>{
 const r=report();r.market=null;
 const result=assessmentReadiness(r,partial,null,'CAUTION');
 assert.equal(result.label,'Market data unavailable');assert.match(result.summary,/retrieved sources/);assert.match(result.summary,/price or liquidity/);
 assert.doesNotMatch(JSON.stringify(result),/pending|assessed|incomplete checks|zero liquidity|no market exists|\d+\//i);
});
test('verified stop rules take priority even when market evidence is missing',()=>{
 const r=report();r.market=null;
 const result=assessmentReadiness(r,{...partial,hard:['A current freeze authority can freeze token accounts.']},null,'AVOID');
 assert.equal(result.label,'Stop rule triggered');assert.match(result.summary,/freeze authority/);
});
test('supported zero is a calculated score, distinct from the absence of a score',()=>{
 const r=report();r.market=null;
 assert.equal(assessmentReadiness(r,{...partial,score:0},0,'AVOID').label,'Observed activity');
 assert.equal(assessmentReadiness(r,partial,87,'OK').label,'Observed activity');
});
test('missing current verification and other unresolved measurements have distinct explanations',()=>{
 const r=report();
 assert.equal(assessmentReadiness(r,{...partial,coreVerified:false},null,'CAUTION').label,'Current data unavailable');
 r.market={chainId:r.chain,baseToken:{address:r.token},pairAddress:'selected-pool',priceUsd:'1',liquidity:{usd:20000}};
 const result=assessmentReadiness(r,partial,null,'CAUTION');
 assert.equal(result.label,'Limited evidence');assert.match(result.summary,/wallet or pool measurements/);assert.doesNotMatch(result.summary,/trading records|history|pending|\d+%/);
});
test('the explanation uses source state rather than special-casing the project token',()=>{
 const r=report();r.market=null;const first=assessmentReadiness(r,partial,null,'CAUTION');
 r.token='0xf712daf52ee4097e369488b6eb4fa3bc299ba62d';r.chain='robinhood';
 assert.deepEqual(assessmentReadiness(r,partial,null,'CAUTION'),first);
});
