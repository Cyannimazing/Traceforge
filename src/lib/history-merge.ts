import {analyzeInvestigation,type IdentityRecord,type InvestigationInput,type LabelRecord,type TradeRecord,type TransferRecord} from './investigation';
import type {InvestigationReport,PoolTimingProof,Evidence} from './investigation-types';
import type {HistoryJob} from './history-store';
import type {PoolLaunchResult} from './pool-launch';
import {clockReferenceTime,type EvidenceClock} from './evidence-clock';
import {getDisplayAssessment} from './verdict-summary';
import {computeRiskMetrics} from './risk-metrics';
import {trustRating} from './trust-rating';

const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const str=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const date=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
const integer=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const historyPrefix='Resumable pool history:';
const infrastructure=['pool','exchange','bridge','burn','contract'] as const;
const unique=<T>(values:T[])=>[...new Set(values)];
function clock(value:unknown):EvidenceClock|undefined{
 const c=obj(value);return ['local','provider-quorum'].includes(String(c.basis))&&str(c.referenceAt)&&str(c.localCapturedAt)&&Array.isArray(c.sources)&&c.sources.every(source=>str(obj(source).name))?c as EvidenceClock:undefined;
}
function completeResult(value:unknown,chain:string,token:string,pool:string,observedAt:number,eventAt:number):PoolLaunchResult|undefined{
 const r=obj(value),p=obj(r.proof),creation=obj(p.creation),through=obj(p.through),norm=(v:unknown)=>typeof v==='string'?v.toLowerCase():'';
 if(r.status!=='verified'||r.scope!=='selected-pool'||norm(r.pool)!==pool||norm(r.token)!==token||p.verified!==true||p.scope!=='selected-pool'||p.chain!==chain||norm(p.pool)!==pool||![p.token0,p.token1].some(t=>norm(t)===token))return;
 if(![p.token0,p.token1,p.factory,p.firstSwapTransaction,creation.transaction,creation.blockHash,through.blockHash].every(str)||!integer(p.firstSwapLogIndex)||!integer(creation.blockNumber)||!integer(through.blockNumber)||Number(creation.blockNumber)>Number(through.blockNumber))return;
 if(!Number.isFinite(date(p.verifiedAt))||date(p.verifiedAt)>observedAt+120000||![p.firstSwapAt,p.windowEndAt,through.timestamp].every(t=>Number.isFinite(date(t))&&date(t)<=eventAt+120000)||date(p.windowEndAt)!==date(p.firstSwapAt)+60000||date(through.timestamp)<=date(p.windowEndAt))return;
 if(!Array.isArray(r.trades)||!Array.isArray(r.sources)||!Array.isArray(p.eligibleTradeIds)||!p.eligibleTradeIds.every(str))return;
 for(const value of r.trades){
  const t=obj(value),prefix=`${chain}:${pool}:${norm(t.transaction)}:`;
  if(!str(t.id)||!str(t.wallet)||!str(t.source)||!str(t.transaction)||!['buy','sell'].includes(String(t.side))||!t.id.startsWith(prefix)||!/^\d+$/.test(t.id.slice(prefix.length))||!Number.isSafeInteger(Number(t.id.slice(prefix.length)))||!Number.isFinite(date(t.timestamp))||date(t.timestamp)<date(p.firstSwapAt)||date(t.timestamp)>date(p.windowEndAt))return;
  if(!(typeof t.amount==='number'&&Number.isFinite(t.amount)&&t.amount>0)&&!(t.amount===undefined&&typeof t.amountRaw==='string'&&/^[1-9]\d{0,77}$/.test(t.amountRaw)))return;
 }
 if(!p.eligibleTradeIds.every(id=>(r.trades as Record<string,unknown>[]).some(t=>t.id===id&&t.side==='buy')))return;
 return r as unknown as PoolLaunchResult;
}
function recordId(evidence:Evidence,kind:'trade'|'transfer',suffix:string){const prefix=`${kind}:`;return evidence.id.startsWith(prefix)&&evidence.id.endsWith(suffix)?evidence.id.slice(prefix.length,-suffix.length):evidence.id;}

