export type FactorId='swarm'|'fresh'|'insiders'|'concentration'|'snipers'|'dev';
export type FactorInput={id:FactorId;value:number|null;lower:number;upper:number;evidenceIds:string[];detail:string};
export const FACTORS:Record<FactorId,{label:string;maximum:number;clearAt:number;zeroAt:number}>={
 swarm:{label:'Largest-hand sell impact',maximum:30,clearAt:.1,zeroAt:.6},
 fresh:{label:'Fresh wallets',maximum:20,clearAt:0,zeroAt:1},
 insiders:{label:'Early / creator-origin exposure',maximum:15,clearAt:.02,zeroAt:.2},
 concentration:{label:'Top-ten hands concentration',maximum:15,clearAt:.3,zeroAt:.8},
 snipers:{label:'First-minute buyer exposure',maximum:10,clearAt:.03,zeroAt:.25},
 dev:{label:'Creator-linked exposure',maximum:10,clearAt:.02,zeroAt:.15},
};
/** Behavioral reconstruction from saved public input/output pairs, not source
 * recovery or outcome calibration. Fresh's interior curve is not yet identified. */
export function factorPoints(id:FactorId,risk:number):number|null{
 if(!Number.isFinite(risk)||risk<0||risk>1)return null;
 if(id==='fresh')return risk===0?20:risk>=6/7?0:null;
 const f=FACTORS[id];return f.maximum*Math.max(0,Math.min(1,(f.zeroAt-risk)/(f.zeroAt-f.clearAt)));
}
export function scoreFactors(inputs:FactorInput[],gates:{hard?:string[];soft?:string[];missingCore?:boolean}={}){
 const hard=[...new Set(gates.hard||[])],soft=[...new Set(gates.soft||[])];
 const components=(Object.keys(FACTORS) as FactorId[]).map(id=>{
  const f=FACTORS[id],matches=inputs.filter(i=>i.id===id),input=matches.length===1?matches[0]:undefined;
  const valid=input&&Number.isFinite(input.lower)&&Number.isFinite(input.upper)&&input.lower>=0&&input.upper<=1&&input.lower<=input.upper;
  const exact=valid&&input.value!==null&&input.value===input.lower&&input.value===input.upper;
  const measured=exact?factorPoints(id,input.value!):null;
  const lower=valid?(factorPoints(id,input.upper)??0):0,upper=valid?(factorPoints(id,input.lower)??f.maximum):f.maximum;
  const earned=measured??(valid&&lower===upper?lower:null);
  return {id,label:f.label,maximum:f.maximum,earned,lower,upper,state:earned===null?'unknown' as const:earned===f.maximum?'clear' as const:earned===0?'flagged' as const:'watch' as const,detail:input?.detail||'Required measurement unavailable.',evidenceIds:input?.evidenceIds||[]};
 });
 const ceiling=soft.length?59:null;
 const lower=Math.min(ceiling??100,Math.round(components.reduce((n,c)=>n+c.lower,0))),upper=Math.min(ceiling??100,Math.round(components.reduce((n,c)=>n+c.upper,0)));
 const complete=components.every(c=>c.earned!==null);
 const score=gates.missingCore?null:complete?Math.min(ceiling??100,Math.round(components.reduce((n,c)=>n+c.earned!,0))):null;
 const decision: 'CLEAN'|'OK'|'CAUTION'|'AVOID'|'UNRATED'=hard.length?'AVOID':score===null?'CAUTION':score>=90?'CLEAN':score>=75?'OK':'CAUTION';
 return {version:'six-factor-v1' as const,score,range:{lower:gates.missingCore&&!hard.length?0:lower,upper},decision,components,ceiling,hard,soft,complete:complete&&!gates.missingCore,
  basis:'Six-factor behavioral reconstruction. Five component curves match public observations; unresolved inputs retain score bounds. Not a probability of safety.',
  reasons:[...hard,...soft,...(gates.missingCore?['Current required control or holder evidence is incomplete.']:[]),...components.filter(c=>c.earned===null).map(c=>`${c.label} is not fully evaluated.`)]};
}
