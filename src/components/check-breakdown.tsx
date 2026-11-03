import type {InvestigationReport} from '@/lib/investigation-types';
import {checkBreakdown} from '@/lib/check-breakdown';
import {findingBreakdown} from '@/lib/finding-breakdown';
import './check-breakdown.css';

export default function CheckBreakdown({report}:{report:InvestigationReport}){
 const result=checkBreakdown(report.checks);
 const walletWarnings=findingBreakdown(report.investigation.findings).wallet.length;
 return <section className="check-breakdown" aria-label="Contract check results">
  <header><h3>Contract controls</h3><span>{result.buckets[0].count} of {result.completed} passed{result.unchecked>0?` · ${result.unchecked} unchecked`:''}</span></header>
  <p>{walletWarnings?'Passing contract controls does not clear the wallet warnings below.':'Results apply to the controls listed below.'}</p>
  <details><summary>View {result.items.length} controls and check percentages</summary>{result.items.length?<><ul>{result.items.map(check=><li key={check.key}><span>{check.title}<small>{check.value}</small></span><strong>{check.status==='clear'?'Passed':check.status==='critical'?'Failed':check.status==='warning'?'Warning':'Unchecked'}</strong></li>)}</ul><dl>{result.buckets.map((bucket,index)=><div key={bucket.label} className={`check-result-${index}`}><dt>{bucket.label} <small>{bucket.count}</small></dt><dd>{bucket.percent===null?'-':`${bucket.percent}%`}</dd></div>)}</dl><p>Share of completed contract controls only. Not the overall assessment or a safety probability.</p></>:<p>No contract checks completed.</p>}</details>
 </section>;
}
