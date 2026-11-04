import type {TrustRating} from './trust-rating';
import type {ObservedDecision} from './observed-decision';
import {decisionModel,decisionMemoryBounds,type DecisionKey,type DecisionModelResult,type DecisionModelInput} from './decision-model';

type Mass=Record<DecisionKey,number>;
export type VerdictBounds=Record<DecisionKey,{lower:number;upper:number}>;
export type VerdictAdjustment={from:'ok';to:'caution';amount:number;reason:string};

export type VerdictOutput={
 version:'verdict-output-v2';decision:'AVOID'|'CAUTION'|'OK';
 p:Record<DecisionKey,number>;selectedWeight:number;
 basis:'calculated'|'uncertainty-allocation'|'rule';
 score:number|null;calculationScope?:'observed'|'strict';explanation:string;
 bounds?:VerdictBounds;adjustments?:VerdictAdjustment[];
 inputBasis?:'validated-ranges'|'rating-inputs'|'full-supported-domain';
 calculation?:{mass:Mass;total:number};
};
export type VerdictOutputInput={rating:TrustRating;observed?:ObservedDecision|null;critical?:boolean};
const keys=['avoid','caution','ok'] as const;
const validScore=(value:number|null|undefined):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const validInterval=(value:{lower:number;upper:number}|undefined,max:number)=>!!value&&Number.isFinite(value.lower)&&Number.isFinite(value.upper)&&value.lower>=0&&value.lower<=value.upper&&value.upper<=max;
function validBounds(bounds:VerdictBounds|null|undefined):bounds is VerdictBounds{
 return !!bounds&&keys.every(key=>validInterval(bounds[key],1))&&keys.reduce((sum,key)=>sum+bounds[key].lower,0)<=1+1e-10&&keys.reduce((sum,key)=>sum+bounds[key].upper,0)>=1-1e-10;
}
function validInputs(input:DecisionModelInput|undefined):input is DecisionModelInput{
 return !!input&&validInterval(input.score,100)&&Number.isInteger(input.score.lower)&&Number.isInteger(input.score.upper)&&validInterval(input.dumpImpact,1)&&typeof input.danger==='boolean'&&(input.security===null||input.security===0||input.security===1)&&decisionMemoryBounds(input)!==null&&(input.hard===undefined||Array.isArray(input.hard)&&input.hard.every(reason=>typeof reason==='string'));
}
const scoreCeiling=(rating:TrustRating)=>Number.isInteger(rating.ceiling)&&rating.ceiling!>=0&&rating.ceiling!<=100?rating.ceiling!:100;
function envelope(rating:TrustRating):{bounds:VerdictBounds;inputBasis:NonNullable<VerdictOutput['inputBasis']>}{
 const known=validInputs(rating.judgeInputs),ceiling=scoreCeiling(rating);
 const mustCap=ceiling<100&&(known?rating.judgeInputs!.score.upper>ceiling:!validInterval(rating.range,ceiling));
 // New memory bounds must be evaluated, not hidden behind a prior cached
 // vector that assumed zero hits. Legacy reports retain their existing path.
 if(rating.judgeInputs?.memoryHitsRange===undefined&&!mustCap&&validBounds(rating.judge?.ranges))return {bounds:structuredClone(rating.judge.ranges),inputBasis:'validated-ranges'};
 const input:DecisionModelInput=known?{...rating.judgeInputs!,score:{lower:Math.min(ceiling,rating.judgeInputs!.score.lower),upper:Math.min(ceiling,rating.judgeInputs!.score.upper)}}:{score:{lower:0,upper:ceiling},danger:false,security:null,memoryHits:null,dumpImpact:{lower:0,upper:1}};
 // Only endpoints of the existing supported additive security term are needed.
 // No likelihood is assigned to either endpoint or to any missing risk input.
 const runs=(input.security===null?[0,1] as const:[input.security]).map(security=>decisionModel({...input,security}));
 const bounds=Object.fromEntries(keys.map(key=>[key,{lower:Math.min(...runs.map(run=>run.ranges![key].lower)),upper:Math.max(...runs.map(run=>run.ranges![key].upper))}])) as VerdictBounds;
 return {bounds,inputBasis:known?'rating-inputs':'full-supported-domain'};
}
function exact(judge:DecisionModelResult|undefined):judge is DecisionModelResult&{p:Record<DecisionKey,number>}{
 if(!judge?.p||!['AVOID','CAUTION','OK'].includes(judge.decision))return false;
 const values=keys.map(key=>judge.p![key]);
 return values.every(value=>Number.isFinite(value)&&value>=0&&value<=1)&&Math.abs(values.reduce((sum,value)=>sum+value,0)-1)<=.00101&&judge.p[judge.decision.toLowerCase() as DecisionKey]===Math.max(...values);
}

