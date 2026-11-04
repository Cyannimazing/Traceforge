import {holderScope} from './holder-scope';
import type {InvestigationReport} from './investigation-types';

export function holderCountSummary(report:InvestigationReport){
 const scope=holderScope(report),count=report.holderCount;
 const total=typeof count==='number'&&Number.isSafeInteger(count)&&count>=scope.allSnapshot.length?count:null;
 const derived=total!==null&&report.sources.some(source=>source.name==='Robinhood Pons Transfer candidate history'&&source.status==='available'&&source.detail.includes(`Transfer-ledger count: ${total} recorded holder accounts`));
 return {total,derived,analyzed:scope.holders.length,infrastructure:scope.infrastructure.length,traced:report.investigation.wallets.length};
}
