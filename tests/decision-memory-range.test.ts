import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionModel,type DecisionModelInput} from '../src/lib/decision-model';
import {buildVerdictOutput} from '../src/lib/verdict-output';
import type {TrustRating} from '../src/lib/trust-rating';
import type {ObservedDecision} from '../src/lib/observed-decision';

type MemoryInput=DecisionModelInput&{memoryHitsRange?:{lower:number;upper:number}};
const keys=['avoid','caution','ok'] as const;
const base:MemoryInput={score:{lower:59,upper:59},danger:false,security:0,memoryHits:1,dumpImpact:{lower:.24,upper:.24}};
const rating=(input:MemoryInput):TrustRating=>({version:'six-factor-v1',score:null,range:input.score,decision:'CAUTION',basis:'Synthetic bounded inputs',reasons:[],components:[],ceiling:null,hard:[],coreVerified:true,judgeInputs:input,judge:decisionModel(input)});
function endpoints(inputs:MemoryInput[]){
 const runs=inputs.map(input=>decisionModel(input));
 return Object.fromEntries(keys.map(key=>[key,{lower:Math.min(...runs.map(run=>run.mass![key]/run.total!)),upper:Math.max(...runs.map(run=>run.mass![key]/run.total!))}]));
}

test('one known memory hit with incomplete search retains only the one-to-two-hit envelope',()=>{
 const input:MemoryInput={...base,memoryHitsRange:{lower:1,upper:2}},out=decisionModel(input);
 assert.equal(out.p,null);assert.equal(out.confidence,null);
 assert.deepEqual(out.ranges,endpoints([{...base,memoryHits:1},{...base,memoryHits:2}]));
 assert(out.ranges!.avoid.lower>decisionModel({...base,memoryHits:0}).ranges!.avoid.lower);
 assert(out.reasons.some(reason=>/memory/i.test(reason)&&/1/.test(reason)&&/2/.test(reason)));
 assert(!out.reasons.some(reason=>/not evaluated/i.test(reason)));
 assert.deepEqual(decisionModel({...input,memoryHits:null}).ranges,out.ranges,'an explicit qualified range also works without an exact hit count');
});

test('two saturated hits and explicit scoped zero preserve their exact normalized masses',()=>{
 for(const hits of [0,1,2]){
  const expected=decisionModel({...base,memoryHits:hits}),input:MemoryInput={...base,memoryHits:null,memoryHitsRange:{lower:hits,upper:hits}},out=decisionModel(input);
  assert.deepEqual(out.p,expected.p);assert.deepEqual(out.ranges,expected.ranges);assert.deepEqual(out.mass,expected.mass);assert.equal(out.total,expected.total);
 }
 const saturated=decisionModel({...base,memoryHits:19,memoryHitsRange:{lower:2,upper:2}});
 assert.deepEqual(saturated.p,decisionModel({...base,memoryHits:2}).p);
 assert(saturated.reasons.some(reason=>/saturat/i.test(reason)));
 assert.deepEqual(buildVerdictOutput({rating:{...rating({...base,memoryHits:2,memoryHitsRange:{lower:2,upper:2}}),score:59}}).p,saturated.p);
});

test('legacy numeric and null memory inputs retain their original behavior when no range is supplied',()=>{
 for(const hits of [0,1,2,29]){
  const actual=decisionModel({...base,memoryHits:hits});assert(actual.p);assert.equal(actual.total,1.12+Math.min(.5,.25*hits));
 }
 const unknown=decisionModel({...base,memoryHits:null});
 assert.equal(unknown.p,null);assert.deepEqual(unknown.ranges,endpoints([{...base,memoryHits:0},{...base,memoryHits:2}]));
 assert(unknown.reasons.some(reason=>reason.includes('not evaluated')));
});

test('malformed or count-inconsistent memory ranges abstain and preserve critical stops',()=>{
 const invalid:unknown[]=[null,{},[],{lower:1},{upper:2},{lower:-1,upper:2},{lower:0,upper:3},{lower:2,upper:1},{lower:.5,upper:2},{lower:0,upper:Infinity},{lower:NaN,upper:2},{lower:'1',upper:2}];
 const inputs=[...invalid.map(memoryHitsRange=>({...base,memoryHitsRange} as MemoryInput)),{...base,memoryHits:0,memoryHitsRange:{lower:1,upper:2}},{...base,memoryHits:2,memoryHitsRange:{lower:0,upper:0}},{...base,memoryHits:19,memoryHitsRange:{lower:1,upper:1}}];
 for(const input of inputs){
  const out=decisionModel(input);assert.equal(out.p,null);assert.equal(out.ranges,null);assert.equal(out.confidence,null);
  const hard=decisionModel({...input,hard:['Verified critical control']});assert.equal(hard.decision,'AVOID');assert.equal(hard.p,null);
 }
});

