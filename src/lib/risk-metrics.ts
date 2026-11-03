import type {Evidence,InvestigationReport,InvestigatedWallet} from './investigation-types';

export type RiskMetric={id:string;label:string;status:'observed'|'modeled'|'unknown';value:number|null;unit:'percent';basis:string;scope:string;evidenceIds:string[];sourceRefs:string[];wallets:string[];limitations:string[];range?:{lower:number;upper:number}};
export type ConstantProductScenario={kind:'constant-product';pool:string;token:string;tokenReserveRaw:string;quoteReserveRaw:string;sellAmountRaw:string;feeBps:number;source:string;timestamp:string;blockRef:string;evidenceIds:string[];sellEvidenceIds:string[]};
export type RiskMetrics={version:'evidence-metrics-v1';metrics:RiskMetric[];gaps:string[]};
const validDate=(v:string)=>Number.isFinite(Date.parse(v));
const independent=(e:Evidence)=>e.attribution!=='provider-reported'&&!!e.source&&validDate(e.timestamp);
const unique=(values:string[])=>[...new Set(values)];
const infraCategories=['pool','exchange','bridge','burn'] as const;
const capped=(v:number)=>Math.min(100,Math.max(0,v));

/** Measurements, not a fitted probability or a policy-derived rating. No score is produced.
 * Share values retain the report's total-supply denominator. Removing only observed
 * infrastructure produces an explicitly adjusted denominator, never verified float.
 */
