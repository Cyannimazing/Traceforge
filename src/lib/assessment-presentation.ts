/** TraceForge presentation only. Canonical model keys, thresholds and weights
 * remain unchanged; external provider labels are displayed in their own terms. */
export const decisionLabels={avoid:'High risk',caution:'Watch',ok:'Clear'} as const;
export type AssessmentStatus='critical'|'caution'|'insufficient'|'clear';

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
