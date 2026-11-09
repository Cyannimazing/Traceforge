import type {Evidence,InvestigatedWallet,InvestigationReport,Relationship} from './investigation-types';
import {holderScope} from './holder-scope';
import {topHolderCohort} from './top-holder-cohort';
import {clockReferenceTime} from './evidence-clock';

export type CurrentHolderGraph={nodes:InvestigatedWallet[];edges:Relationship[];total:number;excludedInfrastructure:number;shown:number;truncated:boolean;documentedGroups:number;walletGroups:number};

/** Current snapshot addresses only. A documented group is a connected component
 * among displayed wallets, not a claim of shared ownership or a count of people. */
export function buildCurrentHolderGraph(report:InvestigationReport,options:{limit?:number;cohort?:'top'|'all'}={}):CurrentHolderGraph{
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
 const scope=holderScope(report),top=options.cohort==='top'?topHolderCohort(report):null,infra=new Set([...scope.infrastructureAddresses,...(top?.contractAddresses||[])]);
 const requested=options.limit??100,limit=Number.isFinite(requested)?Math.max(0,Math.min(10000,Math.floor(requested))):100;
 const existing=new Map(report.investigation.wallets.map(w=>[normalize(w.address),w]));
 const sorted=[...(top?.holders||scope.holders)].sort((a,b)=>(Number.isFinite(b.share)?b.share:-1)-(Number.isFinite(a.share)?a.share:-1)||normalize(a.address).localeCompare(normalize(b.address)));
 const nodes:InvestigatedWallet[]=sorted.slice(0,limit).map(h=>{
  const address=normalize(h.address),old=existing.get(address);
  return {...old,address,share:Number.isFinite(h.share)&&h.share>=0&&h.share<=100?h.share:null,categories:old?.categories.filter(c=>!old.categorySources?.[c])||['unclassified'],evidenceIds:old?[...old.evidenceIds]:[]};
 });
 const shown=new Set(nodes.map(n=>n.address));
 const captured=clockReferenceTime(report.investigation.coverage.clock,Date.parse(report.investigation.coverage.fetchedAt));
 const positive=(e:Evidence)=>typeof e.amount==='number'?Number.isFinite(e.amount)&&e.amount>0:typeof e.amountRaw==='string'&&/^[1-9]\d{0,77}$/.test(e.amountRaw);
 const proofs=new Map(report.investigation.evidence.filter(e=>e.kind==='transfer'&&e.attribution!=='provider-reported'&&!!e.transaction?.trim()&&!!e.source.trim()&&!!e.from&&!!e.to&&normalize(e.from)!==normalize(e.to)&&Number.isFinite(Date.parse(e.timestamp))&&Number.isFinite(captured)&&Date.parse(e.timestamp)<=captured+120_000&&positive(e)).map(e=>[e.id,e]));
 const trades=new Map(report.investigation.evidence.filter(e=>e.kind==='trade'&&e.attribution!=='provider-reported'&&!!e.transaction?.trim()&&!!e.source.trim()&&Number.isFinite(Date.parse(e.timestamp))&&Number.isFinite(captured)&&Date.parse(e.timestamp)<=captured+120_000).map(e=>[e.id,e]));
 const tradeOwner=(id:string)=>{const m=/^trade:.+:(0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}):buy$/i.exec(id);return m?normalize(m[1]):null;};
 const independent=report.investigation.relationships.filter(r=>r.attribution!=='provider-reported'&&r.kind!=='provider-reported');
 const matches=(e:Evidence,from:string,to:string)=>normalize(e.from!)===from&&normalize(e.to!)===to;
 const nativeTokens=report.chain==='solana'?['SOL','native']:report.chain==='bsc'?['BNB','native']:['ETH','native'];
 // A raw transfer is not automatically acquisition funding. Keep the upstream
 // eligibility decision and verify its native receipt before drawing a link.
 const fundingReceipts=new Set<string>();
 for(const r of independent.filter(r=>r.kind==='funding')){
  const from=normalize(r.from),to=normalize(r.to);
  if(infra.has(from)||infra.has(to))continue;
  for(const id of r.evidenceIds){const e=proofs.get(id);if(e&&matches(e,from,to)&&nativeTokens.includes(e.token||'')&&!(report.chain==='solana'&&e.amount!==undefined&&e.amount<0.0001))fundingReceipts.add(id);}
 }
 const byPair=new Map<string,Relationship>();
 for(const r of independent){
  const from=normalize(r.from),to=normalize(r.to);if(from===to||!shown.has(from)||!shown.has(to))continue;
  const records=[...new Set(r.evidenceIds)].flatMap(id=>proofs.has(id)?[proofs.get(id)!]:[]);
  let qualified:Evidence[]=[];
  if(r.kind==='bundle'||r.kind==='pack'){
   // Verified buys by both endpoints: same transaction (bundle) or within 12 s (pack).
   const buys=[...new Set(r.evidenceIds)].flatMap(id=>trades.has(id)?[trades.get(id)!]:[]);
   const own=(who:string)=>buys.filter(e=>tradeOwner(e.id)===who);
   for(const a of own(from))for(const b of own(to)){if(r.kind==='bundle'?a.transaction===b.transaction:Math.abs(Date.parse(a.timestamp)-Date.parse(b.timestamp))<=12_000)qualified.push(a,b);}
  }else if(r.kind==='distributor'){
   // Both endpoints received this token from the same sender.
   for(const a of records.filter(e=>normalize(e.to!)===from))for(const b of records.filter(e=>normalize(e.to!)===to)){if(a.id!==b.id&&normalize(a.from!)===normalize(b.from!)&&!infra.has(normalize(a.from!)))qualified.push(a,b);}
  }else if(r.kind==='shared-funder'){
   const native=records.filter(e=>fundingReceipts.has(e.id));
   for(const a of native.filter(e=>normalize(e.to!)===from))for(const b of native.filter(e=>normalize(e.to!)===to)){
    if(a.id!==b.id&&normalize(a.from!)===normalize(b.from!)&&!infra.has(normalize(a.from!)))qualified.push(a,b);
   }
  }else qualified=records.filter(e=>matches(e,from,to)||matches(e,to,from));
  if(!qualified.length)continue;
  const endpoints=[from,to].sort(),key=endpoints.join('|'),previous=byPair.get(key);
  const weak=(k:string)=>['shared-funder','bundle','pack','distributor'].includes(k);
  const kind=previous&&!weak(previous.kind)?previous.kind:r.kind;
  byPair.set(key,{id:previous?.id||`current:${key}`,from:endpoints[0],to:endpoints[1],kind,evidenceIds:[...new Set([...(previous?.evidenceIds||[]),...qualified.map(e=>e.id)])],description:r.kind==='bundle'?'Bought in the same transaction.':r.kind==='pack'?'Entered together in the first trading minute.':r.kind==='distributor'?'Received this token from the same sender.':'Documented transfers connect these current snapshot holders. This does not establish common ownership or coordinated intent.'});
 }
 const edges=[...byPair.values()].sort((a,b)=>a.id.localeCompare(b.id));
 const adjacency=new Map<string,Set<string>>();
 for(const e of edges)for(const [a,b] of [[e.from,e.to],[e.to,e.from]]){const neighbors=adjacency.get(a)||new Set<string>();neighbors.add(b);adjacency.set(a,neighbors);}
 const seen=new Set<string>();let documentedGroups=0;
 for(const start of adjacency.keys()){
  if(seen.has(start))continue;documentedGroups++;const pending=[start];
  while(pending.length){const address=pending.pop()!;if(seen.has(address))continue;seen.add(address);pending.push(...(adjacency.get(address)||[]));}
 }
 return {nodes,edges,total:sorted.length,excludedInfrastructure:top?top.infrastructure.length+top.contracts.length:scope.infrastructure.length,shown:nodes.length,truncated:sorted.length>nodes.length,documentedGroups,walletGroups:nodes.length-adjacency.size+documentedGroups};
}
