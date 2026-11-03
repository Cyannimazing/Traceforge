/** TraceForge presentation only. Canonical model keys, thresholds and weights
 * remain unchanged; external provider labels are displayed in their own terms. */
export const decisionLabels={avoid:'High risk',caution:'Watch',ok:'Clear'} as const;
export type AssessmentStatus='critical'|'caution'|'insufficient'|'clear';
type TimingCoverage=Pick<import('./investigation-types').Investigation['coverage'],'launchVerified'|'poolTiming'|'poolTimings'|'curveTiming'>;
export function earlyBuyingExplanation(coverage:TimingCoverage){
 const pool=coverage.poolTiming?.verified===true||coverage.poolTimings?.some(proof=>proof.verified===true),curve=coverage.curveTiming?.verified===true;
 if(pool||curve){
  const venue=pool&&curve?'selected pool and launchpad':pool?'selected pool':'selected launchpad';
  return {title:'First-minute trading verified',detail:`The first trading minute in the ${venue} is verified. Token-wide early-buyer exposure remains incomplete because other venues and transfer paths are not fully covered.`,preTrading:`The first minute in the ${venue} is verified. Transfers before trading and creator-origin inflows are not fully traced.`};
 }
 if(coverage.launchVerified)return {title:'Early-buyer exposure is incomplete',detail:'The trading launch is verified. Complete attribution of early buying and later transfers remains incomplete.',preTrading:'The trading launch is verified. Transfers before trading and creator-origin inflows are not fully traced.'};
 return {title:'First-minute buying is unverified',detail:'The retrieved records do not establish a complete first trading minute for the analyzed venue.',preTrading:'The retrieved records do not establish all transfers before trading or all creator-origin inflows.'};
}

export function decisionLabel(value:string):string {
 switch(value.trim().toUpperCase()){
  case 'AVOID':case 'DANGER':case 'CRITICAL':case 'HIGH RISK':return decisionLabels.avoid;
  case 'CAUTION':case 'WATCH':return decisionLabels.caution;
  case 'OK':case 'CLEAN':case 'CLEAR':return decisionLabels.ok;
  default:return 'Not assessed';
 }
}

export function assessmentLabel(status:AssessmentStatus):string {
 return status==='critical'?decisionLabels.avoid:status==='clear'?decisionLabels.ok:decisionLabels.caution;
}

/** Apply only to TraceForge-owned explanation text, never raw provider fields.
 * Preserve explicitly attributed legacy quotes even when held in saved summaries. */
export function presentationText(text:string,source:'independent'|'provider'='independent'):string {
 if(source==='provider'||/\b(?:SwarmEngine|provider)\s+(?:reports?|reported|says)\b/i.test(text))return text;
 return text.replace(/\b(?:AVOID|Avoid|CAUTION|Caution|OK|CLEAN|Clean|Danger)\b/g,value=>decisionLabel(value));
}
