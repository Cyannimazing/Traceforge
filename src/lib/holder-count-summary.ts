import {holderScope} from './holder-scope';
import type {InvestigationReport} from './investigation-types';

export const HOLDER_DISPLAY_LIMIT=50;

export function holderCountSummary(report:InvestigationReport){
 const scope=holderScope(report),count=report.holderCount;
 const total=typeof count==='number'&&Number.isSafeInteger(count)&&count>=scope.allSnapshot.length?count:null;
 const inventory=report.holderEnumeration;
 const allRecordedChecked=!report.fixture&&!report.providerAnalysis&&total!==null&&total>0&&inventory?.kind==='pons-creation-ledger'&&inventory.complete===true&&inventory.recordedAccounts===total&&inventory.verifiedAccounts===total&&scope.allSnapshot.length===total;
 const derived=total!==null&&report.sources.some(source=>source.name==='Robinhood Pons Transfer candidate history'&&source.status==='available'&&source.detail.includes(`Transfer-ledger count: ${total} recorded holder accounts`));
 return {total,derived,allRecordedChecked,displayed:Math.min(HOLDER_DISPLAY_LIMIT,scope.holders.length),analyzed:scope.holders.length,infrastructure:scope.infrastructure.length,traced:report.investigation.wallets.length};
}
