import React from 'react';
import {decisionLabel} from '@/lib/assessment-presentation';
import type {VerdictOutput} from '@/lib/verdict-output';
import type {AssessmentProgress} from '@/lib/assessment-progress';

type Props={score:number|null;decision:VerdictOutput['decision'];confidence:number;basis:VerdictOutput['basis'];progress?:AssessmentProgress};
export default function AssessmentHeadline({score,decision,confidence,basis,progress}:Props){
 const scored=score!==null&&Number.isFinite(score)&&score>=0&&score<=100;
 const tone=decision==='OK'?'clear':decision==='AVOID'?'high-risk':'watch';
 const partial=!scored&&basis==='uncertainty-allocation'&&progress!==undefined;
 const label=partial?'Factors assessed':basis==='calculated'?'Verdict confidence':basis==='rule'?'Rule allocation':'Decision weight';
 return <div className="ro-verdict-headline" data-verdict={tone}>
  <div className="ro-overall-score" aria-label={scored?`Overall score: ${score} out of 100`:partial?`Scoring progress: ${progress.earned.toFixed(1)} established points out of 100; ${100-progress.maximum} points pending`:'Overall score not established'}>
   <span>{partial?'Score progress':'Overall score'}</span>
   <div className={scored||partial?'ro-overall-value':'ro-overall-value is-pending'}>{scored||partial?<><strong>{(scored?score:progress!.earned).toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>/100</span></>:<strong>Not scored</strong>}</div>
   {partial&&<small className="ro-assessed-scope">{progress.maximum} points assessed; {100-progress.maximum} pending.</small>}
  </div>
  <div className="ro-headline-decision"><strong className="ro-decision">{decisionLabel(decision)}</strong><span>{label}</span>{partial?<strong className="ro-headline-confidence" aria-label={`${progress.resolvedFactors} of ${progress.totalFactors} factors assessed`}>{progress.resolvedFactors}/{progress.totalFactors}</strong>:<strong className="ro-headline-confidence" aria-label={`${label}: ${confidence}%`}>{confidence.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></strong>}</div>
  {scored&&<div className="ro-overall-meter" role="meter" aria-label="Overall score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{width:`${score}%`}}/></div>}
 </div>;
}
