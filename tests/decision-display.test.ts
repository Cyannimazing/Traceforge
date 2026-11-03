import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionDisplayPercentages} from '../src/lib/decision-display';

test('fractional decision weights display a total of100 without changing model inputs',()=>{
 const input={avoid:.018474207384007034,caution:.9814647061922374,ok:.00006108642375556025};
 const copy={...input},shown=decisionDisplayPercentages(input);
 assert.deepEqual(shown,{avoid:1.9,caution:98.1,ok:0});
 assert.equal(Math.round((shown.avoid+shown.caution+shown.ok)*10),1000);
 assert.deepEqual(input,copy);
});
test('the known scored vector retains its displayed0.3/19.6/80.1',()=>{
 assert.deepEqual(decisionDisplayPercentages({avoid:.003,caution:.196,ok:.801}),{avoid:.3,caution:19.6,ok:80.1});
});
test('existing three-decimal model rounding is reconciled only at the display boundary',()=>{
 for(const input of [{avoid:.333,caution:.333,ok:.333},{avoid:.334,caution:.334,ok:.333}]){
  const shown=decisionDisplayPercentages(input);
  assert.equal(Math.round((shown.avoid+shown.caution+shown.ok)*10),1000);
  for(const key of ['avoid','caution','ok'] as const)assert(Math.abs(shown[key]-input[key]*100)<.11);
 }
});
test('zero weights and one-hot rules stay exact',()=>{
 assert.deepEqual(decisionDisplayPercentages({avoid:1,caution:0,ok:0}),{avoid:100,caution:0,ok:0});
 assert.deepEqual(decisionDisplayPercentages({avoid:0,caution:1,ok:0}),{avoid:0,caution:100,ok:0});
});
test('invalid weights never produce a displayed percentage',()=>{
 for(const input of [{avoid:NaN,caution:1,ok:0},{avoid:-1,caution:1,ok:1},{avoid:0,caution:0,ok:0}])assert.throws(()=>decisionDisplayPercentages(input),/Invalid decision weights/);
});
