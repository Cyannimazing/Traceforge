import React from 'react';
import {decisionLabel} from '@/lib/assessment-presentation';
import type {VerdictOutput} from '@/lib/verdict-output';

type Props={score:number|null;decision:VerdictOutput['decision'];confidence:number;basis:VerdictOutput['basis']};
export default function AssessmentHeadline({score,decision,confidence,basis}:Props){
 const scored=score!==null&&Number.isFinite(score)&&score>=0&&score<=100;
 const tone=decision==='OK'?'clear':decision==='AVOID'?'high-risk':'watch';
 const showConfidence=scored&&basis!=='uncertainty-allocation'&&Number.isFinite(confidence)&&confidence>=0&&confidence<=100;
 const label=basis==='rule'?'Rule allocation':'Verdict confidence';
 return <div className="ro-verdict-headline" data-verdict={tone} data-scored={scored}>
  {scored&&<div className="ro-overall-score" aria-label={`Overall score: ${score} out of 100`}>
   <span>Overall score</span>
   <div className="ro-overall-value"><strong>{score.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>/100</span></div>
  </div>}
  <div className="ro-headline-decision"><strong className="ro-decision">{decisionLabel(decision)}</strong>{showConfidence&&<><span>{label}</span><strong className="ro-headline-confidence" aria-label={`${label}: ${confidence}%`}>{confidence.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></strong></>}</div>
  {scored&&<div className="ro-overall-meter" role="meter" aria-label="Overall score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{width:`${score}%`}}/></div>}
 </div>;
}