/** Conservative uncertainty allocation. Never supplies score-factor measurements or
 * changes the original rating. Callers qualify critical evidence beforehand.
 * No token identifiers, network requests, or provider verdict inputs are used.
 */
export function buildVerdictOutput({rating,observed,critical=false}:VerdictOutputInput):VerdictOutput{
 const ceiling=scoreCeiling(rating);
 const hasMemoryRange=rating.judgeInputs?.memoryHitsRange!==undefined,memory=hasMemoryRange?decisionMemoryBounds(rating.judgeInputs!):undefined;
 // Observed points may explicitly condition on the count found so far. A
 // strict exact vector cannot replace a non-exact strict memory envelope.
 const candidate=rating.coreVerified!==true||hasMemoryRange&&!memory?undefined:validScore(observed?.score)&&observed.score<=ceiling&&exact(observed.judge)?{judge:observed.judge,scope:'observed' as const,score:observed.score}:(!hasMemoryRange||memory!.lower===memory!.upper)&&validScore(rating.score)&&rating.score<=ceiling&&exact(rating.judge)?{judge:rating.judge,scope:'strict' as const,score:rating.score}:undefined;
 const score=validScore(candidate?.score)?candidate.score:validScore(rating.score)&&rating.score<=ceiling?rating.score:null;
 const base={version:'verdict-output-v2' as const,score};
 if(critical||rating.hard?.length)return {...base,decision:'AVOID',p:{avoid:1,caution:0,ok:0},selectedWeight:1,basis:'rule',explanation:'A source-qualified critical rule takes precedence. The 100/0/0 allocation expresses that decision rule; it is not a probability of loss or a confidence measurement.'};
 if(candidate){
  const {judge,scope}=candidate,p={...judge.p};
  return {...base,decision:judge.decision,p,selectedWeight:p[judge.decision.toLowerCase() as DecisionKey],basis:'calculated',calculationScope:scope,...(judge.mass&&judge.total?{calculation:{mass:{...judge.mass},total:judge.total}}:{}),explanation:scope==='observed'?'Existing conditional observed-scope model weights, preserved without alteration. Its stated assumptions and excluded inputs still apply. These are not measured safety probabilities or evidence confidence.':'Existing strict calculated model weights, preserved without alteration. These are not measured safety probabilities or evidence confidence.'};
 }
 const {bounds,inputBasis}=envelope(rating),p={avoid:bounds.avoid.lower,ok:bounds.ok.lower,caution:1-bounds.avoid.lower-bounds.ok.lower},adjustments:VerdictAdjustment[]=[];
 if(rating.coreVerified!==true){adjustments.push({from:'ok',to:'caution',amount:p.ok,reason:'Required current holder or control evidence is unverified; minimum OK support is withheld until the core evidence gate passes.'});p.caution+=p.ok;p.ok=0;}
 const winner=(['caution','avoid','ok'] as const).reduce((best,key)=>p[key]>p[best]?key:best);
 return {...base,decision:winner.toUpperCase() as VerdictOutput['decision'],p,selectedWeight:p[winner],basis:'uncertainty-allocation',bounds,adjustments,inputBasis,explanation:'Conservative allocation from the existing model envelope: Avoid uses its minimum supported normalized weight; OK uses its minimum; Caution receives 1 minus those minima. Unknown security is bounded by both supported endpoints, not averaged. Existing score ceilings apply before evaluation; missing core evidence withholds OK support. This is not a measured safety probability or evidence confidence. Unknown scores and factors remain unknown.'};
}
