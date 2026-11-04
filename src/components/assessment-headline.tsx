import React from 'react';
import {decisionLabel} from '@/lib/assessment-presentation';
import type {VerdictOutput} from '@/lib/verdict-output';
import type {AssessmentProgress} from '@/lib/assessment-progress';

type Props={score:number|null;decision:VerdictOutput['decision'];confidence:number;basis:VerdictOutput['basis'];progress?:AssessmentProgress};
export default function AssessmentHeadline({score,decision,confidence,basis,progress}:Props){
 const scored=score!==null&&Number.isFinite(score)&&score>=0&&score<=100;
 const tone=decision==='OK'?'clear':decision==='AVOID'?'high-risk':'watch';
 const partial=!scored&&basis==='uncertainty-allocation'&&progress!==undefined;
 const label=partial?'Model assessed':basis==='calculated'?'Verdict confidence':basis==='rule'?'Rule allocation':'Decision weight';
 const percentage=partial?progress.modelCoverage:confidence;
 return <div className="ro-verdict-headline" data-verdict={tone}>
  <div className="ro-overall-score" aria-label={scored?`Overall score: ${score} out of 100`:partial&&progress.maximum>0?`Assessed points: ${progress.earned.toFixed(1)} out of ${progress.maximum} resolved points`:partial?'No factor points assessed':'Overall score not established'}>
   <span>{partial?'Assessed points':'Overall score'}</span>
   <div className={scored||partial&&progress.maximum>0?'ro-overall-value':'ro-overall-value is-pending'}>{scored?<><strong>{score.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>/100</span></>:partial&&progress.maximum>0?<><strong>{progress.earned.toLocaleString(undefined,{maximumFractionDigits:1})}</strong><span>/{progress.maximum}</span></>:<strong>{partial?'Awaiting measurements':'Not scored'}</strong>}</div>
   {partial&&<small className="ro-assessed-scope">{progress.resolvedFactors} of {progress.totalFactors} factors. Remaining factors are unscored.</small>}
  </div>
  <div className="ro-headline-decision"><strong className="ro-decision">{decisionLabel(decision)}</strong><span title={partial?'Percentage of the six-factor model weight with resolved point contributions. This is not a confidence or safety percentage.':undefined}>{label}</span><strong className="ro-headline-confidence" aria-label={`${label}: ${percentage}%`}>{percentage.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></strong></div>
  {scored&&<div className="ro-overall-meter" role="meter" aria-label="Overall score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}><span style={{width:`${score}%`}}/></div>}
 </div>;
}
