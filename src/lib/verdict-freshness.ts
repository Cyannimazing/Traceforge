import type {InvestigationReport} from './investigation-types';
export function staleVerification(report:InvestigationReport){
 const reasons=report.investigation.coverage.reasons;
 return {
  controls:reasons.some(reason=>reason.startsWith('Contract check refresh is incomplete:')),
  holders:reasons.some(reason=>reason.startsWith('Holder snapshot is stale:')),
 };
}
