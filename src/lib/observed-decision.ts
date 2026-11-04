import type {InvestigationReport,Evidence} from './investigation-types';
import {trustRating,type TrustRating} from './trust-rating';
import {agentEvidenceContext} from './agent-evidence-context';
import {buildScoringInputs,type ScoringFactorId} from './scoring-inputs';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {holderScope} from './holder-scope';
import {scoreFactors} from './reconstructed-score';
import {decisionModel,type DecisionModelResult} from './decision-model';
import {PUMPSWAP_PROGRAM} from './solana-pool-reserves';
import {clockReferenceTime} from './evidence-clock';
import {robinhoodObservedDecision} from './robinhood-observed-decision';

export type ObservedFactor={id:ScoringFactorId;value:number;basis:'observed-holdings'|'readable-wallets'|'account-nonce-proxy'|'observed-exposure'|'observed-none'|'conditional-scenario';detail:string};
export type ObservedDecision={score:number;scoreBand:'CLEAN'|'OK'|'CAUTION'|'AVOID';judge:DecisionModelResult;factors:ObservedFactor[];scope:{holderCount:number;readableFreshWallets:number;unreadFreshWallets:number;activityProxy?:{kind:'low-account-nonce';limit:number;readable:number;lowNonce:number;unread:number;outsideLimit:number};notes:string[]};impact:number;largestShare:number};
const HISTORY_SOURCES=new Set(['Alchemy finalized Solana transaction history','Alchemy durable Solana mint-address history']);
const uint64=(value:string)=>/^\d{1,20}$/.test(value)&&BigInt(value)<=18446744073709551615n?BigInt(value):null;

/** Conditional model of documented observations, kept separate from the strict
 * evidence bounds. No missing measurement is rewritten as a verified zero.
 * The initial nominal reserve scenario supports verified base-side PumpSwap.
 */
