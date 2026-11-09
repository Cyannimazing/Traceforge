import type {Evidence,InvestigationReport,InvestigatedWallet} from './investigation-types';
import {holderScope} from './holder-scope';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {clockReferenceTime} from './evidence-clock';

export type RiskMetric={id:string;label:string;status:'observed'|'modeled'|'unknown';value:number|null;unit:'percent';basis:string;scope:string;evidenceIds:string[];sourceRefs:string[];wallets:string[];limitations:string[];range?:{lower:number;upper:number}};
export type ConstantProductScenario={kind:'constant-product';pool:string;token:string;tokenReserveRaw:string;quoteReserveRaw:string;sellAmountRaw:string;feeBps:number;source:string;timestamp:string;blockRef:string;evidenceIds:string[];sellEvidenceIds:string[]};
export type RiskMetrics={version:'evidence-metrics-v1';metrics:RiskMetric[];gaps:string[]};
const unique=(values:string[])=>[...new Set(values)];
const infraCategories=['pool','exchange','bridge','burn'] as const;
const capped=(v:number)=>Math.min(100,Math.max(0,v));

/** Measurements, not a fitted probability or a policy-derived rating. No score is produced.
 * Share values retain the report's total-supply denominator. Removing only observed
 * infrastructure produces an explicitly adjusted denominator, never verified float.
 */
