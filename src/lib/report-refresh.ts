import { sameToken, type Report } from './analysis';
import { identityEvidence } from './investigation';
import { retainVerifiedPoolHistory } from './history-merge';
import type { Evidence, Finding, Investigation, InvestigationReport, InvestigatedWallet } from './investigation-types';
import {computeRiskMetrics} from './risk-metrics';
import {trustRating} from './trust-rating';
import {getDisplayAssessment} from './verdict-summary';
import {observedDecision} from './observed-decision';

const unique = <T>(values:T[]) => [...new Set(values)];
const byId = <T extends {id:string}>(older:T[], newer:T[]) => [...new Map([...older,...newer].map(item=>[item.id,item])).values()];
const stalePrefix = 'Holder snapshot is stale:';
const staleChecksPrefix='Contract check refresh is incomplete:';
const hasHolderSnapshot=(report:InvestigationReport)=>report.sources.some(source=>source.status==='available'&&(/^(Bitquery|Blockscout|Solana RPC) Holders$/i.test(source.name)||(report.chain!=='solana'&&source.name==='GoPlus Security')));
const derive=(report:InvestigationReport,updateAssessment=true):InvestigationReport=>{
 if(report.providerAnalysis)return report;
 const current={...report,riskMetrics:computeRiskMetrics(report)};
 const rating=trustRating(current);
 return {...current,trustRating:rating,observedDecision:observedDecision(current,rating),investigation:updateAssessment?{...current.investigation,assessment:getDisplayAssessment(current)}:current.investigation};
};
function assessment(findings:Finding[], checks:Report['checks'], coverage:Investigation['coverage']):Investigation['assessment'] {
 const critical=findings.some(f=>f.level==='critical')||checks.some(c=>c.status==='critical');
 const warning=findings.some(f=>f.level==='warning')||checks.some(c=>c.status==='warning');
 const incomplete=coverage.status!=='complete'||coverage.truncated||!coverage.launchVerified||checks.some(check=>check.status==='unknown')||coverage.reasons.some(r=>r.startsWith(stalePrefix)||r.startsWith(staleChecksPrefix));
 return critical?{status:'critical',title:'Critical evidence detected',summary:'A critical signal is present in the available evidence. Inspect its source and timestamp alongside the investigation limits.'}:warning?{status:'caution',title:'Patterns need review',summary:'Review the linked transactions, contract checks and coverage limits. Relationships do not establish ownership or intent.'}:incomplete?{status:'insufficient',title:'Insufficient evidence',summary:'Incomplete or stale evidence prevents a reliable all-clear. Check each source and its last successful timestamp.'}:{status:'clear',title:'No flagged pattern in scope',summary:'No configured pattern was detected in the stated sample. This is not a safety guarantee.'};
}

