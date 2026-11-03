import type {InvestigationReport} from './investigation-types';
import {getDisplayAssessment} from './verdict-summary';
import {staleVerification} from './trust-rating';
import {checkBreakdown} from './check-breakdown';

/** Qualitative evidence support, not a calibrated probability of profit or safety. */
export function verdictConfidence(report:InvestigationReport):{level:'Low'|'Moderate';reason:string}{
 const assessment=getDisplayAssessment(report);
 if(report.providerAnalysis)return {level:'Low',reason:'The provider conclusion has not been independently corroborated.'};
 if(assessment.status==='insufficient')return {level:'Low',reason:'Too few completed checks support a token-level conclusion.'};
 const stale=staleVerification(report);
 if(stale.controls||stale.holders)return {level:'Low',reason:'Current verification is incomplete. Some displayed controls or balances retain an older snapshot; they do not establish the current condition.'};
 if(checkBreakdown(report.checks).unchecked)return {level:'Low',reason:'Control checks remain unverified. Missing results cannot support a stronger token-level conclusion.'};
 const level=assessment.status==='critical'?'critical':'warning';
 const decisive=report.investigation.findings.filter(f=>f.level===level);
 if(decisive.some(f=>f.certainty!=='observed'||f.attribution==='provider-reported'))return {level:'Low',reason:'The risk conclusion relies on inferred wallet relationships. Observed transfers alone do not prove common ownership or coordinated selling.'};
 const records=report.investigation.evidence;
 if(decisive.some(f=>!f.evidenceIds.length||f.evidenceIds.some(id=>!records.some(e=>e.id===id&&e.source&&e.transaction&&Number.isFinite(Date.parse(e.timestamp||''))))))return {level:'Low',reason:'The decisive findings lack complete linked transaction evidence.'};
 const controls=report.checks.filter(c=>c.status===level);
 if(assessment.status==='caution'&&!decisive.length&&!controls.length)return {level:'Low',reason:'Required evidence is incomplete or unavailable. Caution reflects that gap, not a directly observed harmful condition.'};
 if(controls.some(c=>!report.sources.some(s=>s.name===c.source&&s.status==='available'&&Number.isFinite(Date.parse(s.fetchedAt||'')))))return {level:'Low',reason:'The flagged controls lack a current attributed source response.'};
 return {level:'Moderate',reason:assessment.status==='clear'?'The completed checks and sampled holdings support OK within the analyzed scope. This does not establish future safety.':'Direct records support the flagged condition. Its wider impact and future outcome remain uncertain.'};
}