/** Replay only already recorded canonical pool windows onto a new snapshot.
 * Every proof and log is validated by the same merge path as a resumed job.
 * Provider labels from the previous snapshot are deliberately not replayed. */
export function retainVerifiedPoolHistory(previous:InvestigationReport,next:InvestigationReport):InvestigationReport{
 const chain=previous.chain;if(chain!=='ethereum'&&chain!=='base')return next;
 const proofs=previous.investigation.coverage.poolTimings||(previous.investigation.coverage.poolTiming?[previous.investigation.coverage.poolTiming]:[]);
 if(!proofs.length)return next;
 const records=new Map(previous.investigation.evidence.map(e=>[e.id,e]));
 const pools:HistoryJob['pools']=proofs.map(proof=>{
  const prefix=`${previous.chain}:${proof.pool.toLowerCase()}:`;
  const trades:TradeRecord[]=previous.investigation.timeline.flatMap(event=>{
   if(event.kind!=='buy'&&event.kind!=='sell')return [];
   const evidence=records.get(event.evidenceId);if(!evidence?.transaction||evidence.kind!=='trade'||evidence.attribution==='provider-reported')return [];
   const id=recordId(evidence,'trade',`:${event.wallet.toLowerCase()}:${event.kind}`);if(!id.startsWith(prefix))return [];
   return [{id,wallet:event.wallet,timestamp:evidence.timestamp,side:event.kind,amount:evidence.amount,amountRaw:evidence.amountRaw,decimals:evidence.decimals,transaction:evidence.transaction,source:evidence.source}];
  });
  const sourcePrefix=`Historical pool ${proof.pool.toLowerCase()} / `;
  return {pool:proof.pool,status:'complete',checkpoint:null,message:'Retained verified window',updatedAt:proof.verifiedAt,result:{status:'verified',scope:'selected-pool',pool:proof.pool,token:previous.token,proof,trades,reasons:['Previously verified pool windows retained across the holder snapshot refresh; transaction timestamps are unchanged.'],sources:previous.sources.filter(s=>s.name.startsWith(sourcePrefix)).map(s=>({...s,name:s.name.slice(sourcePrefix.length)}))}};
 });
 const captured=previous.investigation.coverage.fetchedAt;
 return mergeHistoryReport(next,{id:'retained-pool-evidence',chain,token:previous.token,status:'complete',createdAt:captured,updatedAt:captured,revision:0,message:'Retained canonical evidence',poolLimit:pools.length,progress:{clock:previous.investigation.coverage.clock},result:null,leaseExpiresAt:null,pools,counts:{complete:pools.length,queued:0,running:0,paused:0,blocked:0}});
}

/** Apply only completely verified pool windows. Account snapshots and original
 * source evidence retain their timestamps. Canonical log IDs replace overlapping
 * aggregate feed totals, but the original feed observations remain inspectable.
 * No job, including one whose listed pools all finish, establishes token launch.
 */