test('unknown security preserves the qualified memory floor throughout verdict fallback',()=>{
 const input:MemoryInput={...base,security:null,memoryHitsRange:{lower:1,upper:2}},out=buildVerdictOutput({rating:rating(input)});
 assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.inputBasis,'rating-inputs');
 assert.deepEqual(out.bounds,endpoints([0,1].flatMap(security=>[1,2].map(memoryHits=>({...base,security:security as 0|1,memoryHits})))));
 assert.equal(out.p.avoid,out.bounds!.avoid.lower);
});

test('malformed memory metadata cannot reuse cached ranges or an exact zero-memory vector',()=>{
 const zero=decisionModel({...base,memoryHits:0}),fallback=buildVerdictOutput({rating:{...rating(base),judge:undefined,judgeInputs:undefined}});
 for(const memoryHitsRange of [{lower:0,upper:3},{lower:2,upper:1},null] as unknown[]){
  const forged={...base,memoryHitsRange} as MemoryInput;
  for(const score of [null,59]){
   const out=buildVerdictOutput({rating:{...rating(forged),score,judge:zero}});
   assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.inputBasis,'full-supported-domain');assert.deepEqual(out.bounds,fallback.bounds);
   for(const value of Object.values(out.p))assert(Number.isFinite(value)&&value>=0&&value<=1);
  }
 }
});

test('a newly partial memory range cannot retain a cached exact verdict, while hard rules still dominate',()=>{
 const input:MemoryInput={...base,memoryHitsRange:{lower:1,upper:2}},cached=decisionModel({...base,memoryHits:0}),r={...rating(input),score:59,judge:cached};
 const out=buildVerdictOutput({rating:r});assert.equal(out.basis,'uncertainty-allocation');assert.deepEqual(out.bounds,endpoints([{...base,memoryHits:1},{...base,memoryHits:2}]));
 for(const options of [{rating:{...r,hard:['Verified critical control']}},{rating:r,critical:true}]){
  const critical=buildVerdictOutput(options);assert.equal(critical.basis,'rule');assert.equal(critical.decision,'AVOID');assert.deepEqual(critical.p,{avoid:1,caution:0,ok:0});
 }
});

test('a qualified conditional observed point remains eligible alongside a partial strict memory envelope',()=>{
 const input:MemoryInput={...base,memoryHitsRange:{lower:1,upper:2}},r=rating(input);
 const observed:ObservedDecision={score:59,scoreBand:'CAUTION',judge:decisionModel(base),factors:[],impact:.24,largestShare:.1,scope:{holderCount:2,readableFreshWallets:2,unreadFreshWallets:0,notes:['Conditional on the observed one-hit count; additional cross-token matches remain unknown.']}};
 const out=buildVerdictOutput({rating:r,observed});assert.equal(out.basis,'calculated');assert.equal(out.calculationScope,'observed');assert.deepEqual(out.p,observed.judge.p);
 const invalid={...input,memoryHitsRange:{lower:0,upper:3}};
 const withheld=buildVerdictOutput({rating:rating(invalid),observed});assert.equal(withheld.basis,'uncertainty-allocation');assert.equal(withheld.inputBasis,'full-supported-domain');
});

test('partial-memory score envelopes contain every supported integer score and admissible memory branch',()=>{
 const bounded=decisionModel({...base,score:{lower:20,upper:90},memoryHitsRange:{lower:1,upper:2}}),measured=Object.fromEntries(keys.map(key=>[key,{lower:1,upper:0}])) as NonNullable<ReturnType<typeof decisionModel>['ranges']>;
 for(let score=20;score<=90;score++)for(const memoryHits of [1,2]){
  const exact=decisionModel({...base,score:{lower:score,upper:score},memoryHits});
  for(const key of keys){const value=exact.mass![key]/exact.total!;measured[key].lower=Math.min(measured[key].lower,value);measured[key].upper=Math.max(measured[key].upper,value);}
 }
 assert.deepEqual(bounded.ranges,measured);assert.equal(bounded.p,null);
});
