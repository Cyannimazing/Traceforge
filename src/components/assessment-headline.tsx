import React from 'react';
import {decisionLabel} from '@/lib/assessment-presentation';
import type {VerdictOutput} from '@/lib/verdict-output';

type Props={score:number|null;decision:VerdictOutput['decision'];confidence:number;basis:VerdictOutput['basis']};
export default function AssessmentHeadline({score,decision,confidence,basis}:Props){
 const scored=score!==null&&Number.isFinite(score)&&score>=0&&score<=100;
 const tone=decision==='OK'?'clear':decision==='AVOID'?'high-risk':'watch';
 const label=basis==='calculated'?'Verdict confidence':basis==='rule'?'Rule allocation':'Decision weight';
 return <div className="ro-verdict-headline" data-verdict={tone}>
  <div className="ro-overall-score" aria-label={scored?`Overall score: ${score} out of 100`:'Overall score not established'}>
   <span>Overall score</span>
   <div className={scored?'ro-overall-value':'ro-overall-value is-pending'}>{scored?<><strong>{score.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>/100</span></>:<strong>Not scored</strong>}</div>
  </div>
  <div className="ro-headline-decision"><strong className="ro-decision">{decisionLabel(decision)}</strong><span>{label}</span><strong className="ro-headline-confidence" aria-label={`${label}: ${confidence}%`}>{confidence.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></strong></div>
  {scored&&<div className="ro-overall-meter" role="meter" aria-label="Overall score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{width:`${score}%`}}/></div>}
 </div>;
}
