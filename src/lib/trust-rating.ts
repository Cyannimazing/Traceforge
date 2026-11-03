import type {InvestigationReport} from './investigation-types';
import {agentEvidenceContext} from './agent-evidence-context';
import {buildScoringInputs} from './scoring-inputs';
import {scoreFactors} from './reconstructed-score';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {staleVerification} from './verdict-freshness';
import {decisionModel,type DecisionModelResult} from './decision-model';
export {staleVerification} from './verdict-freshness';
export type RatingComponent={id:string;label:string;earned:number;maximum:number;state:'clear'|'watch'|'flagged'|'unknown';detail:string;lower?:number;upper?:number;evidenceIds?:string[]};
export type TrustRating={version:'evidence-v3'|'six-factor-v1';score:number|null;range?:{lower:number;upper:number};decision:'CLEAN'|'OK'|'CAUTION'|'AVOID'|'UNRATED';basis:string;reasons:string[];components:RatingComponent[];ceiling:number|null;hard?:string[];soft?:string[];judge?:DecisionModelResult};
/** Primary independent verdict. Unknown inputs retain score intervals instead
 * of receiving favorable zero-risk defaults or arbitrary fixed deductions. */
export function trustRating(report:InvestigationReport):TrustRating{
 const context=agentEvidenceContext(report),inputs=buildScoringInputs(report);
 const hard:string[]=[],soft:string[]=[];
 // Reuse the guard's source and freshness policy, but do not mistake every
 // warning (metadata, configured fees, proxy presence) for active owner powers.
 const captured=Date.parse(report.fetchedAt);
 const fresh=(at:string|undefined)=>!!at&&Number.isFinite(captured)&&Number.isFinite(Date.parse(at))&&Date.parse(at)>=captured-600_000&&Date.parse(at)<=captured+120_000;
 const controlSource=report.chain==='solana'?'Solana RPC authorities':'GoPlus Security';
 const sourceCurrent=report.sources.some(s=>s.name===controlSource&&s.status==='available'&&fresh(s.fetchedAt));
 const controlsStale=staleVerification(report).controls;
 const controls=report.checks.filter(c=>!report.providerAnalysis&&!controlsStale&&sourceCurrent&&c.source===controlSource&&fresh(c.fetchedAt));
 const warned=(key:string)=>controls.some(c=>c.key===key&&c.status==='warning');
 const activePowerKeys=new Set(report.chain==='solana'?['solana_mint_authority','solana_extension_transferFeeConfigAuthority']:['is_mintable','transfer_pausable']);
 for(const control of controls.filter(c=>c.status==='warning'&&activePowerKeys.has(c.key)))soft.push(`Active owner power: ${control.title}.`);
 if(report.chain!=='solana'&&warned('is_proxy')&&warned('is_open_source'))soft.push('An upgradeable proxy has unverified contract source.');
 // The RPC adapter labels a capability as warning, not proof of its misuse.
 // The disclosed freeze stop rule concerns the active capability itself.
 if(report.chain==='solana'&&warned('solana_freeze_authority'))hard.push('A verified current freeze authority can freeze token accounts.');
 const extensionCoverageMissing=report.chain==='solana'&&(!controls.some(c=>c.key==='solana_extensions'&&c.status==='clear')||controls.some(c=>(c.key==='solana_extensions'||c.key.startsWith('solana_extension_'))&&c.status==='unknown'));
 if(context.guard.critical)hard.push(...context.guard.reasons.filter(r=>r.startsWith('Critical')));
 if(inputs.find(i=>i.id==='swarm')!.lower>=.5)hard.push('Modeled largest-hand sell impact is at least 50% in the stated pool scenario.');
 if(inputs.find(i=>i.id==='fresh')!.lower>=.8)hard.push('At least 80% of current evaluated holder wallets satisfy the fresh-wallet predicate.');
 if(inputs.find(i=>i.id==='dev')!.lower>=.1)soft.push('Observed creator-linked holdings are at least 10% of adjusted supply.');
 const graph=buildCurrentHolderGraph(report,{limit:1000}),adj=new Map<string,Set<string>>();
 for(const e of graph.edges)for(const [a,b]of [[e.from,e.to],[e.to,e.from]]){const set=adj.get(a)||new Set<string>();set.add(b);adj.set(a,set);}
 const seen=new Set<string>();let largeGroup=false;
 for(const start of adj.keys()){if(seen.has(start))continue;const pending=[start];let size=0;while(pending.length){const a=pending.pop()!;if(seen.has(a))continue;seen.add(a);size++;pending.push(...(adj.get(a)||[]));}if(size>=3)largeGroup=true;}
 if(largeGroup)soft.push('A transaction-backed connected group contains at least three current holders. Common ownership remains an inference.');
 const result=scoreFactors(inputs,{hard,soft,missingCore:context.guard.missingCore||extensionCoverageMissing});
 const impact=inputs.find(i=>i.id==='swarm')!;
 const securityIncomplete=report.chain!=='solana'&&['is_honeypot','owner_change_balance','is_mintable','transfer_pausable','is_proxy','is_open_source','hidden_owner','selfdestruct'].some(key=>!controls.some(c=>c.key===key&&c.status!=='unknown')||controls.some(c=>c.key===key&&c.status==='unknown'));
 const judge=decisionModel({score:result.range,danger:hard.length>0,
  security:context.guard.missingCore||extensionCoverageMissing||securityIncomplete||context.guard.critical||report.chain==='solana'&&warned('solana_freeze_authority')?null:context.guard.warning?1:0,
  memoryHits:null,dumpImpact:{lower:impact.lower,upper:impact.upper},hard});
 return {...result,decision:report.providerAnalysis?'UNRATED':result.decision,score:report.providerAnalysis?null:result.score,
  judge:report.providerAnalysis?undefined:judge,
  reasons:[...new Set([...result.reasons,...context.guard.reasons,...(extensionCoverageMissing?['Current mint extension decoding is incomplete or unverified.']:[])])],components:result.components.map(c=>({...c,earned:c.earned??0}))};
}
