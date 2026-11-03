import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {trustRating} from '../src/lib/trust-rating';
function report(){const r=structuredClone(fixtureReport);delete r.providerAnalysis;r.chain='solana';r.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear' as const,value:'Revoked',description:''}));r.sources=[{name:'Solana RPC authorities',status:'available',fetchedAt:r.fetchedAt,detail:''}];r.investigation.findings=[];r.investigation.coverage.status='partial';r.holders=[{address:'holder',share:1,contract:false,locked:false,tag:''}];return r;}
test('passing controls and incomplete history never manufacture an 85% probability',()=>{const r=trustRating(report());assert.notEqual(r.score,85);assert.match(r.basis,/not a probability/);assert.equal(r.version,'evidence-v3');});
test('shared funding remains a qualified caution regardless of passing controls',()=>{const r=report();r.investigation.findings=[{id:'funder:a',title:'Shared funding',description:'',level:'warning',certainty:'inferred',wallets:[],evidenceIds:['t']}];assert.equal(trustRating(r).decision,'CAUTION');assert((trustRating(r).score??100)<75);});
test('critical control overrides clear checks',()=>{const r=report();r.checks.push({key:'trap',title:'Trap',status:'critical',value:'',description:''});assert.equal(trustRating(r).decision,'AVOID');});
test('no data is unrated, never a made-up low trust score',()=>{const r=report();r.checks=[];r.holders=[];assert.equal(trustRating(r).decision,'UNRATED');assert.equal(trustRating(r).score,null);});
test('unsupported extension cannot produce OK',()=>{const r=report();r.checks.push({key:'solana_extensions',title:'Unsupported extensions',status:'unknown',value:'',description:''});assert.equal(trustRating(r).decision,'CAUTION');});

test('retained clear controls and holdings cannot produce OK after failed current verification',()=>{
 for(const reason of ['Contract check refresh is incomplete: Freeze authority. Last known results retained.','Holder snapshot is stale: All holder sources failed.']){
  const r=report();r.investigation.coverage.reasons=[reason];const rating=trustRating(r);
  assert.equal(rating.decision,'CAUTION');assert((rating.score??100)<75);assert(rating.reasons.some(value=>value.includes('current')));
 }
});
