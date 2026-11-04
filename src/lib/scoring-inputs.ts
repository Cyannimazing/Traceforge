import type {Evidence,InvestigationReport} from './investigation-types';
import type {WalletActivitySnapshot} from './wallet-activity';
import type {SolanaTokenAccount} from './solana-public';
import {holderScope} from './holder-scope';
import {isSupportedEvmPoolFactory} from './evm-pool-reserves';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {computeRiskMetrics} from './risk-metrics';
import {clockReferenceTime} from './evidence-clock';

export type ScoringFactorId='swarm'|'fresh'|'insiders'|'concentration'|'snipers'|'dev';
export type FactorMeasurement={id:ScoringFactorId;value:number|null;lower:number;upper:number;evidenceIds:string[];detail:string};
export type ExposureScope={addresses:readonly string[];denominator:number};
const ids:ScoringFactorId[]=['swarm','fresh','insiders','concentration','snipers','dev'];
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const unique=(values:string[])=>[...new Set(values)];
const unknown=(id:ScoringFactorId,detail:string):FactorMeasurement=>({id,value:null,lower:0,upper:1,evidenceIds:[],detail});
const bounded=(id:ScoringFactorId,lower:number,upper:number,evidenceIds:string[],detail:string):FactorMeasurement=>{
 lower=clamp(lower);upper=Math.max(lower,clamp(upper));
 const exact=Math.abs(upper-lower)<1e-12;
 // Canonicalize machine-precision dust so the downstream exact-value contract
 // (value === lower === upper) remains true. Material unknowns retain bounds.
 if(exact)upper=lower;
 return {id,value:exact?lower:null,lower,upper,evidenceIds:unique(evidenceIds),detail};
};

/** Evidence fractions and mathematical scope bounds only. No scoring curves,
 * inferred ownership, missing-data defaults or calibrated probabilities. */
