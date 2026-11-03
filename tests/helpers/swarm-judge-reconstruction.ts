/** Offline behavioral reconstruction, never imported by application code.
 * Parameters fit public response evidence, not token outcome labels. */
export type ObservedJudgeInput={score:number|null;band:string;security:number;memoryHits:number;dumpImpact:number|null};
export function reconstructObservedJudge(input:ObservedJudgeInput){
 const {score,band,security,memoryHits,dumpImpact}=input;
 if(score===null||!Number.isFinite(score)||score<0||score>100||![0,1].includes(security)||!Number.isSafeInteger(memoryHits)||memoryHits<0||(dumpImpact!==null&&(!Number.isFinite(dumpImpact)||dumpImpact<0||dumpImpact>1)))return null;
 const sigmoid=(x:number)=>1/(1+Math.exp(-x)),round=(x:number)=>Math.round(x*1000)/1000;
 const baseAvoid=sigmoid((48-score)/7),baseOK=sigmoid((score-74)/6),baseCaution=1.12-baseAvoid-baseOK;
 const evidence:{k:string;avoid:number;ok?:number;caution?:number}[]=[{k:`score ${score}`,avoid:round(baseAvoid),ok:round(baseOK),caution:round(baseCaution)}];
 let extra=0;
 const add=(k:string,avoid:number)=>{extra+=avoid;evidence.push({k,avoid});};
 if(band==='DANGER')add('hard rule: DANGER band',.6);
 if(security===1)add('contract risk (warn)',.35);
 if(memoryHits>0)add(`swarm seen in ${memoryHits} other token(s)`,Math.min(.5,.25*memoryHits));
 if(dumpImpact!==null&&dumpImpact>=.5)add(`one hand can dump ${Math.round(dumpImpact*100)}%`,.4);
 const total=1.12+extra,raw={avoid:(baseAvoid+extra)/total,caution:baseCaution/total,ok:baseOK/total};
 const winner=(['avoid','caution','ok'] as const).reduce((a,b)=>raw[b]>raw[a]?b:a);
 const bar={avoid:.7,caution:.6,ok:.9}[winner];
 return {decision:winner.toUpperCase(),p:{avoid:round(raw.avoid),caution:round(raw.caution),ok:round(raw.ok)},confidence:round(raw[winner]),bar,escalate:raw[winner]<bar,evidence,raw,total};
}
