import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVerdictOutput} from '../src/lib/verdict-output';
import {trustRating,type TrustRating} from '../src/lib/trust-rating';
import {observedDecision} from '../src/lib/observed-decision';
import {decisionModel,type DecisionModelInput} from '../src/lib/decision-model';
import type {InvestigationReport} from '../src/lib/investigation-types';
import fixture from './fixtures/grok-observed-inputs.json';

const snapshot=()=>structuredClone(fixture.report) as InvestigationReport;
const strict=(score:number):TrustRating=>({version:'six-factor-v1',score,decision:'OK',basis:'Test measured inputs',reasons:[],components:[],ceiling:null,hard:[],coreVerified:true,judge:decisionModel({score:{lower:score,upper:score},danger:false,security:0,memoryHits:0,dumpImpact:{lower:.2,upper:.2}})});

test('known observed score87 preserves its existing dynamic80.1 percent vector exactly',()=>{
 const report=snapshot(),rating=trustRating(report),observed=observedDecision(report,rating)!;
 const before=JSON.stringify({rating,observed}),out=buildVerdictOutput({rating,observed});
 assert.deepEqual(out.p,{avoid:.003,caution:.196,ok:.801});assert.equal(out.selectedWeight,.801);assert.equal(out.decision,'OK');assert.equal(out.score,87);assert.equal(out.basis,'calculated');assert.equal(out.calculationScope,'observed');assert.equal(JSON.stringify({rating,observed}),before);assert.equal(rating.score,null);
});

test('insufficient inputs allocate model uncertainty without filling unknown score or factors',()=>{
 const report=snapshot();report.checks=[];const rating=trustRating(report),before=JSON.stringify(rating);
 const out=buildVerdictOutput({rating,observed:null});assert.equal(out.p.ok,0);assert(out.p.caution>.9);assert.equal(out.decision,'CAUTION');assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.score,null);assert.match(out.explanation,/not.*safety/i);assert.equal(JSON.stringify(rating),before);assert(out.adjustments?.length);
});

test('known score changes retain the strict calculated model',()=>{
 const a=strict(87),b=strict(40),one=buildVerdictOutput({rating:a}),two=buildVerdictOutput({rating:b});
 assert.deepEqual(one.p,a.judge!.p);assert.deepEqual(two.p,b.judge!.p);assert.notDeepEqual(one.p,two.p);assert.equal(one.calculationScope,'strict');assert.equal(one.basis,'calculated');assert.equal(two.basis,'calculated');assert.equal(two.decision,'AVOID');
});

test('qualified critical rules dominate both calculated and uncertain outputs with an explicit allocation',()=>{
 const report=snapshot(),rating=trustRating(report),observed=observedDecision(report,rating);
 for(const input of [{rating,observed,critical:true},{rating,critical:true},{rating:{...rating,hard:['Verified freeze authority']},observed}]){
  const out=buildVerdictOutput(input);assert.equal(out.decision,'AVOID');assert.deepEqual(out.p,{avoid:1,caution:0,ok:0});assert.equal(out.basis,'rule');assert.equal(out.selectedWeight,1);assert.match(out.explanation,/allocation/i);assert.match(out.explanation,/not.*probability/i);
 }
});

test('invalid or winner-inconsistent exact vectors cannot masquerade as calculated outputs',()=>{
 for(const p of [{avoid:NaN,caution:.5,ok:.5},{avoid:-.1,caution:.2,ok:.9},{avoid:.2,caution:.2,ok:.2},{avoid:.8,caution:.1,ok:.1}]){
  const rating=strict(87);rating.judge={...rating.judge!,p};const out=buildVerdictOutput({rating});assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.score,87);
 }
});

const intervalRating=(input:DecisionModelInput,coreVerified=true):TrustRating=>({...strict(input.score.lower),score:null,range:input.score,judgeInputs:input,judge:decisionModel(input),coreVerified});
const partial:DecisionModelInput={score:{lower:20,upper:75},danger:false,security:0,memoryHits:null,dumpImpact:{lower:0,upper:1}};

test('actual verified MeiMei bounds produce a calculated98.1465 percent caution allocation rather than a target46',()=>{
 // Saved meimei-release-verified.json: score points20..75; security0;
 // unqueried memory0..0.5 addition; unresolved impact0..1. No token input.
 const rating=intervalRating(partial),out=buildVerdictOutput({rating});
 assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.version,'verdict-output-v2');assert.equal(out.score,null);
 assert(Math.abs(out.p.avoid-.018474207384007034)<1e-12);assert(Math.abs(out.p.ok-.00006108642375556025)<1e-12);assert(Math.abs(out.p.caution-.9814647061922374)<1e-12);
 assert.equal(out.p.caution,1-out.p.avoid-out.p.ok);assert.equal(out.adjustments?.length,0);
 const changed=buildVerdictOutput({rating:intervalRating({...partial,score:{lower:20,upper:85}})});assert.notDeepEqual(changed.p,out.p);
});

test('unknown security unions supported endpoints without assigning a zero or an average',()=>{
 const input={...partial,security:null},out=buildVerdictOutput({rating:intervalRating(input)}),a=decisionModel({...input,security:0}),b=decisionModel({...input,security:1});
 assert.equal(out.inputBasis,'rating-inputs');for(const key of ['avoid','caution','ok'] as const){assert.equal(out.bounds![key].lower,Math.min(a.ranges![key].lower,b.ranges![key].lower));assert.equal(out.bounds![key].upper,Math.max(a.ranges![key].upper,b.ranges![key].upper));}
});

