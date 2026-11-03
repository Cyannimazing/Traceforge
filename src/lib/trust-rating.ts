import type {InvestigationReport} from './investigation-types';
import {checkBreakdown} from './check-breakdown';
import {findingBreakdown} from './finding-breakdown';
import {computeRiskMetrics} from './risk-metrics';
import {verdictBand} from './verdict-band';

export type RatingComponent={id:string;label:string;earned:number;maximum:number;state:'clear'|'watch'|'flagged'|'unknown';detail:string};
export type TrustRating={version:'evidence-v3';score:number|null;decision:'CLEAN'|'OK'|'CAUTION'|'AVOID'|'UNRATED';basis:string;reasons:string[];components:RatingComponent[];ceiling:number|null};
export function staleVerification(report:InvestigationReport){
 const reasons=report.investigation.coverage.reasons;
 return {
  controls:reasons.some(reason=>reason.startsWith('Contract check refresh is incomplete:')),
  holders:reasons.some(reason=>reason.startsWith('Holder snapshot is stale:')),
 };
}
/** Explicit product policy, not a trained or calibrated safety probability.
 * Unknown categories earn no points. Correlated findings affect a family once.
 * Material warnings and stale core data cannot be averaged into an OK result. */
export function trustRating(report:InvestigationReport):TrustRating{
 const controls=checkBreakdown(report.checks),findings=findingBreakdown(report.investigation.findings);
 const critical=controls.buckets[2].count>0||findings.risks.some(f=>f.level==='critical');
 const warnings=controls.buckets[1].count>0||findings.risks.some(f=>f.level==='warning');
 const required=report.chain==='solana'?['solana_mint_authority','solana_freeze_authority']:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'];
 const source=report.chain==='solana'?'Solana RPC authorities':'GoPlus Security';
 const attributed=report.sources.some(s=>s.name===source&&s.status==='available'&&Number.isFinite(Date.parse(s.fetchedAt||'')));
 const core=required.every(key=>controls.items.some(c=>c.key===key&&c.status==='clear'));
 const holders=report.holders.some(h=>Number.isFinite(h.share)&&h.share>=0&&h.share<=100);
 const dataPresent=controls.completed>0&&attributed&&holders&&!report.providerAnalysis;
 const stale=staleVerification(report);
 const reasons:string[]=[];
 if(critical)reasons.push('A critical control or behavior is flagged.');
 if(warnings)reasons.push(...findings.risks.filter(f=>f.level==='warning').map(f=>f.title),...controls.items.filter(c=>c.status==='warning').map(c=>c.title));
 if(!core)reasons.push('Required contract controls are not all verified clear.');
 if(controls.unchecked)reasons.push(`${controls.unchecked} control checks are unverified.`);
 if(!holders)reasons.push('No usable holder snapshot is available.');
 if(!attributed)reasons.push('Control source evidence is unavailable.');
 if(stale.controls)reasons.push('The current contract controls were not fully verified. Retained results describe an older snapshot.');
 if(stale.holders)reasons.push('The current holder snapshot could not be verified. Displayed balances retain their earlier timestamp.');
 const metrics=report.riskMetrics||computeRiskMetrics(report);
 const metric=(id:string)=>metrics.metrics.find(m=>m.id===id&&m.status==='observed'&&m.value!==null&&Number.isFinite(m.value));
 const largest=metric('largest-holder-adjusted-float'),top10=metric('top10-holder-adjusted-float');
 const concentrationKnown=!!largest&&!!top10&&!stale.holders;
 const concentrated=concentrationKnown&&(largest!.value!>10||top10!.value!>50);
 const proof=report.investigation.evidence.filter(e=>e.attribution!=='provider-reported'&&e.transaction&&e.source&&Number.isFinite(Date.parse(e.timestamp)));
 const transferIds=new Set(proof.filter(e=>e.kind==='transfer').map(e=>e.id));
 const fundingKnown=report.investigation.relationships.some(r=>r.kind==='funding'&&r.attribution!=='provider-reported'&&r.evidenceIds.some(id=>transferIds.has(id)));
 const activityKnown=proof.some(e=>e.kind==='trade');
 const sharedFunding=findings.risks.some(f=>f.id.startsWith('funder:'));
 const activityWarning=findings.wallet.some(f=>!f.id.startsWith('funder:'));
 const controlsClear=core&&!controls.unchecked&&!stale.controls&&!controls.buckets[1].count&&!controls.buckets[2].count&&!findings.controls.length;
 const components:RatingComponent[]=[
  {id:'controls',label:'Contract controls',maximum:40,earned:controlsClear?40:0,state:controlsClear?'clear':controls.buckets[1].count||controls.buckets[2].count?'flagged':'unknown',detail:controlsClear?'Required controls verified clear at the source timestamp.':'Flagged, unverified or stale controls earn no points.'},
  {id:'concentration',label:'Holder distribution',maximum:20,earned:concentrationKnown&&!concentrated?20:0,state:!concentrationKnown?'unknown':concentrated?'flagged':'clear',detail:concentrationKnown?`Largest observed holder ${largest!.value!.toFixed(2)}%; top ten ${top10!.value!.toFixed(2)}%, after excluding evidenced infrastructure. Policy limits: 10% and 50%.`:'Verified holder distribution is unavailable or stale.'},
  {id:'funding',label:'Funding relationships',maximum:20,earned:sharedFunding?10:fundingKnown?20:0,state:sharedFunding?'watch':fundingKnown?'clear':'unknown',detail:sharedFunding?'Shared sources observed. One family-level warning; repeated funders do not multiply the deduction. Common ownership is not established.':fundingKnown?'No shared-funding warning in the qualified funding relationships.':'No qualified funding relationship with independent transaction evidence was returned.'},
  {id:'activity',label:'Wallet activity',maximum:20,earned:activityWarning?0:activityKnown?20:0,state:activityWarning?'flagged':activityKnown?'clear':'unknown',detail:activityWarning?'Wallet behavior raised a warning. Inspect transaction amounts, timing and connection evidence.':activityKnown?'No behavior warning in the observed trades.':'No independently attributed trade evidence was returned.'},
 ];
 if(concentrated)reasons.push('Observed holder concentration exceeds the rating policy limits.');
 for(const c of components)if(c.state==='unknown')reasons.push(`${c.label} is not fully evaluated.`);
 const caution=warnings||concentrated||!core||!!controls.unchecked||stale.controls||stale.holders;
 const ceiling=critical?0:caution?74:null;
 const earned=components.reduce((sum,c)=>sum+c.earned,0);
 const score=report.providerAnalysis?null:critical?0:!dataPresent?null:Math.min(earned,ceiling??100);
 const decision=report.providerAnalysis?'UNRATED':critical?'AVOID':score===null?'UNRATED':verdictBand(score);
 return {version:'evidence-v3',score,decision,components,ceiling,basis:'TraceForge rule-based evidence rating, not a probability of safety. Policy weights: controls 40, distribution 20, funding 20, activity 20. Evaluates the returned scope; missing history is not a clean finding.',reasons:[...new Set(reasons)]};
}
