import {ArrowUpRight} from 'lucide-react';
import {computeRiskMetrics} from '@/lib/risk-metrics';
import type {InvestigationReport} from '@/lib/investigation-types';
import type {Selection} from './investigation-panels';

export default function RiskMeasurements({report,onSelect}:{report:InvestigationReport;onSelect:(s:Selection)=>void}){
 const result=report.riskMetrics||computeRiskMetrics(report);
 const names:Record<string,string>={'largest-holder-adjusted-float':'Largest holder','top10-holder-adjusted-float':'Top 10 holders','creator-adjusted-float':'Creator holdings'};
 const rows=result.metrics.filter(m=>m.id in names);
 return <section className="ro-exposures" aria-label="Measured holder exposure"><h3>Measured holder exposure</h3><p>Percent of supply after excluding the observed infrastructure balances. These are holdings, not trust probabilities.</p><dl>{rows.map(m=><div key={m.id}><dt>{names[m.id]}</dt><dd>{m.value===null?'Not established':`${m.value.toFixed(2)}%`}{!!m.evidenceIds.length&&<button aria-label={`Inspect ${names[m.id].toLowerCase()} evidence`} onClick={()=>onSelect({kind:'group',id:m.id,wallets:m.wallets,evidenceIds:m.evidenceIds})}><ArrowUpRight size={13}/></button>}</dd></div>)}</dl><details><summary>Measurement sources and scope</summary>{rows.map(m=><div key={m.id}><strong>{names[m.id]}</strong><p>{m.basis}. {m.sourceRefs.join(', ')}.</p><p>{m.limitations.join(' ')}</p></div>)}</details>{report.poolReserves?.snapshot&&<details><summary>Verified pool reserves - slot {report.poolReserves.snapshot.slot}</summary><p>Pool and token vault ownership verified in one finalized snapshot.</p><p>{report.poolReserves.snapshot.limitations.join(' ')} {report.poolReserves.snapshot.feeAssumption}</p><p>Sell impact is not estimated from dollar liquidity.</p></details>}</section>;
}