export function buildScoringInputs(report:InvestigationReport,options:{exposureScope?:ExposureScope}={}):FactorMeasurement[]{
 const result=new Map(ids.map(id=>[id,unknown(id,'Required independent evidence is unavailable; absence is not a zero-risk measurement.')]));
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase();
 const reference=clockReferenceTime(report.investigation.coverage.clock,Date.parse(report.investigation.coverage.fetchedAt));
 const validDate=(at:string|undefined)=>!!at&&Number.isFinite(reference)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=reference+120_000;
 const snapshotReference=Date.parse(report.fetchedAt);
 const snapshotDate=(at:string|undefined)=>!!at&&Number.isFinite(snapshotReference)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=snapshotReference+120_000;
 const freshDate=(at:string|undefined)=>snapshotDate(at)&&Date.parse(at!)>=snapshotReference-600_000;
 const evidence=new Map(report.investigation.evidence.filter(e=>e.attribution!=='provider-reported'&&e.source.trim()&&(e.kind==='holding'||e.kind==='label'?snapshotDate(e.timestamp):validDate(e.timestamp))).map(e=>[e.id,e]));
 const metrics=computeRiskMetrics(report);
 if(report.providerAnalysis||metrics.metrics.find(m=>m.id==='largest-holder-supply')?.value==null)return ids.map(id=>result.get(id)!);
 const sourceNames=report.chain==='solana'?['Solana RPC Holders']:['Blockscout Holders','GoPlus Security','BSC RPC finalized holder balances','EVM RPC holder balances'];
 const snapshotSource=report.sources.some(s=>sourceNames.includes(s.name)&&s.status==='available'&&snapshotDate(s.fetchedAt));
 const wallets=new Map(report.investigation.wallets.map(w=>[normalize(w.address),w]));
 const qualifiedHolders=report.holders.filter(h=>snapshotSource||wallets.get(normalize(h.address))?.evidenceIds.some(id=>{const e=evidence.get(id);return e?.kind==='holding'&&(!e.token||normalize(e.token)===normalize(report.token));}));
 const qualified={...report,holders:qualifiedHolders,investigation:{...report.investigation,evidence:[...evidence.values()]}};
 const scope=holderScope(qualified),graph=buildCurrentHolderGraph(qualified,{limit:Math.max(100,qualifiedHolders.length)});
 const shares=new Map(scope.holders.map(h=>[normalize(h.address),h.share]));
 if(!shares.size)return ids.map(id=>result.get(id)!);
 const infraShare=scope.infrastructure.reduce((sum,h)=>sum+h.share,0),denominator=100-infraShare;
 if(denominator<=0)return ids.map(id=>result.get(id)!);
 const missingShare=Math.max(0,100-scope.allSnapshot.reduce((sum,h)=>sum+h.share,0));
 const share=(addresses:Iterable<string>)=>unique([...addresses]).reduce((sum,a)=>sum+(shares.get(normalize(a))||0),0)/denominator;
 const complete=report.investigation.coverage.status==='complete'&&report.investigation.coverage.launchVerified&&validDate(report.investigation.coverage.earliestTradeAt)&&!report.investigation.coverage.truncated;
 const holdingIds=(addresses:Iterable<string>)=>unique([...addresses].flatMap(a=>wallets.get(normalize(a))?.evidenceIds.filter(id=>evidence.get(id)?.kind==='holding')||[]));

 const adjacency=new Map<string,Set<string>>();
 for(const edge of graph.edges)for(const [a,b] of [[edge.from,edge.to],[edge.to,edge.from]]){const neighbors=adjacency.get(a)||new Set<string>();neighbors.add(b);adjacency.set(a,neighbors);}
 const groups:string[][]=[],seen=new Set<string>();
 for(const address of shares.keys()){
  if(seen.has(address))continue;const group:string[]=[],pending=[address];
  while(pending.length){const a=pending.pop()!;if(seen.has(a))continue;seen.add(a);group.push(a);pending.push(...(adjacency.get(a)||[]));}
  groups.push(group);
 }
 groups.sort((a,b)=>share(b)-share(a)||a[0].localeCompare(b[0]));
 const concentrated=groups.slice(0,10).flat(),lowerConcentration=share(concentrated);
 const groupIds=graph.edges.filter(e=>concentrated.includes(e.from)&&concentrated.includes(e.to)).flatMap(e=>e.evidenceIds);
 result.set('concentration',bounded('concentration',lowerConcentration,graph.truncated?1:lowerConcentration+missingShare/denominator,[...holdingIds(concentrated),...groupIds],`Top ten documented current-holder groups, including singletons, hold ${(lowerConcentration*100).toFixed(4)}% of adjusted supply (${(lowerConcentration*denominator).toFixed(4)}% of total supply). The adjusted denominator excludes ${infraShare.toFixed(4)}% measured infrastructure. Connections are not common ownership. The upper bound adds unobserved supply; unidentified relationships can change grouping.`));

 const activity=(report as InvestigationReport&{walletActivity?:WalletActivitySnapshot}).walletActivity;
 if(activity?.source.trim()&&freshDate(activity.observedAt)){
  let uncertain=0;const rows=new Map(activity.wallets.map(w=>[normalize(w.address),w]));
  for(const address of shares.keys()){
   const w=rows.get(address),count=w?.count;
   const countValid=typeof count==='number'&&Number.isSafeInteger(count)&&count>=0;
   const evm=report.chain!=='solana'&&!!activity.blockRef&&w?.basis==='evm-outgoing-count'&&w.exact&&countValid;
   const solana=report.chain==='solana'&&w?.basis==='solana-address-signatures'&&countValid&&count!>10;
   // Outgoing nonce is only a lower bound on lifetime transactions. A low
   // nonce cannot establish freshness even if an older adapter marked it true.
   if(evm){if(!(count!>10&&w!.fresh===false))uncertain++;}
   else if(!(solana&&w!.fresh===false))uncertain++;
  }
  result.set('fresh',bounded('fresh',0,uncertain/shares.size,[],`No current holder is established as lifetime-fresh by these bounded activity probes; ${shares.size-uncertain} of ${shares.size} exceed ten observed transactions and ${uncertain} remain unknown. ${report.chain==='solana'?'At least 11 finalized address signatures rules out the <=10 predicate; short pages do not establish lifetime freshness.':'More than ten outgoing transactions rules out <=10 lifetime transactions. Low outgoing counts omit incoming/internal activity and cannot establish lifetime freshness.'} Source: ${activity.source}, ${activity.observedAt}.`));
 }

 const positive=(e:Evidence)=>typeof e.amount==='number'?Number.isFinite(e.amount)&&e.amount>0:typeof e.amountRaw==='string'&&/^[1-9]\d{0,77}$/.test(e.amountRaw);
 // Conditional point models may count a selected current-balance cohort.
 // Keep the original report's identity, receipt, timing and funding evidence;
 // only the counted recipient holdings and their supplied denominator change.
 // The default strict calculation continues to use the full snapshot.
 const requested=options.exposureScope,selected=requested?new Set(requested.addresses.map(normalize)):null;
 const exposureShares=selected?new Map([...shares].filter(([a])=>selected.has(a))):shares,exposureDenominator=requested?.denominator??denominator;
 const exposureValid=Number.isFinite(exposureDenominator)&&exposureDenominator>0&&exposureDenominator<=100&&(!selected||[...selected].every(a=>shares.has(a)))&&[...exposureShares.values()].reduce((sum,n)=>sum+n,0)<=exposureDenominator+1e-8;
 const exposureShare=(addresses:Iterable<string>)=>unique([...addresses]).reduce((sum,a)=>sum+(exposureShares.get(normalize(a))||0),0)/exposureDenominator;
 const exposureMissing=requested?Math.max(0,exposureDenominator-[...exposureShares.values()].reduce((sum,n)=>sum+n,0))/exposureDenominator:missingShare/denominator;
 const transfers=[...evidence.values()].filter(e=>e.kind==='transfer'&&e.transaction?.trim()&&e.from&&e.to&&normalize(e.from)!==normalize(e.to)&&positive(e));
 const creators=new Set<string>(),creatorProofs:string[]=[];
 for(const [address,w] of wallets){
  if(!w.categories.includes('creator')||w.categorySources?.creator==='swarm')continue;
  const proofs=w.evidenceIds.filter(id=>{const e=evidence.get(id);return e?.kind==='authority'&&e.transaction?.trim()&&normalize(id)===`identity:creator:${address}`;});
  if(proofs.length){creators.add(address);creatorProofs.push(...proofs);}
 }
 const eligibleNative=new Set(report.investigation.relationships.filter(r=>r.kind==='funding'&&r.attribution!=='provider-reported').flatMap(r=>r.evidenceIds.filter(id=>{const e=evidence.get(id);return e?.from&&e.to&&normalize(e.from)===normalize(r.from)&&normalize(e.to)===normalize(r.to);})));
 const native=report.chain==='solana'?['SOL','native']:report.chain==='bsc'?['BNB','native']:['ETH','native'];
 const funded=new Set<string>(),fundedProofs:string[]=[];
 for(const e of transfers){
  if(!creators.has(normalize(e.from!))||!exposureShares.has(normalize(e.to!)))continue;
  const scanned=e.token&&normalize(e.token)===normalize(report.token),nativeFunding=native.includes(e.token||'')&&eligibleNative.has(e.id)&&!(report.chain==='solana'&&e.amount!==undefined&&e.amount<.0001);
  if(scanned||nativeFunding){funded.add(normalize(e.to!));fundedProofs.push(e.id);}
 }
 if(creators.size&&exposureValid){
  const exposure=new Set([...creators].filter(a=>exposureShares.has(a)).concat([...funded])),lower=exposureShare(exposure);
  result.set('dev',bounded('dev',lower,complete?lower+exposureMissing:1,[...creatorProofs,...fundedProofs,...holdingIds(exposure)],`Current creator and directly creator-funded/recipient holdings are counted once${requested?' within the selected exposure cohort':''}. Observed exposure ${(lower*100).toFixed(4)}% of adjusted supply. Transfers do not establish current common control; absent creator balances and unobserved funding remain unknown.`));
 }
 const early=new Set(funded),earlyProofs=[...fundedProofs,...(funded.size?creatorProofs:[])];
 const launch=report.investigation.coverage.launchVerified&&validDate(report.investigation.coverage.earliestTradeAt)?Date.parse(report.investigation.coverage.earliestTradeAt!):null;
 if(launch!==null)for(const e of transfers){if(e.token&&normalize(e.token)===normalize(report.token)&&exposureShares.has(normalize(e.to!))&&Date.parse(e.timestamp)<launch){early.add(normalize(e.to!));earlyProofs.push(e.id);}}
 if(exposureValid&&(early.size||complete&&creators.size)){const lower=exposureShare(early);result.set('insiders',bounded('insiders',lower,complete?lower+exposureMissing:1,[...earlyProofs,...holdingIds(early)],`Union of observed prelaunch token recipients and current creator-funded holders${requested?' within the selected exposure cohort':''}. This measures related exposure, not insider intent or privileged information. Positive partial observations are lower bounds.`));}

 const snipers=new Set<string>(),sniperProofs:string[]=[];
 const pools=report.investigation.coverage.poolTimings||[report.investigation.coverage.poolTiming].filter(p=>!!p);
 for(const event of report.investigation.timeline){
  const address=normalize(event.wallet),w=wallets.get(address),e=evidence.get(event.evidenceId);
  if(event.kind!=='buy'||!exposureShares.has(address)||!w?.categories.includes('sniper')||w.categorySources?.sniper==='swarm'||e?.kind!=='trade'||!e.transaction||!positive(e)||!e.token||normalize(e.token)!==normalize(report.token))continue;
  const when=Date.parse(e.timestamp),inGlobal=launch!==null&&when>=launch&&when<=launch+60_000;
  const inPool=pools.some(p=>p&&p.verified&&p.chain===report.chain&&p.scope==='selected-pool'&&[p.token0,p.token1].some(t=>normalize(t)===normalize(report.token))&&validDate(p.verifiedAt)&&validDate(p.firstSwapAt)&&validDate(p.windowEndAt)&&Date.parse(p.windowEndAt)===Date.parse(p.firstSwapAt)+60_000&&Date.parse(p.through.timestamp)>Date.parse(p.windowEndAt)&&when>=Date.parse(p.firstSwapAt)&&when<=Date.parse(p.windowEndAt)&&p.eligibleTradeIds.some(id=>e.id===id||e.id.startsWith(`trade:${id}:`)));
  const curve=report.investigation.coverage.curveTiming;
  const inCurve=curve?.verified&&curve.scope==='selected-launchpad'&&curve.protocol==='four-meme-v2'&&curve.chain===report.chain&&normalize(curve.token)===normalize(report.token)&&validDate(curve.verifiedAt)&&validDate(curve.firstPurchaseAt)&&validDate(curve.windowEndAt)&&Date.parse(curve.windowEndAt)===Date.parse(curve.firstPurchaseAt)+60_000&&Date.parse(curve.through.timestamp)>Date.parse(curve.windowEndAt)&&when>=Date.parse(curve.firstPurchaseAt)&&when<=Date.parse(curve.windowEndAt)&&curve.eligibleTradeIds.some(id=>e.id.startsWith(`trade:${id}:`))&&e.source===curve.source;
  if(inGlobal||inPool||inCurve){snipers.add(address);sniperProofs.push(e.id);}
 }
 if(exposureValid&&(snipers.size||complete)){const lower=exposureShare(snipers);result.set('snipers',bounded('snipers',lower,complete?lower+exposureMissing:1,[...sniperProofs,...holdingIds(snipers)],`Current balances of wallets with transaction-backed buys in verified first-minute windows${requested?' within the selected exposure cohort':''}. Selected-pool and launchpad windows are not token-wide launch history; timing alone does not prove automation. Positive partial classifications are lower bounds.`));}

 const pool=report.poolReserves?.snapshot;
 const supported=pool&&[pool.base,pool.quote].every(t=>t.mintExtensions.every(e=>['metadataPointer','tokenMetadata'].includes(e))&&t.vaultExtensions.every(e=>e==='immutableOwner'));
 const raw=(n:string)=>/^\d{1,78}$/.test(n)?BigInt(n):null;
 if(report.chain==='solana'&&report.poolReserves?.status==='verified'&&pool&&pool.protocol==='pumpswap'&&pool.constantProductEligible&&supported&&pool.source.trim()&&pool.evidenceId&&freshDate(pool.observedAt)&&pool.commitment==='finalized'&&normalize(pool.base.mint)===normalize(report.token)&&(!report.market?.pairAddress||normalize(report.market.pairAddress)===normalize(pool.pool))){
  const largest=groups[0],owners=new Set(largest),accountRows=new Map<string,SolanaTokenAccount>();let conflict=false;
  for(const account of report.solana?.tokenAccounts||[]){
   if(!owners.has(normalize(account.owner))||normalize(account.mint)!==normalize(report.token))continue;
   if(!freshDate(account.timestamp)||account.decimals!==pool.base.decimals||raw(account.amountRaw)===null){conflict=true;continue;}
   const old=accountRows.get(account.address);if(old&&(old.amountRaw!==account.amountRaw||old.owner!==account.owner))conflict=true;
   accountRows.set(account.address,account);
  }
  const knownOwners=new Set([...accountRows.values()].map(a=>normalize(a.owner))),x=raw(pool.base.amountRaw),quote=raw(pool.effectiveQuoteAmountRaw),q=[...accountRows.values()].reduce((n,a)=>n+BigInt(a.amountRaw),0n);
  const rawShare=typeof report.totalSupply==='number'&&report.totalSupply>0?Number(q)/10**pool.base.decimals/report.totalSupply*100:NaN;
  const observedShare=largest.reduce((sum,a)=>sum+(shares.get(a)||0),0);
  if(!Number.isFinite(rawShare)||Math.abs(rawShare-observedShare)>1e-6)conflict=true;
  if(!conflict&&largest.every(a=>knownOwners.has(a))&&x!==null&&x>0n&&quote!==null&&quote>0n&&q>0n){
   const den=(x+q)*(x+q),impact=Number((den-x*x)*1_000_000_000_000n/den)/1_000_000_000_000;
   const links=graph.edges.filter(e=>owners.has(e.from)&&owners.has(e.to)).flatMap(e=>e.evidenceIds);
   result.set('swarm',bounded('swarm',impact,impact,[pool.evidenceId,...holdingIds(largest),...links],`Conditional zero-fee terminal-price scenario for the largest documented current-holder group (${largest.length} addresses): sell ${q} raw token units into ${x} raw base reserves at ${pool.blockRef}, ${pool.observedAt}. Formula 1 - x²/(x+q)². Fees are unverified; no execution quote, routing, other pools, arbitrage or unidentified ownership is modeled.`));
  }
 }
 const evm=report.evmPoolReserves?.snapshot;
 const evmBlockCurrent=evm&&snapshotDate(evm.blockTimestamp)&&Date.parse(evm.blockTimestamp)>=snapshotReference-900_000;
 if(report.chain!=='solana'&&report.evmPoolReserves?.status==='verified'&&evm&&evm.chain===report.chain&&evm.finality==='finalized'&&evmBlockCurrent&&evm.constantProductEligible&&isSupportedEvmPoolFactory(evm.chain,evm.factory)&&freshDate(evm.observedAt)&&normalize(evm.token)===normalize(report.token)&&normalize(evm.base.address)===normalize(report.token)&&normalize(evm.quote.address)!==normalize(report.token)&&report.market?.pairAddress&&normalize(evm.pool)===normalize(report.market.pairAddress)&&evm.blockRef&&Number.isSafeInteger(evm.blockNumber)&&evm.blockNumber>=0&&/^0x[\da-f]{64}$/i.test(evm.blockHash)&&evm.source.trim()&&report.sources.some(s=>s.name===evm.source&&s.status==='available'&&freshDate(s.fetchedAt))&&evidence.get(evm.evidenceId)?.source===evm.source){
  const x=raw(evm.base.reserveRaw),quote=raw(evm.quote.reserveRaw),supply=raw(evm.totalSupplyRaw),largest=groups[0],owners=new Set(largest),balances=new Map<string,bigint>();let conflict=false;
  for(const row of evm.holders){
   const address=normalize(row.address);if(!owners.has(address))continue;
   const amount=row.status==='observed'&&row.balanceRaw!==undefined?raw(row.balanceRaw):null;
   if(amount===null||amount<0n||(supply!==null&&amount>supply)||(balances.has(address)&&balances.get(address)!==amount)){conflict=true;continue;}balances.set(address,amount);
  }
  const q=[...balances.values()].reduce((n,a)=>n+a,0n),observedShare=largest.reduce((sum,a)=>sum+(shares.get(a)||0),0);
  const rawShare=supply!==null&&supply>0n?Number(q)/Number(supply)*100:NaN;
  const scaledSupply=supply!==null&&Number.isInteger(evm.base.decimals)&&evm.base.decimals>=0&&evm.base.decimals<=255?Number(supply)/10**evm.base.decimals:NaN;
  if(!Number.isFinite(rawShare)||Math.abs(rawShare-observedShare)>1e-6||!Number.isFinite(scaledSupply)||typeof report.totalSupply!=='number'||report.totalSupply<=0||Math.abs(scaledSupply/report.totalSupply-1)>1e-9)conflict=true;
  if(!conflict&&largest.every(address=>balances.has(address))&&x!==null&&x>0n&&quote!==null&&quote>0n&&q>0n&&supply!==null&&q+x<=supply&&evm.base.balanceRaw===evm.base.reserveRaw&&evm.quote.balanceRaw===evm.quote.reserveRaw){
   const den=(x+q)*(x+q),impact=Number((den-x*x)*1_000_000_000_000n/den)/1_000_000_000_000;
   const links=graph.edges.filter(e=>owners.has(e.from)&&owners.has(e.to)).flatMap(e=>e.evidenceIds);
   result.set('swarm',bounded('swarm',impact,impact,[evm.evidenceId,...holdingIds(largest),...links],`Hypothetical zero-fee constant-product terminal-price scenario for the largest documented current-holder group (${largest.length} addresses). Same-finalized-block balance ${q} raw token units against ${x} raw token reserves at ${evm.blockRef}, ${evm.observedAt}. Formula 1 - x²/(x+q)². Token transfers, sellability, fees, routing and arbitrage are not established by reserve reads. This is a risk scenario, not an executable sale quote.`));
  }
 }
 return ids.map(id=>result.get(id)!);
}