export function computeRiskMetrics(report:InvestigationReport,options:{poolScenario?:ConstantProductScenario}={}):RiskMetrics{
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
 const reference=clockReferenceTime(report.investigation.coverage.clock,Date.parse(report.investigation.coverage.fetchedAt));
 const validDate=(at:string)=>Number.isFinite(reference)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=reference+120_000;
 const snapshotDate=(at:string)=>Number.isFinite(Date.parse(report.fetchedAt))&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=Date.parse(report.fetchedAt)+120_000;
 const independent=(e:Evidence)=>e.attribution!=='provider-reported'&&!!e.source.trim()&&(e.kind==='holding'||e.kind==='label'?snapshotDate(e.timestamp):validDate(e.timestamp));
 const evidence=new Map(report.investigation.evidence.filter(independent).map(e=>[e.id,e]));
 const holderSourceNames=report.chain==='solana'?['Solana RPC Holders']:['Blockscout Holders','GoPlus Security','BSC RPC finalized holder balances','EVM RPC holder balances'];
 const holdingsSources=report.sources.filter(s=>s.status==='available'&&snapshotDate(s.fetchedAt||'')&&holderSourceNames.includes(s.name));
 const holdings=new Map<string,{wallet:InvestigatedWallet;share:number;ids:string[];sources:string[]}>();
 let invalid=false;const snapshotShares=new Map<string,number>();
 const wallets=new Map(report.investigation.wallets.map(w=>[normalize(w.address),w]));
 // Use actual snapshot holder rows, not graph nodes whose amounts might be trade flows.
 for(const h of report.holders){
  if(!h.address.trim()||!Number.isFinite(h.share)||h.share<0||h.share>100){invalid=true;continue;}
  const address=normalize(h.address),prior=snapshotShares.get(address);
  if(prior!==undefined&&Math.abs(prior-h.share)>1e-8){invalid=true;continue;}
  snapshotShares.set(address,h.share);
  const wallet=wallets.get(address)||{address,share:h.share,categories:['unclassified'] as InvestigatedWallet['categories'],evidenceIds:[]};
  const proofs=wallet.evidenceIds.flatMap(id=>{const e=evidence.get(id);return e?.kind==='holding'&&(!e.token||normalize(e.token)===normalize(report.token))?[e]:[];});
  if(!proofs.length&&!holdingsSources.length)continue;
  const existing=holdings.get(address);if(existing&&Math.abs(existing.share-h.share)>1e-8){invalid=true;continue;}
  holdings.set(address,{wallet,share:h.share,ids:proofs.map(e=>e.id),sources:unique([...proofs.map(e=>e.source),...holdingsSources.map(s=>s.name)])});
 }
 const all=[...holdings.values()],observed=all.reduce((sum,h)=>sum+h.share,0);
 invalid=invalid||[...snapshotShares.values()].reduce((sum,share)=>sum+share,0)>100.000001;
 const available=!report.providerAnalysis&&!invalid&&all.length>0;
 const qualifiedReport={...report,sources:report.sources.filter(s=>!s.fetchedAt||snapshotDate(s.fetchedAt)),investigation:{...report.investigation,evidence:[...evidence.values()]}};
 const infrastructure=new Set(holderScope(qualifiedReport).infrastructureAddresses),infrastructureIds:string[]=[];
 for(const [a,wallet] of wallets){
  if(!infrastructure.has(a))continue;
  const categories=infraCategories.filter(c=>wallet.categories.includes(c)&&wallet.categorySources?.[c]!=='swarm');
  if(!categories.length)continue;
  const proofs=wallet.evidenceIds.filter(id=>evidence.get(id)?.kind==='label'&&categories.some(c=>normalize(id)===`label:${a}:${c}`||(c==='pool'&&normalize(id).startsWith(`pool-timing:${a}:`))));
  infrastructureIds.push(...proofs);
 }
 const infraShare=all.filter(h=>infrastructure.has(normalize(h.wallet.address))).reduce((sum,h)=>sum+h.share,0);
 const adjustedDenominator=100-infraShare,unobserved=Math.max(0,100-observed);
 const participants=all.filter(h=>!infrastructure.has(normalize(h.wallet.address))).sort((a,b)=>b.share-a.share||a.wallet.address.localeCompare(b.wallet.address));
 const common=[`Holdings cover ${holdings.size} observed snapshot addresses. Other accounts owned by those wallets and omitted holders can change the result.`, 'An address is not necessarily one person. Services and unidentified infrastructure can remain in the sample.'];
 const metrics:RiskMetric[]=[];
 const create=(id:string,label:string,basis:string):RiskMetric=>({id,label,status:'unknown',value:null,unit:'percent',basis,scope:'Observed holder snapshot only',evidenceIds:[],sourceRefs:[],wallets:[],limitations:[...common]});
 function measure(id:string,label:string,rows:typeof all,extraIds:string[]=[],float=false){
  const metric=create(id,label,float?'Supply excluding observed infrastructure balances (not verified circulating float)':'Reported total token supply');
  if(!available||!rows.length||(float&&adjustedDenominator<=0)){
   metric.limitations.push(report.providerAnalysis?'Imported provider reports do not establish independent measurements.':invalid?'Conflicting holder rows or supply shares invalidate the measurement.':'Required attributed holdings or identities were not observed. Missing data is not zero.');metrics.push(metric);return;
  }
  const sum=rows.reduce((n,h)=>n+h.share,0),den=float?adjustedDenominator:100;
  metric.status='observed';metric.value=capped(float?sum/den*100:sum);metric.range={lower:metric.value,upper:capped(float?(sum+unobserved)/den*100:sum+unobserved)};
  metric.wallets=rows.map(h=>h.wallet.address);metric.evidenceIds=unique([...rows.flatMap(h=>h.ids),...extraIds,...(float?infrastructureIds:[])]);metric.sourceRefs=unique([...rows.flatMap(h=>h.sources),...metric.evidenceIds.flatMap(id=>evidence.has(id)?[evidence.get(id)!.source]:[]),...(float&&report.market?.pairAddress&&infrastructure.has(normalize(report.market.pairAddress))&&qualifiedReport.sources.some(s=>s.name==='DEX Screener'&&s.status==='available'&&validDate(s.fetchedAt||''))?['DEX Screener']:[])]);
  if(float)metric.limitations.push(`${infraShare.toFixed(6)}% of reported supply was excluded using observed infrastructure labels. Unobserved infrastructure means the true float denominator is unknown.`);
  metric.limitations.push('Range is a mathematical missing-balance bound, not a confidence interval. It assumes reported shares use one coherent supply denominator.');metrics.push(metric);
 }
 measure('largest-holder-supply','Largest observed non-infrastructure holder',participants.slice(0,1));
 measure('top10-holder-supply','Ten largest observed non-infrastructure holders',participants.slice(0,10));
 measure('largest-holder-adjusted-float','Largest holder / adjusted supply',participants.slice(0,1),[],true);
 measure('top10-holder-adjusted-float','Top ten real holders / adjusted supply',participants.slice(0,10),[],true);
 const creatorIds:string[]=[],creatorWallets=[...wallets.values()].filter(wallet=>{
  if(!wallet.categories.includes('creator')||wallet.categorySources?.creator==='swarm'||infrastructure.has(normalize(wallet.address)))return false;
  const ids=wallet.evidenceIds.filter(id=>{const e=evidence.get(id);return e?.kind==='authority'&&!!e.transaction?.trim()&&normalize(id)===`identity:creator:${normalize(wallet.address)}`;});creatorIds.push(...ids);return ids.length>0;
 });
 const creators:typeof all=[];
 for(const wallet of creatorWallets){
  const address=normalize(wallet.address),positive=participants.find(h=>normalize(h.wallet.address)===address);if(positive){creators.push(positive);continue;}
  // A measured zero is evidence about this address, not a positive holder row.
  // Require current RPC provenance and exact token/address binding; absence from
  // the holder sample or a provider-only creator claim cannot supply a zero.
  const proof=wallet.evidenceIds.map(id=>evidence.get(id)).find(e=>e?.kind==='holding'&&normalize(e.id)===`holding:evm:${address}`&&e.to&&normalize(e.to)===address&&e.token&&normalize(e.token)===normalize(report.token)&&e.amountRaw==='0'&&Number.isInteger(e.decimals)&&e.decimals!>=0&&e.decimals!<=255&&e.source==='EVM RPC holder balances'&&Date.parse(e.timestamp)>=Date.parse(report.fetchedAt)-600_000&&holdingsSources.some(s=>s.name===e.source&&s.fetchedAt===e.timestamp));
  if(!proof)continue;
  const conflict=[...evidence.values()].some(e=>e.kind==='holding'&&e.to&&normalize(e.to)===address&&e.token&&normalize(e.token)===normalize(report.token)&&Date.parse(e.timestamp)>=Date.parse(proof.timestamp)&&e.amountRaw!==undefined&&/^[0-9]+$/.test(e.amountRaw)&&BigInt(e.amountRaw)>0n);
  if(!conflict)creators.push({wallet,share:0,ids:[proof.id],sources:[proof.source]});
 }
 measure('creator-supply','Observed creator holdings',creators,creatorIds);
 measure('creator-adjusted-float','Observed creator / adjusted supply',creators,creatorIds,true);
 if(creators.length&&creators.length===creatorWallets.length&&creators.every(h=>h.share===0))for(const metric of metrics.slice(-2)){if(metric.value===0){metric.range={lower:0,upper:0};metric.scope='Direct balances of the transaction-backed creator addresses at the stated snapshot';metric.limitations.push('These explicitly read addresses hold zero at this snapshot. Creator-funded wallets and other creator-linked exposure remain unknown; a zero direct balance does not establish zero linked exposure.');}}

 // Concrete transfers can document a connection. They never establish beneficial
 // ownership or coordination. Common infrastructure funders are excluded.
 const graph=buildCurrentHolderGraph({...qualifiedReport,holders:report.holders.filter(h=>holdings.has(normalize(h.address)))},{limit:Math.max(100,holdings.size)});
 const adjacency=new Map<string,Set<string>>(),linkIds=new Map<string,string[]>();
 for(const link of graph.edges){
  const from=normalize(link.from),to=normalize(link.to);
  for(const [a,b] of [[from,to],[to,from]]){const set=adjacency.get(a)||new Set<string>();set.add(b);adjacency.set(a,set);linkIds.set(a,unique([...(linkIds.get(a)||[]),...link.evidenceIds]));}
 }
 const visited=new Set<string>();let largest:typeof all=[],largestIds:string[]=[];
 for(const start of adjacency.keys()){
  if(visited.has(start))continue;const queue=[start],members:string[]=[];
  while(queue.length){const a=queue.pop()!;if(visited.has(a))continue;visited.add(a);members.push(a);queue.push(...(adjacency.get(a)||[]));}
  const rows=members.map(a=>holdings.get(a)!);if(rows.reduce((n,h)=>n+h.share,0)>largest.reduce((n,h)=>n+h.share,0)){largest=rows;largestIds=members.flatMap(a=>linkIds.get(a)||[]);}
 }
 measure('linked-holder-supply','Largest documented connected holder group',largest,largestIds);
 metrics.at(-1)!.limitations.push('Transfers or a shared funder document relationships, not common ownership or coordinated intent. Exchanges, refunds and ordinary payments are alternative explanations. A missing observed group is unknown, not zero connected exposure.');
 if(graph.truncated)metrics.at(-1)!.limitations.push(`Connection projection covers ${graph.shown} of ${graph.total} attributed current holders; additional snapshot addresses were not evaluated for this metric.`);

 const impact=create('sell-impact','Modeled terminal pool price impact','Constant-product pool spot-price change');impact.scope='One explicitly supplied pool snapshot and sell-size scenario';
 const p=options.poolScenario;
 const raw=(v:string)=>/^\d{1,78}$/.test(v)?BigInt(v):null;
 if(!report.providerAnalysis&&p?.kind==='constant-product'&&normalize(p.token)===normalize(report.token)&&p.pool.trim()&&p.source.trim()&&p.blockRef.trim()&&validDate(p.timestamp)&&p.evidenceIds.length&&p.sellEvidenceIds.length&&Number.isInteger(p.feeBps)&&p.feeBps>=0&&p.feeBps<10000){
  const x=raw(p.tokenReserveRaw),y=raw(p.quoteReserveRaw),q=raw(p.sellAmountRaw);
  if(x!==null&&y!==null&&q!==null&&x>0n&&y>0n&&q>0n&&q<=10n*x){
   const effective=q*BigInt(10000-p.feeBps),den=(x+q)*(10000n*x+effective),num=10000n*x*x;
   impact.value=Number((den-num)*100000000000n/den)/1000000000;impact.status='modeled';impact.evidenceIds=unique([...p.evidenceIds,...p.sellEvidenceIds]);impact.sourceRefs=[p.source];impact.wallets=[];
   impact.limitations=[`Reserve snapshot ${p.timestamp}, block/slot ${p.blockRef}. Sell size ${q} raw token units; input fee ${p.feeBps} bps.`, 'Terminal price change uses 1 - x² / ((x + q) × (x + q × (1 - fee))). It is not average execution slippage.', 'Conditional constant-product scenario, not a forecast. No routing, arbitrage, concurrent trades, taxes, transfer hooks or concentrated-liquidity behavior are modeled.'];
  }
 }
 if(impact.value===null)impact.limitations=['Actual attributed token/quote reserve snapshot, invariant type, fee and explicit sell amount are required. USD liquidity is never treated as verified reserves.','Concentrated-liquidity and bonding-curve pools require their own verified models.'];
 metrics.push(impact);
 return {version:'evidence-metrics-v1',metrics,gaps:['These measurements support the separate policy rating; neither is a calibrated safety probability.','Fresh-wallet prevalence requires chain-wide lifetime transaction counts; bounded mint history cannot establish it.','Insider intent cannot be inferred from ownership or timing alone.','Token-wide first-minute sniper float remains unknown without verified launch coverage and complete acquisition attribution.','True circulating float, complete beneficial ownership and all-pool sell impact are not established by this holder sample.']};
}
