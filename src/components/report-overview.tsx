"use client";

import {LLM_REVIEW_ENABLED} from '@/lib/features';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Crosshair, Minus, Plus, RotateCcw } from 'lucide-react';
import { gsap } from 'gsap';
import { short } from '@/lib/analysis';
import { getDisplayAssessment } from '@/lib/verdict-summary';
import { findingBreakdown } from '@/lib/finding-breakdown';
import { verdictConfidence } from '@/lib/verdict-confidence';
import {trustRating} from '@/lib/trust-rating';
import {buildCurrentHolderGraph} from '@/lib/current-holder-graph';
import {holderScope} from '@/lib/holder-scope';
import {computeRiskMetrics} from '@/lib/risk-metrics';
import RiskMeasurements from './risk-measurements';
import type { InvestigationReport, WalletCategory } from '@/lib/investigation-types';
import type { Selection } from './investigation-panels';
import CheckBreakdown from './check-breakdown';
import CryptoAgentPanel,{useCryptoReview} from './crypto-agent-panel';
import './report-overview.css';

type Props = { report: InvestigationReport; selection?: Selection | null; onSelect: (selection: Selection) => void; onInspect: () => void; paused: boolean };
const LIMIT = 100, WIDTH = 700, HEIGHT = 400;
const shareText = (share: number | null) => share == null || !Number.isFinite(share) ? 'Supply share unavailable' : share > 0 && share < .01 ? '<0.01% of supply' : `${share.toLocaleString(undefined, { maximumFractionDigits: 2 })}% of supply`;
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
export default function ReportOverview({ report, selection, onSelect, onInspect, paused }: Props) {
  const agentResult=useCryptoReview(report),agentReview=LLM_REVIEW_ENABLED&&agentResult?.status==='ready'?agentResult.review:null;
  const id = useId(), inv = report.investigation, provider = report.providerAnalysis, assessment = getDisplayAssessment(report), age = sourceAge(report);
  const snapshot=useMemo(()=>holderScope(report),[report]);
  const largestHolding=useMemo(()=>(report.riskMetrics||computeRiskMetrics(report)).metrics.find(metric=>metric.id==='largest-holder-adjusted-float'),[report]);
  const root = useRef<HTMLElement>(null), viewport = useRef<SVGGElement>(null), motion = useRef<gsap.core.Timeline | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [hovered, setHovered] = useState<string | null>(null), [localSelection, setLocalSelection] = useState<string | null>(null);
  const [onScreen, setOnScreen] = useState(false), [visible, setVisible] = useState(true), [reduced, setReduced] = useState(false);
  const selectedRaw = selection === undefined ? localSelection : selection?.kind === 'wallet' ? selection.id : null;
  const selected = selectedRaw&&report.chain!=='solana'?selectedRaw.toLowerCase():selectedRaw;
  const drag = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);
  const animate = !paused && !reduced && visible && onScreen;
  const graph = useMemo(() => {
    const current=buildCurrentHolderGraph(report,{limit:LIMIT});
    const wallets=current.nodes,edges=current.edges;
    const maxShare = Math.max(1, ...wallets.map(wallet => wallet.share ?? 0));
    const nodes = wallets.map((wallet, index) => {
      const angle = index * Math.PI * (3 - Math.sqrt(5)) - .7, distance = Math.sqrt((index + .3) / Math.max(1, wallets.length));
      return { ...wallet, rank:index+1, x: WIDTH / 2 + Math.cos(angle) * 285 * distance, y: HEIGHT / 2 + Math.sin(angle) * 155 * distance, radius: wallet.share == null ? 6 : Math.max(6,(wallets.length>50?28:wallets.length>25?36:46)*Math.sqrt(Math.max(0,wallet.share)/maxShare)) };
    });
    // Deterministic collision relaxation separates bubbles and pointer targets.
    for (let pass = 0; pass < 70; pass++) {
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy) || .01;
        const minimum = Math.max(9, a.radius) + Math.max(9, b.radius) + 9;
        if (distance < minimum) { const shift = (minimum - distance) * .32; a.x -= dx / distance * shift; a.y -= dy / distance * shift; b.x += dx / distance * shift; b.y += dy / distance * shift; }
      }
      for (const node of nodes) { node.x = Math.max(node.radius + 35, Math.min(WIDTH - node.radius - 35, node.x)); node.y = Math.max(node.radius + 28, Math.min(HEIGHT - node.radius - 28, node.y)); }
    }
    const neighbors = new Map(nodes.map(node => [node.address, new Set<string>()]));
    for (const edge of edges) { neighbors.get(edge.from)!.add(edge.to); neighbors.get(edge.to)!.add(edge.from); }
    const groups: string[][] = [], visited = new Set<string>();
    for (const node of nodes) {
      if (visited.has(node.address)) continue;
      const queue = [node.address], members: string[] = []; visited.add(node.address);
      while (queue.length) { const address = queue.shift()!; members.push(address); for (const next of neighbors.get(address)!) if (!visited.has(next)) { visited.add(next); queue.push(next); } }
      if (members.length > 1) groups.push(members);
    }
    return { total:current.total,excludedInfrastructure:current.excludedInfrastructure,truncated:current.truncated,documentedGroups:current.documentedGroups,nodes, edges, neighbors, linked: groups.sort((a, b) => b.length - a.length)[0] || [], positions: new Map(nodes.map(node => [node.address, node])) };
  }, [report]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const preferences = () => { setReduced(media.matches); setVisible(!document.hidden); };
    preferences(); media.addEventListener('change', preferences); document.addEventListener('visibilitychange', preferences);
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: .08 });
    if (root.current) observer.observe(root.current.querySelector('.ro-canvas') || root.current);
    return () => { observer.disconnect(); media.removeEventListener('change', preferences); document.removeEventListener('visibilitychange', preferences); };
  }, []);
  useEffect(() => {
    const context = gsap.context(() => {
      const sequence = gsap.timeline({ paused: true });
      const points = graph.nodes.map(node=>({address:node.address,x:node.x,y:node.y}));
      const positions = new Map(points.map(point=>[point.address,point]));
      const elements = [...(root.current?.querySelectorAll<SVGGElement>('[data-map-node]') || [])];
      const edges = [...(root.current?.querySelectorAll<SVGGElement>('[data-map-edge]') || [])];
      const redraw = () => {
        elements.forEach((element,index)=>{const point=points[index];element.setAttribute('transform',`translate(${point.x} ${point.y})`);});
        edges.forEach((element,index)=>{const edge=graph.edges[index],a=positions.get(edge.from)!,b=positions.get(edge.to)!;const path=`M ${a.x} ${a.y} Q ${(a.x+b.x)/2} ${(a.y+b.y)/2-Math.min(30,Math.abs(a.x-b.x)/7)} ${b.x} ${b.y}`;element.querySelectorAll('path').forEach(line=>line.setAttribute('d',path));});
      };
      // A six-pixel maximum drift preserves target spacing and makes the static
      // snapshot explorable without pretending that these are live transfers.
      points.forEach((point,index)=>sequence.to(point,{x:point.x+Math.cos(index*2.4)*5,y:point.y+Math.sin(index*1.7)*4,duration:6+index%5,repeat:-1,yoyo:true,ease:'sine.inOut'},0));
      sequence.eventCallback('onUpdate',redraw);
      motion.current = sequence;
    }, root);
    return () => { context.revert(); motion.current = null; };
  }, [graph]);
  useEffect(() => { motion.current?.paused(!animate); if (reduced || paused) gsap.set(root.current?.querySelectorAll('.ro-node-arrival') || [], { opacity: 1, scale: 1 }); }, [animate, reduced, paused, graph]);
  useEffect(() => {
    const tween = gsap.to(viewport.current, { attr: { transform: `translate(${view.x} ${view.y}) translate(350 200) scale(${view.zoom}) translate(-350 -200)` }, duration: animate && !drag.current ? .3 : 0, ease: 'power3.out', overwrite: true });
    return () => { tween.kill(); };
  }, [view, animate]);

  const selectedWallets = new Set(selected ? [selected] : selection?.wallets || []);
  if (selection?.kind === 'relationship') { const edge = inv.relationships.find(edge => edge.id === selection.id); if (edge) { selectedWallets.add(edge.from); selectedWallets.add(edge.to); } }
  if (selection?.kind === 'finding') for (const address of inv.findings.find(finding => finding.id === selection.id)?.wallets || []) selectedWallets.add(address);
  const focusAddress = hovered || selected, focused = graph.positions.get(focusAddress || '');
  const highlighted = new Set([...selectedWallets, ...(focusAddress ? [focusAddress, ...(graph.neighbors.get(focusAddress) || [])] : [])]);
  const selectWallet = (address: string) => { if (selection === undefined) setLocalSelection(address); onSelect({ kind: 'wallet', id: address }); };
  const selectGroup = () => { const members = new Set(graph.linked); onSelect({ kind: 'group', id: 'overview-linked-group', wallets: graph.linked, evidenceIds: [...new Set(graph.edges.filter(edge => members.has(edge.from) && members.has(edge.to)).flatMap(edge => edge.evidenceIds))] }); };
  const zoom = (delta: number) => setView(value => ({ ...value, zoom: Math.max(.75, Math.min(2.5, Math.round((value.zoom + delta) * 100) / 100)) }));
  const breakdown = findingBreakdown(inv.findings);
  const reasons = breakdown.risks.filter(finding=>!finding.id.startsWith('funder:'));
  const fundingPatterns = breakdown.risks.filter(finding=>finding.id.startsWith('funder:'));
  const rating=trustRating(report);
  const decision = agentReview?.decision||rating.decision;
  const confidence = verdictConfidence(report);
  const roles: { category: WalletCategory; name: string }[] = [{ category: 'creator', name: 'Creator' }, { category: 'authority', name: 'Authority' }, { category: 'sniper', name: 'Possible snipers' }];
  const verifiedTiming = inv.coverage.launchVerified || !!inv.coverage.poolTiming || !!inv.coverage.poolTimings?.length;

  return <section ref={root} className="report-overview" aria-label="Wallet network and assessment" data-paused={!animate}>
    <div className={`ro-assessment ro-status-${agentReview?(decision==='AVOID'?'critical':decision==='OK'?'clear':'caution'):assessment.status}`}>
      <header className="ro-verdict-heading"><h2>{agentReview?'Gemini verdict':'Independent verdict'}</h2><span className="ro-coverage">{inv.coverage.status === 'complete' ? 'Scope complete' : inv.coverage.status === 'partial' ? 'Partial evidence' : 'Evidence unavailable'}</span></header>
      <div className="ro-rating"><strong className="ro-decision">{decision}</strong>{!LLM_REVIEW_ENABLED&&<div className="ro-overall-confidence" aria-label={rating.score===null?'Overall evidence rating unavailable':`Overall evidence rating: ${rating.score} out of 100`}><strong>{rating.score===null?'Unrated':rating.score}{rating.score!==null&&<small>%</small>}</strong><span>Overall evidence rating</span></div>}{agentReview?.confidencePercent!=null&&<div className="ro-overall-confidence" aria-label={`Overall verdict confidence: ${agentReview.confidencePercent}% in ${decision}`}><strong>{agentReview.confidencePercent.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></strong><span>Verdict confidence</span></div>}</div>
      {!LLM_REVIEW_ENABLED&&<p className="ro-overall-explanation">Calculated from contract checks, holder distribution and observed wallet activity. A rule-based rating, not a safety probability.</p>}
      {agentReview?.confidencePercent!=null&&<p className="ro-overall-explanation">{agentReview.confidencePercent.toLocaleString(undefined,{maximumFractionDigits:1})}% model weight for {decision}. The breakdown below shows the alternatives.</p>}
      {agentReview&&<section className="ro-decision-weights" aria-label="AI decision weights">
        <h3>AI decision weights</h3>
        {agentReview.distribution?<>
          <dl>{([['avoid','Avoid'],['caution','Caution'],['ok','OK']] as const).map(([key,label])=><div key={key} className={decision===key.toUpperCase()?'is-selected':''}>
            <dt>{label}</dt><dd><span className="ro-weight-track" aria-hidden="true"><span style={{width:`${agentReview.distribution![key]}%`}}/></span><span className="ro-weight-value">{agentReview.distribution![key].toFixed(1)}%</span></dd>
          </div>)}</dl>
          <p>How Gemini weighs this evidence across the three decisions. Not a probability of token safety.</p>
        </>:<p>{agentReview.overrides.length?'Decision weights withheld because an evidence rule changed or restricted the AI verdict.':'The available evidence does not support decision weights.'}</p>}
      </section>}
      <p className="ro-summary">{agentReview?.summary||assessment.summary}</p>
      <div className="ro-holder-scope">
        <dl aria-label="Holder snapshot and investigation scope">
          <div><dt>Snapshot holders</dt><dd>{snapshot.holders.length.toLocaleString()}</dd></div>
          <div><dt>Addresses traced</dt><dd>{inv.wallets.length.toLocaleString()}</dd></div>
          {largestHolding?.value!=null&&<div><dt>Largest / adjusted supply</dt><dd>{largestHolding.value.toFixed(2)}%</dd></div>}
        </dl>
        <p>Holder counts exclude {snapshot.infrastructure.length.toLocaleString()} observed infrastructure address{snapshot.infrastructure.length===1?'':'es'}. Traced addresses also include historical activity.{largestHolding?.value!=null?' Adjusted supply excludes observed infrastructure balances.':''}</p>
      </div>
      <details className="ro-rating-details"><summary>Independent rule checks</summary><p>Diagnostic policy rating: {rating.score===null?'unrated':`${rating.score}/100`}. This is calculated from the evidence below; it is not a probability of safety.</p><p>{rating.basis}</p><dl>{rating.components.map(component=><div key={component.id}><dt>{component.label}<small>{component.detail}</small></dt><dd>{component.earned}<span> / {component.maximum}</span></dd></div>)}</dl></details>
      <details className="ro-confidence"><summary>Evidence support: {confidence.level}</summary><p>{confidence.reason}</p><p>Coverage describes what was checked. The rating describes the findings within that scope. Neither is a measured probability of future safety.</p></details>
      {LLM_REVIEW_ENABLED&&<CryptoAgentPanel report={report} onSelect={onSelect} result={agentResult}/>}
      <p className="ro-findings-total">{breakdown.label}</p>
      <CheckBreakdown report={report} />
      <RiskMeasurements report={report} onSelect={onSelect}/>
      <div className="ro-reasons"><h3>Independent findings</h3>
        {!!fundingPatterns.length&&<section className="ro-funding-patterns"><h4>{fundingPatterns.length} shared-funding pattern{fundingPatterns.length===1?'':'s'}</h4><p>These wallets received funds from common sources. The transfers are observed; shared ownership or coordinated selling is not established. An unlabeled service could explain the links.</p><div>{fundingPatterns.map(finding=><button key={finding.id} type="button" onClick={()=>onSelect({kind:'finding',id:finding.id})}><span><span>Source <code title={finding.id.slice(7)}>{short(finding.id.slice(7))}</code></span><small>{finding.wallets.length} wallets · {finding.evidenceIds.length} records · {finding.attribution==='provider-reported'?'Provider-reported':'Inferred pattern'}</small></span><ArrowUpRight size={14}/></button>)}</div></section>}
        {assessment.status==='clear'&&provider?.band?.trim().toUpperCase()==='CLEAN'&&<button type="button" onClick={onInspect}><span className="ro-reason-mark" aria-hidden="true"/><span><strong>SwarmEngine reports CLEAN{provider.score!=null?` - ${provider.score}/100`:''}</strong><span className="ro-reason-description">{provider.reason||'No warning was reported in the provider assessment.'}</span><small>Provider-reported result</small></span><ArrowUpRight size={15}/></button>}
        {reasons.map(finding => <button key={finding.id} type="button" onClick={() => onSelect({ kind: 'finding', id: finding.id })}><span className={`ro-reason-mark is-${finding.level}`} aria-hidden="true" /><span><strong>{finding.title}</strong><span className="ro-reason-description">{finding.description}</span>{finding.id.startsWith('funder:')&&<small className="ro-funding-source" title={finding.id.slice(7)}>Funding source: {short(finding.id.slice(7))}</small>}<small>{finding.attribution === 'provider-reported' ? 'Reported by SwarmEngine' : finding.certainty === 'inferred' ? 'Inferred from the sample' : 'Evidence in this report'}</small></span><ArrowUpRight size={15} /></button>)}
        {!breakdown.risks.length && <p>{'No additional wallet-risk finding was established in the retrieved scope. See the verdict reasoning and coverage above.'}</p>}
      </div>
      {!inv.coverage.launchVerified&&<div className="ro-coverage-note"><strong>Coverage gap - launch history</strong><p>{verifiedTiming?'Selected pool windows are verified; the first-ever token launch is not.':'First-minute buyer coverage is unverified, so possible snipers cannot be assessed.'} This is missing evidence, not an additional detected risk.</p></div>}
      <div className="ro-age"><Clock3 size={18} aria-hidden="true" /><div><span>{age.basis}</span><strong>{age.value}</strong></div><details><summary>Source</summary><p>{age.detail}</p></details></div>
      {provider && <div className="ro-provider"><div><a href={provider.sourceUrl} target="_blank" rel="noreferrer">SwarmEngine report <ArrowUpRight size={13} /></a><span>{provider.band || 'No rating'}{provider.score != null && ` - ${provider.score}/100`}</span></div><small>Scanned {provider.providerTimestamp ? dateText(provider.providerTimestamp) : 'at an unreported time'}. Retrieved {dateText(provider.fetchedAt)}.</small><small>Provider claims are not independently verified. Its score is not a safety probability.</small></div>}
      <div className="ro-roles" aria-label="Roles in the supplied sample">{roles.map(({ category, name }) => {
        const wallets = inv.wallets.filter(wallet => wallet.categories.includes(category)), reportedCount = wallets.filter(wallet => wallet.categorySources?.[category] === 'swarm').length;
        const reported = reportedCount === wallets.length && reportedCount > 0, poolScoped = !reported && category === 'sniper' && !inv.coverage.launchVerified && verifiedTiming;
        const negative = category === 'sniper' && provider && provider.holders.length > 0 && provider.holders.every(holder => holder.signals.sniper === false);
        const revoked=category==='authority'&&report.solana?.authorities.mint.address===null&&report.solana?.authorities.freeze.address===null;
        return <div key={category}><span>{name}</span>{wallets.length ? <button type="button" onClick={() => wallets.length === 1 ? selectWallet(wallets[0].address) : onInspect()}>{wallets.length} {reported ? 'reported' : 'identified'}<ArrowUpRight size={12} /></button> : <small>{revoked ? 'Mint / freeze revoked' : negative ? '0 reported in sample' : provider ? 'Not reported' : 'Not established'}</small>}{reportedCount > 0 && reportedCount < wallets.length && <small>{reportedCount} provider-reported</small>}{poolScoped && <small>Selected pools only</small>}</div>;
      })}</div>
      <button type="button" className="ro-inspect" onClick={onInspect}>Inspect evidence and coverage <ArrowUpRight size={17} /></button>
      <p className="ro-boundary">{report.fixture ? 'Synthetic example. ' : ''}A bounded investigation, not a guarantee of safety.</p>
    </div>
    <div className="ro-map">
      <header className="ro-map-heading"><h2>Holder map <Crosshair size={17} aria-hidden="true" /></h2><span>{graph.nodes.length} / {graph.total} holders</span></header>
      <div className="ro-canvas">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-labelledby={`${id}-map-title`} aria-describedby={`${id}-map-help`} tabIndex={0}
          onKeyDown={event => { if (event.target !== event.currentTarget) return; const steps: Record<string, [number, number]> = { ArrowLeft: [-25, 0], ArrowRight: [25, 0], ArrowUp: [0, -25], ArrowDown: [0, 25] }; if (steps[event.key]) { event.preventDefault(); const [x, y] = steps[event.key]; setView(value => ({ ...value, x: value.x + x, y: value.y + y })); } if (event.key === 'Home') { event.preventDefault(); setView({ x: 0, y: 0, zoom: 1 }); } }}
          onPointerDown={event => { if ((event.target as Element).closest('[data-wallet], [data-map-edge]') || event.button !== 0) return; drag.current = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (!drag.current) return; const rect = event.currentTarget.getBoundingClientRect(), scale = Math.max(WIDTH / rect.width, HEIGHT / rect.height), origin = drag.current; setView(value => ({ ...value, x: origin.originX + (event.clientX - origin.x) * scale, y: origin.originY + (event.clientY - origin.y) * scale })); }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          <title id={`${id}-map-title`}>Current holder snapshot. Connections require matching transaction evidence. Position and motion are visual layout only.</title>
          <g className="ro-map-registration" aria-hidden="true"><path d="M 22 42 V 22 H 42 M 658 22 H 678 V 42 M 22 358 V 378 H 42 M 658 378 H 678 V 358" /></g>
          <g ref={viewport}>
            {graph.edges.map(edge => { const a = graph.positions.get(edge.from)!, b = graph.positions.get(edge.to)!, path = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - Math.min(30, Math.abs(a.x - b.x) / 7)} ${b.x} ${b.y}`; return <g key={edge.id} data-map-edge="true" className={`ro-edge ${edge.attribution === 'provider-reported' ? 'is-reported' : ''} ${highlighted.has(edge.from) && highlighted.has(edge.to) ? 'is-highlighted' : ''} ${focusAddress&&(!highlighted.has(edge.from)||!highlighted.has(edge.to))?'is-muted':''}`}><path className="ro-connection" d={path}><title>{edge.description}</title></path><path className="ro-edge-hit" d={path} role="button" tabIndex={0} aria-label={`Inspect connection between ${short(edge.from)} and ${short(edge.to)}. ${edge.evidenceIds.length} evidence records.`} onClick={()=>onSelect({kind:'group',id:edge.id,wallets:[edge.from,edge.to],evidenceIds:edge.evidenceIds})} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect({kind:'group',id:edge.id,wallets:[edge.from,edge.to],evidenceIds:edge.evidenceIds});}}}/></g>; })}
            {graph.nodes.map(node => <g key={node.address} data-map-node="true" transform={`translate(${node.x} ${node.y})`}><g data-wallet="true" className={`ro-wallet ${selectedWallets.has(node.address) ? 'is-selected' : ''} ${focusAddress && !highlighted.has(node.address) ? 'is-muted' : ''}`} role="button" tabIndex={0} aria-label={`${node.label || node.address}, ${shareText(node.share)}. Inspect wallet evidence.`} aria-pressed={selectedWallets.has(node.address)} onPointerEnter={() => setHovered(node.address)} onPointerLeave={() => setHovered(null)} onFocus={() => setHovered(node.address)} onBlur={() => setHovered(null)} onClick={() => selectWallet(node.address)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectWallet(node.address); } }}>
              <title>{node.label || short(node.address)} - {shareText(node.share)}</title><circle className="ro-hit" r={Math.max(20, node.radius + 8)} />
              <g className="ro-node-arrival"><circle className={`ro-node ${node.share == null ? 'is-unknown' : ''}`} r={node.radius} /><circle className="ro-node-focus" r={node.radius + 6} />{node.categories.includes('creator') && <circle className="ro-creator-ring" r={node.radius + 3} />}{node.radius>=25?<text className="ro-node-label" textAnchor="middle" y="-2"><tspan x="0">{node.share!==null?`${node.share<.1?'<0.1':node.share.toFixed(1)}%`:''}</tspan><tspan className="ro-node-rank" x="0" dy="15">#{node.rank}</tspan></text>:<circle className="ro-node-core" r="2" />}</g>
            </g></g>)}
          </g>
        </svg>
        {!graph.nodes.length && <p className="ro-map-empty">No holder addresses were returned.<small>Open the evidence to see which sources are missing.</small></p>}
        {focused&&<div className="ro-map-tooltip" aria-hidden="true"><strong>{focused.label||short(focused.address)}</strong><span>{shareText(focused.share)}</span><small>{focused.categories.filter(category=>category!=='unclassified').map(category=>category.replaceAll('-',' ')).join(' / ')||'Wallet role not established'}</small></div>}
        <div className="ro-map-controls" aria-label="Network view controls"><button type="button" aria-label="Zoom out" disabled={view.zoom <= .75} onClick={() => zoom(-.25)}><Minus size={16} /></button><output aria-label="Network zoom">{Math.round(view.zoom * 100)}%</output><button type="button" aria-label="Zoom in" disabled={view.zoom >= 2.5} onClick={() => zoom(.25)}><Plus size={16} /></button><button type="button" aria-label="Reset network view" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}><RotateCcw size={15} /></button></div>
      </div>
      <div className="ro-map-caption"><div aria-live="polite"><strong>{focused ? focused.label || short(focused.address) : selected ? short(selected) : 'Explore the connections'}</strong><span>{focused ? `${shareText(focused.share)} - ${graph.neighbors.get(focused.address)?.size || 0} visible connections` : selected ? 'Outside this current-holder map. Open wallet evidence for historical details.' : 'Hover or focus a wallet. Select it to inspect the evidence.'}</span></div>{graph.linked.length > 1 && <button type="button" onClick={selectGroup}>{graph.linked.length} linked<ArrowUpRight size={14} /></button>}</div>
      <div className="ro-legend"><span><i />Supply share</span><span><i className="is-hollow" />Share unknown</span><span><i className="is-ring" />Creator label</span></div>
      <p id={`${id}-map-help`} className="ro-map-help">{graph.nodes.length} current holders shown{graph.truncated?` of ${graph.total}`:''}. {graph.excludedInfrastructure} infrastructure addresses excluded. Bubble area reflects supply share; tiny holdings use a minimum marker. Lines show transaction-backed relationships, not common ownership. Historical-only addresses remain in Traced addresses. Drag to pan; arrow keys pan when the map is focused. Home resets the view.</p>
    </div>
  </section>;
}
