import type {InvestigationReport} from './investigation-types';
import type {TrustRating} from './trust-rating';
import {FACTORS,type FactorId} from './reconstructed-score';
import {staleVerification} from './verdict-freshness';
export type AssessmentProgress={earned:number;maximum:number;resolvedFactors:number;totalFactors:number;modelCoverage:number;currentCompleted:number;currentTotal:number};
/** Resolved point contributions, not a substitute score or a safety probability.
 * Never normalize a partial X/Y result into the six-factor judge's 0..100 input. */
export function assessmentProgress(report:InvestigationReport,rating:TrustRating):AssessmentProgress{
 const stale=staleVerification(report),captured=Date.parse(report.fetchedAt);
 const fresh=(at:string|undefined)=>!!at&&Number.isFinite(captured)&&Number.isFinite(Date.parse(at))&&Date.parse(at)>=captured-600_000&&Date.parse(at)<=captured+120_000;
 const source=report.chain==='solana'?'Solana RPC authorities':'GoPlus Security';
 const keys=new Set(report.chain==='solana'?['solana_mint_authority','solana_freeze_authority','solana_extensions']:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable']);
 for(const check of report.checks)if(check.source===source)keys.add(check.key);
 const currentSource=!report.providerAnalysis&&!stale.controls&&report.sources.some(s=>s.name===source&&s.status==='available'&&fresh(s.fetchedAt));
 let currentCompleted=0;
 if(currentSource)for(const key of keys){
  const rows=report.checks.filter(c=>c.key===key&&c.source===source);
  if(rows.length&&rows.every(c=>fresh(c.fetchedAt)&&['clear','warning','critical'].includes(c.status))&&new Set(rows.map(c=>`${c.status}:${c.value}`)).size===1)currentCompleted++;
 }
 const holderSources=report.chain==='solana'?['Solana RPC Holders']:['Blockscout Holders','GoPlus Security','BSC RPC finalized holder balances','EVM RPC holder balances'];
 const currentHolders=!report.providerAnalysis&&!stale.holders&&report.sources.some(s=>holderSources.includes(s.name)&&s.status==='available'&&fresh(s.fetchedAt));
 let earned=0,maximum=0,resolvedFactors=0;
 if(currentHolders)for(const id of Object.keys(FACTORS) as FactorId[]){
  const rows=rating.components.filter(c=>c.id===id),c=rows.length===1?rows[0]:undefined,max=FACTORS[id].maximum;
  if(!c||c.state==='unknown'||c.maximum!==max||!Number.isFinite(c.earned)||c.earned<0||c.earned>max||c.lower!==c.earned||c.upper!==c.earned)continue;
  earned+=c.earned;maximum+=max;resolvedFactors++;
 }
 return {earned,maximum,resolvedFactors,totalFactors:Object.keys(FACTORS).length,modelCoverage:maximum,currentCompleted,currentTotal:keys.size};
}
