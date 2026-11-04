"use client";

import {LLM_REVIEW_ENABLED} from '@/lib/features';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';
import { gsap } from 'gsap';
import { short } from '@/lib/analysis';
import { getDisplayAssessment } from '@/lib/verdict-summary';
import { findingBreakdown } from '@/lib/finding-breakdown';
import {observedDecision} from '@/lib/observed-decision';
import {trustRating} from '@/lib/trust-rating';
import {buildVerdictOutput} from '@/lib/verdict-output';
import {decisionDisplayPercentages} from '@/lib/decision-display';
import {decisionLabels,decisionLabel,presentationText,earlyBuyingExplanation} from '@/lib/assessment-presentation';
import {buildCurrentHolderGraph} from '@/lib/current-holder-graph';
import {layoutHolderMap} from '@/lib/holder-map-layout';
import {holderMapDrift} from '@/lib/holder-map-motion';
import {mapDisplayShare,resolveShareBasis,sharePercentText,type MapShareBasis} from '@/lib/holder-map-basis';
import {holderScope} from '@/lib/holder-scope';
import {topHolderCohort} from '@/lib/top-holder-cohort';
import {HOLDER_DISPLAY_LIMIT} from '@/lib/holder-count-summary';
import {computeRiskMetrics} from '@/lib/risk-metrics';
import RiskMeasurements from './risk-measurements';
import DecisionOutput from './decision-output';
import AssessmentHeadline from './assessment-headline';
import ObservedScoreBreakdown from './observed-score-breakdown';
import type { InvestigationReport, WalletCategory } from '@/lib/investigation-types';
import type { Selection } from './investigation-panels';
import CheckBreakdown from './check-breakdown';
import CryptoAgentPanel,{useCryptoReview} from './crypto-agent-panel';
import './report-overview.css';
import './assessment-headline.css';
import './observed-score-breakdown.css';
import './holder-constellation.css';
import ShareBasisSelector from './share-basis-selector';

type Props = { report: InvestigationReport; selection?: Selection | null; onSelect: (selection: Selection) => void; onInspect: () => void; paused: boolean; shareBasis?:MapShareBasis; onShareBasisChange?:(basis:MapShareBasis)=>void };
const LIMIT = HOLDER_DISPLAY_LIMIT, WIDTH = 700, HEIGHT = 400;
const formatMapShare = (share: number | null, basis: MapShareBasis) => share == null || !Number.isFinite(share) ? `${basis==='float'?'Snapshot float':'Supply'} share unavailable` : `${sharePercentText(share)} of ${basis==='float'?'snapshot float':'total supply'}`;
const dateText = (value: string) => new Date(value).toLocaleString();

/** Age uses actual source dates and an explicitly named reference time. */
function sourceAge(report: InvestigationReport) {
  const launch = report.providerAnalysis?.launchAt, pair = report.market?.pairCreatedAt;
  const start = launch ? Date.parse(launch) : typeof pair === 'number' ? pair : NaN;
  const reference = launch ? report.providerAnalysis?.providerTimestamp || report.providerAnalysis?.fetchedAt || report.fetchedAt : report.fetchedAt;
  const elapsed = Date.parse(reference) - start;
  const basis = launch ? report.providerAnalysis?.providerTimestamp ? 'Reported launch age at scan' : 'Reported launch age at retrieval' : 'DEX pair age at retrieval';
  if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(elapsed) || elapsed < 0) return { value: 'Unavailable', basis: 'No usable launch or pair timestamp', detail: 'Token age cannot be established from the supplied timestamps.' };
  const minutes = Math.floor(elapsed / 60_000), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const value = days >= 365 ? `${Math.floor(days / 365)}y ${days % 365}d` : days ? `${days}d ${hours % 24}h` : hours ? `${hours}h ${minutes % 60}m` : minutes ? `${minutes}m` : '<1m';
  return { value, basis, detail: `${launch ? 'SwarmEngine reported launch' : 'DEX Screener pair creation'}: ${dateText(new Date(start).toISOString())}. Measured at ${dateText(reference)}.${launch ? ' The reported launch is not independently verified.' : ' Pair age does not establish token age.'}` };
}

