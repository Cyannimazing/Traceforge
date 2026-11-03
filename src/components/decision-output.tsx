import type {DecisionModelResult} from '@/lib/decision-model';
import type {VerdictOutput} from '@/lib/verdict-output';
import {decisionDisplayPercentages} from '@/lib/decision-display';
import {decisionLabels as labels,decisionLabel,presentationText} from '@/lib/assessment-presentation';

const percent=(value:number)=>`${(value*100).toFixed(1)}%`;
export default function DecisionOutput(props:{result:DecisionModelResult;output?:never}|{output:VerdictOutput;result?:never}){
 if(props.output){
  const output=props.output;
  const basis=output.basis==='uncertainty-allocation'?'Includes unresolved checks':output.basis==='rule'?'Rule allocation':'Calculated weights';
  const shown=decisionDisplayPercentages(output.p);
  return <section className="ro-decision-weights ro-calculated-judge ro-visible-decision" aria-label="Assessment support percentages">
   <header><h3>Decision support</h3><span className="ro-output-basis">{basis}</span></header>
   <dl>{(['avoid','caution','ok'] as const).map(key=><div key={key} className={output.decision===key.toUpperCase()?'is-selected':''}><dt>{labels[key]}</dt><dd><span className="ro-weight-track" aria-hidden="true"><span style={{width:`${shown[key]}%`}}/></span><span className="ro-weight-value">{shown[key].toFixed(1)}%</span></dd></div>)}</dl>
   <details className="ro-judge-calculation"><summary>How this percentage works</summary><p>{presentationText(output.explanation)}</p>
    {output.basis==='uncertainty-allocation'&&output.bounds&&<dl className="ro-output-arithmetic">
     <div><dt>Minimum supported High risk weight</dt><dd>{(output.bounds.avoid.lower*100).toFixed(6)}%</dd></div>
     <div><dt>Minimum supported Clear weight</dt><dd>{(output.bounds.ok.lower*100).toFixed(6)}%</dd></div>
     <div><dt>Remainder assigned to Watch</dt><dd>100% - {(output.bounds.avoid.lower*100).toFixed(6)}% - {(output.bounds.ok.lower*100).toFixed(6)}% = {((1-output.bounds.avoid.lower-output.bounds.ok.lower)*100).toFixed(6)}%</dd></div>
    </dl>}
    {!!output.adjustments?.length&&<ul>{output.adjustments.map((adjustment,index)=><li key={index}>{(adjustment.amount*100).toFixed(6)}% moved from Clear to Watch: {presentationText(adjustment.reason)}</li>)}</ul>}
    {output.calculation&&<dl className="ro-output-arithmetic">{(['avoid','caution','ok'] as const).map(key=><div key={key}><dt>{labels[key]} calculation</dt><dd>{output.calculation!.mass[key].toFixed(6)} / {output.calculation!.total.toFixed(6)} × 100</dd></div>)}</dl>}
    <p>Decision weights are not measured chances of safety. Display rounding keeps the three labels at 100%; the calculation retains its precision.</p>
   </details>
  </section>;
 }
 const {result}=props;
 if(!result)return null;
 return <section className="ro-decision-weights ro-calculated-judge" aria-label="Calculated decision output">
  <header><h3>Decision support</h3><strong>{decisionLabel(result.decision)}</strong></header>
  {result.ranges?<dl>{(['avoid','caution','ok'] as const).map(key=>{
   const range=result.ranges![key],exact=result.p?.[key],low=exact??range.lower,high=exact??range.upper;
   return <div key={key} className={result.p&&result.decision===key.toUpperCase()?'is-selected':''}>
    <dt>{labels[key]}</dt><dd><span className="ro-weight-track ro-weight-interval" aria-hidden="true"><span style={{width:percent(high)}}/><i style={{width:percent(low)}}/></span><span className="ro-weight-value">{exact!==undefined?percent(exact):`${(Math.floor(low*1000)/10).toFixed(1)}-${(Math.ceil(high*1000)/10).toFixed(1)}%`}</span></dd>
   </div>;
  })}</dl>:<p>Decision weights are withheld: a required input is unavailable or outside the reconstructed model's supported cases. Verified stop rules still apply.</p>}
  <p>{result.p?`${percent(result.confidence!)} normalized model weight for ${decisionLabel(result.decision)}.`:'Ranges show how unresolved inputs could change the model output. No single confidence percentage is assigned.'} These are reconstructed decision weights, not measured chances of safety.</p>
  <details className="ro-judge-calculation"><summary>How this decision is calculated</summary>
   <p>Six-factor points produce the score. The decision model transforms that score, adds supported risk signals, then divides each weight by the total. The largest weight selects the model decision. Verified critical findings override it with High risk.</p>
   <dl><div><dt>Base High risk</dt><dd>sigmoid((48 - score) / 7)</dd></div><div><dt>Base Clear</dt><dd>sigmoid((score - 74) / 6)</dd></div><div><dt>Base Watch</dt><dd>1.12 - Base High risk - Base Clear</dd></div><div><dt>Normalize</dt><dd>weight / (1.12 + risk additions)</dd></div></dl>
   {result.mass&&<p>Raw weights: High risk {result.mass.avoid.toFixed(6)}, Watch {result.mass.caution.toFixed(6)}, Clear {result.mass.ok.toFixed(6)}. Total {result.total!.toFixed(6)}. Rounding happens after division.</p>}
   {result.reasons.length>0&&<ul>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
   <p>Source: behavioral reconstruction checked against 77 scored public Swarm reports. The model is deterministic and uses no LLM. Score bands and decision weights are separate outputs.</p>
  </details>
 </section>;
}