/** Merge only the requested refresh scope; old evidence keeps its original timestamp. */
export function mergeReportRefresh(previous:InvestigationReport,next:InvestigationReport,mode:'market'|'holders'):InvestigationReport {
 if(previous.fixture||previous.chain!==next.chain||!sameToken(previous.chain,previous.token,next.token))return previous;
 const sources=new Map(previous.sources.map(source=>[source.name,source]));
 for(const incoming of next.sources){
  if(/not requested/i.test(incoming.detail))continue;
  const earlier=sources.get(incoming.name);
  sources.set(incoming.name,incoming.status==='available'?incoming:{...incoming,fetchedAt:earlier?.fetchedAt||incoming.fetchedAt});
 }
 if(mode==='market')return derive({...previous,market:next.market??previous.market,sources:[...sources.values()],fetchedAt:next.market?next.fetchedAt:previous.fetchedAt},false);
 // Provider classifications are an atomic report, not independent wallet facts
 // to union with an older snapshot. Failed provider refreshes retain the last
 // successful provider analysis rather than silently changing its provenance.
 if(next.providerAnalysis)return derive(retainVerifiedPoolHistory(previous,{...next,market:next.market??previous.market}));
 if(previous.providerAnalysis){
  const reason='Provider refresh failed: retaining the last successful provider wallet and contract report with its original scan timestamp.';
  return derive({...previous,sources:[...sources.values()],investigation:{...previous.investigation,coverage:{...previous.investigation.coverage,reasons:unique([...previous.investigation.coverage.reasons,reason])}}});
 }
 const sourceAvailable=(name:string)=>next.sources.some(source=>source.name===name&&source.status==='available');
 const rpcHolders=next.chain==='solana'&&sourceAvailable('Solana RPC Holders');
 const rpcAuthorities=next.chain==='solana'&&sourceAvailable('Solana RPC authorities');
 const rpcSupply=next.chain==='solana'&&sourceAvailable('Solana RPC supply');
 const holderAvailable=hasHolderSnapshot(next);
 const goPlusSecurity=sourceAvailable('GoPlus Security');
 const securityAvailable=goPlusSecurity||rpcAuthorities;
 const address=(value:string)=>previous.chain==='solana'?value:value.toLowerCase();
 const freshWallets=new Map(next.investigation.wallets.map(wallet=>[address(wallet.address),wallet]));
 // Public GoPlus holders can supplement the investigation adapter but never replace Bitquery's snapshot.
 for(const h of next.holders)if(!freshWallets.has(address(h.address)))freshWallets.set(address(h.address),{address:h.address,share:h.share,categories:['unclassified'],evidenceIds:[]});
 const wallets:InvestigatedWallet[]=previous.investigation.wallets.map(old=>{
  const fresh=freshWallets.get(address(old.address));freshWallets.delete(address(old.address));
  const categories=unique([...old.categories,...(fresh?.categories||[])]);
  return {...old,...fresh,address:old.address,share:holderAvailable?(fresh?.share??null):old.share,balance:holderAvailable?fresh?.balance:old.balance,categories:categories.length>1?categories.filter(c=>c!=='unclassified'):categories,evidenceIds:unique([...old.evidenceIds,...(fresh?.evidenceIds||[])])};
 });
 for(const fresh of freshWallets.values())wallets.push({...fresh,share:holderAvailable?fresh.share:null,balance:holderAvailable?fresh.balance:undefined,categories:[...fresh.categories],evidenceIds:[...fresh.evidenceIds]});
 let identities=goPlusSecurity?next.identities:previous.identities;
 if(rpcAuthorities){
  identities=[...(previous.identities||[])];
  for(const kind of ['mint','freeze'] as const){
   const state=next.solana?.authorities[kind];
   // Undefined is an unverified field, not a revocation of a prior role.
   if(state?.address===undefined)continue;
   identities=identities.filter(identity=>!(identity.role==='authority'&&identity.authorityKind===kind));
   if(state.address!==null){
    const identity=next.identities?.find(identity=>identity.role==='authority'&&identity.authorityKind===kind&&identity.address===state.address);
    identities.push(identity||{address:state.address,role:'authority',authorityKind:kind,label:kind==='mint'?'Mint authority':'Freeze authority',slot:state.slot,timestamp:state.timestamp||next.sources.find(source=>source.name==='Solana RPC authorities')?.fetchedAt||next.fetchedAt,source:'Solana RPC authorities',timestampBasis:'local-observation'});
   }
  }
 }
 const authorities=securityAvailable?(identities||[]).filter(identity=>identity.role==='authority'):[];
 if(securityAvailable){
  const current=new Set(authorities.map(identity=>address(identity.address)));
  for(const wallet of wallets){wallet.categories=wallet.categories.filter(category=>category!=='authority');if(current.has(address(wallet.address)))wallet.categories.push('authority');if(!wallet.categories.length)wallet.categories.push('unclassified');}
  for(const identity of authorities){
   const key=address(identity.address),evidenceId=identityEvidence(identity,key).id;
   const existing=wallets.find(wallet=>address(wallet.address)===key);
   if(existing){existing.categories=existing.categories.filter(category=>category!=='unclassified');existing.evidenceIds=unique([...existing.evidenceIds,evidenceId]);}
   else wallets.push({address:identity.address,share:null,categories:['authority'],evidenceIds:[evidenceId],...(identity.label?{label:identity.label}:{})});
  }
  if(rpcAuthorities)for(const wallet of wallets){
   const active=authorities.filter(identity=>identity.address===wallet.address);
   const earlier=(previous.identities||[]).filter(identity=>identity.role==='authority'&&identity.address===wallet.address);
   const labels=unique(active.map(identity=>identity.label||(identity.authorityKind?`${identity.authorityKind==='mint'?'Mint':'Freeze'} authority`:'Current owner / authority')));
   if(labels.length)wallet.label=labels.join(' / ');
   else if(earlier.some(identity=>identity.label===wallet.label)||wallet.label===unique(earlier.map(identity=>identity.label).filter((label):label is string=>!!label)).join(' / '))wallet.label=undefined;
  }
 }
 const priorChecks=new Map(previous.checks.map(check=>[check.key,check]));
 const retainedUnknownChecks:string[]=[];
 const isRpcCheck=(check:Report['checks'][number])=>check.key.startsWith('solana_')||check.source?.startsWith('Solana RPC');
 const freshCheck=(check:Report['checks'][number])=>{
  const earlier=priorChecks.get(check.key);
  if(check.status!=='unknown'||!earlier||earlier.status==='unknown')return check;
  retainedUnknownChecks.push(check.title);
  const source=earlier.source||(isRpcCheck(earlier)?'Solana RPC authorities':'GoPlus Security');
  return {...earlier,source,fetchedAt:earlier.fetchedAt||previous.investigation.evidence.find(e=>e.id===`security:${earlier.key}`)?.timestamp||previous.sources.find(s=>s.name===source)?.fetchedAt||previous.fetchedAt};
 };
 let checks=goPlusSecurity?next.checks.map(freshCheck):previous.checks;
 if(rpcAuthorities){
  const merged=new Map(checks.map(check=>[check.key,check]));
  for(const check of next.checks.filter(isRpcCheck))merged.set(check.key,freshCheck(check));
  checks=[...merged.values()];
 }
 const isHolding=(item:Evidence)=>item.kind==='holding';
 // Holding records describe the displayed snapshot, never historical trades.
 // Replace them as a scope on success; preserve their original time on outage.
 let evidence=byId(previous.investigation.evidence.filter(item=>!holderAvailable||!isHolding(item)),next.investigation.evidence.filter(item=>holderAvailable||!isHolding(item)));
 const holdingIds=new Set(evidence.filter(isHolding).map(item=>item.id));
 const knownHoldingIds=new Set([...previous.investigation.evidence,...next.investigation.evidence].filter(isHolding).map(item=>item.id));
 for(const wallet of wallets)wallet.evidenceIds=wallet.evidenceIds.filter(id=>!knownHoldingIds.has(id)||holdingIds.has(id));
 let findings=byId(previous.investigation.findings,next.investigation.findings);
 if(securityAvailable){
  // Clear only refreshed check keys. Unknown checks preserve the last known
  // flag and timestamp, while explicit clear results remove that flag.
  const keys=new Set((goPlusSecurity?[...previous.checks,...next.checks]:next.checks.filter(isRpcCheck)).map(check=>`security:${check.key}`));
  evidence=evidence.filter(e=>!keys.has(e.id));findings=findings.filter(f=>!keys.has(f.id));
  for(const identity of authorities){
   evidence=byId(evidence,[identityEvidence(identity,address(identity.address))]);
  }
  for(const check of checks.filter(c=>keys.has(`security:${c.key}`)&&(c.status==='critical'||c.status==='warning'))){
   const id=`security:${check.key}`;
   const source=check.source||(isRpcCheck(check)?'Solana RPC authorities':'GoPlus Security');
   const timestamp=check.fetchedAt||next.sources.find(s=>s.name===source)?.fetchedAt||next.fetchedAt;
   const item:Evidence={id,kind:'label',timestamp,description:`${source} reports: ${check.title} = ${check.value}. This is a provider observation, not an independent audit.`,source};
   evidence.push(item);findings.push({id,title:check.title,description:check.description,level:check.status==='critical'?'critical':'warning',certainty:'observed',wallets:[],evidenceIds:[id]});
  }
 }
 let solana=previous.solana;
 if(next.chain==='solana'&&next.solana&&(rpcHolders||rpcAuthorities||rpcSupply)){
  const incoming=next.solana,earlier=previous.solana;
  const snapshot={...(earlier?.snapshot||incoming.snapshot),fetchedAt:incoming.snapshot.fetchedAt};
  if(rpcHolders)Object.assign(snapshot,{ownersSlot:incoming.snapshot.ownersSlot,largestAccountsSlot:incoming.snapshot.largestAccountsSlot,selectionSource:incoming.snapshot.selectionSource,selectionTimestamp:incoming.snapshot.selectionTimestamp,selectedTokenAccounts:incoming.snapshot.selectedTokenAccounts,unresolvedTokenAccounts:incoming.snapshot.unresolvedTokenAccounts});
  if(rpcAuthorities)Object.assign(snapshot,{mintSlot:incoming.snapshot.mintSlot,tokenProgram:incoming.snapshot.tokenProgram});
  if(rpcSupply||(rpcAuthorities&&next.totalSupply!=null))snapshot.supplySlot=incoming.snapshot.supplySlot;
  solana={snapshot,tokenAccounts:rpcHolders?incoming.tokenAccounts:earlier?.tokenAccounts||[],extensions:rpcAuthorities?incoming.extensions:earlier?.extensions||[],authorities:{mint:rpcAuthorities&&incoming.authorities.mint.address!==undefined?incoming.authorities.mint:earlier?.authorities.mint||{},freeze:rpcAuthorities&&incoming.authorities.freeze.address!==undefined?incoming.authorities.freeze:earlier?.authorities.freeze||{}}};
 }
 const history=previous.investigation.timeline.length>0||previous.investigation.relationships.length>0||!!previous.investigation.coverage.poolTiming;
 const coverage={...(history?previous.investigation.coverage:next.investigation.coverage),reasons:unique([...previous.investigation.coverage.reasons,...next.investigation.coverage.reasons]).filter(r=>!r.startsWith(stalePrefix)&&!(securityAvailable&&r.startsWith(staleChecksPrefix))&&!r.startsWith('Current holder snapshot refreshed at')&&!r.startsWith('Holder snapshot refreshed at'))};
 if(retainedUnknownChecks.length){coverage.status=coverage.status==='complete'?'partial':coverage.status;coverage.reasons.push(`${staleChecksPrefix} ${unique(retainedUnknownChecks).join(', ')}. Last known results retain their original timestamps; current check state was not verified.`);}
 if(!holderAvailable){coverage.status=coverage.status==='complete'?'partial':coverage.status;coverage.reasons.unshift(`${stalePrefix} all holder sources are unavailable. Displayed balances retain their last successful values; the refresh attempted at ${next.fetchedAt} did not verify current holdings.`);}
 else coverage.reasons.push(`Current holder snapshot refreshed at ${next.fetchedAt}. Missing snapshot wallets have unknown share, not zero. Historical evidence retains its original timestamps.`);
 const investigation:Investigation={wallets,evidence,findings,relationships:byId(previous.investigation.relationships,next.investigation.relationships),timeline:byId(previous.investigation.timeline,next.investigation.timeline).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),coverage,assessment:assessment(findings,checks,coverage)};
 return derive({...previous,holders:holderAvailable?next.holders:previous.holders,holderCount:holderAvailable?next.holderCount:previous.holderCount,totalSupply:(holderAvailable||securityAvailable||rpcSupply)&&next.totalSupply!=null?next.totalSupply:previous.totalSupply,checks,identities,solana,walletActivity:next.walletActivity??previous.walletActivity,controlProbes:next.controlProbes??previous.controlProbes,sources:[...sources.values()],investigation,fetchedAt:holderAvailable||securityAvailable?next.fetchedAt:previous.fetchedAt});
}

