import type { InvestigationReport, Investigation } from './investigation-types';
import {trustRating} from './trust-rating';
import {observedDecision} from './observed-decision';
import {buildVerdictOutput} from './verdict-output';

/** Presentation precedence keeps observed flags visible when history is incomplete. */
export function getDisplayAssessment(report: InvestigationReport): Investigation['assessment'] {
 const inv=report.investigation;
 if(!report.providerAnalysis){
  const rating=trustRating(report);
  // A verified hard stop outranks the narrower observed-scope model. Otherwise,
  // use the same calculated vector or conservative allocation as the API/UI.
  // Neither missing evidence nor a cached/provider verdict is a stop rule.
  if(rating.decision==='AVOID'&&rating.hard?.length){
   return {status:'critical',title:'Avoid',summary:rating.hard.join(' ')};
  }
  const observed=observedDecision(report,rating);
  if(observed?.judge.p){
   const decision=observed.judge.decision;
   return {status:decision==='AVOID'?'critical':decision==='OK'?'clear':'caution',title:decision,summary:`Observed-scope score ${observed.score}/100. Calculated decision weight ${(observed.judge.confidence!*100).toFixed(1)}% for ${decision}. Unread wallets and incomplete history remain outside the assessed scope.`};
  }
  const output=buildVerdictOutput({rating,observed}),status=output.decision==='AVOID'?'critical':output.decision==='OK'?'clear':!report.holders.length&&!report.checks.length?'insufficient':'caution';
  return {status,title:output.decision==='AVOID'?'Avoid':output.decision==='OK'?'OK':'Caution',summary:output.basis==='uncertainty-allocation'?`Some six-factor inputs are not fully evaluated. Conservative uncertainty allocation gives ${(output.selectedWeight*100).toFixed(1)}% decision weight to ${output.decision}; this is not a safety probability.`:output.basis==='rule'?output.explanation:`Six-factor score: ${output.score??'unavailable'}/100. Calculated decision weight ${(output.selectedWeight*100).toFixed(1)}% for ${output.decision}.`};
 }

 const critical=inv.findings.some(f=>f.level==='critical')||report.checks.some(c=>c.status==='critical');
 const warning=inv.findings.some(f=>f.level==='warning')||report.checks.some(c=>c.status==='warning');
 // Attribute the findings that actually determine the verdict. An unrelated
 // canonical trade or holding record cannot corroborate a provider risk claim.
 const risksAreProviderOnly=(level:'critical'|'warning')=>!!report.providerAnalysis&&inv.findings.filter(f=>f.level===level).every(f=>f.attribution==='provider-reported')&&report.checks.filter(c=>c.status===level).every(c=>c.source==='Swarm provider report');
 const providerOnly=critical?risksAreProviderOnly('critical'):warning?risksAreProviderOnly('warning'):false;
 const fundingOnly=warning&&!providerOnly&&!report.checks.some(c=>c.status==='warning'||c.status==='critical')&&inv.findings.filter(f=>f.level==='warning').every(f=>f.id.startsWith('funder:'));
 // Preserve an explicit provider CLEAN result as an attributed report. Missing
 // independent history is a coverage limitation, not an observed warning. The
 // underlying investigation remains partial/insufficient; never infer CLEAN
 // from its numeric score or let it suppress a contradictory finding.
 const providerClean=!critical&&!warning&&inv.assessment.status!=='critical'&&inv.assessment.status!=='caution'&&report.providerAnalysis?.band?.trim().toUpperCase()==='CLEAN';
 if(providerClean)return {
  status:'clear',
  title:'No red flags reported',
  summary:`SwarmEngine reports CLEAN. This provider verdict has not been independently verified.${inv.coverage.status!=='complete'?' Independent historical coverage remains limited.':''}`,
 };
 const rating=trustRating(report);
 const status=critical?'critical':warning?'caution':rating.decision==='OK'||rating.decision==='CLEAN'?'clear':rating.decision==='CAUTION'?'caution':'insufficient';
 return {
  status,
  title:status==='critical'?'Danger':status==='clear'?'No red flags found':'Caution',
  summary:critical?(providerOnly?'SwarmEngine reports a serious warning in this token.':'A serious warning was found in the token checks.'):warning?(providerOnly?'SwarmEngine reports warning signs. Inspect the findings below.':fundingOnly?'Shared funding links triggered caution. This does not establish common ownership or coordinated selling.':'Wallet activity or contract settings raised a warning.'):status==='insufficient'?'Not enough completed checks to assess this token.':status==='caution'?rating.reasons.join(' '):inv.coverage.status==='complete'?'No warning was found in the checks completed.':'No warning was found in completed contract checks or sampled wallet activity. Historical coverage remains partial.',
 };
}