/** Position and motion are layout only, never ownership or live transfers. */
export default function ReportOverview({ report, selection, onSelect, onInspect, paused,shareBasis:controlledShareBasis,onShareBasisChange }: Props) {
  const agentResult=useCryptoReview(report),agentReview=LLM_REVIEW_ENABLED&&agentResult?.status==='ready'?agentResult.review:null;
  const id = useId(), inv = report.investigation, provider = report.providerAnalysis, assessment = getDisplayAssessment(report), age = sourceAge(report);
  const snapshot=useMemo(()=>holderScope(report),[report]);
  const cohort=useMemo(()=>topHolderCohort(report),[report]);
  const floatBasis=cohort.floatBasis;
  const basisScope=`${report.chain}:${report.token}`;
  const [basisChoice,setBasisChoice]=useState<{scope:string;basis:MapShareBasis}|null>(null);
  const shareBasis=resolveShareBasis(controlledShareBasis??(basisChoice?.scope===basisScope?basisChoice.basis:'float'),floatBasis);
  const changeShareBasis=(basis:MapShareBasis)=>{setBasisChoice({scope:basisScope,basis});onShareBasisChange?.(basis);};
  const displayShare=(raw:number|null)=>mapDisplayShare(raw,shareBasis,floatBasis);
  const shareText=(raw:number|null)=>formatMapShare(displayShare(raw),shareBasis);
  const bubbleShare=(raw:number|null)=>{const value=displayShare(raw);return value===null?'':sharePercentText(value);};
  const largestHolding=useMemo(()=>(report.riskMetrics||computeRiskMetrics(report)).metrics.find(metric=>metric.id==='largest-holder-adjusted-float'),[report]);
  const root = useRef<HTMLElement>(null), viewport = useRef<SVGGElement>(null), motion = useRef<gsap.core.Timeline | null>(null), entrance = useRef<gsap.core.Timeline|null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [compactMap,setCompactMap]=useState(false),mapWidth=compactMap?HEIGHT:WIDTH,mapOriginX=(WIDTH-mapWidth)/2;
  useEffect(()=>{const canvas=root.current?.querySelector('.ro-canvas');if(!canvas)return;const size=new ResizeObserver(([entry])=>setCompactMap(entry.contentRect.width<=560));size.observe(canvas);return()=>size.disconnect();},[]);
  const [hovered, setHovered] = useState<string | null>(null), [localSelection, setLocalSelection] = useState<string | null>(null);
  const [mapFocusHeld,setMapFocusHeld]=useState(false),[mapDragging,setMapDragging]=useState(false);
  const [onScreen, setOnScreen] = useState(false), [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false);
  const selectedRaw = selection === undefined ? localSelection : selection?.kind === 'wallet' ? selection.id : null;
  const selected = selectedRaw&&report.chain!=='solana'?selectedRaw.toLowerCase():selectedRaw;
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const animate = !paused && !reduced && visible && onScreen;
  const graph = useMemo(() => {
    const current=buildCurrentHolderGraph(report,{limit:LIMIT,cohort:'top'});
    const wallets=current.nodes,edges=current.edges;
    const layout=layoutHolderMap(wallets,WIDTH,HEIGHT);
    const nodes=wallets.map((wallet,index)=>({...wallet,rank:index+1,...layout[index]}));
    const neighbors = new Map(nodes.map(node => [node.address, new Set<string>()]));
    for (const edge of edges) { neighbors.get(edge.from)!.add(edge.to); neighbors.get(edge.to)!.add(edge.from); }
    const groups: string[][] = [], visited = new Set<string>();
    for (const node of nodes) {
      if (visited.has(node.address)) continue;
      const queue = [node.address], members: string[] = []; visited.add(node.address);
      while (queue.length) { const address = queue.shift()!; members.push(address); for (const next of neighbors.get(address)!) if (!visited.has(next)) { visited.add(next); queue.push(next); } }
      if (members.length > 1) groups.push(members);
    }
    return { total:current.total,excludedInfrastructure:current.excludedInfrastructure,truncated:current.truncated,documentedGroups:current.documentedGroups,walletGroups:current.walletGroups,nodes, edges, neighbors, linked: groups.sort((a, b) => b.length - a.length)[0] || [], positions: new Map(nodes.map(node => [node.address, node])) };
  }, [report]);
  const floating = animate && graph.nodes.length>0 && !hovered && !mapFocusHeld && !mapDragging && !(selection === undefined ? localSelection : selection);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preferences = () => { setReduced(media.matches); setVisible(!document.hidden); };
    preferences(); media.addEventListener('change', preferences); document.addEventListener('visibilitychange', preferences);
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: .08 });
    if (root.current) observer.observe(root.current.querySelector('.ro-canvas') || root.current);
    return () => { observer.disconnect(); media.removeEventListener('change', preferences); document.removeEventListener('visibilitychange', preferences); };
  }, []);
  useEffect(() => {
    if(!graph.nodes.length)return;
    const context = gsap.context(() => {
      const sequence = gsap.timeline({ paused: true });
      const clock={phase:0};
      const points = graph.nodes.map(node=>({address:node.address,x:node.x,y:node.y}));
      const positions = new Map(points.map(point=>[point.address,point]));
      const elements = [...(root.current?.querySelectorAll<SVGGElement>('[data-map-node]') || [])];
      const edges = [...(root.current?.querySelectorAll<SVGGElement>('[data-map-edge]') || [])];
      const arrivals = [...(root.current?.querySelectorAll<SVGGElement>('.ro-node-arrival') || [])];
      const bubbles=[...(root.current?.querySelectorAll<SVGCircleElement>('.ro-node')||[])],radii=bubbles.map(circle=>Number(circle.getAttribute('r')));
      const arrival=gsap.timeline({paused:true});
      arrival.fromTo(arrivals,{opacity:.22},{opacity:1,duration:.8,stagger:{amount:.8,from:'center'},ease:'power3.out'},0);
      // Animate radii in each wallet's local origin. No group scale/transform
      // touches the packed coordinates or persists after the entry sequence.
      arrival.fromTo(bubbles,{attr:{r:(index:number)=>radii[index]*.12}},{attr:{r:(index:number)=>radii[index]},duration:1.35,stagger:{amount:1.1,from:'center'},ease:'expo.out'},0);
      const marks=root.current?.querySelectorAll('.ro-node-inner,.ro-creator-ring,.ro-authority-mark'),labels=root.current?.querySelectorAll('.ro-node-label,.ro-node-core'),connections=root.current?.querySelectorAll('.ro-connection');
      if(marks?.length)arrival.fromTo(marks,{opacity:0},{opacity:1,duration:.7,stagger:{amount:.5},ease:'power2.out'},.45);
      if(labels?.length)arrival.fromTo(labels,{opacity:0},{opacity:1,duration:.5,stagger:{amount:.7},ease:'power2.out'},.7);
      if(connections?.length)arrival.fromTo(connections,{strokeDasharray:'100 100',strokeDashoffset:100},{strokeDashoffset:0,duration:1.6,stagger:{amount:.65},ease:'power2.inOut',clearProps:'strokeDasharray,strokeDashoffset'},.35);
      entrance.current=arrival;
      const redraw = () => {
        points.forEach((point,index)=>{const node=graph.nodes[index],drift=holderMapDrift(clock.phase,index);point.x=node.x+drift.x;point.y=node.y+drift.y;});
        elements.forEach((element,index)=>{const point=points[index];element.setAttribute('transform',`translate(${point.x} ${point.y})`);});
        edges.forEach((element,index)=>{const edge=graph.edges[index],a=positions.get(edge.from)!,b=positions.get(edge.to)!;const path=`M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${(a.y+b.y)/2-Math.min(30,Math.abs(a.x-b.x)/7)} ${b.x} ${b.y}`;element.querySelectorAll('path').forEach(line=>line.setAttribute('d',path));});
      };
      // One continuous field clock keeps every real edge attached. Packing
      // reserves the full envelope; holding a target makes inspection stable.
      sequence.to(clock,{phase:Math.PI*2,duration:14,repeat:-1,ease:'none'},0);
      sequence.eventCallback('onUpdate',redraw);
      motion.current = sequence;
    }, root);
    return () => { context.revert(); motion.current = null; entrance.current=null; };
  }, [graph]);
  useEffect(() => { motion.current?.paused(!floating); if(reduced||paused)entrance.current?.progress(1).pause();else entrance.current?.paused(!animate); }, [animate, floating, reduced, paused, graph]);
  useEffect(() => {
    const tween = gsap.to(viewport.current, { attr: { transform: `translate(${view.x} ${view.y}) translate(350 200) scale(${view.zoom}) translate(-350 -200)` }, duration: animate && !drag.current ? .3 : 0, ease: 'power3.out', overwrite: true });
    return () => { tween.kill(); };
  }, [view, animate]);

  const normalizeWallet=(address:string)=>report.chain==='solana'?address:address.toLowerCase();
  const selectedWallets = new Set((selected ? [selected] : selection?.wallets || []).map(normalizeWallet));
  if (selection?.kind === 'relationship') { const edge = inv.relationships.find(edge => edge.id === selection.id); if (edge) { selectedWallets.add(normalizeWallet(edge.from)); selectedWallets.add(normalizeWallet(edge.to)); } }
  if (selection?.kind === 'finding') for (const address of inv.findings.find(finding => finding.id === selection.id)?.wallets || []) selectedWallets.add(normalizeWallet(address));
  const focusAddress = hovered || selected, focused = graph.positions.get(focusAddress || '');
  const highlighted = new Set([...selectedWallets, ...(focusAddress ? [focusAddress, ...(graph.neighbors.get(focusAddress) || [])] : [])]);
  const selectWallet = (address: string) => { if (selection === undefined) setLocalSelection(address); onSelect({ kind: 'wallet', id: address }); };
  const selectGroup = () => { const members = new Set(graph.linked); onSelect({ kind: 'group', id: 'overview-linked-group', wallets: graph.linked, evidenceIds: [...new Set(graph.edges.filter(edge => members.has(edge.from) && members.has(edge.to)).flatMap(edge => edge.evidenceIds))] }); };
  const zoom = (delta: number) => setView(value => ({ ...value, zoom: Math.max(.75, Math.min(2.5, Math.round((value.zoom + delta) * 100) / 100)) }));
  const breakdown = findingBreakdown(inv.findings);
  const reasons = breakdown.risks.filter(finding=>!finding.id.startsWith('funder:'));
  const fundingPatterns = breakdown.risks.filter(finding=>finding.id.startsWith('funder:'));
  const rating=useMemo(()=>trustRating(report),[report]);
  const observedResult=useMemo(()=>observedDecision(report,rating),[report,rating]);
  const verdictOutput=useMemo(()=>buildVerdictOutput({rating,observed:observedResult}),[rating,observedResult]);
  const decision = assessment.status==='critical'?'AVOID':agentReview?.decision||verdictOutput.decision;
  const observed=observedResult?.judge.decision===decision?observedResult:null;
  const simpleReason=rating.hard?.[0]||(assessment.status==='critical'?assessment.summary:agentReview?.summary)||rating.soft?.[0]||(observed?.judge.p?decision==='OK'?'No stop rule was triggered in the observed activity.':'The observed activity raised warning signs.':rating.score===null?'Some wallet checks are incomplete.':rating.decision==='CLEAN'||rating.decision==='OK'?'No major warning found in the completed checks.':'The completed checks found warning signs.');
  const scoreText=rating.score!==null?String(rating.score):'Unavailable';
  const points=(n:number)=>Number(n.toFixed(1)).toLocaleString();
  const confidencePercent=decisionDisplayPercentages(verdictOutput.p)[verdictOutput.decision.toLowerCase() as 'avoid'|'caution'|'ok'];
  const unresolved=new Set(rating.components.filter(component=>component.state==='unknown').map(component=>component.id));
  const earlyBuying=earlyBuyingExplanation(inv.coverage);
  const why: {title:string;detail:string}[]=[];
  for(const reason of [...(rating.hard||[]),...(rating.soft||[])])why.push({title:'Verified warning',detail:reason});
  if(observed?.judge.p){
   const factor=(id:string)=>observed.factors.find(f=>f.id===id)!;
   why.push({title:'Holder concentration',detail:`The largest documented holder group holds ${(observed.largestShare*100).toFixed(2)}% of adjusted supply. The top ten groups hold ${(factor('concentration').value*100).toFixed(2)}%.`});
   why.push({title:'Creator-linked holdings',detail:`${(factor('dev').value*100).toFixed(2)}% is held by the identified creator and directly linked wallets found in the retrieved records. Other funding paths remain unverified.`});
   why.push({title:'Large-sale model',detail:`A hypothetical sale by the largest group moves the raw pool price ${(observed.impact*100).toFixed(1)}% in the model, before fees or token restrictions. This is not a verified trade quote.`});
   const proxy=observed.scope.activityProxy;
   why.push({title:'Wallet activity checked',detail:proxy?`${proxy.lowNonce} of ${proxy.readable} selected readable wallets had an account nonce of ten or less. Nonces count outgoing transactions and, for delegated wallets, accepted authorizations. This is an activity proxy, not lifetime freshness. ${proxy.unread} unread wallet${proxy.unread===1?' is':'s are'} excluded.${proxy.outsideLimit?` ${proxy.outsideLimit} other readable wallets are outside the selected scope.`:''}`:`Fresh-wallet exposure is ${(factor('fresh').value*100).toFixed(1)}% among ${observed.scope.readableFreshWallets} readable non-creator wallets; ${observed.scope.unreadFreshWallets} unread wallets are excluded. Early-buyer findings use retrieved records, not complete launch history.`});
  }else{
   if(largestHolding?.status==='observed'&&largestHolding.value!==null)why.push({title:'Holder concentration',detail:`The largest returned holder holds ${largestHolding.value.toFixed(2)}% of measured snapshot float. Platform balances are excluded; this is not the holder's share of total token supply.`});
   if(rating.components.some(component=>component.id==='snipers'&&(component.state==='flagged'||component.state==='watch')))why.push({title:'First-minute buyers still hold tokens',detail:'Transaction evidence identifies buys in a verified first-minute window, and those buyers still have a current balance. The Sniper label describes entry timing in that venue; it does not prove bot activity.'});
   if(unresolved.has('fresh'))why.push({title:'Some holder histories are unread',detail:'Lifetime activity has not been verified for every current holder, so the fresh-wallet check is incomplete.'});
   if(unresolved.has('snipers'))why.push({title:earlyBuying.title,detail:earlyBuying.detail});
   if(unresolved.has('insiders'))why.push({title:'Pre-trading transfers are not fully traced',detail:earlyBuying.preTrading});
   if(unresolved.has('dev'))why.push({title:'Creator funding is not fully traced',detail:'The complete funding trail is missing, so the total held by the creator and creator-funded wallets cannot be confirmed.'});
   if(unresolved.has('swarm'))why.push({title:'Sell impact is unverified',detail:'The available pool evidence cannot establish how much a sale by the largest holder group could move the price.'});
  }
  if(!why.length&&rating.score===null)why.push({title:'Required checks are incomplete',detail:'Some current contract controls or holder balances could not be verified. Open the evidence to see which source results are missing.'});
  const roles: { category: WalletCategory; name: string }[] = [{ category: 'creator', name: 'Creator' }, { category: 'authority', name: 'Owner' }, { category: 'sniper', name: 'Snipers' }];
  const verifiedTiming = inv.coverage.launchVerified || !!inv.coverage.poolTiming || !!inv.coverage.poolTimings?.length || !!inv.coverage.curveTiming;

  return <section ref={root} className="report-overview" aria-label="Wallet network and assessment" data-paused={!animate} data-floating={floating}>
    <div className={`ro-assessment ro-status-${decision==='AVOID'?'critical':decision==='OK'?'clear':'caution'}`}>
      <header className="ro-verdict-heading"><h2>Verdict</h2><span className="ro-coverage">{rating.hard?.length?'Stop rule triggered':observed?.judge.p?'Observed activity':inv.coverage.status === 'complete' ? 'Checks complete' : inv.coverage.status === 'partial' ? 'Incomplete checks' : 'Evidence unavailable'}</span></header>
      <AssessmentHeadline score={observed?.score??rating.score} decision={decision==='INSUFFICIENT'?'CAUTION':decision} confidence={confidencePercent} basis={verdictOutput.basis}/>
      <p className="ro-simple-reason">{presentationText(simpleReason)}</p>
      {!LLM_REVIEW_ENABLED&&<DecisionOutput output={verdictOutput}/>}
      {observed&&<ObservedScoreBreakdown factors={observed.factors}/>}
      {why.length>0&&<section className="ro-plain-reasons" aria-label={`Why ${decisionLabel(decision).toLowerCase()}?`}><h3>Why {decisionLabel(decision).toLowerCase()}?</h3><ul>{why.map((reason,index)=><li key={`${reason.title}:${index}`}><strong>{reason.title}</strong><p>{reason.detail}</p></li>)}</ul></section>}
      <details className="ro-analysis-details"><summary>Analysis details</summary><div className="ro-analysis-body">
      {agentReview&&<section className="ro-decision-weights" aria-label="AI decision weights">
        <h3>AI decision weights</h3>
        {agentReview.distribution?<>
          <dl>{(['avoid','caution','ok'] as const).map(key=><div key={key} className={decision===key.toUpperCase()?'is-selected':''}>
            <dt>{decisionLabels[key]}</dt><dd><span className="ro-weight-track" aria-hidden="true"><span style={{width:`${agentReview.distribution![key]}%`}}/></span><span className="ro-weight-value">{agentReview.distribution![key].toFixed(1)}%</span></dd>
          </div>)}</dl>
          <p>How Gemini weighs this evidence across the three decisions. Not a probability of token safety.</p>
        </>:<p>{agentReview.overrides.length?'Decision weights withheld because an evidence rule changed or restricted the AI assessment.':'The available evidence does not support decision weights.'}</p>}
      </section>}
      {observed&&<details className="ro-rating-details"><summary>Observed score - {observed.score}/100</summary><dl>{observed.factors.map(factor=><div key={factor.id}><dt>{factor.id}<small>{factor.detail}</small></dt><dd>{(factor.value*100).toFixed(2)}%</dd></div>)}</dl><p>{observed.scope.readableFreshWallets} readable non-creator wallets assessed; {observed.scope.unreadFreshWallets} outside this activity sample.</p>{observed.scope.notes.map(note=><p key={note}>{note}</p>)}</details>}
      <div className="ro-holder-scope">
        <dl aria-label="Holder snapshot and investigation scope">
          <div><dt>Snapshot holders</dt><dd>{snapshot.holders.length.toLocaleString()}</dd></div>
          <div><dt>Addresses traced</dt><dd>{inv.wallets.length.toLocaleString()}</dd></div>
          {largestHolding?.value!=null&&<div><dt>Largest / adjusted supply</dt><dd>{largestHolding.value.toFixed(2)}%</dd></div>}
        </dl>
        <p>Holder counts exclude {snapshot.infrastructure.length.toLocaleString()} observed infrastructure address{snapshot.infrastructure.length===1?'':'es'}. Traced addresses also include historical activity.{largestHolding?.value!=null?' Adjusted supply excludes observed infrastructure balances.':''}</p>
      </div>
      {!observed&&<details className="ro-rating-details"><summary>Score breakdown</summary><p>{rating.score===null?'The overall score is unavailable while required checks remain incomplete.':`Measured score: ${scoreText}/100.`}</p><dl>{rating.components.map(component=><div key={component.id}><dt>{component.label}<details className="ro-factor-detail"><summary>Measurement details</summary><p>{component.detail}</p></details>{!!component.evidenceIds?.length&&<button className="ro-factor-evidence" onClick={()=>onSelect({kind:'group',id:`factor:${component.id}`,wallets:[],evidenceIds:component.evidenceIds!})}>Inspect {component.evidenceIds.length} evidence records <ArrowUpRight size={12}/></button>}</dt><dd>{component.state==='unknown'?'Not verified':points(component.earned)}<span> / {component.maximum}</span></dd></div>)}</dl>{!!rating.hard?.length&&<p>Stop rules: {rating.hard.join(' ')}</p>}{!!rating.soft?.length&&<p>Score cap: {rating.soft.join(' ')}</p>}<p>{rating.basis}</p></details>}
      {report.controlProbes&&<details className="ro-rating-details"><summary>Direct RPC control observations - {report.controlProbes.observations.filter(o=>o.status==='observed').length} observed</summary><p>{report.controlProbes.anchor?`Block ${report.controlProbes.anchor.number}, ${report.controlProbes.anchor.finality}. `:''}{report.controlProbes.status}. Read at {dateText(report.controlProbes.fetchedAt)}.</p><dl>{report.controlProbes.observations.map(o=><div key={o.key}><dt>{o.key.split(':')[0]}<small>{o.detail}</small></dt><dd>{o.status==='unknown'?'Unresolved':o.outcome.replaceAll('-',' ')}</dd></div>)}</dl>{report.controlProbes.limitations.map(note=><p key={note}>{note}</p>)}</details>}
      <details className="ro-confidence"><summary>Decision basis and coverage</summary><p>{presentationText(verdictOutput.explanation)} Unread wallets are excluded from the observed fresh-wallet denominator. Unverified history remains a coverage limit.</p></details>
      {LLM_REVIEW_ENABLED&&<CryptoAgentPanel report={report} onSelect={onSelect} result={agentResult}/>}
      <p className="ro-findings-total">{breakdown.label}</p>
      <CheckBreakdown report={report} />
      <RiskMeasurements report={report} onSelect={onSelect}/>
      <div className="ro-reasons"><h3>Independent findings</h3>
        {!!fundingPatterns.length&&<section className="ro-funding-patterns"><h4>{fundingPatterns.length} shared-funding pattern{fundingPatterns.length===1?'':'s'}</h4><p>These wallets received funds from common sources. The transfers are observed; shared ownership or coordinated selling is not established. An unlabeled service could explain the links.</p><div>{fundingPatterns.map(finding=><button key={finding.id} type="button" onClick={()=>onSelect({kind:'finding',id:finding.id})}><span><span>Source <code title={finding.id.slice(7)}>{short(finding.id.slice(7))}</code></span><small>{finding.wallets.length} wallets · {finding.evidenceIds.length} records · {finding.attribution==='provider-reported'?'Provider-reported':'Inferred pattern'}</small></span><ArrowUpRight size={14}/></button>)}</div></section>}
        {assessment.status==='clear'&&provider?.band?.trim().toUpperCase()==='CLEAN'&&<button type="button" onClick={onInspect}><span className="ro-reason-mark" aria-hidden="true"/><span><strong>SwarmEngine reports CLEAN{provider.score!=null?` - ${provider.score}/100`:''}</strong><span className="ro-reason-description">{provider.reason||'No warning was reported in the provider assessment.'}</span><small>Provider-reported result</small></span><ArrowUpRight size={15}/></button>}
        {reasons.map(finding => <button key={finding.id} type="button" onClick={() => onSelect({ kind: 'finding', id: finding.id })}><span className={`ro-reason-mark is-${finding.level}`} aria-hidden="true" /><span><strong>{finding.title}</strong><span className="ro-reason-description">{finding.description}</span>{finding.id.startsWith('funder:')&&<small className="ro-funding-source" title={finding.id.slice(7)}>Funding source: {short(finding.id.slice(7))}</small>}<small>{finding.attribution === 'provider-reported' ? 'Reported by SwarmEngine' : finding.certainty === 'inferred' ? 'Inferred from the sample' : 'Evidence in this report'}</small></span><ArrowUpRight size={15} /></button>)}
        {!breakdown.risks.length && <p>{'No additional wallet-risk finding was established in the retrieved scope. See the assessment reasoning and coverage above.'}</p>}
      </div>
      {!inv.coverage.launchVerified&&<div className="ro-coverage-note"><strong>Coverage gap - launch history</strong><p>{verifiedTiming?'Selected trading windows are verified; the first-ever token launch is not.':'First-minute buyer coverage is unverified, so possible snipers cannot be assessed.'} This is missing evidence, not an additional detected risk.</p></div>}
      </div></details>
      <div className="ro-age"><Clock3 size={18} aria-hidden="true" /><div><span>{age.basis}</span><strong>{age.value}</strong></div><details><summary>Source</summary><p>{age.detail}</p></details></div>
      {provider && <div className="ro-provider"><div><a href={provider.sourceUrl} target="_blank" rel="noreferrer">SwarmEngine report <ArrowUpRight size={13} /></a><span>{provider.band || 'No rating'}{provider.score != null && ` - ${provider.score}/100`}</span></div><small>Scanned {provider.providerTimestamp ? dateText(provider.providerTimestamp) : 'at an unreported time'}. Retrieved {dateText(provider.fetchedAt)}.</small><small>Provider claims are not independently verified. Its score is not a safety probability.</small></div>}
      <div className="ro-roles" aria-label="Flags in the supplied sample">{roles.map(({ category, name }) => {
        const wallets = inv.wallets.filter(wallet => wallet.categories.includes(category)), reportedCount = wallets.filter(wallet => wallet.categorySources?.[category] === 'swarm').length;
        const currentCount = wallets.filter(wallet => snapshot.holders.some(holder => normalizeWallet(holder.address) === normalizeWallet(wallet.address))).length;
        const reported = reportedCount === wallets.length && reportedCount > 0, poolScoped = !reported && category === 'sniper' && !inv.coverage.launchVerified && verifiedTiming;
        const negative = category === 'sniper' && provider && provider.holders.length > 0 && provider.holders.every(holder => holder.signals.sniper === false);
        const revoked=category==='authority'&&report.solana?.authorities.mint.address===null&&report.solana?.authorities.freeze.address===null;
        return <div key={category}><span>{name}</span>{wallets.length ? <button type="button" onClick={() => wallets.length === 1 ? selectWallet(wallets[0].address) : onInspect()}>{wallets.length} {reported ? 'reported' : 'identified'}<ArrowUpRight size={12} /></button> : <small>{revoked ? 'Mint / freeze revoked' : negative ? '0 reported in sample' : provider ? 'Not reported' : 'Not established'}</small>}{category==='sniper'&&wallets.length>0&&<small>{currentCount} current / {wallets.length} flagged {wallets.length===1?'wallet':'wallets'}</small>}{reportedCount > 0 && reportedCount < wallets.length && <small>{reportedCount} provider-reported</small>}{poolScoped && <small>{inv.coverage.curveTiming?'Selected launchpad / pool windows only':'Selected pools only'}</small>}</div>;
      })}</div>
      <button type="button" className="ro-inspect" onClick={onInspect}>View evidence <ArrowUpRight size={17} /></button>
      {report.fixture&&<p className="ro-boundary">Synthetic example.</p>}
    </div>
    <div className="ro-map ro-map-designed">
      <header className="ro-map-heading"><h2>Holder map <Crosshair size={17} aria-hidden="true" /></h2><ShareBasisSelector value={shareBasis} onChange={changeShareBasis} floatAvailable={floatBasis.denominator!==null} describedBy={`${id}-map-basis`} label="Holder map percentage basis"/></header>
      {floatBasis.reason&&<p className="ro-map-basis-unavailable">{floatBasis.reason} Showing total supply.</p>}
      <div className="ro-map-metrics"><span><strong>{graph.nodes.length}</strong>Top wallets</span><span><strong>{graph.edges.length}</strong>Documented links</span><span title="Connected wallets count as one group when transaction evidence supports the link. This is not a count of people."><strong>{graph.walletGroups}</strong>Wallet groups</span></div>
      <div className="ro-canvas">
        <svg viewBox={`${mapOriginX} 0 ${mapWidth} ${HEIGHT}`} role="group" aria-labelledby={`${id}-map-title`} aria-describedby={`${id}-map-help`} tabIndex={0}
          onFocusCapture={()=>setMapFocusHeld(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setMapFocusHeld(false);}}
          onKeyDown={event => { if (event.target !== event.currentTarget) return; const steps: Record<string, [number, number]> = { ArrowLeft: [-25, 0], ArrowRight: [25, 0], ArrowUp: [0, -25], ArrowDown: [0, 25] }; if (steps[event.key]) { event.preventDefault(); const [x, y] = steps[event.key]; setView(value => ({ ...value, x: value.x + x, y: value.y + y })); } if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(.25); } if (event.key === '-') { event.preventDefault(); zoom(-.25); } if (event.key === 'Home') { event.preventDefault(); setView({ x: 0, y: 0, zoom: 1 }); } }}
          onPointerDown={event => { if ((event.target as Element).closest('[data-wallet], [data-map-edge]') || event.button !== 0) return; setMapDragging(true); drag.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (animate && !drag.current && event.pointerType!=='touch') { const bounds=event.currentTarget.getBoundingClientRect(),scale=Math.min(bounds.width/mapWidth,bounds.height/HEIGHT),x=mapOriginX+(event.clientX-bounds.left-(bounds.width-mapWidth*scale)/2)/scale,y=(event.clientY-bounds.top-(bounds.height-HEIGHT*scale)/2)/scale,inside=x>=20&&x<=680&&y>=20&&y<=380; event.currentTarget.parentElement?.setAttribute('data-reticle-active',String(inside)); if(inside)event.currentTarget.querySelector('[data-map-reticle]')?.setAttribute('transform',`translate(${x} ${y})`); } if (!drag.current) return; const rect = event.currentTarget.getBoundingClientRect(), scale = Math.max(mapWidth / rect.width, HEIGHT / rect.height), origin = drag.current; setView(value => ({ ...value, x: origin.originX + (event.clientX - origin.x) * scale, y: origin.originY + (event.clientY - origin.y) * scale })); }}
          onPointerLeave={event=>{event.currentTarget.parentElement?.setAttribute('data-reticle-active','false');}}
          onPointerUp={() => { drag.current = null; setMapDragging(false); }} onPointerCancel={() => { drag.current = null; setMapDragging(false); }} onLostPointerCapture={() => { drag.current = null; setMapDragging(false); }}>
          <desc id={`${id}-map-title`}>Current holder snapshot. Connections require matching transaction evidence. Position and motion are visual layout only.</desc>
          <g className="ro-map-board" aria-hidden="true">
            <g className="ro-field-orbits"><circle cx="350" cy="200" r="178"/><circle className="ro-field-rim" cx="350" cy="200" r="188"/><circle className="ro-field-revolve" cx="350" cy="200" r="188"/></g>
            <g className="ro-board-pointer"><g data-map-reticle="true"><path className="ro-board-reticle" d="M-14 0h9M5 0h9M0 -14v9M0 5v9"/><rect className="ro-board-reticle-center" x="-2" y="-2" width="4" height="4"/></g></g>
          </g>
          <g ref={viewport}>
            {graph.edges.map(edge => { const a = graph.positions.get(edge.from)!, b = graph.positions.get(edge.to)!, path = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - Math.min(30, Math.abs(a.x - b.x) / 7)} ${b.x} ${b.y}`; return <g key={edge.id} data-map-edge="true" className={`ro-edge ${edge.attribution === 'provider-reported' ? 'is-reported' : ''} ${highlighted.has(edge.from) && highlighted.has(edge.to) ? 'is-highlighted' : ''} ${focusAddress&&(!highlighted.has(edge.from)||!highlighted.has(edge.to))?'is-muted':''}`}><path className="ro-connection" pathLength="100" d={path} aria-hidden="true"/><path className="ro-edge-hit" d={path} role="button" tabIndex={0} aria-label={`Inspect connection between ${short(edge.from)} and ${short(edge.to)}. ${edge.evidenceIds.length} evidence records.`} onClick={()=>onSelect({kind:'group',id:edge.id,wallets:[edge.from,edge.to],evidenceIds:edge.evidenceIds})} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect({kind:'group',id:edge.id,wallets:[edge.from,edge.to],evidenceIds:edge.evidenceIds});}}}/></g>; })}
            {graph.nodes.map(node => <g key={node.address} data-map-node="true" transform={`translate(${node.x} ${node.y})`}><g data-wallet="true" className={`ro-wallet ${node.rank<=3&&node.share!==null?'is-major':''} ${selectedWallets.has(node.address) ? 'is-selected' : ''} ${focusAddress && !highlighted.has(node.address) ? 'is-muted' : ''}`} role="button" tabIndex={0} aria-label={`${node.address}, ${shareText(node.share)}. Inspect wallet evidence.`} aria-pressed={selectedWallets.has(node.address)} onPointerEnter={() => setHovered(node.address)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(node.address)} onBlur={() => setHovered(null)} onClick={() => selectWallet(node.address)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectWallet(node.address); } }}>
              <circle className="ro-hit" r={Math.max(20, node.radius + 8)} />
              <g className="ro-node-arrival"><circle className={`ro-node ${node.share == null ? 'is-unknown' : ''}`} r={node.radius} />{node.radius>=17&&<circle className="ro-node-inner" r={node.radius-4}/>}<circle className="ro-node-focus" r={node.radius+7} pathLength="100"/><circle className="ro-selection-orbit" r={node.radius+11} pathLength="100"/><circle key={selectedWallets.has(node.address)?'selected':'idle'} className="ro-selection-response" r={node.radius+15} pathLength="100"/>{node.categories.includes('creator')&&<circle className="ro-creator-ring" r={node.radius+3}/>}<path className="ro-node-brackets" d={`M${-node.radius-8} -5v-7h7M${node.radius+8} 5v7h-7`}/>{node.categories.includes('authority')&&<rect className="ro-authority-mark" x="-3" y={-node.radius-7} width="6" height="6"/>}{node.radius>=18?<text className={node.radius<26 ? "ro-node-label ro-label-compact" : "ro-node-label"} textAnchor="middle" y={node.radius>=28&&(node.categories.includes('creator')||node.categories.includes('authority'))?-2:4}><tspan x="0">{bubbleShare(node.share)}</tspan>{node.radius>=28&&(node.categories.includes('creator')||node.categories.includes('authority'))&&<tspan className="ro-node-rank" x="0" dy="13">{node.categories.includes('creator')?'CREATOR':'OWNER'}</tspan>}</text>:<circle className="ro-node-core" r={node.share===null?0:1.6}/>}</g>
            </g></g>)}
          </g>
        </svg>
        {!graph.nodes.length && <p className="ro-map-empty">Holder map unavailable<small>No current holder addresses were returned. No relationship can be inferred from this empty view.</small></p>}
        {focused&&<div className="ro-map-tooltip" aria-hidden="true"><strong>{short(focused.address)}</strong><span>{shareText(focused.share)}</span>{shareBasis==='float'&&<span className="ro-map-raw-share">{formatMapShare(focused.share,'total')}</span>}<small>{focused.categories.filter(category=>category!=='unclassified').map(category=>category==='authority'?'Owner':category==='deployer-linked'?'Dev-linked':category.replaceAll('-',' ')).join(' / ')||'No additional wallet flag'}</small></div>}
        <div className="ro-map-controls" aria-label="Network view controls"><button type="button" aria-label="Zoom out" disabled={view.zoom <= .75} onClick={() => zoom(-.25)}><Minus size={16} /></button><output aria-label="Network zoom">{Math.round(view.zoom * 100)}%</output><button type="button" aria-label="Zoom in" disabled={view.zoom >= 2.5} onClick={() => zoom(.25)}><Plus size={16} /></button><button type="button" aria-label="Reset network view" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}><RotateCcw size={15} /></button></div>
      </div>
      {graph.nodes.length>0&&<div className="ro-holder-rail" aria-label="Largest displayed holders">{graph.nodes.slice(0,3).map(node=><button type="button" key={node.address} className={selectedWallets.has(node.address)?'is-selected':''} onPointerEnter={()=>setHovered(node.address)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(node.address)} onBlur={()=>setHovered(null)} onClick={()=>selectWallet(node.address)} aria-label={`Inspect holder rank ${node.rank}, ${node.address}, ${shareText(node.share)}`}><span className="ro-rail-rank">{String(node.rank).padStart(2,'0')}</span><span><strong>{short(node.address)}</strong><small>{shareText(node.share)}</small></span><ArrowUpRight size={13}/></button>)}</div>}
      <div className="ro-map-caption"><div aria-live="polite"><strong>{focused ? short(focused.address) : selected ? short(selected) : 'Select a holder'}</strong><span>{focused ? `${shareText(focused.share)} - ${graph.neighbors.get(focused.address)?.size || 0} visible connections` : selected ? 'Outside the displayed holder set. Open wallet evidence for its snapshot and history.' : 'Hover or focus a wallet. Select it to inspect the evidence.'}</span></div>{graph.linked.length > 1 && <button type="button" onClick={selectGroup}>{graph.linked.length} linked<ArrowUpRight size={14} /></button>}</div>
      <div className="ro-legend"><span><i />{shareBasis==='float'?'Snapshot float':'Total supply'}</span><span><i className="is-hollow" />Share unknown</span><span><i className="is-ring" />Creator</span><span><i className="is-authority" />Owner</span><span><i className="is-link" />Documented link</span></div>
      <p className="ro-map-quick-help">{cohort.rawRanked.length} ranked balances, {graph.excludedInfrastructure} set aside. Drag to explore. Select a wallet for evidence.</p>
      <details className="ro-map-method"><summary>How shares and connections work</summary>
      <p id={`${id}-map-basis`} className="ro-map-basis-note">{floatBasis.denominator===null?floatBasis.reason:<>Snapshot float = 100% − {floatBasis.excluded!.toLocaleString(undefined,{maximumFractionDigits:8})}% measured set-aside balances = {floatBasis.denominator.toLocaleString(undefined,{maximumSignificantDigits:10})}% of total supply. Wallet snapshot-float share = supply share ÷ this denominator × 100.</>} Uses measured platform, burn and selected verified code-contract balances, not the sum of displayed wallets. A contract account is not automatically a pool or locker. Previously identified infrastructure without current balances is outside this denominator: its balance is unknown, not zero. Other infrastructure may be unrecognized. This is not verified circulating float or a complete supply census.</p>
      <p id={`${id}-map-help`} className="ro-map-help">{graph.nodes.length} largest current holders shown{graph.truncated?` of ${graph.total} analyzed`:''}. {graph.excludedInfrastructure} infrastructure addresses excluded. Labels show the selected percentage basis. Bubble areas retain their supply-share proportions; tiny holdings use a minimum marker. Lines show transaction-backed relationships, not common ownership. Motion is decorative, not live transfers; position has no risk meaning. Historical-only addresses remain in Traced addresses. Drag to pan; arrow keys pan when the map is focused. + / - zoom; Home resets the view.</p>
      </details>
    </div>
  </section>;
}