/** A new deep sample replaces previous history. Only snapshot scopes can fall
 * back: balances after a total holder-source failure, and unverified checks or
 * authority fields. Never carry old trades, funding links or inferred roles into
 * the new sample merely because their addresses happen to be the same.
 */
export function mergeDeepReport(previous:InvestigationReport,next:InvestigationReport):InvestigationReport {
 if(previous.providerAnalysis||next.providerAnalysis)return next;
 if(previous.fixture||next.fixture||previous.chain!==next.chain||!sameToken(next.chain,previous.token,next.token))return next;
 const address=(value:string)=>next.chain==='solana'?value:value.toLowerCase();
 const holderAvailable=hasHolderSnapshot(next);
 const earlierAuthorities=(previous.identities||[]).filter(identity=>identity.role==='authority');
 const authorityAddresses=new Set(earlierAuthorities.map(identity=>address(identity.address)));
 const earlierIdentityIds=new Set(earlierAuthorities.map(identity=>identityEvidence(identity,address(identity.address)).id));
 const retainedHoldingIds=new Set(!holderAvailable?previous.investigation.evidence.filter(evidence=>evidence.kind==='holding').map(evidence=>evidence.id):[]);
 const earlierHolderAddresses=new Set([...previous.holders.map(holder=>address(holder.address)),...previous.investigation.wallets.filter(wallet=>wallet.share!==null||wallet.balance!==undefined).map(wallet=>address(wallet.address))]);
 const snapshotWallets=previous.investigation.wallets.filter(wallet=>authorityAddresses.has(address(wallet.address))||(!holderAvailable&&earlierHolderAddresses.has(address(wallet.address)))).map((wallet):InvestigatedWallet=>({address:wallet.address,share:wallet.share,balance:wallet.balance,categories:authorityAddresses.has(address(wallet.address))?['authority']:['unclassified'],evidenceIds:wallet.evidenceIds.filter(id=>earlierIdentityIds.has(id)||retainedHoldingIds.has(id)),...(authorityAddresses.has(address(wallet.address))&&wallet.label?{label:wallet.label}:{})}));
 const checkSources=new Set(previous.checks.flatMap(check=>check.source?[check.source]:[]));
 const snapshots:InvestigationReport={...previous,identities:earlierAuthorities,sources:previous.sources.filter(source=>/^(Bitquery|Blockscout|Solana RPC) Holders$/i.test(source.name)||source.name==='Blockscout token'||source.name==='GoPlus Security'||source.name.startsWith('Solana RPC ')||checkSources.has(source.name)),investigation:{...previous.investigation,wallets:snapshotWallets,evidence:previous.investigation.evidence.filter(evidence=>earlierIdentityIds.has(evidence.id)||retainedHoldingIds.has(evidence.id)||evidence.id.startsWith('security:')),findings:previous.investigation.findings.filter(finding=>finding.id.startsWith('security:')),timeline:[],relationships:[],coverage:{...previous.investigation.coverage,poolTiming:undefined,reasons:previous.investigation.coverage.reasons.filter(reason=>reason.startsWith(stalePrefix)||reason.startsWith(staleChecksPrefix))}}};
 const merged=mergeReportRefresh(snapshots,next,'holders');
 const identities=[...(next.identities||[]).filter(identity=>identity.role!=='authority'),...(merged.identities||[]).filter(identity=>identity.role==='authority')];
 const currentIdentityIds=new Set(identities.map(identity=>identityEvidence(identity,address(identity.address)).id));
 const currentAuthorities=new Set(identities.filter(identity=>identity.role==='authority').map(identity=>address(identity.address)));
 const newWallets=new Set(next.investigation.wallets.map(wallet=>address(wallet.address)));
 for(const holder of next.holders)newWallets.add(address(holder.address));
 const activeFlags=new Set(merged.checks.filter(check=>check.status==='critical'||check.status==='warning').map(check=>`security:${check.key}`));
 const newEvidenceIds=new Set(next.investigation.evidence.map(evidence=>evidence.id));
 const evidence=merged.investigation.evidence.filter(evidence=>retainedHoldingIds.has(evidence.id)|| (evidence.id.startsWith('security:')?activeFlags.has(evidence.id):evidence.id.startsWith('identity:')?currentIdentityIds.has(evidence.id):newEvidenceIds.has(evidence.id)));
 const evidenceIds=new Set(evidence.map(evidence=>evidence.id));
 const wallets=merged.investigation.wallets.filter(wallet=>newWallets.has(address(wallet.address))||currentAuthorities.has(address(wallet.address))||(!holderAvailable&&earlierHolderAddresses.has(address(wallet.address)))).map(wallet=>({...wallet,evidenceIds:wallet.evidenceIds.filter(id=>evidenceIds.has(id))}));
 const newFindings=new Set(next.investigation.findings.map(finding=>finding.id));
 const findings=merged.investigation.findings.filter(finding=>finding.id.startsWith('security:')?activeFlags.has(finding.id):newFindings.has(finding.id));
 const reasons=[...merged.investigation.coverage.reasons];
 const retainedChecks=merged.checks.filter(check=>{
  const incoming=next.checks.find(value=>value.key===check.key);
  return previous.checks.some(value=>value.key===check.key&&value.status!=='unknown')&&(!incoming||incoming.status==='unknown');
 });
 if(retainedChecks.length&&!reasons.some(reason=>reason.startsWith(staleChecksPrefix)))reasons.push(`${staleChecksPrefix} ${retainedChecks.map(check=>check.title).join(', ')}. Last known results retain their original timestamps; current check state was not verified.`);
 const retainedAuthorities=identities.filter(identity=>identity.role==='authority'&&earlierAuthorities.some(earlier=>identityEvidence(earlier,address(earlier.address)).id===identityEvidence(identity,address(identity.address)).id&&earlier.timestamp===identity.timestamp));
 if(retainedAuthorities.length)reasons.push('Some authority roles retain their last verified snapshot because the new scan did not verify those fields. Inspect each role evidence timestamp; absence of a field does not establish revocation.');
 reasons.push('This deep scan replaces earlier trade and funding samples. Retained snapshot fields keep their original timestamps; prior event history is not merged.');
 const coverage={...next.investigation.coverage,reasons:unique(reasons),status:(!holderAvailable||retainedChecks.length||retainedAuthorities.length)&&next.investigation.coverage.status==='complete'?'partial' as const:next.investigation.coverage.status};
 const investigation:Investigation={...next.investigation,wallets,evidence,findings,coverage,assessment:assessment(findings,merged.checks,coverage)};
 return derive({...next,holders:merged.holders,holderCount:merged.holderCount,totalSupply:merged.totalSupply,checks:merged.checks,identities,solana:merged.solana,sources:merged.sources,investigation});
}
