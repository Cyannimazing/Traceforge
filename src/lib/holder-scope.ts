import type {Report} from './analysis';
import type {Investigation} from './investigation-types';
import {clockReferenceTime} from './evidence-clock';

type HolderScopeReport=Pick<Report,'chain'|'holders'|'market'>&Partial<Pick<Report,'sources'|'fetchedAt'>>&{investigation:Pick<Investigation,'wallets'|'evidence'>&Partial<Pick<Investigation,'coverage'>>};
/** Presentation scope only: preserve supply-share denominators and source rows.
 * A generic smart-contract address can be a genuine holder, so it is not excluded.
 */
export function holderScope(report:HolderScopeReport){
 const normalize=(address:string)=>report.chain==='solana'?address:address.toLowerCase();
 const capture=Date.parse(report.investigation.coverage?.fetchedAt||report.fetchedAt||'');
 const reference=clockReferenceTime(report.investigation.coverage?.clock,capture);
 const dated=(at:string|undefined)=>!!at&&Number.isFinite(Date.parse(at))&&(!Number.isFinite(reference)||Date.parse(at)<=reference+120_000);
 const snapshotDated=(at:string|undefined)=>!!at&&Number.isFinite(Date.parse(at))&&Number.isFinite(Date.parse(report.fetchedAt||''))&&Date.parse(at)<=Date.parse(report.fetchedAt!)+120_000;
 const infrastructureAddresses=new Set<string>();
 if(report.market?.pairAddress&&report.sources?.some(s=>s.name==='DEX Screener'&&s.status==='available'&&snapshotDated(s.fetchedAt)))infrastructureAddresses.add(normalize(report.market.pairAddress));
 const evidence=new Map(report.investigation.evidence.map(record=>[record.id,record]));
 for(const wallet of report.investigation.wallets){
  const categories=wallet.categories.filter(category=>['pool','exchange','bridge','burn'].includes(category)&&!wallet.categorySources?.[category]);
  if(!categories.length)continue;
  const backed=wallet.evidenceIds.some(id=>{
   const record=evidence.get(id);
   if(record?.kind!=='label'||record.attribution==='provider-reported'||!record.source.trim()||!(dated(record.timestamp)||snapshotDated(record.timestamp)))return false;
   const key=normalize(id),walletAddress=normalize(wallet.address);
   return categories.some(category=>key===`label:${walletAddress}:${category}`||(category==='pool'&&key.startsWith(`pool-timing:${walletAddress}:`)));
  });
  if(backed)infrastructureAddresses.add(normalize(wallet.address));
 }
 const allSnapshot=[...new Map(report.holders.map(holder=>[normalize(holder.address),holder])).values()];
 const holders=allSnapshot.filter(holder=>!infrastructureAddresses.has(normalize(holder.address)));
 const infrastructure=allSnapshot.filter(holder=>infrastructureAddresses.has(normalize(holder.address)));
 return {holders,infrastructure,allSnapshot,infrastructureAddresses:[...infrastructureAddresses]};
}