export function mergeHistoryReport(report:InvestigationReport,job:HistoryJob):InvestigationReport{
 if(report.fixture||!['ethereum','base'].includes(report.chain)||job.chain!==report.chain||job.token.toLowerCase()!==report.token.toLowerCase())return report;
 const old=report.investigation,normalize=(value:string)=>value.toLowerCase();
 const captured=Math.max(date(old.coverage.fetchedAt),date(job.updatedAt)),fetchedAt=Number.isFinite(captured)?new Date(captured).toISOString():old.coverage.fetchedAt;
 const clocks=[clock(obj(job.progress).clock),clock(old.coverage.clock)].filter((value):value is EvidenceClock=>!!value).sort((a,b)=>date(b.localCapturedAt)-date(a.localCapturedAt));
 const validationClock=clocks.find(value=>value.basis==='provider-quorum'&&new Set(value.sources.map(source=>source.name)).size>=2&&Number.isFinite(date(value.referenceAt))&&Math.abs(date(value.referenceAt)-date(value.localCapturedAt))<=86400000&&captured-date(value.localCapturedAt)>=-1000&&captured-date(value.localCapturedAt)<=120000)||clocks.find(value=>value.basis==='local');
 const eventAt=clockReferenceTime(validationClock,captured);
 const completed=job.pools.flatMap(pool=>{if(pool.status!=='complete')return [];const result=completeResult(pool.result,report.chain,normalize(report.token),normalize(pool.pool),captured,eventAt);return result?[result]:[];});
 if(!completed.length)return report;
 const evidenceById=new Map(old.evidence.map(e=>[e.id,e]));
 const originalTrades:TradeRecord[]=[],transfers:TransferRecord[]=[],labels:LabelRecord[]=[],identities:IdentityRecord[]=[...(report.identities||[])];
 for(const event of old.timeline){
  const e=evidenceById.get(event.evidenceId);if(!e?.transaction||e.attribution==='provider-reported')continue;
  if((event.kind==='buy'||event.kind==='sell')&&e.kind==='trade')originalTrades.push({id:recordId(e,'trade',`:${normalize(event.wallet)}:${event.kind}`),wallet:event.wallet,timestamp:e.timestamp,side:event.kind,amount:e.amount,amountRaw:e.amountRaw,decimals:e.decimals,transaction:e.transaction,source:e.source});
  else if((event.kind==='funding'||event.kind==='transfer')&&e.kind==='transfer'&&e.from&&e.to&&typeof e.amount==='number')transfers.push({id:recordId(e,'transfer',`:${normalize(e.from)}:${normalize(e.to)}`),from:e.from,to:e.to,timestamp:e.timestamp,amount:e.amount,token:e.token||'unknown',native:event.kind==='funding',transaction:e.transaction,source:e.source});
 }
 for(const wallet of old.wallets){
  for(const category of infrastructure){const e=evidenceById.get(`label:${normalize(wallet.address)}:${category}`);if(wallet.categories.includes(category)&&e)labels.push({address:wallet.address,category,label:e.description,source:e.source,timestamp:e.timestamp,timestampBasis:'local-observation'});}
  for(const role of ['creator','authority'] as const){if(identities.some(i=>normalize(i.address)===normalize(wallet.address)&&i.role===role))continue;const e=evidenceById.get(`identity:${role}:${normalize(wallet.address)}`);if(wallet.categories.includes(role)&&e)identities.push({address:wallet.address,role,source:e.source,timestamp:e.timestamp,transaction:e.transaction,timestampBasis:'local-observation'});}
 }
 const canonical=completed.flatMap(result=>result.trades),canonicalIds=new Set(canonical.map(t=>t.id)),canonicalTx=new Set(canonical.map(t=>normalize(t.transaction)));
 const isCanonical=(trade:TradeRecord)=>trade.id.startsWith(`${report.chain}:`)&&trade.id.includes(`:${normalize(trade.transaction)}:`);
 const trades=[...new Map([...originalTrades.filter(t=>!canonicalIds.has(t.id)&&(!canonicalTx.has(normalize(t.transaction))||isCanonical(t))),...canonical].map(t=>[t.id,t])).values()];
 const previousProofs=old.coverage.poolTimings|| (old.coverage.poolTiming?[old.coverage.poolTiming]:[]);
 const poolTimings=[...new Map([...previousProofs,...completed.map(r=>r.proof!)].map(p=>[normalize(p.pool),p])).values()];
 const holders=old.wallets.filter(w=>w.share!==null||w.balance!==undefined).map(w=>({address:w.address,share:w.share,balance:w.balance}));
 const reasons=unique([...old.coverage.reasons.filter(reason=>!reason.startsWith(historyPrefix)),...completed.flatMap(r=>Array.isArray(r.reasons)?r.reasons.filter(str):[]),`${historyPrefix} ${completed.length} of ${job.pools.length} listed pool windows verified. Pool discovery is not an exhaustive historical registry; these windows do not establish token-wide launch or complete wallet history. Aggregate feed rows overlapping canonical transactions are excluded from totals but retained as source evidence.`]);
 const input:InvestigationInput={chain:report.chain,token:report.token,holders,trades,transfers,identities,labels,launchVerified:false,poolTimings,clock:validationClock,earliestTradeAt:old.coverage.earliestTradeAt,complete:false,reasons,fetchedAt,holderLimit:Math.max(old.coverage.holderLimit,holders.length),buyerLimit:old.coverage.buyerLimit,fundingHops:old.coverage.fundingHops,truncated:true};
 const investigation=analyzeInvestigation(input);
 // Keep exact original observations, including source records no longer used in
 // aggregate totals. Recomputed findings/timeline use only accepted input above.
 investigation.evidence=[...new Map([...investigation.evidence,...old.evidence].map(e=>[e.id,e])).values()];
 const wallets=new Map(investigation.wallets.map(w=>[normalize(w.address),w]));
 for(const previous of old.wallets){const current=wallets.get(normalize(previous.address));if(current){current.evidenceIds=unique([...current.evidenceIds,...previous.evidenceIds]);if(!current.label&&previous.label)current.label=previous.label;}else{const retained={address:previous.address,share:previous.share,balance:previous.balance,categories:['unclassified' as const],evidenceIds:[...previous.evidenceIds],...(previous.label?{label:previous.label}:{})};investigation.wallets.push(retained);}}
 // Keep upstream labels/links as upstream claims when verified pool windows
 // are added. A newly independently derived category takes precedence for that
 // category only; it does not upgrade the remaining provider classifications.
 if(report.providerAnalysis){
  for(const previous of old.wallets){
   const current=investigation.wallets.find(wallet=>normalize(wallet.address)===normalize(previous.address));if(!current)continue;
   for(const category of previous.categories){
    if(previous.categorySources?.[category]!=='swarm'||current.categories.includes(category))continue;
    current.categories=unique([...current.categories.filter(c=>c!=='unclassified'),category]);
    current.categorySources={...current.categorySources,[category]:'swarm'};
   }
  }
  investigation.relationships=[...investigation.relationships,...old.relationships.filter(edge=>edge.attribution==='provider-reported')];
  const canonicalEventKeys=new Set(investigation.timeline.map(event=>{const e=investigation.evidence.find(e=>e.id===event.evidenceId);return `${normalize(e?.transaction||'')}:${normalize(event.wallet)}:${event.kind}`;}));
  const providerEvents=old.timeline.filter(event=>{const e=evidenceById.get(event.evidenceId);return e?.attribution==='provider-reported'&&!canonicalEventKeys.has(`${normalize(e.transaction||'')}:${normalize(event.wallet)}:${event.kind}`);});
  investigation.timeline=[...investigation.timeline,...providerEvents].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id));
  investigation.coverage.source='Swarm provider report + verified selected pool evidence';
 }
 investigation.findings=[...investigation.findings,...old.findings.filter(f=>f.id.startsWith('security:')||f.attribution==='provider-reported')];
 const sources=new Map(report.sources.map(source=>[source.name,source]));
 for(const result of completed)for(const source of result.sources||[]){if(!source||!str(source.name)||!str(source.detail)||!['available','unavailable','unsupported'].includes(source.status))continue;const name=`Historical pool ${normalize(result.pool)} / ${source.name}`;sources.set(name,{...source,name});}
 sources.set('Resumable pool history',{name:'Resumable pool history',status:'available',detail:reasons[reasons.length-1],fetchedAt:job.updatedAt});
 const merged={...report,sources:[...sources.values()],investigation};
 if(!merged.providerAnalysis){merged.riskMetrics=computeRiskMetrics(merged);merged.trustRating=trustRating(merged);}
 investigation.assessment=getDisplayAssessment(merged);
 return merged;
}
