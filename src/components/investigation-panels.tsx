"use client";
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Copy, ExternalLink, Pause, Play, ShieldAlert, X } from 'lucide-react';
import { CHAINS, short } from '@/lib/analysis';
import { getDisplayAssessment } from '@/lib/verdict-summary';
import {assessmentLabel,presentationText} from '@/lib/assessment-presentation';
import { findingBreakdown } from '@/lib/finding-breakdown';
import './verdict-details.css';
import ProviderWalletDetails from './provider-wallet-details';
import WalletRoleSummary from './wallet-role-summary';
import {presentWalletRole} from '@/lib/wallet-role-presentation';
import type { InvestigationReport, TimelineEvent } from '@/lib/investigation-types';
export type Selection = { kind:'wallet'|'relationship'|'group'|'finding'; id:string; wallets?:string[]; evidenceIds?:string[] };
export const count = (value:number|null|undefined) => value == null || !Number.isFinite(value) ? 'Unavailable' : value>0&&value<0.01 ? '<0.01' : new Intl.NumberFormat('en-US',{maximumFractionDigits:2,notation:Math.abs(value)>1e6?'compact':'standard'}).format(value);
export const label = (value:string) => value==='authority'?'current owner / authority':value==='sniper'?'possible sniper':value==='fresh'?'fresh wallet':value==='insider'?'possible insider':value==='coordinated-seller'?'related seller':value.replaceAll('-',' ');
const timestamp = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not reported';

