import {qualifyCrossTokenMemory} from './cross-token-memory';
import type {InvestigationReport} from './investigation-types';
import type {TrustRating} from './trust-rating';
import type {ObservedDecision,ObservedFactor} from './observed-decision';
import {agentEvidenceContext} from './agent-evidence-context';
import {holderScope} from './holder-scope';
import {buildCurrentHolderGraph} from './current-holder-graph';
import {buildScoringInputs} from './scoring-inputs';
import {scoreFactors} from './reconstructed-score';
import {decisionModel} from './decision-model';
import {topHolderCohort} from './top-holder-cohort';
import {TRANSFER_WINDOW_LIMIT} from './transfer-window-types';

const norm=(s:string)=>s.toLowerCase(),positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const raw=(v:unknown)=>typeof v==='string'&&/^\d{1,78}$/.test(v)&&BigInt(v)<2n**256n?BigInt(v):null;
const hash=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);
const HOLDINGS='EVM RPC holder balances';
const CHAINS=new Set(['ethereum','base','bsc','robinhood']);

/** Real-holder point model for every EVM token without a stronger launchpad
 * model. Real holders are the largest independently balance-verified accounts
 * after setting aside attributed infrastructure (pools, exchanges, bridges,
 * burns) and code-proven contracts. It never rewrites strict evidence bounds;
 * unread accounts and launch history outside the transfer window stay unknown. */
