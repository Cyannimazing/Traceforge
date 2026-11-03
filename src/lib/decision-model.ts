/** Reconstructed public behavior, not recovered private source or a calibrated
 * probability of safety. Normalize unrounded masses; round only for display. */
export type DecisionKey='avoid'|'caution'|'ok';
type Interval={lower:number;upper:number};
type Mass=Record<DecisionKey,number>;
export type DecisionModelInput={score:Interval;danger:boolean;security:0|1|null;memoryHits:number|null;dumpImpact:Interval;hard?:string[]};
export type DecisionModelResult={version:'traceforge-judge-v1';decision:'AVOID'|'CAUTION'|'OK';modelDecision:'AVOID'|'CAUTION'|'OK'|null;confidence:number|null;p:Mass|null;ranges:Record<DecisionKey,Interval>|null;mass:Mass|null;total:number|null;bar:number|null;escalate:boolean;reasons:string[]};
const keys=['avoid','caution','ok'] as const;
const round=(n:number)=>Math.round(n*1000)/1000;
const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const valid=(r:Interval,max:number)=>Number.isFinite(r?.lower)&&Number.isFinite(r?.upper)&&r.lower>=0&&r.upper<=max&&r.lower<=r.upper;
function calculate(score:number,extra:number){
 const avoid=sigmoid((48-score)/7),ok=sigmoid((score-74)/6);
 const mass={avoid:avoid+extra,caution:1.12-avoid-ok,ok},total=1.12+extra;
 const p={avoid:mass.avoid/total,caution:mass.caution/total,ok:mass.ok/total};
 const winner=keys.reduce((a,b)=>p[b]>p[a]?b:a);
 return {mass,total,p,winner};
}
export function decisionModel(input:DecisionModelInput):DecisionModelResult{
 const hard=[...new Set(input.hard||[])];
 const base:DecisionModelResult={version:'traceforge-judge-v1',decision:hard.length?'AVOID':'CAUTION',modelDecision:null,confidence:null,p:null,ranges:null,mass:null,total:null,bar:null,escalate:true,reasons:hard};
 if(!valid(input.score,100)||!Number.isInteger(input.score.lower)||!Number.isInteger(input.score.upper)||!valid(input.dumpImpact,1)||![0,1].includes(input.security as number)||(input.memoryHits!==null&&(!Number.isSafeInteger(input.memoryHits)||input.memoryHits<0)))return {...base,reasons:[...hard,'A required model input is unavailable or outside the validated domain.']};
 const fixed=(input.danger?.6:0)+(input.security===1?.35:0);
 const lowerExtra=fixed+(input.memoryHits===null?0:Math.min(.5,.25*input.memoryHits))+(input.dumpImpact.lower>=.5?.4:0);
 const upperExtra=fixed+(input.memoryHits===null?.5:Math.min(.5,.25*input.memoryHits))+(input.dumpImpact.upper>=.5?.4:0);
 const ranges=Object.fromEntries(keys.map(k=>[k,{lower:1,upper:0}])) as Record<DecisionKey,Interval>;
 const winners=new Set<DecisionKey>();
 // Scores are integer totals. Evaluate every score because caution has an
 // interior maximum. Each normalized mass is monotone in the additive term.
 for(let score=input.score.lower;score<=input.score.upper;score++)for(const extra of [lowerExtra,upperExtra]){
  const c=calculate(score,extra);winners.add(c.winner);
  for(const key of keys){ranges[key].lower=Math.min(ranges[key].lower,c.p[key]);ranges[key].upper=Math.max(ranges[key].upper,c.p[key]);}
 }
 const exact=input.score.lower===input.score.upper&&lowerExtra===upperExtra;
 const reasons=[...hard,...(input.score.lower!==input.score.upper?['Unresolved factors produce a score interval.']:[]),...(input.memoryHits===null?['Cross-token group history is not evaluated; its possible model contribution is bounded.']:[]),...(input.dumpImpact.lower<.5&&input.dumpImpact.upper>=.5?['The sell-impact stop threshold is unresolved.']:[])];
 const proven=winners.size===1?[...winners][0].toUpperCase() as DecisionModelResult['decision']:null;
 if(!exact||hard.length)return {...base,decision:hard.length?'AVOID':proven??'CAUTION',ranges,reasons,modelDecision:proven};
 const c=calculate(input.score.lower,lowerExtra),decision=c.winner.toUpperCase() as DecisionModelResult['decision'],bar={avoid:.7,caution:.6,ok:.9}[c.winner];
 return {...base,decision,modelDecision:decision,confidence:round(c.p[c.winner]),p:{avoid:round(c.p.avoid),caution:round(c.p.caution),ok:round(c.p.ok)},ranges,mass:c.mass,total:c.total,bar,escalate:c.p[c.winner]<bar,reasons};
}
