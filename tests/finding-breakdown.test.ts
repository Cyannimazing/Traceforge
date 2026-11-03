import test from 'node:test';
import assert from 'node:assert/strict';
import {findingBreakdown} from '../src/lib/finding-breakdown';
import type {Finding} from '../src/lib/investigation-types';

const finding=(id:string,level:Finding['level']='warning'):Finding=>({id,level,title:id,description:'',certainty:'inferred',wallets:[],evidenceIds:[]});
test('five funding warnings plus one coverage note are not six warnings',()=>{
 const result=findingBreakdown([...Array.from({length:5},(_,i)=>finding(`funder:${i}`)),finding('coverage','info')]);
 assert.equal(result.wallet.length,5);assert.equal(result.risks.length,5);assert.equal(result.notes.length,1);
 assert.equal(result.label,'5 warnings · 1 coverage note');
});
test('control findings and non-coverage information are not mislabeled wallet warnings',()=>{
 const result=findingBreakdown([finding('security:mint','critical'),finding('creator','info'),finding('coverage','info')]);
 assert.equal(result.wallet.length,0);assert.equal(result.controls.length,1);assert.equal(result.notes.length,2);
 assert.equal(result.label,'1 critical finding · 1 coverage note · 1 information note');
});
test('critical evidence is ordered first and duplicate IDs count once',()=>{
 const result=findingBreakdown([finding('funder:a'),finding('funder:a'),finding('sell','critical')]);
 assert.equal(result.risks.length,2);assert.equal(result.risks[0].id,'sell');
});
