import type {InvestigationReport} from './investigation-types';
/** Shared client/server representation of every input consumed by the analyst. */
export function agentReportIdentity(report:InvestigationReport){
 return JSON.stringify({chain:report.chain,token:report.token,fetchedAt:report.fetchedAt,market:report.market,sources:report.sources,checks:report.checks,holders:report.holders,riskMetrics:report.riskMetrics??null,investigation:report.investigation,identities:report.identities??[],solana:report.solana??null,poolReserves:report.poolReserves??null});
}
/** A market tick can retain a visibly dated review, but changed blockchain evidence cannot. */
export function agentEvidenceIdentity(report:InvestigationReport){
 return JSON.stringify({chain:report.chain,token:report.token,sources:report.sources.filter(source=>source.name!=='DEX Screener'),checks:report.checks,holders:report.holders,investigation:report.investigation,identities:report.identities??[],solana:report.solana??null,poolReserves:report.poolReserves??null});
}
