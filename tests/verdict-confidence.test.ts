import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {verdictConfidence} from '../src/lib/verdict-confidence';

test('an inferred funding warning cannot imply high confidence from passed contracts',()=>{
 const report=structuredClone(fixtureReport);
 report.investigation.findings=[{id:'funder:a',title:'Shared funding',description:'',level:'warning',certainty:'inferred',wallets:[],evidenceIds:['tx']}];
 report.checks=[];
 assert.equal(verdictConfidence(report).level,'Low');
 assert.match(verdictConfidence(report).reason,/inferred/);
});
test('no checks and incomplete history yields low confidence',()=>{
 const report=structuredClone(fixtureReport);report.checks=[];report.investigation.findings=[];
 assert.equal(verdictConfidence(report).level,'Low');
});
test('source claims without linked evidence cannot earn moderate confidence',()=>{
 const report=structuredClone(fixtureReport);report.checks=[];
 report.investigation.findings=[{id:'selling:a',title:'Selling',description:'',level:'critical',certainty:'observed',wallets:[],evidenceIds:['missing']}];
 assert.equal(verdictConfidence(report).level,'Low');
});

function clearSnapshot(){
 const r=structuredClone(fixtureReport);delete r.providerAnalysis;r.chain='solana';r.investigation.findings=[];r.investigation.coverage.reasons=[];
 r.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear' as const,value:'Revoked',description:''}));
 r.sources=[{name:'Solana RPC authorities',status:'available',fetchedAt:r.fetchedAt,detail:''}];return r;
}
test('unverified core controls have Low support rather than invented direct adverse evidence',()=>{
 const r=clearSnapshot();r.checks[1].status='unknown';const support=verdictConfidence(r);
 assert.equal(support.level,'Low');assert.match(support.reason,/unverified|unavailable|incomplete/);assert(!support.reason.includes('Direct records support'));
});
test('retained stale controls and holders have Low support even when prior values were clear',()=>{
 for(const reason of ['Contract check refresh is incomplete: Freeze authority.','Holder snapshot is stale: Retained previous holdings.']){
  const r=clearSnapshot();r.investigation.coverage.reasons=[reason];assert.equal(verdictConfidence(r).level,'Low');
 }
});