export function computeRiskMetrics(report:InvestigationReport,options:{poolScenario?:ConstantProductScenario}={}):RiskMetrics{
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
 const evidence=new Map(report.investigation.evidence.filter(independent).map(e=>[e.id,e]));
 const holdingsSources=report.sources.filter(s=>s.status==='available'&&validDate(s.fetchedAt||'')&&['Blockscout Holders','GoPlus Security','Solana RPC Holders'].includes(s.name));
 const holdings=new Map<string,{wallet:InvestigatedWallet;share:number;ids:string[];sources:string[]}>();
 let invalid=false;
 const wallets=new Map(report.investigation.wallets.map(w=>[normalize(w.address),w]));
 // Use actual snapshot holder rows, not graph nodes whose amounts might be trade flows.
 for(const h of report.holders){
  if(!Number.isFinite(h.share)||h.share<0||h.share>100)continue;
  const address=normalize(h.address),wallet=wallets.get(address);if(!wallet)continue;
  const proofs=wallet.evidenceIds.flatMap(id=>{const e=evidence.get(id);return e?.kind==='holding'?[e]:[];});
  if(!proofs.length&&!holdingsSources.length)continue;
  const existing=holdings.get(address);if(existing&&Math.abs(existing.share-h.share)>1e-8){invalid=true;continue;}
  holdings.set(address,{wallet,share:h.share,ids:proofs.map(e=>e.id),sources:unique([...proofs.map(e=>e.source),...holdingsSources.map(s=>s.name)])});
 }
 const all=[...holdings.values()],observed=all.reduce((sum,h)=>sum+h.share,0);
 invalid=invalid||observed>100.000001;
 const available=!report.providerAnalysis&&!invalid&&all.length>0;
 const infrastructure=new Set<string>(),infrastructureIds:string[]=[];
 for(const [a,wallet] of wallets){
  const categories=infraCategories.filter(c=>wallet.categories.includes(c)&&wallet.categorySources?.[c]!=='swarm');
  if(!categories.length)continue;
  const proofs=wallet.evidenceIds.filter(id=>evidence.get(id)?.kind==='label');
  if(proofs.length){infrastructure.add(a);infrastructureIds.push(...proofs);}
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
  metric.wallets=rows.map(h=>h.wallet.address);metric.evidenceIds=unique([...rows.flatMap(h=>h.ids),...extraIds,...(float?infrastructureIds:[])]);metric.sourceRefs=unique(rows.flatMap(h=>h.sources));
  if(float)metric.limitations.push(`${infraShare.toFixed(6)}% of reported supply was excluded using observed infrastructure labels. Unobserved infrastructure means the true float denominator is unknown.`);
  metric.limitations.push('Range is a mathematical missing-balance bound, not a confidence interval. It assumes reported shares use one coherent supply denominator.');metrics.push(metric);
 }
 measure('largest-holder-supply','Largest observed non-infrastructure holder',participants.slice(0,1));
 measure('top10-holder-supply','Ten largest observed non-infrastructure holders',participants.slice(0,10));
 measure('largest-holder-adjusted-float','Largest holder / adjusted supply',participants.slice(0,1),[],true);
 measure('top10-holder-adjusted-float','Top ten / adjusted supply',participants.slice(0,10),[],true);
 const creatorIds:string[]=[];
 const creators=participants.filter(h=>{
  if(!h.wallet.categories.includes('creator')||h.wallet.categorySources?.creator==='swarm')return false;
  const ids=h.wallet.evidenceIds.filter(id=>{const e=evidence.get(id);return e?.kind==='authority'&&!!e.transaction;});
  creatorIds.push(...ids);return ids.length>0;
 });
 measure('creator-supply','Observed creator holdings',creators,creatorIds);
 measure('creator-adjusted-float','Observed creator / adjusted supply',creators,creatorIds,true);

 // Concrete transfers can document a connection. They never establish beneficial
 // ownership or coordination. Common infrastructure funders are excluded.
 const adjacency=new Map<string,Set<string>>(),linkIds=new Map<string,string[]>();
 for(const link of report.investigation.relationships){
  if(link.attribution==='provider-reported'||link.kind==='provider-reported')continue;
  const from=normalize(link.from),to=normalize(link.to);
  if(from===to||!holdings.has(from)||!holdings.has(to)||infrastructure.has(from)||infrastructure.has(to))continue;
  const proofs=link.evidenceIds.map(id=>evidence.get(id)).filter((e):e is Evidence=>!!e&&e.kind==='transfer'&&!!e.transaction&&!!e.from&&!!e.to);
  const direct=proofs.some(e=>normalize(e.from!)===from&&normalize(e.to!)===to||normalize(e.from!)===to&&normalize(e.to!)===from);
  const shared=link.kind==='shared-funder'&&proofs.some(a=>normalize(a.to!)===from&&proofs.some(b=>b.id!==a.id&&normalize(b.to!)===to&&normalize(a.from!)===normalize(b.from!)&&!infrastructure.has(normalize(a.from!))));
  if(!direct&&!shared)continue;
  for(const [a,b] of [[from,to],[to,from]]){const set=adjacency.get(a)||new Set<string>();set.add(b);adjacency.set(a,set);linkIds.set(a,unique([...(linkIds.get(a)||[]),...proofs.map(e=>e.id)]));}
 }
 const visited=new Set<string>();let largest:typeof all=[],largestIds:string[]=[];
 for(const start of adjacency.keys()){
  if(visited.has(start))continue;const queue=[start],members:string[]=[];
  while(queue.length){const a=queue.pop()!;if(visited.has(a))continue;visited.add(a);members.push(a);queue.push(...(adjacency.get(a)||[]));}
  const rows=members.map(a=>holdings.get(a)!);if(rows.reduce((n,h)=>n+h.share,0)>largest.reduce((n,h)=>n+h.share,0)){largest=rows;largestIds=members.flatMap(a=>linkIds.get(a)||[]);}
 }
 measure('linked-holder-supply','Largest documented connected holder group',largest,largestIds);
 metrics.at(-1)!.limitations.push('Transfers or a shared funder document relationships, not common ownership or coordinated intent. Exchanges, refunds and ordinary payments are alternative explanations. A missing observed group is unknown, not zero connected exposure.');

 const impact=create('sell-impact','Modeled terminal pool price impact','Constant-product pool spot-price change');impact.scope='One explicitly supplied pool snapshot and sell-size scenario';
 const p=options.poolScenario;
 const raw=(v:string)=>/^\d{1,78}$/.test(v)?BigInt(v):null;
 if(!report.providerAnalysis&&p?.kind==='constant-product'&&normalize(p.token)===normalize(report.token)&&p.pool&&p.source&&p.blockRef&&validDate(p.timestamp)&&p.evidenceIds.length&&p.sellEvidenceIds.length&&Number.isInteger(p.feeBps)&&p.feeBps>=0&&p.feeBps<10000){
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
