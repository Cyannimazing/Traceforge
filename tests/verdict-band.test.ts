import test from 'node:test';
import assert from 'node:assert/strict';
import {verdictBand} from '../src/lib/verdict-band';
test('requested bands use exact unrounded boundaries',()=>{
 for(const [score,expected] of [[0,'CAUTION'],[74.999,'CAUTION'],[75,'OK'],[89,'OK'],[89.999,'OK'],[90,'CLEAN'],[100,'CLEAN']] as const)assert.equal(verdictBand(score),expected);
});
test('invalid scores never become CLEAN; critical evidence overrides scores',()=>{
 for(const score of [null,undefined,NaN,Infinity,-1,101])assert.equal(verdictBand(score),'UNRATED');
 assert.equal(verdictBand(100,true),'AVOID');assert.equal(verdictBand(null,true),'AVOID');
});