test('absent or invalid metadata uses the full supported model envelope rather than malformed factor totals',()=>{
 const rating={...strict(87),score:null,coreVerified:true,judge:undefined,components:[]};
 const unknown=buildVerdictOutput({rating}),invalid=buildVerdictOutput({rating:{...rating,judgeInputs:{...partial,score:{lower:NaN,upper:75}}}});
 assert.equal(unknown.inputBasis,'full-supported-domain');assert.deepEqual(invalid.p,unknown.p);assert(unknown.p.caution>.99);assert.equal(unknown.score,null);
 const duplicates={...rating,components:[{id:'fresh',label:'Fake duplicates',maximum:999,earned:999,state:'clear' as const,detail:''},{id:'fresh',label:'Duplicate',maximum:999,earned:999,state:'clear' as const,detail:''}]};assert.deepEqual(buildVerdictOutput({rating:duplicates}).p,unknown.p);
});

test('an envelope collapsed to exact inputs converges to the existing normalized masses',()=>{
 const input:DecisionModelInput={score:{lower:60,upper:60},danger:false,security:0,memoryHits:0,dumpImpact:{lower:.1,upper:.100001}},rating=intervalRating(input),exact=decisionModel(input);
 rating.judge={...rating.judge!,p:null,confidence:null};const out=buildVerdictOutput({rating});
 for(const key of ['avoid','caution','ok'] as const)assert(Math.abs(out.p[key]-exact.mass![key]/exact.total!)<1e-12);
 assert.equal(out.decision,'CAUTION');assert(Math.abs(out.selectedWeight-exact.confidence!)<=.001);
});

test('core gate withholds only minimum OK support and soft ceilings are applied before the envelope',()=>{
 const verified=buildVerdictOutput({rating:intervalRating(partial)}),gated=buildVerdictOutput({rating:intervalRating(partial,false)});
 assert.equal(gated.p.avoid,verified.p.avoid);assert.equal(gated.p.ok,0);assert.equal(gated.p.caution,verified.p.caution+verified.p.ok);assert.equal(gated.adjustments?.[0].amount,verified.p.ok);
 const input={...partial,score:{lower:20,upper:59}},rating={...intervalRating(input),ceiling:59,soft:['Qualified owner-power warning']};
 const out=buildVerdictOutput({rating});assert.deepEqual(out.bounds,decisionModel(input).ranges);assert(out.p.ok<=verified.p.ok);
});

test('adverse model labels without hard evidence never manufacture a one-hot rule',()=>{
 const rating=strict(40);rating.decision='AVOID';rating.judge={...rating.judge!,p:null,confidence:null};
 const result=buildVerdictOutput({rating});assert.equal(result.decision,'AVOID');assert.equal(result.basis,'uncertainty-allocation');assert(result.p.avoid<1);assert(result.p.caution>0);
 const report=snapshot(),observed=observedDecision(report)!;const conditional=buildVerdictOutput({rating,observed});assert.equal(conditional.basis,'calculated');assert.deepEqual(conditional.p,observed.judge.p);
});

test('exact strict and observed AVOID vectors remain calculated even with verified core data',()=>{
 const rating={...strict(40),coreVerified:true},out=buildVerdictOutput({rating});assert.equal(out.basis,'calculated');assert.deepEqual(out.p,rating.judge!.p);
 const report=snapshot(),observed=observedDecision(report)!;observed.score=40;observed.judge=rating.judge!;
 const selected=buildVerdictOutput({rating:trustRating(report),observed});assert.equal(selected.basis,'calculated');assert.equal(selected.decision,'AVOID');assert.deepEqual(selected.p,observed.judge.p);
});

test('an exact favorable candidate cannot bypass an unverified or absent core gate',()=>{
 const report=snapshot(),observed=observedDecision(report)!;
 for(const coreVerified of [false,undefined])for(const candidate of [undefined,observed]){
  const out=buildVerdictOutput({rating:{...strict(87),coreVerified},observed:candidate});assert.equal(out.basis,'uncertainty-allocation');assert.equal(out.decision,'CAUTION');assert.equal(out.p.ok,0);assert.equal(out.adjustments?.length,1);assert(out.adjustments![0].amount>.8);
 }
});

test('inconsistent cached ranges cannot bypass the qualified soft score ceiling',()=>{
 const rating={...intervalRating(partial),ceiling:59,soft:['Qualified owner-power warning']};
 const out=buildVerdictOutput({rating}),expected=decisionModel({...partial,score:{lower:20,upper:59}});
 assert.deepEqual(out.bounds,expected.ranges);assert.equal(out.inputBasis,'rating-inputs');
 const exactAboveCap={...strict(87),ceiling:59,coreVerified:true};
 const rejected=buildVerdictOutput({rating:exactAboveCap});assert.equal(rejected.basis,'uncertainty-allocation');assert.equal(rejected.score,null);
});

test('a strict vector uses its own score when an observed candidate has no valid exact vector',()=>{
 const report=snapshot(),observed=observedDecision(report)!;observed.score=12;observed.judge.p=null;
 const out=buildVerdictOutput({rating:strict(87),observed});assert.equal(out.calculationScope,'strict');assert.equal(out.score,87);assert.deepEqual(out.p,{avoid:.003,caution:.196,ok:.801});
});

test('all outputs sum within existing model rounding and select their largest decision weight',()=>{
 for(let score=0;score<=100;score++){
  const out=buildVerdictOutput({rating:strict(score)}),values=Object.values(out.p);
  assert(Math.abs(values.reduce((a,b)=>a+b,0)-1)<=.00101);assert.equal(out.selectedWeight,out.p[out.decision.toLowerCase() as keyof typeof out.p]);assert.equal(out.selectedWeight,Math.max(...values));
 }
});
