import type {InvestigationReport} from './investigation-types';
import type {SolanaPoolReserveSnapshot} from './solana-pool-reserves';
import {staleVerification} from './verdict-freshness';

type FindingScope={scope:'current-holder'|'mixed'|'outside-current-snapshot'|'non-wallet';currentHolderAddresses:string[];outsideCurrentHolderAddresses:string[];currentHolderCount:number;totalWalletCount:number;note:string};
type PoolContext={status:'verified'|'unknown';reasons:string[];snapshot?:SolanaPoolReserveSnapshot};
const clean=(value:string,max=400)=>value.replace(/https?:\/\/\S+/gi,'[source URL omitted]').replace(/[\u0000-\u001f]/g,' ').replace(/[\u2013\u2014]/g,'-').slice(0,max);

/** Direct evidence guards and explicit scopes. A weighted rating, missing launch
 * history and a model packet's size are never substitutes for observed hazards. */
export function agentEvidenceContext(report:InvestigationReport){
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
 // Current snapshot checks follow the current report capture, while event history keeps its own timestamp.
 const captured=Date.parse(report.fetchedAt);
 const dated=(at:string|undefined)=>!!at&&Number.isFinite(Date.parse(at))&&Number.isFinite(captured)&&Date.parse(at)<=captured+120_000;
 const fresh=(at:string|undefined)=>dated(at)&&Date.parse(at!)>=captured-600_000;
 const stale=staleVerification(report);
 const controlSource=report.chain==='solana'?'Solana RPC authorities':'GoPlus Security';
 const required=report.chain==='solana'?['solana_mint_authority','solana_freeze_authority']:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'];
 const sourceCurrent=report.sources.some(s=>s.name===controlSource&&s.status==='available'&&fresh(s.fetchedAt));
 const qualifiedControls=report.checks.filter(c=>!report.providerAnalysis&&!stale.controls&&sourceCurrent&&c.source===controlSource&&fresh(c.fetchedAt));
 const unresolved=required.filter(key=>!qualifiedControls.some(c=>c.key===key&&c.status!=='unknown')||qualifiedControls.some(c=>c.key===key&&c.status==='unknown'));
 const holderSourceNames=report.chain==='solana'?['Solana RPC Holders']:['Blockscout Holders','GoPlus Security','BSC RPC finalized holder balances','EVM RPC holder balances'];
 const holderSource=report.sources.some(s=>holderSourceNames.includes(s.name)&&s.status==='available'&&fresh(s.fetchedAt));
 const holderShares=new Map<string,number>();let invalidHolders=false;
 for(const h of report.holders){
  if(!h.address||!Number.isFinite(h.share)||h.share<0||h.share>100){invalidHolders=true;continue;}
  const address=normalize(h.address),existing=holderShares.get(address);
  if(existing!==undefined&&Math.abs(existing-h.share)>1e-8)invalidHolders=true;
  holderShares.set(address,h.share);
 }
 if([...holderShares.values()].reduce((a,b)=>a+b,0)>100.000001)invalidHolders=true;
 const evidence=new Map(report.investigation.evidence.filter(e=>e.attribution!=='provider-reported'&&!!e.source.trim()&&dated(e.timestamp)).map(e=>[e.id,e]));
 const infrastructureCategories=['pool','exchange','bridge','burn'] as const;
 const infrastructure=new Set(report.investigation.wallets.filter(w=>{
  const categories=infrastructureCategories.filter(c=>w.categories.includes(c)&&!w.categorySources?.[c]);
  return w.evidenceIds.some(id=>{
   if(evidence.get(id)?.kind!=='label')return false;
   const key=normalize(id),address=normalize(w.address);
   return categories.some(c=>key===`label:${address}:${c}`||(c==='pool'&&key.startsWith(`pool-timing:${address}:`)));
  });
 }).map(w=>normalize(w.address)));
 const currentHolderAddresses=[...holderShares.keys()].filter(a=>!infrastructure.has(a));
 const currentHolders=new Set(currentHolderAddresses);
 const findingScopes:Record<string,FindingScope>={};
 for(const finding of report.investigation.findings){
  const addresses=[...new Set(finding.wallets.map(normalize))];
  const current=addresses.filter(a=>currentHolders.has(a)),outside=addresses.filter(a=>!currentHolders.has(a));
  findingScopes[finding.id]={scope:!addresses.length?'non-wallet':!current.length?'outside-current-snapshot':outside.length?'mixed':'current-holder',currentHolderAddresses:current,outsideCurrentHolderAddresses:outside,currentHolderCount:current.length,totalWalletCount:addresses.length,note:addresses.length?`${current.length} of ${addresses.length} finding addresses are current non-infrastructure snapshot holders. Outside-snapshot balances are unknown, not zero. Historical transactions do not establish current ownership.`:'This finding has no wallet membership scope.'};
 }
 const criticalControls=qualifiedControls.filter(c=>c.status==='critical');
 const warningControls=qualifiedControls.filter(c=>c.status==='warning');
 const criticalFindings=report.investigation.findings.filter(f=>!report.providerAnalysis&&f.attribution!=='provider-reported'&&f.level==='critical'&&f.certainty==='observed'&&f.evidenceIds.some(id=>{const e=evidence.get(id);return !!e?.transaction&&['trade','transfer','authority'].includes(e.kind);}));
 const missingCore=!!report.providerAnalysis||unresolved.length>0||stale.controls||stale.holders||!holderSource||holderShares.size===0||invalidHolders;
 const reasons:string[]=[];
 if(report.providerAnalysis)reasons.push('An imported verdict does not establish independent current evidence.');
 if(unresolved.length)reasons.push(`Required current controls are unverified: ${unresolved.join(', ')}.`);
 if(stale.controls)reasons.push('Contract controls retain an older snapshot after a failed refresh.');
 if(stale.holders||!holderSource)reasons.push('A fresh attributed holder source is unavailable.');
 if(!holderShares.size||invalidHolders)reasons.push('The holder snapshot is empty or contains invalid/conflicting supply shares.');
 reasons.push(...criticalControls.map(c=>`Critical current control: ${clean(c.title,120)}.`),...warningControls.map(c=>`Current control warning: ${clean(c.title,120)}.`),...criticalFindings.map(f=>`Critical observed finding: ${clean(f.title,120)}.`));

 let poolReserves:PoolContext|null=null;
 if(report.poolReserves){
  const result=report.poolReserves,p=result.snapshot;
  const matches=p&&[p.base.mint,p.quote.mint].some(m=>normalize(m)===normalize(report.token))&&(!report.market?.pairAddress||normalize(p.pool)===normalize(report.market.pairAddress));
  if(result.status==='verified'&&p&&matches&&fresh(p.observedAt)&&p.source&&p.evidenceId&&!report.providerAnalysis){
   const token=(t:SolanaPoolReserveSnapshot['base'])=>({mint:clean(t.mint,100),vault:clean(t.vault,100),amountRaw:clean(t.amountRaw,100),decimals:t.decimals,tokenProgram:clean(t.tokenProgram,100),mintExtensions:t.mintExtensions.map(x=>clean(x,100)),vaultExtensions:t.vaultExtensions.map(x=>clean(x,100))});
   poolReserves={status:'verified',reasons:result.reasons.map(x=>clean(x)),snapshot:{protocol:p.protocol,pool:clean(p.pool,100),program:clean(p.program,100),base:token(p.base),quote:token(p.quote),slot:p.slot,observedAt:p.observedAt,commitment:p.commitment,source:clean(p.source,150),blockRef:clean(p.blockRef,150),evidenceId:clean(p.evidenceId,200),virtualQuoteReservesRaw:clean(p.virtualQuoteReservesRaw,100),effectiveQuoteAmountRaw:clean(p.effectiveQuoteAmountRaw,100),protocolFeesRaw:clean(p.protocolFeesRaw,100),creatorFeesRaw:clean(p.creatorFeesRaw,100),creatorFeeBpsRaw:clean(p.creatorFeeBpsRaw,100),constantProductEligible:p.constantProductEligible,feeBps:p.feeBps,feeAssumption:clean(p.feeAssumption),limitations:p.limitations.map(x=>clean(x))}};
  }else poolReserves={status:'unknown',reasons:[...result.reasons.map(x=>clean(x)),'No fresh verified reserve snapshot matches the selected token and pool.']};
 }
 return {guard:{critical:criticalControls.length>0||criticalFindings.length>0,missingCore,warning:warningControls.length>0,reasons},currentHolderAddresses,excludedInfrastructureAddresses:[...holderShares.keys()].filter(a=>infrastructure.has(a)),findingScopes,poolReserves};
}