export function realHolderDecision(report:InvestigationReport,strict:TrustRating):ObservedDecision|null{
 if(!CHAINS.has(report.chain)||report.providerAnalysis||strict.coreVerified!==true)return null;
 const context=agentEvidenceContext(report);if(context.guard.missingCore)return null;
 const captured=Date.parse(report.fetchedAt);
 const dated=(at:string|undefined)=>!!at&&Number.isFinite(captured)&&Number.isFinite(Date.parse(at))&&Date.parse(at)<=captured+120000;
 const fresh=(at:string|undefined)=>dated(at)&&Date.parse(at!)>=captured-600000;
 const source=(name:string)=>report.sources.some(s=>s.name===name&&s.status==='available'&&fresh(s.fetchedAt));
 if(!source(HOLDINGS)||!source('DEX Screener'))return null;
 const inventory=report.holderEnumeration;
 if(inventory?.kind!=='real-holder-prefix'||inventory.ranked?.verified!==true||!Array.isArray(inventory.ranked.addresses)||!inventory.ranked.addresses.length||inventory.ranked.addresses.length>50)return null;
 const supply=report.totalSupply;if(!positive(supply))return null;
 const scope=holderScope(report),cohort=topHolderCohort(report),graph=buildCurrentHolderGraph(report,{limit:10000});
 if(!cohort.holders.length||graph.truncated)return null;
 // The cohort must be exactly the verified ranking: no provider-only rows.
 const ranked=inventory.ranked.addresses.map(norm);
 if(cohort.rawRanked.length!==ranked.length||cohort.rawRanked.some((h,i)=>norm(h.address)!==ranked[i]))return null;
 const evidence=new Map(report.investigation.evidence.filter(e=>e.attribution!=='provider-reported'&&!!e.source.trim()).map(e=>[e.id,e]));
 let decimals:number|undefined;const amounts=new Map<string,number>();let rankedRaw=0n;
 for(const h of cohort.rawRanked){
  const key=norm(h.address),e=evidence.get(`holding:evm:${key}`),n=raw(e?.amountRaw);
  if(!e||e.kind!=='holding'||e.source!==HOLDINGS||!fresh(e.timestamp)||norm(e.to||'')!==key||norm(e.token||'')!==norm(report.token)||n===null||n<=0n||!Number.isInteger(e.decimals))return null;
  if(decimals!==undefined&&decimals!==e.decimals)return null;decimals=e.decimals;
  const amount=Number(n)/10**e.decimals!;if(!positive(amount)||!positive(h.share)||Math.abs(amount/supply*100-h.share)>1e-6)return null;
  amounts.set(key,amount);rankedRaw+=n;
 }
 if(decimals===undefined||Number(rankedRaw)/10**decimals/supply>1+1e-12)return null;
 // Creators are optional: only receipt-backed or adapter-verified identities count.
 const creators=new Set((report.identities||[]).filter(i=>{const e=evidence.get(`identity:creator:${norm(i.address)}`);return i.role==='creator'&&/^0x[0-9a-f]{40}$/i.test(i.address)&&e?.kind==='authority'&&hash(e.transaction)&&hash(i.transaction);}).map(i=>norm(i.address)));
 const denominator=cohort.denominator;if(!positive(denominator))return null;
 const shares=new Map(cohort.holders.map(h=>[norm(h.address),h.share]));
 const adjacency=new Map<string,Set<string>>();for(const edge of graph.edges)for(const [a,b]of [[edge.from,edge.to],[edge.to,edge.from]]){const set=adjacency.get(norm(a))||new Set<string>();set.add(norm(b));adjacency.set(norm(a),set);}
 const groups:string[][]=[],seen=new Set<string>();for(const a of shares.keys()){if(seen.has(a))continue;const group:string[]=[],queue=[a];while(queue.length){const item=queue.pop()!;if(seen.has(item)||!shares.has(item))continue;seen.add(item);group.push(item);queue.push(...(adjacency.get(item)||[]));}groups.push(group);}
 const share=(addresses:Iterable<string>)=>[...new Set(addresses)].reduce((sum,a)=>sum+(shares.get(norm(a))||0),0)/denominator;
 groups.sort((a,b)=>share(b)-share(a)||a[0].localeCompare(b[0]));const largest=groups[0],q=largest.reduce((sum,a)=>sum+(amounts.get(a)||0),0);
 const market=report.market,price=Number(market?.priceUsd),liquidity=market?.liquidity?.usd,quoteAddress=(market?.quoteToken as {address?:unknown}|undefined)?.address;
 if(!market||market.chainId!==report.chain||norm(market.baseToken.address)!==norm(report.token)||typeof quoteAddress==='string'&&norm(quoteAddress)===norm(report.token)||!positive(price)||!positive(liquidity)||!positive(q))return null;
 const x=liquidity/(2*price),impact=1-(x/(x+q))**2;if(!positive(x)||!Number.isFinite(impact)||impact<0||impact>1)return null;
 const activity=report.walletActivity;if(!activity||activity.source!=='EVM RPC wallet activity'||!source(activity.source)||!fresh(activity.observedAt)||activity.finality!=='finalized'||!activity.blockRef?.trim())return null;
 const rows=new Map(activity.wallets.map(w=>[norm(w.address),w])),eligible=cohort.holders.filter(h=>!creators.has(norm(h.address)));
 const readable=eligible.filter(h=>{const w=rows.get(norm(h.address));return w&&['evm-outgoing-count','evm-account-nonce'].includes(w.basis)&&w.exact===true&&Number.isSafeInteger(w.count)&&w.count!>=0;});
 const candidates=new Set(cohort.activityCandidates.map(h=>norm(h.address))),selected=readable.filter(h=>candidates.has(norm(h.address)));if(!selected.length)return null;
 const low=selected.filter(h=>rows.get(norm(h.address))!.count!<=10).length,unread=eligible.length-readable.length,outside=readable.length-selected.length;
 const transfers=[...evidence.values()].filter(e=>e.kind==='transfer'&&hash(e.transaction)&&!!e.from&&!!e.to&&(positive(e.amount)||(raw(e.amountRaw)??0n)>0n));
 const funded=new Set(transfers.filter(e=>creators.has(norm(e.from!))&&shares.has(norm(e.to!))&&norm(e.token||'')===norm(report.token)).map(e=>norm(e.to!)));
 const early=new Set(funded),launch=report.investigation.coverage.launchVerified&&dated(report.investigation.coverage.earliestTradeAt)?Date.parse(report.investigation.coverage.earliestTradeAt!):null;
 if(launch!==null)for(const e of transfers)if(norm(e.token||'')===norm(report.token)&&shares.has(norm(e.to!))&&Date.parse(e.timestamp)<launch)early.add(norm(e.to!));
 const sniper=buildScoringInputs(report,{exposureScope:{addresses:cohort.holders.map(h=>h.address),denominator}}).find(f=>f.id==='snipers')!.lower;
 const dev=creators.size?share([...creators,...funded]):0,insiders=share(early),concentration=share(groups.slice(0,10).flat());
 const window=report.investigation.coverage.transferWindow;
 const capped=!!window&&(window.status==='capped'||(window.total!==null&&window.total>window.limit));
 const windowNote=capped?` Token too large for a full crawl: activity is limited to the most recent ${window!.limit.toLocaleString('en-US')} transfers.`:'';
 const exposure=(id:'insiders'|'snipers'|'dev',value:number,detail:string):ObservedFactor=>({id,value,basis:value>0?'observed-exposure':'observed-none',detail:`${detail} ${value===0?'No matches were recorded in the returned scope; this is not verified zero lifetime exposure. ':''}Unread transfers, earlier venues and other controlled wallets remain outside this point model.${windowNote}`});
 const factors:ObservedFactor[]=[
  {id:'swarm',value:impact,basis:'conditional-scenario',detail:`Nominal balanced pool x=L/(2P)=${x} token units from selected DEX liquidity $${liquidity} and price $${price}; largest real-holder group q=${q} token units. Impact=1-(x/(x+q))². Assumes equal-value sides, zero fees and constant-product updates; concentrated ranges, routing and other venues are not modeled.`},
  {id:'fresh',value:low/selected.length,basis:'account-nonce-proxy',detail:`${low}/${selected.length} readable real holders among the first ${cohort.activityCandidates.length} have account nonce at most ten. This low-account-nonce proxy is not verified lifetime freshness. ${unread} unread rows and ${outside} other readable real-holder rows are excluded from this denominator.`},
  exposure('insiders',insiders,creators.size?'Documented creator-origin recipients and verified prelaunch recipients among real holders.':'Creator not established; only verified prelaunch recipients among real holders are counted.'),
  {id:'concentration',value:concentration,basis:'observed-holdings',detail:`Top ten documented real-holder groups divided by ${denominator}% of total supply after setting aside measured infrastructure and code-proven contracts. Connections do not prove common ownership; unobserved relationships are excluded.`},
  exposure('snipers',sniper,launch===null?'Launch timing not established for this token (for large or old tokens the launch is outside the transfer window).':'Current real holders with transaction-backed buys in verified first-minute intervals.'),
  exposure('dev',dev,creators.size?'Direct creator balances plus documented creator-origin recipient holdings among real holders.':'Creator not established by receipt-backed evidence; no creator exposure is attributed.'),
 ];
 if(factors.some(f=>!Number.isFinite(f.value)||f.value<0||f.value>1))return null;
 const hard=[...(strict.hard||[])],soft=[...(strict.soft||[])],scored=scoreFactors(factors.map(f=>({...f,lower:f.value,upper:f.value,evidenceIds:[]})),{hard,soft});if(scored.score===null)return null;
 const memory=qualifyCrossTokenMemory(report);
 const security=context.guard.critical?null:strict.judgeInputs?.security??null,judge=decisionModel({score:{lower:scored.score,upper:scored.score},danger:hard.length>0,security,memoryHits:memory.count,dumpImpact:{lower:impact,upper:impact},hard});
 const windowDetail=window?window.detail:'No transfer window was read; real holders come from provider and activity candidates.';
 return {score:scored.score,scoreBand:scored.decision,judge,factors,impact,largestShare:share(largest),scope:{holderCount:cohort.holders.length,readableFreshWallets:selected.length,unreadFreshWallets:unread+outside,activityProxy:{kind:'low-account-nonce',limit:cohort.activityCandidates.length,readable:selected.length,lowNonce:low,unread,outsideLimit:outside},topHolders:{rawLimit:cohort.rawLimit,rawCount:cohort.rawRanked.length,selectedCount:cohort.holders.length,infrastructureCount:cohort.infrastructure.length,contractCount:cohort.contracts.length,activityLimit:15,floatDenominator:denominator,allAnalyzedCount:scope.holders.length},notes:[
  'Real-holder point model of verified current balances. Strict evidence bounds remain separate; this score is not a safety probability or a complete audit.',
  `Real holders: the largest ${cohort.rawRanked.length} verified balances among ${inventory.candidates} nominated accounts (provider holder list${inventory.windowCandidates?`, ${inventory.windowCandidates} transfer-window candidates`:''}, identities and observed activity), after setting aside ${cohort.infrastructure.length} infrastructure and ${cohort.contracts.length} code-proven contracts. Accounts outside the candidate set are unknown, not zero.`,
  capped?`Large token: this verdict uses the most recent ${TRANSFER_WINDOW_LIMIT.toLocaleString('en-US')} transfers. The full history is too large to crawl, so older activity isn't included. ${windowDetail}`:windowDetail,
  'Low account nonce is not verified lifetime-fresh status. Unknown wallets are excluded from that proxy, not assigned favorable counts.',
  `${memory.count} independently qualified prior-token group claim(s) contribute to this calculation. ${memory.notes.join(' ')}`,
 ]}};
}
