import test from 'node:test';
import assert from 'node:assert/strict';
import observations from './fixtures/swarm-judge-observations.json';
import {decisionModel} from '../src/lib/decision-model';

test('production judge reproduces every supported captured public distribution',()=>{
 let matched=0,unscored=0;
 for(const row of observations.rows){
  if(row.input.score===null){
   const unknown=decisionModel({score:{lower:0,upper:100},danger:false,security:row.input.security as 0|1,memoryHits:row.input.memoryHits,dumpImpact:{lower:0,upper:1}});
   assert.equal(unknown.p,null,row.path);assert.equal(unknown.confidence,null,row.path);unscored++;continue;
  }
  // Replay the provider's observed no-addition branch for its null-impact rows.
  // Independent missing impact must use [0,1], as the unknown-input tests do.
  const actual=decisionModel({score:{lower:row.input.score,upper:row.input.score},danger:row.input.band==='DANGER',security:row.input.security as 0|1,memoryHits:row.input.memoryHits,dumpImpact:row.input.dumpImpact===null?{lower:0,upper:0}:{lower:row.input.dumpImpact,upper:row.input.dumpImpact}});
  assert.deepEqual(actual.p,row.observed.p,row.path);assert.equal(actual.modelDecision,row.observed.decision,row.path);assert.equal(actual.confidence,row.observed.confidence);assert.equal(actual.bar,row.observed.bar,row.path);assert.equal(actual.escalate,row.observed.escalate,row.path);matched++;
 }
 assert(matched>=77);assert.equal(matched+unscored,observations.rows.length);assert(unscored>=2);
});
test('87 uses unrounded masses and has an inspectable calculation',()=>{
 const r=decisionModel({score:{lower:87,upper:87},danger:false,security:0,memoryHits:0,dumpImpact:{lower:.26,upper:.26}});
 assert.deepEqual(r.p,{avoid:.003,caution:.196,ok:.801});assert.equal(r.confidence,.801);assert.equal(r.total,1.12);assert.equal(r.decision,'OK');assert.equal(r.escalate,true);
 assert(Math.abs(r.mass!.ok-.897215975)<.000001);
});
test('all integer scores are evaluated so caution interior peak is retained',()=>{
 const r=decisionModel({score:{lower:0,upper:100},danger:false,security:0,memoryHits:0,dumpImpact:{lower:0,upper:0}});
 assert.equal(r.p,null);assert.equal(r.confidence,null);assert.equal(r.decision,'CAUTION');assert(r.ranges!.caution.upper>.78);
 for(let score=0;score<=100;score++){
  const exact=decisionModel({score:{lower:score,upper:score},danger:false,security:0,memoryHits:0,dumpImpact:{lower:0,upper:0}});
  for(const k of ['avoid','caution','ok'] as const)assert(exact.p![k]>=r.ranges![k].lower-.001&&exact.p![k]<=r.ranges![k].upper+.001);
 }
});
test('unknown risk branches expand ranges and critical rules override without false confidence',()=>{
 const r=decisionModel({score:{lower:87,upper:87},danger:false,security:0,memoryHits:null,dumpImpact:{lower:0,upper:1}});
 assert.equal(r.p,null);assert.equal(r.confidence,null);assert(r.ranges!.avoid.upper>.44);
 const hard=decisionModel({score:{lower:100,upper:100},danger:true,security:0,memoryHits:0,dumpImpact:{lower:0,upper:0},hard:['Freeze']});
 assert.equal(hard.decision,'AVOID');assert.equal(hard.confidence,null);assert.equal(hard.p,null);
});
test('unknown security and malformed score cannot turn into favorable precise weights',()=>{
 for(const score of [{lower:90,upper:89},{lower:NaN,upper:100},{lower:80.5,upper:90},{lower:-1,upper:100}])assert.equal(decisionModel({score,danger:false,security:0,memoryHits:0,dumpImpact:{lower:0,upper:0}}).ranges,null);
 assert.equal(decisionModel({score:{lower:87,upper:87},danger:false,security:null,memoryHits:0,dumpImpact:{lower:0,upper:0}}).p,null);
});
test('risk intervals contain every admissible integer score and discrete observed risk branch',()=>{
 for(const setting of [{lower:20,upper:90,danger:false,security:0 as const},{lower:0,upper:100,danger:true,security:1 as const}]){
  const bounded=decisionModel({score:{lower:setting.lower,upper:setting.upper},danger:setting.danger,security:setting.security,memoryHits:null,dumpImpact:{lower:0,upper:1}});
  const measured={avoid:{lower:1,upper:0},caution:{lower:1,upper:0},ok:{lower:1,upper:0}};
  const winners=new Set<string>();
  for(let score=setting.lower;score<=setting.upper;score++)for(const memoryHits of [0,1,2,50])for(const impact of [0,.499999,.5,1]){
   const exact=decisionModel({score:{lower:score,upper:score},danger:setting.danger,security:setting.security,memoryHits,dumpImpact:{lower:impact,upper:impact}});
   winners.add(exact.modelDecision!);
   for(const key of ['avoid','caution','ok'] as const){
    const raw=exact.mass![key]/exact.total!;
    measured[key].lower=Math.min(measured[key].lower,raw);measured[key].upper=Math.max(measured[key].upper,raw);
    assert(raw>=bounded.ranges![key].lower-1e-12&&raw<=bounded.ranges![key].upper+1e-12);
   }
  }
  assert.deepEqual(bounded.ranges,measured);
  assert.equal(bounded.modelDecision,winners.size===1?[...winners][0]:null);
 }
});
test('unsupported security, invalid memory and malformed impact abstain without masking a critical stop',()=>{
 const base={score:{lower:87,upper:87},danger:false,security:0 as const,memoryHits:0,dumpImpact:{lower:0,upper:0}};
 for(const invalid of [{...base,security:2 as unknown as 0},{...base,memoryHits:-1},{...base,memoryHits:.5},{...base,memoryHits:Infinity},{...base,dumpImpact:{lower:0,upper:1.01}},{...base,dumpImpact:{lower:NaN,upper:1}}]){
  const unknown=decisionModel(invalid);assert.equal(unknown.p,null);assert.equal(unknown.ranges,null);assert.equal(unknown.confidence,null);assert.equal(unknown.decision,'CAUTION');
  const critical=decisionModel({...invalid,hard:['Verified freeze authority']});assert.equal(critical.decision,'AVOID');assert.equal(critical.p,null);assert.equal(critical.confidence,null);
 }
});
