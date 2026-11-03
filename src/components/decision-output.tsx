import type {DecisionModelResult} from '@/lib/decision-model';

const labels={avoid:'Avoid',caution:'Caution',ok:'OK'} as const;
const percent=(value:number)=>`${(value*100).toFixed(1)}%`;
export default function DecisionOutput({result}:{result:DecisionModelResult}){
 return <section className="ro-decision-weights ro-calculated-judge" aria-label="Calculated decision output">
  <header><h3>Decision output</h3><strong>{result.decision}</strong></header>
  {result.ranges?<dl>{(['avoid','caution','ok'] as const).map(key=>{
   const range=result.ranges![key],exact=result.p?.[key],low=exact??range.lower,high=exact??range.upper;
   return <div key={key} className={result.p&&result.decision===key.toUpperCase()?'is-selected':''}>
    <dt>{labels[key]}</dt><dd><span className="ro-weight-track ro-weight-interval" aria-hidden="true"><span style={{width:percent(high)}}/><i style={{width:percent(low)}}/></span><span className="ro-weight-value">{exact!==undefined?percent(exact):`${(Math.floor(low*1000)/10).toFixed(1)}-${(Math.ceil(high*1000)/10).toFixed(1)}%`}</span></dd>
   </div>;
  })}</dl>:<p>Decision weights are withheld: a required input is unavailable or outside the reconstructed model's supported cases. Verified stop rules still apply.</p>}
  <p>{result.p?`${percent(result.confidence!)} normalized model weight for ${result.decision}.`:'Ranges show how unresolved inputs could change the model output. No single confidence percentage is assigned.'} These are reconstructed decision weights, not measured chances of safety.</p>
  <details className="ro-judge-calculation"><summary>How this decision is calculated</summary>
   <p>Six-factor points produce the score. The decision model transforms that score, adds supported risk signals, then divides each weight by the total. The largest weight selects the model decision. Verified critical findings override it with AVOID.</p>
   <dl><div><dt>Base Avoid</dt><dd>sigmoid((48 - score) / 7)</dd></div><div><dt>Base OK</dt><dd>sigmoid((score - 74) / 6)</dd></div><div><dt>Base Caution</dt><dd>1.12 - Base Avoid - Base OK</dd></div><div><dt>Normalize</dt><dd>weight / (1.12 + risk additions)</dd></div></dl>
   {result.mass&&<p>Raw weights: Avoid {result.mass.avoid.toFixed(6)}, Caution {result.mass.caution.toFixed(6)}, OK {result.mass.ok.toFixed(6)}. Total {result.total!.toFixed(6)}. Rounding happens after division.</p>}
   {result.reasons.length>0&&<ul>{result.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
   <p>Source: behavioral reconstruction checked against 77 scored public Swarm reports. The model is deterministic and uses no LLM. Score bands and decision weights are separate outputs.</p>
  </details>
 </section>;
}
