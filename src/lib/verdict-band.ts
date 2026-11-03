export type VerdictBand='CLEAN'|'OK'|'CAUTION'|'AVOID'|'UNRATED';
/** User-defined display bands. Maps an established score; does not invent one. */
export function verdictBand(score:number|null|undefined,critical=false):VerdictBand{
 if(critical)return 'AVOID';
 if(typeof score!=='number'||!Number.isFinite(score)||score<0||score>100)return 'UNRATED';
 return score>=90?'CLEAN':score>=75?'OK':'CAUTION';
}