function VerdictDetails({report,onSelect}:{report:InvestigationReport;onSelect:(value:Selection)=>void}) {
 const inv=report.investigation, coverage=inv.coverage, provider=report.providerAnalysis;
 const poolTimings=coverage.poolTimings?.length?coverage.poolTimings:coverage.poolTiming?[coverage.poolTiming]:[],poolTiming=poolTimings[0],timingVerified=coverage.launchVerified||!!poolTiming;
 const assessment=getDisplayAssessment(report), status=assessment.status;
 const trades=inv.timeline.filter(e=>e.kind==='buy'||e.kind==='sell');
 const buys=trades.filter(e=>e.kind==='buy'), sells=trades.filter(e=>e.kind==='sell');
 const snipers=inv.wallets.filter(w=>w.categories.includes('sniper'));
 const earlyBuyers=inv.wallets.filter(w=>w.categories.includes('early-buyer'));
 const creators=inv.wallets.filter(w=>w.categories.includes('creator'));
 const authorities=inv.wallets.filter(w=>w.categories.includes('authority'));
 const accumulators=inv.wallets.filter(w=>w.categories.includes('accumulator'));
 const funding=inv.relationships.filter(r=>r.kind==='funding');
 const sharedFunding=inv.findings.filter(f=>f.id.startsWith('funder:'));
 const linked=inv.wallets.filter(w=>w.categories.includes('deployer-linked'));
 const selling=inv.findings.filter(f=>f.id.startsWith('selling:'));
 const reportedSnipers=snipers.filter(wallet=>wallet.categorySources?.sniper==='swarm'), assessedSnipers=snipers.filter(wallet=>wallet.categorySources?.sniper!=='swarm');
 const negativeProviderSnipers=provider&&provider.holders.length>0&&provider.holders.every(holder=>holder.signals.sniper===false);
 const sniperTitle=reportedSnipers.length?`${reportedSnipers.length} provider-reported possible sniper wallet${reportedSnipers.length===1?'':'s'}${assessedSnipers.length?`; ${assessedSnipers.length} additional evidence-assessed`:''}`:assessedSnipers.length?`${assessedSnipers.length} evidence-assessed possible sniper wallets${poolTiming?' in verified pool windows':''}`:negativeProviderSnipers?'0 possible snipers reported in the provider holder sample':!trades.length?'Snipers not assessed - trading history unavailable':!timingVerified?'Snipers not assessed - trading start unverified':snipers.length?`${snipers.length} possible sniper wallet${snipers.length===1?'':'s'}${poolTiming?' in verified pool windows':' observed'}`:`No sniper timing flag${poolTiming?' in verified pool windows':' in sampled trades'}`;
 const shares=report.holders.map(h=>h.share).filter(v=>Number.isFinite(v)&&v>=0&&v<=100).sort((a,b)=>b-a);
 const sampledShare=shares.reduce((sum,value)=>sum+value,0);
 const concentrationKnown=shares.length>0&&sampledShare<=100.01;
 const findingCounts=findingBreakdown(inv.findings),orderedFindings=findingCounts.risks;
 const orderedChecks=[...report.checks].sort((a,b)=>({critical:0,warning:1,unknown:2,clear:3}[a.status]-{critical:0,warning:1,unknown:2,clear:3}[b.status]));
 return <div className="verdict-details">
  <section className={`verdict verdict-${status}`} aria-labelledby="verdict-detail-title">
   <span className="verdict-state">{report.fixture?'Example assessment':'Token assessment'}</span>
   <h3 id="verdict-detail-title">{provider?assessment.title:assessmentLabel(status)}</h3>
   <p>{presentationText(assessment.summary,provider?'provider':'independent')}</p>
   <p className="verdict-rule">Assessment uses reported critical flags, then warning signals, then coverage limits. It is not a risk score or safety guarantee.</p>{provider&&<details className="verdict-disclosure"><summary>SwarmEngine scoring details</summary><p>These component values and limits are supplied by SwarmEngine. They are not probabilities or independently calibrated TraceForge scores.</p>{!!Object.keys(provider.scoreParts||{}).length&&<dl className="verdict-facts">{Object.entries(provider.scoreParts||{}).map(([key,value])=><div key={key}><dt>{label(key.replaceAll('_','-'))}</dt><dd>{count(value)}</dd></div>)}</dl>}{!!provider.gates.length&&<><h4>Provider decision limits</h4><ul className="verdict-limits">{provider.gates.map((gate,index)=><li key={index}>{gate}</li>)}</ul></>}{!!Object.keys(provider.metrics||{}).length&&<details><summary>Raw provider metrics</summary><p>Names and numeric values retain the provider schema; units are not inferred.</p><dl className="verdict-facts">{Object.entries(provider.metrics||{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{count(value)}</dd></div>)}</dl></details>}{!Object.keys(provider.scoreParts||{}).length&&!provider.gates.length&&!Object.keys(provider.metrics||{}).length&&<p>No scoring breakdown was supplied.</p>}</details>}
   {report.fixture&&<p className="verdict-fixture">Synthetic example. These results are fabricated to demonstrate the interface.</p>}
  </section>

  <section className="verdict-block" aria-labelledby="roles-detail-title">
   <h3 id="roles-detail-title">Creator, authority & wallet roles</h3>
   <dl className="verdict-facts">
    <div><dt>Creator</dt><dd>{creators.length?`${creators.length} identified`:'Not identified'}</dd></div>
    <div><dt>Current owner / authority</dt><dd>{authorities.length?`${authorities.length} identified`:report.solana?.authorities.mint.address===null&&report.solana?.authorities.freeze.address===null?'Mint / freeze revoked':'Not identified'}</dd></div>
    <div><dt>Net-buying wallets</dt><dd>{trades.length?`${accumulators.length} in sample`:'Not assessed - no trades'}</dd></div>
   </dl>
   {[...new Map([...creators,...authorities].map(w=>[w.address,w])).values()].length>0&&<div className="verdict-wallets">{[...new Map([...creators,...authorities].map(w=>[w.address,w])).values()].map(w=><button key={w.address} onClick={()=>onSelect({kind:'wallet',id:w.address})} aria-label={`Inspect ${w.categories.filter(c=>c==='creator'||c==='authority').join(' and ')} ${w.address}`}><span>{w.categories.filter(c=>c==='creator'||c==='authority').join(' / ')} · {short(w.address)}</span><ArrowUpRight size={13}/></button>)}</div>}
   <p className="verdict-limit">Creator and current authority are separate roles. No identified authority does not establish renounced control. Net buying compares buys and sells only within the observed sample.</p>
   <dl className="verdict-facts">{(['pool','exchange','bridge','burn','contract'] as const).map(category=>{const matches=inv.wallets.filter(w=>w.categories.includes(category));return <div key={category}><dt>{category==='pool'?'Liquidity pools':category==='exchange'?'Exchanges':category==='bridge'?'Bridges':category==='burn'?'Burn addresses':'Other contracts'}</dt><dd>{matches.length?`${matches.length} provider-labeled`:'Not identified'}</dd></div>;})}</dl>
   <p className="verdict-limit">Infrastructure labels come from provider evidence. Unrecognized infrastructure may remain unclassified; missing labels do not establish a private wallet or shared operator.</p>
  </section>

  <section className="verdict-block sniper-assessment" aria-labelledby="sniper-detail-title">
   <h3 id="sniper-detail-title">Snipers & early trading</h3>
   <strong className="verdict-result">{sniperTitle}</strong>
   <p>{provider ? 'SwarmEngine sniper flags are its own classifications; TraceForge has not independently checked their launch timing. Separately assessed timing labels require a non-infrastructure transaction sender buying within 60 seconds of a verified trading start in the stated scope.' : 'A possible sniper is a non-infrastructure transaction sender with a buy within 60 seconds of the verified trading start in the stated scope.'} This does not prove a bot, beneficial ownership or privileged access.</p>
   <dl className="verdict-facts">
    <div><dt>{poolTiming?'Verified pool windows':'Indexed trading start'}</dt><dd>{poolTiming?`${poolTimings.length} - see intervals below`:coverage.launchVerified?timestamp(coverage.earliestTradeAt):'Unverified'}</dd></div>
    <div><dt>Observed trade sample</dt><dd>{trades.length?`${buys.length} buys · ${sells.length} sells`:'Unavailable'}</dd></div>
    <div><dt>Early-buyer wallets</dt><dd>{timingVerified&&trades.length?`${earlyBuyers.length}${poolTiming?' in pool window':' in sample'}`:'Not assessed'}</dd></div>
   </dl>
   {snipers.length>0&&<div className="verdict-wallets">{snipers.map(w=><button key={w.address} onClick={()=>onSelect({kind:'wallet',id:w.address})} aria-label={`Inspect possible sniper ${w.address}`}>{short(w.address)}<ArrowUpRight size={13}/></button>)}</div>}
   {poolTimings.map(proof=><p className="verdict-limit" key={proof.pool}>Pool {short(proof.pool)}: creation block {proof.creation.blockNumber} through block {proof.through.blockNumber}. First swap {timestamp(proof.firstSwapAt)}; first-minute end {timestamp(proof.windowEndAt)}. <button className="text-link" onClick={()=>onSelect({kind:'wallet',id:proof.pool})}>Inspect pool evidence<ArrowUpRight size={12}/></button></p>)}
   <p className="verdict-limit">{provider&&!poolTiming?'Provider flags do not establish the first trade, first-minute coverage or complete launch history.':poolTiming?"Timing labels refer only to verified events in these pool intervals. Other pools and the token's first-ever launch are not established.":"Timing is relative to the provider's indexed start, not proof of the token's first trade across every venue."}</p>
  </section>

  <section className="verdict-block" aria-labelledby="findings-detail-title">
   <h3 id="findings-detail-title">Risk findings <span>{orderedFindings.length}</span></h3>
   <p>{findingCounts.label}. Coverage notes are listed separately under Scope & uncertainty.</p>
   <div className="finding-list">{orderedFindings.length?orderedFindings.map(f=><button key={f.id} onClick={()=>onSelect({kind:'finding',id:f.id})}><div><span className="finding-level">{f.level==='info'?'Informational finding':`${f.level} signal`}</span><strong>{f.title}</strong><p>{f.description}</p><span className={`certainty ${f.certainty}`}>{f.attribution==='provider-reported'?'Provider-reported by SwarmEngine':f.certainty} · {f.evidenceIds.length} evidence records</span></div><ChevronRight size={16}/></button>):<p className="verdict-limit">No configured finding is supported by this sample. Missing evidence is not a negative result.</p>}</div>
  </section>

  <section className="verdict-block" aria-labelledby="checks-detail-title">
   <h3 id="checks-detail-title">Contract & authority checks</h3>
   <p>Provider-reported checks. “No flag” describes only the named check and is not an independent contract audit.</p>
   <div className="verdict-checks">{orderedChecks.length?orderedChecks.map(check=><article key={check.key}><div><strong>{check.title}</strong><span className={`check-result result-${check.status}`}>{check.status==='unknown'?'Unknown':check.status==='clear'?'No flag':check.status==='critical'?'Critical':'Warning'}</span></div><p>{check.description}</p><small>Reported value: {check.value}</small>{inv.findings.some(f=>f.id===`security:${check.key}`)&&<button className="verdict-inspect" onClick={()=>onSelect({kind:'finding',id:`security:${check.key}`})}>Inspect provider evidence <ArrowUpRight size={13}/></button>}</article>):<p className="verdict-limit">Contract checks unavailable. No contract conclusion can be drawn.</p>}</div>
  </section>

  <section className="verdict-block" aria-labelledby="relationships-detail-title">
   <h3 id="relationships-detail-title">Funding, connections & selling</h3>
   <dl className="verdict-facts">
    <div><dt>Native funding transfers</dt><dd>{funding.length?`${funding.length} observed`:'None evidenced in sample'}</dd></div>
    <div><dt>Shared-funder patterns</dt><dd>{sharedFunding.length?`${sharedFunding.length} inferred`:'None evidenced in sample'}</dd></div>
    <div><dt>Creator-linked wallets</dt><dd>{linked.length?`${linked.length} labeled${linked.some(wallet=>wallet.categorySources?.['deployer-linked']==='swarm')?' (includes provider reports)':''}`:'None evidenced in sample'}</dd></div>
    <div><dt>Connected selling patterns</dt><dd>{!trades.length?'Not assessed - no trades':selling.length?`${selling.length} inferred`:'None evidenced in sample'}</dd></div>
   </dl>
   <p className="verdict-limit">{provider&&`${inv.relationships.filter(edge=>edge.attribution==='provider-reported').length} provider-reported links are listed in Connections. These are separate from independently sourced transfer evidence. `}{!coverage.fundingHops?'Funding history was not requested. ':''}{!inv.evidence.some(e=>e.kind==='transfer')?'No transfer history is available in this report. ':''}Independent connection findings require sourced transfers. Shared funding does not prove ownership. Connected selling checks require linked wallets, prior relationships and separate sales within five minutes.</p>
  </section>

  <section className="verdict-block" aria-labelledby="concentration-detail-title">
   <h3 id="concentration-detail-title">Holder concentration</h3>
   <dl className="verdict-facts">
    <div><dt>Holder count</dt><dd>{count(report.holderCount)}</dd></div>
    <div><dt>Reported holders sampled</dt><dd>{report.holders.length||'Unavailable'}</dd></div>
    <div><dt>Largest sampled holder</dt><dd>{concentrationKnown?`${count(shares[0])}% of supply`:'Unavailable'}</dd></div>
    <div><dt>Top {Math.min(10,shares.length)||10} sampled holders</dt><dd>{concentrationKnown?`${count(shares.slice(0,10).reduce((sum,value)=>sum+value,0))}% of supply`:'Unavailable'}</dd></div>
   </dl>
   <p className="verdict-limit">Uses reported supply shares. The sample may include pools, exchanges, contracts and burn addresses. It does not establish beneficial ownership or historical concentration.</p>
  </section>

  <section className="verdict-block" aria-labelledby="coverage-detail-title">
   <h3 id="coverage-detail-title">Scope & uncertainty</h3>
   {coverage.clock&&Math.abs(coverage.clock.offsetMs)>120_000&&<div className="scope-note"><strong>Clock difference detected</strong><p>Timestamp checks used corroborated provider response time. Local capture: {timestamp(coverage.clock.localCapturedAt)}. Provider reference: {timestamp(coverage.clock.referenceAt)}. Event times were not changed. HTTP clocks are not independent UTC certification.</p></div>}
   <dl className="verdict-facts"><div><dt>Coverage</dt><dd>{coverage.status}</dd></div><div><dt>Requested limits</dt><dd>{coverage.holderLimit} holders · {coverage.buyerLimit} buyers · {coverage.fundingHops} funding hop(s)</dd></div><div><dt>Provider truncation</dt><dd>{coverage.truncated?'Yes - bounded sample':'Not reported as truncated'}</dd></div><div><dt>Evidence captured</dt><dd>{timestamp(coverage.fetchedAt)}</dd></div></dl>
   {coverage.reasons.length>0&&<details className="verdict-disclosure"><summary>Read all {coverage.reasons.length} coverage limits</summary><ul className="verdict-limits">{coverage.reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul></details>}
   <p className="verdict-limit">Coverage applies only to the configured provider windows and sampled wallets. Unavailable data does not mean zero activity. Snapshot balances cannot reconstruct past holdings.</p>
  </section>

  <section className="verdict-block" aria-labelledby="sources-detail-title">
   <h3 id="sources-detail-title">Sources & freshness</h3>{provider&&<p><a href={provider.sourceUrl} target="_blank" rel="noreferrer">SwarmEngine report</a>. Provider scan: {timestamp(provider.providerTimestamp||undefined)}. Retrieved: {timestamp(provider.fetchedAt)}. External rating: {provider.band||'not reported'}{provider.score!=null&&` (${provider.score}/100)`}. This is not a safety probability.</p>}
   <p>{coverage.source}. Available means a response was received. Rejected records and missing history are explained in coverage.</p>
   <div className="verdict-sources">{report.sources.map((source,index)=><article key={`${source.name}:${index}`}><div><strong>{source.name}</strong><span>{source.status}</span></div><small>{source.status==='available'?'Last fetched':'Last successful fetch, if retained'}: {timestamp(source.fetchedAt)}</small><details className="verdict-disclosure"><summary>Source details</summary><p>{source.detail}</p></details></article>)}</div>
  </section>
 </div>;
}

export function EvidencePanel({report,selection,onSelect,onClose,copy}:{report:InvestigationReport;selection:Selection|null;onSelect:(value:Selection)=>void;onClose:()=>void;copy:(value:string)=>void}) {
 const inv=report.investigation, wallet=selection?.kind==='wallet'?inv.wallets.find(w=>w.address===selection.id):null,edge=selection?.kind==='relationship'?inv.relationships.find(r=>r.id===selection.id):null,finding=selection?.kind==='finding'?inv.findings.find(f=>f.id===selection.id):null;
 const providerWallet=wallet?report.providerAnalysis?.holders.find(holder=>holder.address===wallet.address):undefined;
 const ids=wallet?.evidenceIds||edge?.evidenceIds||finding?.evidenceIds||selection?.evidenceIds||[];
 const evidence=inv.evidence.filter(e=>ids.includes(e.id));
 const title=wallet?wallet.label||short(wallet.address):edge?'Wallet connection':finding?finding.title:selection?.kind==='group'?'Connected wallet group':'Investigation assessment';
 return <aside className={`evidence-drawer ${selection?'has-selection':''}`} aria-label="Investigation evidence"><div className="section-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close evidence panel"><X size={17}/></button></div>
 {selection?<><div className="selection-summary">{wallet&&<><span className="address-full">{wallet.address}</span><div className="inline-actions"><button onClick={()=>copy(wallet.address)}><Copy size={13}/>Copy address</button>{!report.fixture&&<a href={`${CHAINS[report.chain].explorer}/${report.chain==='solana'?'account':'address'}/${wallet.address}`} target="_blank" rel="noreferrer">Explorer<ExternalLink size={12}/></a>}</div><div className="selection-share"><strong>{wallet.share==null?'Share unavailable':`${count(wallet.share)}%`}</strong><span>snapshot supply share</span></div>{providerWallet && <p>SwarmEngine float share: {providerWallet.shareFloat == null ? 'not reported' : `${count(providerWallet.shareFloat * 100)}%`}. Float share uses the provider's circulating-float denominator, not total supply.</p>}<WalletRoleSummary role={presentWalletRole(report,wallet)}/><p>Each role keeps its source. Provider-reported classifications have not been independently verified. Labels do not establish wallet ownership.</p></>}{edge&&<>{edge.attribution==='provider-reported'&&<span className="certainty">Provider-reported by SwarmEngine</span>}<p>{edge.description}</p><button className="text-link" onClick={()=>onSelect({kind:'wallet',id:edge.from})}>{short(edge.from)}<ArrowUpRight size={12}/></button><span className="muted"> to </span><button className="text-link" onClick={()=>onSelect({kind:'wallet',id:edge.to})}>{short(edge.to)}<ArrowUpRight size={12}/></button></>}{finding&&<><span className={`certainty ${finding.certainty}`}>{finding.attribution==='provider-reported'?'Provider-reported by SwarmEngine':finding.certainty}</span><p>{finding.description}</p></>}{selection.kind==='group'&&<><p>These wallets are connected by the listed relationships. Provider-reported links remain unverified claims; a shared funding source alone does not prove common control.</p><div className="group-members">{selection.wallets?.map(a=><button key={a} onClick={()=>onSelect({kind:'wallet',id:a})}>{short(a)}<ArrowUpRight size={12}/></button>)}</div></>}</div>{providerWallet&&<ProviderWalletDetails holder={providerWallet} chain={report.chain}/>}<div className="drawer-subhead">Supporting evidence <span>{evidence.length}</span></div><div className="evidence-records">{evidence.length?evidence.map(e=><article key={e.id} className="evidence-record"><div><span>{e.attribution==='provider-reported'?'Provider-reported record':e.kind==='authority'?'Identity record':e.kind==='holding'?'Balance snapshot':label(e.kind)}</span><time>{new Date(e.timestamp).toLocaleString()}</time></div><p>{e.description}</p>{e.amount!=null&&<span className="evidence-amount">{count(e.amount)} {e.token||'tokens'}</span>}{e.transaction&&!report.fixture&&<a target="_blank" rel="noreferrer" href={`${CHAINS[report.chain].explorer}/${report.chain==='solana'?'tx':'tx'}/${e.transaction}`}>Inspect transaction <ExternalLink size={12}/></a>}<small>{report.fixture?'Synthetic example. ':''}Source: {e.source}</small></article>):<p className="drawer-empty">No transaction-level evidence is available for this selection. Unclassified wallets are not assumed to be safe or suspicious.</p>}</div></>:<VerdictDetails report={report} onSelect={onSelect}/>}
 </aside>;
}
export function ActivityTimeline({report,paused,onSelect,onActive}:{report:InvestigationReport;paused:boolean;onSelect:(selection:Selection)=>void;onActive:(wallet:string|null)=>void}) {
 const events=useMemo(()=>[...report.investigation.timeline].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),[report.investigation.timeline]);
 const [cursor,setCursor]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 const evidenceById=useMemo(()=>new Map(report.investigation.evidence.map(evidence=>[evidence.id,evidence])),[report.investigation.evidence]);
 const isReported=(event:TimelineEvent)=>evidenceById.get(event.evidenceId)?.attribution==='provider-reported';
 const eventName=(event:TimelineEvent)=>isReported(event)&&event.id.startsWith('swarm:entry:')?report.providerAnalysis?.holders.find(holder=>holder.address===event.wallet)?.signals.kind||event.kind:event.kind;
 const reportedCount=events.filter(isReported).length;
 const eventScope=reportedCount===events.length&&events.length?'Provider-reported entries':reportedCount?'Provider-reported and evidence-assessed events':'Observed event replay - sampled transactions only';
 useEffect(()=>{setCursor(value=>Math.min(value,Math.max(0,events.length-1)));if(!events.length)setPlaying(false);},[events.length]);
 useEffect(()=>{setCursor(0);setPlaying(false);onActive(null);},[report.token,report.fixture,onActive]);
 useEffect(()=>{if(paused)setPlaying(false);},[paused]);
 useEffect(()=>{if(!playing||paused||events.length<2)return;const timer=setInterval(()=>setCursor(c=>{if(c>=events.length-1){setPlaying(false);return c;}return c+1;}),1000/speed);return()=>clearInterval(timer);},[playing,paused,events.length,speed]);
 useEffect(()=>{onActive(events[cursor]?.wallet||null);},[cursor,events,onActive]);
 const safeCursor=Math.min(cursor,Math.max(0,events.length-1)),current=events[safeCursor],seen=events.slice(0,safeCursor+1),buys=seen.filter(e=>e.kind==='buy').length,sells=seen.filter(e=>e.kind==='sell').length;
 const first=events[0]?Date.parse(events[0].timestamp):0,last=events.at(-1)?Date.parse(events.at(-1)!.timestamp):1;
 const position=(event:TimelineEvent)=>last===first?50:4+(Date.parse(event.timestamp)-first)/(last-first)*92;
 return <section className="timeline-panel"><div className="section-heading"><div><h2>Follow the money</h2><p>{eventScope}</p></div><span className="muted">{events.length} events</span></div>{events.length?<><div className="timeline-plot" role="group" aria-label={eventScope}><div className="timeline-lane"><span>Buys</span><i/></div><div className="timeline-lane"><span>Sells</span><i/></div><div className="timeline-lane"><span>Transfers</span><i/></div><div className="timeline-marks">{events.map((e,i)=><button key={e.id} title={`${isReported(e)?'Provider-reported ':''}${eventName(e)} - ${new Date(e.timestamp).toLocaleString()}`} aria-label={`Event ${i+1}: ${isReported(e)?'provider-reported ':''}${eventName(e)} by ${short(e.wallet)}`} className={`event-mark event-${e.kind} ${i===cursor?'current':''} ${i<=cursor?'played':''}`} style={{left:`${position(e)}%`,top:e.kind==='buy'?12:e.kind==='sell'?42:72}} onClick={()=>{setCursor(i);setPlaying(false);onSelect({kind:'wallet',id:e.wallet});}}/>)}<div className="time-cursor" style={{left:`${position(current)}%`}}/></div></div><div className="timeline-dates"><span>{new Date(first).toLocaleString()}</span><span>{new Date(last).toLocaleString()}</span></div><div className="playback-controls"><button className="icon-button" aria-label="Previous event" disabled={cursor===0} onClick={()=>{setPlaying(false);setCursor(c=>Math.max(0,c-1));}}><ChevronLeft size={16}/></button><button className="play-button" disabled={paused||events.length<2} title={paused?'Automatic playback is paused. Use Previous event, Next event or the slider to inspect events.':undefined} aria-label={playing?'Pause timeline':'Play timeline'} onClick={()=>{if(cursor===events.length-1)setCursor(0);setPlaying(!playing);}}>{playing?<Pause size={14}/>:<Play size={14}/>}</button><button className="icon-button" aria-label="Next event" disabled={cursor===events.length-1} onClick={()=>{setPlaying(false);setCursor(c=>Math.min(events.length-1,c+1));}}><ChevronRight size={16}/></button><input aria-label="Timeline event position" type="range" min="0" max={events.length-1} value={safeCursor} onChange={e=>{setCursor(Number(e.target.value));setPlaying(false);}}/><button className="speed-button" title="Change playback speed" onClick={()=>setSpeed(s=>s===1?2:s===2?4:1)}>{speed}x</button><span className="timeline-count">{safeCursor+1} / {events.length}</span></div>{paused&&<p className="timeline-playback-note" style={{fontSize:13,padding:'0 16px 12px',color:'var(--muted)'}}>Automatic playback is paused. Use the previous and next buttons or the slider to inspect events.</p>}<div className="event-detail"><button onClick={()=>onSelect({kind:'wallet',id:current.wallet})}><span className={`event-kind ${current.kind}`}>{eventName(current)}</span>{short(current.wallet)}<ArrowUpRight size={12}/></button><span>{new Date(current.timestamp).toLocaleString()}</span><small>{isReported(current)?'Provider-reported by SwarmEngine; not independently verified':`Source: ${evidenceById.get(current.evidenceId)?.source||'not supplied'}`}</small><small>In displayed sample: {buys} buys · {sells} sells</small></div></>:<div className="timeline-unavailable"><span className="empty-timeline-line"/><p>No transaction history in this source sample.</p><small>{report.providerAnalysis ? 'The provider report does not supply a verified transaction timeline. Reported wallet flags and connections cannot reconstruct event history.' : 'Snapshot balances cannot reconstruct historical holdings. Expand the scan to request additional available evidence.'}</small></div>}</section>;
}
