import type {Evidence,InvestigationReport} from './investigation-types';
import type {TrustRating} from './trust-rating';
import type {ObservedDecision,ObservedFactor} from './observed-decision';
import {agentEvidenceContext} from './agent-evidence-context';
import {holderScope} from './holder-scope';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {buildScoringInputs} from './scoring-inputs';
import {scoreFactors} from './reconstructed-score';
import {decisionModel} from './decision-model';
import {clockReferenceTime} from './evidence-clock';
import {topHolderCohort} from './top-holder-cohort';

const norm=(s:string)=>s.toLowerCase(),positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const raw=(v:unknown)=>typeof v==='string'&&/^\d{1,78}$/.test(v)&&BigInt(v)<2n**256n?BigInt(v):null;
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);
const HOLDINGS='EVM RPC holder balances',PONS='Pons factory launch record',PONS_HISTORY='Robinhood Pons Transfer candidate history';

/** A counterfactual point model of the returned Robinhood sample. It never
 * changes strict evidence bounds, lifetime-fresh labels or launch completeness.
 * USD liquidity supplies an explicitly balanced nominal constant-product pool;
 * it is not a read of concentrated Uniswap V4 reserves or an executable quote. */
export function robinhoodObservedDecision(report:InvestigationReport,strict:TrustRating):ObservedDecision|null{
 if(report.chain!=='robinhood'||report.providerAnalysis||strict.coreVerified!==true)return null;
 const context=agentEvidenceContext(report);if(context.guard.missingCore)return null;
 const captured=Date.parse(report.fetchedAt),historyClock=clockReferenceTime(report.investigation.coverage.clock,Date.parse(report.investigation.coverage.fetchedAt));
 const dated=(at:string|undefined,clock=captured)=>!!at&&Number.isFinite(clock)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=clock+120000;
 const fresh=(at:string|undefined)=>dated(at)&&Date.parse(at!)>=captured-600000;
 const source=(name:string)=>report.sources.some(s=>s.name===name&&s.status==='available'&&fresh(s.fetchedAt));
 if(!source(HOLDINGS)||!source(PONS)||!source('DEX Screener'))return null;
 const evidence=new Map(report.investigation.evidence.filter(e=>e.attribution!=='provider-reported'&&!!e.source.trim()&&dated(e.timestamp,e.kind==='holding'||e.kind==='label'?captured:historyClock)).map(e=>[e.id,e]));
 const returnedTrades=[...evidence.values()].filter(e=>e.kind==='trade'&&hash(e.transaction)&&norm(e.token||'')===norm(report.token)&&e.source.startsWith('GeckoTerminal public pool trades')&&source('GeckoTerminal trades')&&(positive(e.amount)||(raw(e.amountRaw)!==null&&raw(e.amountRaw)!>0n)));
 if(!returnedTrades.length)return null;
 const initiators=(report.identities||[]).filter(i=>{
  const e=evidence.get(`identity:creator:${norm(i.address)}`);
  if(i.role!=='creator'||!/^0x[0-9a-f]{40}$/i.test(i.address)||e?.kind!=='authority'||e.source!==i.source||e.timestamp!==i.timestamp)return false;
  if(i.source===PONS)return fresh(i.timestamp)&&i.timestampBasis==='local-observation';
  // The receipt-backed adapter upgrades this same identity to its immutable
  // creation event. Freshness applies to the retrieval source, not launch time.
  return i.source===PONS_HISTORY&&source(PONS_HISTORY)&&i.timestampBasis==='provider-event'&&dated(i.timestamp,historyClock)&&hash(i.transaction)&&hash(e.transaction)&&norm(i.transaction!)===norm(e.transaction!);
 });
 const creators=new Set(initiators.map(i=>norm(i.address)));if(creators.size!==1)return null;
 const supply=report.totalSupply;if(!positive(supply))return null;
 const scope=holderScope(report),cohort=topHolderCohort(report),graph=buildCurrentHolderGraph(report,{limit:10000});if(!cohort.holders.length||graph.truncated)return null;
 let decimals:number|undefined;const amounts=new Map<string,number>();
 function balance(address:string):number|null{
  const key=norm(address),e=evidence.get(`holding:evm:${key}`),n=raw(e?.amountRaw);
  if(!e||e.kind!=='holding'||e.source!==HOLDINGS||!fresh(e.timestamp)||!report.sources.some(s=>s.name===HOLDINGS&&s.status==='available'&&s.fetchedAt===e.timestamp)||norm(e.to||'')!==key||norm(e.token||'')!==norm(report.token)||n===null||!Number.isInteger(e.decimals)||e.decimals!<0||e.decimals!>255)return null;
  if(decimals!==undefined&&decimals!==e.decimals)return null;decimals=e.decimals;
  const amount=Number(n)/10**e.decimals!;return Number.isFinite(amount)&&amount>=0?amount:null;
 }
 for(const h of scope.allSnapshot){const amount=balance(h.address);if(amount===null||!positive(h.share)||Math.abs(amount/supply*100-h.share)>1e-6)return null;amounts.set(norm(h.address),amount);}
 // Direct zero is accepted only when explicitly read, never inferred from a
 // missing holder row. A nonzero creator outside the current snapshot conflicts.
 for(const address of creators){const amount=balance(address);if(amount===null||amount>0&&!amounts.has(address))return null;}
 const denominator=cohort.denominator;if(!positive(denominator))return null;
 const shares=new Map(cohort.holders.map(h=>[norm(h.address),h.share]));
 const adjacency=new Map<string,Set<string>>();for(const edge of graph.edges)for(const [a,b]of [[edge.from,edge.to],[edge.to,edge.from]]){const set=adjacency.get(norm(a))||new Set<string>();set.add(norm(b));adjacency.set(norm(a),set);}
 const groups:string[][]=[],seen=new Set<string>();for(const a of shares.keys()){if(seen.has(a))continue;const group:string[]=[],queue=[a];while(queue.length){const item=queue.pop()!;if(seen.has(item)||!shares.has(item))continue;seen.add(item);group.push(item);queue.push(...(adjacency.get(item)||[]));}groups.push(group);}
 const share=(addresses:Iterable<string>)=>[...new Set(addresses)].reduce((sum,a)=>sum+(shares.get(norm(a))||0),0)/denominator;
 groups.sort((a,b)=>share(b)-share(a)||a[0].localeCompare(b[0]));const largest=groups[0],q=largest.reduce((sum,a)=>sum+amounts.get(a)!,0);
 const market=report.market,price=Number(market?.priceUsd),liquidity=market?.liquidity?.usd,quoteAddress=(market?.quoteToken as {address?:unknown}|undefined)?.address,reportedBase=(market?.liquidity as {base?:unknown}|undefined)?.base;
 if(!market||market.chainId!=='robinhood'||norm(market.baseToken.address)!==norm(report.token)||typeof quoteAddress==='string'&&norm(quoteAddress)===norm(report.token)||!/^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(market.pairAddress||'')||!positive(price)||!positive(liquidity)||!positive(q))return null;
 if(reportedBase!==undefined&&!positive(reportedBase))return null;
 const x=liquidity/(2*price),impact=1-(x/(x+q))**2;if(!positive(x)||!Number.isFinite(impact)||impact<0||impact>1)return null;
 const activity=report.walletActivity;if(!activity||activity.source!=='EVM RPC wallet activity'||!source(activity.source)||!fresh(activity.observedAt)||activity.finality!=='finalized'||!activity.blockRef?.trim()||!dated(activity.blockTimestamp))return null;
 const rows=new Map(activity.wallets.map(w=>[norm(w.address),w])),eligible=cohort.holders.filter(h=>!creators.has(norm(h.address)));
 const readable=eligible.filter(h=>{const w=rows.get(norm(h.address));return w&&['evm-outgoing-count','evm-account-nonce'].includes(w.basis)&&w.exact===true&&fresh(w.observedAt||activity.observedAt)&&Number.isSafeInteger(w.count)&&w.count!>=0;});
 const candidateAddresses=new Set(cohort.activityCandidates.map(h=>norm(h.address))),selected=readable.filter(h=>candidateAddresses.has(norm(h.address)));if(!selected.length)return null;
 const low=selected.filter(h=>rows.get(norm(h.address))!.count!<=10).length,unread=eligible.length-readable.length,outside=readable.length-selected.length;
 const transfers=[...evidence.values()].filter(e=>e.kind==='transfer'&&hash(e.transaction)&&!!e.from&&!!e.to&&(positive(e.amount)||(raw(e.amountRaw)!==null&&raw(e.amountRaw)!>0n)));
 const nativeProofs=new Set(report.investigation.relationships.filter(r=>r.kind==='funding'&&r.attribution!=='provider-reported').flatMap(r=>r.evidenceIds.filter(id=>{const e=evidence.get(id);return e?.from&&e.to&&norm(e.from)===norm(r.from)&&norm(e.to)===norm(r.to);})));
 const funded=new Set(transfers.filter(e=>creators.has(norm(e.from!))&&shares.has(norm(e.to!))&&(norm(e.token||'')===norm(report.token)||['ETH','native'].includes(e.token||'')&&nativeProofs.has(e.id))).map(e=>norm(e.to!)));
 const early=new Set(funded),launch=report.investigation.coverage.launchVerified&&dated(report.investigation.coverage.earliestTradeAt,historyClock)?Date.parse(report.investigation.coverage.earliestTradeAt!):null;
 if(launch!==null)for(const e of transfers)if(norm(e.token||'')===norm(report.token)&&shares.has(norm(e.to!))&&Date.parse(e.timestamp)<launch)early.add(norm(e.to!));
 const sniper=buildScoringInputs(report,{exposureScope:{addresses:cohort.holders.map(h=>h.address),denominator}}).find(f=>f.id==='snipers')!.lower,dev=share([...creators,...funded]),insiders=share(early),concentration=share(groups.slice(0,10).flat());
 const exposure=(id:'insiders'|'snipers'|'dev',value:number,detail:string):ObservedFactor=>({id,value,basis:value>0?'observed-exposure':'observed-none',detail:`${detail} ${value===0?'No matches were recorded in the returned scope; this is not verified zero lifetime exposure. ':''}Unread transfers, earlier venues and other controlled wallets remain outside this point model.`});
 const factors:ObservedFactor[]=[
  {id:'swarm',value:impact,basis:'conditional-scenario',detail:`Nominal balanced pool x=L/(2P)=${x} token units from selected DEX liquidity $${liquidity} and price $${price}; largest documented group q=${q} token units. Impact=1-(x/(x+q))². Assumes equal-value sides, zero fees, successful sales and constant-product updates. This is not an executable V4 quote or verified V4 reserve measurement; shared manager custody is not used as reserves.`},
  {id:'fresh',value:low/selected.length,basis:'account-nonce-proxy',detail:`${low}/${selected.length} readable non-creator EOAs among the first ${cohort.activityCandidates.length} selected top holders have account nonce at most ten. Selection precedes unread/creator filtering; later rows never backfill. This low-account-nonce proxy is not verified lifetime freshness: nonces include outgoing transactions and, for EIP-7702 delegated EOAs, authorization increments. Incoming and internal history are omitted. ${unread} unread/contract rows and ${outside} other readable top-holder rows are excluded from this denominator.`},
  exposure('insiders',insiders,'Observed creator-origin recipients and any verified prelaunch token recipients, unioned once.'),
  {id:'concentration',value:concentration,basis:'observed-holdings',detail:`Top ten documented groups among selected top holders divided by ${denominator}% of total supply after subtracting measured top-cohort infrastructure and separately identified code contracts. Code alone does not identify a pool or locker. Unobserved relationships are excluded; connections do not prove common ownership.`},
  exposure('snipers',sniper,'Current holdings with transaction-backed buys in verified first-minute intervals only. Recent sample start is not launch time.'),
  exposure('dev',dev,'Explicitly read direct launch-initiator balances plus documented creator-origin recipient holdings, unioned once. Pons state identifies the initiator, not all beneficially controlled wallets.'),
 ];
 if(factors.some(f=>!Number.isFinite(f.value)||f.value<0||f.value>1))return null;
 const hard=[...(strict.hard||[])],soft=[...(strict.soft||[])],scored=scoreFactors(factors.map(f=>({...f,lower:f.value,upper:f.value,evidenceIds:[]})),{hard,soft});if(scored.score===null)return null;
 // Preserve the strict control audit's unresolved-security state as well as its
 // hard/soft rules. The point's historical assumptions cannot clear a control.
 const security=context.guard.critical?null:strict.judgeInputs?.security??null,judge=decisionModel({score:{lower:scored.score,upper:scored.score},danger:hard.length>0,security,memoryHits:0,dumpImpact:{lower:impact,upper:impact},hard});
 return {score:scored.score,scoreBand:scored.decision,judge,factors,impact,largestShare:share(largest),scope:{holderCount:cohort.holders.length,readableFreshWallets:selected.length,unreadFreshWallets:unread+outside,activityProxy:{kind:'low-account-nonce',limit:cohort.activityCandidates.length,readable:selected.length,lowNonce:low,unread,outsideLimit:outside},topHolders:{rawLimit:cohort.rawLimit,rawCount:cohort.rawRanked.length,selectedCount:cohort.holders.length,infrastructureCount:cohort.infrastructure.length,contractCount:cohort.contracts.length,activityLimit:15,floatDenominator:denominator,allAnalyzedCount:scope.holders.length},notes:[
  'Conditional observed-scope point model of the returned sample. Strict evidence bounds remain separate; this score is not a safety probability or a complete audit.',
  `${returnedTrades.length} source-attributed selected-pool trade observations establish a returned activity subset, not complete launch history. No recorded insider/sniper match does not prove absence.`,
  'Low account nonce is not verified lifetime-fresh status; EIP-7702 authorization increments are not transactions sent by the account. Unknown wallets are excluded from that proxy, not assigned favorable counts.',
  'The USD-derived balanced constant-product pool is counterfactual for V4: concentrated ranges, hooks, token taxes, fees, routing and execution are not modeled.',
  'No cross-token group search was performed. This conditional point assumes no additional memory hit, without establishing that none exists.',
  `Top-holder assessment first selects ${cohort.rawLimit} raw balance ranks, then sets aside ${cohort.infrastructure.length} attributed infrastructure and ${cohort.contracts.length} independently code-verified contracts, without backfill. Its float subtracts ${100-denominator}% measured set-aside balances. Every balance and the full strict risk analysis remain in the report. Contract code does not establish a custody role.`,
 ]}};
}
