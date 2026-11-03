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
import {buildCurrentHolderGraph} from '@/lib/current-holder-graph';
import {holderScope} from '@/lib/holder-scope';
import {computeRiskMetrics} from '@/lib/risk-metrics';
import RiskMeasurements from './risk-measurements';
import DecisionOutput from './decision-output';
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
  const rating=useMemo(()=>trustRating(report),[report]);
  const observed=useMemo(()=>observedDecision(report,rating),[report,rating]);
  const decision = agentReview?.decision||observed?.judge.decision||rating.decision;
  const simpleReason=agentReview?.summary||rating.hard?.[0]||rating.soft?.[0]||(observed?.judge.p?decision==='OK'?'No stop rule was triggered in the observed activity.':'The observed activity raised warning signs.':rating.score===null?'Some wallet checks are incomplete.':rating.decision==='CLEAN'||rating.decision==='OK'?'No major warning found in the completed checks.':'The completed checks found warning signs.');
  const scoreText=rating.score!==null?String(rating.score):'Unavailable';
  const points=(n:number)=>Number(n.toFixed(1)).toLocaleString();
  const confidencePercent=observed?.judge.confidence==null?null:Math.round(observed.judge.confidence*1000)/10;
  const unresolved=new Set(rating.components.filter(component=>component.state==='unknown').map(component=>component.id));
  const why: {title:string;detail:string}[]=[];
  for(const reason of [...(rating.hard||[]),...(rating.soft||[])])why.push({title:'Verified warning',detail:reason});
  if(observed?.judge.p){
   const factor=(id:string)=>observed.factors.find(f=>f.id===id)!;
   why.push({title:'Holder concentration',detail:`The largest documented holder group holds ${(observed.largestShare*100).toFixed(2)}% of adjusted supply. The top ten groups hold ${(factor('concentration').value*100).toFixed(2)}%.`});
   why.push({title:'Creator-linked holdings',detail:`${(factor('dev').value*100).toFixed(2)}% is held by the identified creator and directly linked wallets found in the retrieved records. Other funding paths remain unverified.`});
   why.push({title:'Large-sale model',detail:`A hypothetical sale by the largest group moves the raw pool price ${(observed.impact*100).toFixed(1)}% in the model, before fees or token restrictions. This is not a verified trade quote.`});
   why.push({title:'Wallet activity checked',detail:`Fresh-wallet exposure is ${(factor('fresh').value*100).toFixed(1)}% among ${observed.scope.readableFreshWallets} readable non-creator wallets; ${observed.scope.unreadFreshWallets} unread wallets are excluded. Early-buyer findings use retrieved records, not complete launch history.`});
  }else{
   if(unresolved.has('fresh'))why.push({title:'Some holder histories are unread',detail:'Lifetime activity has not been verified for every current holder, so the fresh-wallet check is incomplete.'});
   if(unresolved.has('insiders')||unresolved.has('snipers'))why.push({title:'Early buying is unverified',detail:'The retrieved records do not cover the complete launch. First-minute buyers and pre-trading transfers are still unresolved.'});
   if(unresolved.has('dev'))why.push({title:'Creator funding is not fully traced',detail:'The complete funding trail is missing, so the total held by the creator and creator-funded wallets cannot be confirmed.'});
   if(unresolved.has('swarm'))why.push({title:'Sell impact is unverified',detail:'The available pool evidence cannot establish how much a sale by the largest holder group could move the price.'});
  }
  if(!why.length&&rating.score===null)why.push({title:'Required checks are incomplete',detail:'Some current contract controls or holder balances could not be verified. Open the evidence to see which source results are missing.'});
  const roles: { category: WalletCategory; name: string }[] = [{ category: 'creator', name: 'Creator' }, { category: 'authority', name: 'Authority' }, { category: 'sniper', name: 'Possible snipers' }];
  const verifiedTiming = inv.coverage.launchVerified || !!inv.coverage.poolTiming || !!inv.coverage.poolTimings?.length;

  return <section ref={root} className="report-overview" aria-label="Wallet network and assessment" data-paused={!animate}>
    <div className={`ro-assessment ro-status-${decision==='AVOID'?'critical':decision==='OK'||decision==='CLEAN'?'clear':'caution'}`}>
      <header className="ro-verdict-heading"><h2>Verdict</h2><span className="ro-coverage">{observed?.judge.p?'Observed activity':inv.coverage.status === 'complete' ? 'Checks complete' : inv.coverage.status === 'partial' ? 'Incomplete checks' : 'Evidence unavailable'}</span></header>
      <div className="ro-rating"><strong className="ro-decision">{decision}</strong><div className="ro-evidence-confidence" aria-label={confidencePercent===null?'Model confidence unavailable':`Model confidence: ${confidencePercent}%`}><span>Model confidence</span><strong>{confidencePercent===null?'Unavailable':<>{confidencePercent.toLocaleString(undefined,{maximumFractionDigits:1})}<small>%</small></>}</strong></div></div>
      <p className="ro-simple-reason">{simpleReason}</p>
      {why.length>0&&<section className="ro-plain-reasons" aria-label={`Why ${decision.toLowerCase()}?`}><h3>Why {decision.toLowerCase()}?</h3><ul>{why.map((reason,index)=><li key={`${reason.title}:${index}`}><strong>{reason.title}</strong><p>{reason.detail}</p></li>)}</ul></section>}
      <details className="ro-analysis-details"><summary>Analysis details</summary><div className="ro-analysis-body">
      {agentReview&&<section className="ro-decision-weights" aria-label="AI decision weights">
        <h3>AI decision weights</h3>
        {agentReview.distribution?<>
          <dl>{([['avoid','Avoid'],['caution','Caution'],['ok','OK']] as const).map(([key,label])=><div key={key} className={decision===key.toUpperCase()?'is-selected':''}>
            <dt>{label}</dt><dd><span className="ro-weight-track" aria-hidden="true"><span style={{width:`${agentReview.distribution![key]}%`}}/></span><span className="ro-weight-value">{agentReview.distribution![key].toFixed(1)}%</span></dd>
          </div>)}</dl>
          <p>How Gemini weighs this evidence across the three decisions. Not a probability of token safety.</p>
        </>:<p>{agentReview.overrides.length?'Decision weights withheld because an evidence rule changed or restricted the AI verdict.':'The available evidence does not support decision weights.'}</p>}
      </section>}
      {!LLM_REVIEW_ENABLED&&(observed?.judge.p||rating.judge?.p)&&<DecisionOutput result={observed?.judge.p?observed.judge:rating.judge!}/>}
      {observed&&<details className="ro-rating-details"><summary>Observed score - {observed.score}/100</summary><dl>{observed.factors.map(factor=><div key={factor.id}><dt>{factor.id}<small>{factor.detail}</small></dt><dd>{(factor.value*100).toFixed(2)}%</dd></div>)}</dl><p>{observed.scope.readableFreshWallets} readable non-creator wallets assessed; {observed.scope.unreadFreshWallets} unread excluded.</p>{observed.scope.notes.map(note=><p key={note}>{note}</p>)}</details>}
      <div className="ro-holder-scope">
        <dl aria-label="Holder snapshot and investigation scope">
          <div><dt>Snapshot holders</dt><dd>{snapshot.holders.length.toLocaleString()}</dd></div>
          <div><dt>Addresses traced</dt><dd>{inv.wallets.length.toLocaleString()}</dd></div>
          {largestHolding?.value!=null&&<div><dt>Largest / adjusted supply</dt><dd>{largestHolding.value.toFixed(2)}%</dd></div>}
        </dl>
        <p>Holder counts exclude {snapshot.infrastructure.length.toLocaleString()} observed infrastructure address{snapshot.infrastructure.length===1?'':'es'}. Traced addresses also include historical activity.{largestHolding?.value!=null?' Adjusted supply excludes observed infrastructure balances.':''}</p>
      </div>
      <details className="ro-rating-details"><summary>Score breakdown</summary><p>{rating.score===null?'The overall score is unavailable while required checks remain incomplete.':`Measured score: ${scoreText}/100.`}</p><dl>{rating.components.map(component=><div key={component.id}><dt>{component.label}<details className="ro-factor-detail"><summary>Measurement details</summary><p>{component.detail}</p></details>{!!component.evidenceIds?.length&&<button className="ro-factor-evidence" onClick={()=>onSelect({kind:'group',id:`factor:${component.id}`,wallets:[],evidenceIds:component.evidenceIds!})}>Inspect {component.evidenceIds.length} evidence records <ArrowUpRight size={12}/></button>}</dt><dd>{component.state==='unknown'?'Not verified':points(component.earned)}<span> / {component.maximum}</span></dd></div>)}</dl>{!!rating.hard?.length&&<p>Stop rules: {rating.hard.join(' ')}</p>}{!!rating.soft?.length&&<p>Score cap: {rating.soft.join(' ')}</p>}<p>{rating.basis}</p></details>
      {report.controlProbes&&<details className="ro-rating-details"><summary>Direct RPC control observations - {report.controlProbes.observations.filter(o=>o.status==='observed').length} observed</summary><p>{report.controlProbes.anchor?`Block ${report.controlProbes.anchor.number}, ${report.controlProbes.anchor.finality}. `:''}{report.controlProbes.status}. Read at {dateText(report.controlProbes.fetchedAt)}.</p><dl>{report.controlProbes.observations.map(o=><div key={o.key}><dt>{o.key.split(':')[0]}<small>{o.detail}</small></dt><dd>{o.status==='unknown'?'Unresolved':o.outcome.replaceAll('-',' ')}</dd></div>)}</dl>{report.controlProbes.limitations.map(note=><p key={note}>{note}</p>)}</details>}
      <details className="ro-confidence"><summary>How confidence is calculated</summary><p>{confidencePercent===null?'The required model inputs are unavailable.':`${confidencePercent.toLocaleString(undefined,{maximumFractionDigits:1})}% is the normalized model weight for ${decision}, calculated from the observed score and risk signals.`} It is not a measured probability of token safety. Unread wallets are excluded from the fresh-wallet denominator; undocumented matches do not add risk to this observed-scope model. Unverified history remains a coverage limit.</p></details>
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
      </div></details>
      <div className="ro-age"><Clock3 size={18} aria-hidden="true" /><div><span>{age.basis}</span><strong>{age.value}</strong></div><details><summary>Source</summary><p>{age.detail}</p></details></div>
      {provider && <div className="ro-provider"><div><a href={provider.sourceUrl} target="_blank" rel="noreferrer">SwarmEngine report <ArrowUpRight size={13} /></a><span>{provider.band || 'No rating'}{provider.score != null && ` - ${provider.score}/100`}</span></div><small>Scanned {provider.providerTimestamp ? dateText(provider.providerTimestamp) : 'at an unreported time'}. Retrieved {dateText(provider.fetchedAt)}.</small><small>Provider claims are not independently verified. Its score is not a safety probability.</small></div>}
      <div className="ro-roles" aria-label="Roles in the supplied sample">{roles.map(({ category, name }) => {
        const wallets = inv.wallets.filter(wallet => wallet.categories.includes(category)), reportedCount = wallets.filter(wallet => wallet.categorySources?.[category] === 'swarm').length;
        const reported = reportedCount === wallets.length && reportedCount > 0, poolScoped = !reported && category === 'sniper' && !inv.coverage.launchVerified && verifiedTiming;
        const negative = category === 'sniper' && provider && provider.holders.length > 0 && provider.holders.every(holder => holder.signals.sniper === false);
        const revoked=category==='authority'&&report.solana?.authorities.mint.address===null&&report.solana?.authorities.freeze.address===null;
        return <div key={category}><span>{name}</span>{wallets.length ? <button type="button" onClick={() => wallets.length === 1 ? selectWallet(wallets[0].address) : onInspect()}>{wallets.length} {reported ? 'reported' : 'identified'}<ArrowUpRight size={12} /></button> : <small>{revoked ? 'Mint / freeze revoked' : negative ? '0 reported in sample' : provider ? 'Not reported' : 'Not established'}</small>}{reportedCount > 0 && reportedCount < wallets.length && <small>{reportedCount} provider-reported</small>}{poolScoped && <small>Selected pools only</small>}</div>;
      })}</div>
      <button type="button" className="ro-inspect" onClick={onInspect}>View evidence <ArrowUpRight size={17} /></button>
      {report.fixture&&<p className="ro-boundary">Synthetic example.</p>}
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