export function observedDecision(report:InvestigationReport,strictRating:TrustRating=trustRating(report)):ObservedDecision|null{
 if(report.chain==='robinhood')return robinhoodObservedDecision(report,strictRating);
 if(report.providerAnalysis||strictRating.coreVerified!==true||report.chain!=='solana')return null;
 const context=agentEvidenceContext(report);if(context.guard.missingCore)return null;
 const captured=Date.parse(report.fetchedAt),historyClock=clockReferenceTime(report.investigation.coverage.clock,Date.parse(report.investigation.coverage.fetchedAt));
 const dated=(at:string|undefined,clock=captured)=>!!at&&Number.isFinite(clock)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=clock+120_000;
 const fresh=(at:string|undefined)=>dated(at)&&Date.parse(at!)>=captured-600_000;
 const sourceAvailable=(name:string,current=false)=>!!name.trim()&&report.sources.some(s=>s.name===name&&s.status==='available'&&(current?fresh(s.fetchedAt):dated(s.fetchedAt)));
 const validEvidence=(e:Evidence)=>e.attribution!=='provider-reported'&&!!e.source.trim()&&dated(e.timestamp,historyClock);
 const evidence=new Map(report.investigation.evidence.filter(validEvidence).map(e=>[e.id,e]));
 const canonicalHistory=[...evidence.values()].filter(e=>e.kind==='trade'&&!!e.transaction?.trim()&&HISTORY_SOURCES.has(e.source)&&sourceAvailable(e.source)&&e.token===report.token&&/:pump(?:swap)?:/.test(e.id)&&((typeof e.amount==='number'&&Number.isFinite(e.amount)&&e.amount>0)||(!!e.amountRaw&&uint64(e.amountRaw)!==null&&BigInt(e.amountRaw)>0n)));
 if(!canonicalHistory.length)return null;
 const creators=new Set(report.investigation.wallets.filter(w=>w.categories.includes('creator')&&!w.categorySources?.creator&&w.evidenceIds.some(id=>{
  const e=evidence.get(id);return id===`identity:creator:${w.address}`&&e?.kind==='authority'&&!!e.transaction?.trim()&&HISTORY_SOURCES.has(e.source)&&sourceAvailable(e.source);
 })).map(w=>w.address));
 if(!creators.size)return null;
 const scope=holderScope(report),graph=buildCurrentHolderGraph(report,{limit:1000});
 if(!scope.holders.length||graph.truncated||graph.nodes.some(n=>n.share===null))return null;
 const shares=new Map(scope.holders.map(h=>[h.address,h.share])),denominator=100-scope.infrastructure.reduce((sum,h)=>sum+h.share,0);
 if(!(denominator>0))return null;
 const activity=report.walletActivity;
 if(!activity||!fresh(activity.observedAt)||!sourceAvailable(activity.source,true))return null;
 const activityRows=new Map(activity.wallets.map(w=>[w.address,w]));
 const eligible=scope.holders.filter(h=>!creators.has(h.address));let readable=0;
 for(const h of eligible){
  const w=activityRows.get(h.address),count=w?.count;
  // Existing bounded probes can disprove freshness, but neither short Solana
  // pages nor low EVM nonces establish <=10 lifetime transactions.
  if(w&&fresh(w.observedAt||activity.observedAt)&&w.basis==='solana-address-signatures'&&Number.isSafeInteger(count)&&count!>10&&w.fresh===false)readable++;
 }
 if(!readable)return null;
 const adjacency=new Map<string,Set<string>>();
 for(const edge of graph.edges)for(const [from,to] of [[edge.from,edge.to],[edge.to,edge.from]]){const set=adjacency.get(from)||new Set<string>();set.add(to);adjacency.set(from,set);}
 const seen=new Set<string>(),groups:string[][]=[];
 for(const address of shares.keys()){
  if(seen.has(address))continue;const group:string[]=[],pending=[address];
  while(pending.length){const a=pending.pop()!;if(seen.has(a))continue;seen.add(a);group.push(a);pending.push(...(adjacency.get(a)||[]));}groups.push(group);
 }
 const groupShare=(group:string[])=>group.reduce((sum,a)=>sum+shares.get(a)!,0);
 groups.sort((a,b)=>groupShare(b)-groupShare(a)||a[0].localeCompare(b[0]));
 const largest=groups[0],owners=new Set(largest),pool=report.poolReserves?.snapshot;
 if(report.poolReserves?.status!=='verified'||!pool||pool.protocol!=='pumpswap'||pool.program!==PUMPSWAP_PROGRAM||pool.commitment!=='finalized'||!fresh(pool.observedAt)||!sourceAvailable(pool.source,true)||!pool.evidenceId.trim()||!pool.blockRef.trim()||!report.market?.pairAddress||pool.pool!==report.market.pairAddress||pool.base.mint!==report.token||pool.quote.mint===report.token||pool.base.vault===pool.quote.vault||!Number.isSafeInteger(pool.base.decimals)||pool.base.decimals<0||pool.base.decimals>255)return null;
 const x=uint64(pool.base.amountRaw),quote=uint64(pool.quote.amountRaw);
 if(x===null||x===0n||quote===null||quote===0n)return null;
 const accounts=new Map<string,{owner:string;amount:bigint}>();
 for(const account of report.solana?.tokenAccounts||[]){
  if(!owners.has(account.owner)||account.mint!==report.token)continue;
  const amount=uint64(account.amountRaw),old=accounts.get(account.address);
  if(!fresh(account.timestamp)||account.decimals!==pool.base.decimals||report.solana?.snapshot.tokenProgram!==pool.base.tokenProgram||account.state!=='initialized'||amount===null||(old&&(old.owner!==account.owner||old.amount!==amount)))return null;
  accounts.set(account.address,{owner:account.owner,amount});
 }
 const represented=new Set([...accounts.values()].map(a=>a.owner));if(largest.some(a=>!represented.has(a)))return null;
 const q=[...accounts.values()].reduce((sum,a)=>sum+a.amount,0n),supply=report.totalSupply;
 if(q===0n||typeof supply!=='number'||!Number.isFinite(supply)||supply<=0)return null;
 const rawShare=Number(q)/10**pool.base.decimals/supply*100;
 if(!Number.isFinite(rawShare)||Math.abs(rawShare-groupShare(largest))>1e-6)return null;
 const divisor=(x+q)*(x+q),impact=Number((divisor-x*x)*1_000_000_000_000n/divisor)/1_000_000_000_000;
 const strictInputs=buildScoringInputs(report),measured=new Map(strictInputs.map(f=>[f.id,f]));
 const factors:ObservedFactor[]=[
  {id:'swarm',value:impact,basis:'conditional-scenario',detail:`Nominal raw reserve-price drop 1 - x²/(x+q)², with q=${q} and x=${x}, at ${pool.blockRef}. Assumes fee-free constant-product updates, successful transfers and no hook or token-extension side effects. It is not an executable trade quote or verified sell capability.`},
  {id:'fresh',value:0,basis:'readable-wallets',detail:`0 lifetime-fresh wallets established among ${readable} readable non-creator holders; all have more than ten observed transactions. ${eligible.length-readable} unread or indeterminate non-creator wallets are excluded, not classified as old or fresh.`},
  ...(['insiders','concentration','snipers','dev'] as const).map(id=>{
   const value=measured.get(id)!.lower;
   return {id,value,basis:id==='concentration'?'observed-holdings' as const:value>0?'observed-exposure' as const:'observed-none' as const,detail:id==='concentration'?'Top ten documented holder groups in this snapshot, divided by supply after excluding observed infrastructure. Unobserved holdings and relationships are outside this conditional score.':`${id==='insiders'?'Early or creator-origin':id==='snipers'?'First-minute buyer':'Creator-linked'} exposure documented in the retrieved scope only. ${value===0?'Zero recorded matches is not proof of absent activity. ':''}${measured.get(id)!.detail}`};
  }),
 ];
 const hard=[...(strictRating.hard||[])],soft=[...(strictRating.soft||[])];
 // A conditional scenario never creates a new verified hard stop. Existing
 // independent controls and verified strict-model stops retain precedence.
 const scored=scoreFactors(factors.map(f=>({...f,lower:f.value,upper:f.value,evidenceIds:[]})),{hard,soft});
 if(scored.score===null)return null;
 const security=context.guard.critical||hard.some(h=>h.includes('freeze authority'))?null:context.guard.warning?1:0;
 const judge=decisionModel({score:{lower:scored.score,upper:scored.score},danger:hard.length>0,security,memoryHits:0,dumpImpact:{lower:impact,upper:impact},hard});
 const notes=[
  'Conditional observed-scope model. Historical gaps and unread wallets are excluded from this point calculation; the independent strict evidence bounds remain separate.',
  `${canonicalHistory.length} source-attributed canonical trade record(s) establish a usable returned history subset, not complete launch coverage. Zero early/sniper findings mean no documented matches in the analyzed subset.`,
  'Cross-token group search has not been performed. This conditional calculation assumes no additional cross-token memory hit; it does not establish that such hits are absent.',
  'The nominal pool scenario assumes zero fees, successful transfers, constant-product reserve updates and no hook side effects. Quote-token extensions and dynamic behavior are not verified by this scenario.',
  ...(!pool.constantProductEligible?pool.limitations:[]),
  'Connected groups describe documented relationships, not established common ownership. Holder shares cover the supplied current account snapshot.',
 ];
 return {score:scored.score,scoreBand:scored.decision,judge,factors,scope:{holderCount:scope.holders.length,readableFreshWallets:readable,unreadFreshWallets:eligible.length-readable,notes},impact,largestShare:groupShare(largest)/denominator};
}
