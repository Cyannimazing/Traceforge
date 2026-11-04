'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, Database, Fingerprint, GitBranch, ListFilter, LockKeyhole, Network, Search, ShieldCheck, Timer, Users } from 'lucide-react';
import './methodology-page.css';
import {decisionLabels} from '@/lib/assessment-presentation';
import TokenAnalysisGuide from './token-analysis-guide';

const chapters = [
  { id: 'sources', name: 'Sources & search', icon: Database, title: 'Where the report comes from', lead: 'A focused investigation, with a source behind every finding.', paragraphs: [
    'TraceForge runs its independent investigation by default, combining market and security providers with configured blockchain RPC access, including Alchemy. Historical adapters retrieve the transaction evidence available within the stated scope.',
    'Searching checks a focused holder and activity scope, reuses saved historical evidence and returns the report without waiting for an archive crawl. Reopening a token can reuse a report captured within 10 minutes; Refresh investigation requests a new scan.',
    'Each report identifies its sources and coverage. The independent assessment is computed from retrieved evidence and explicit analysis rules, without an LLM. SwarmEngine is a separate external comparison; its scores and labels never replace the independent assessment.',
    `${decisionLabels.ok}, ${decisionLabels.caution} and ${decisionLabels.avoid} are TraceForge’s display labels for its three assessment outcomes. They describe the evaluated evidence, not a probability of safety. Missing coverage remains explicit.`,
  ], detailTitle: 'Source time, retrieval time and provider scores', details: [
    'Provider scan time and retrieval time are separate. Cached reports can predate your request. A provider score is not a probability of safety, and a clean provider result does not resolve missing historical evidence.',
  ], takeaway: 'Open Sources & coverage to see what actually responded and which records the report accepted.' },
  { id: 'wallets', name: 'Wallets & connections', icon: Users, title: 'Start with the holder table', lead: 'An address is an observed participant. It is not an identity.', paragraphs: [
    'Each row is a wallet or contract identified by a source. Supply share is a current snapshot. Creator, current owner, buyers and infrastructure remain separate flags. A wallet can have more than one flag.',
    'The top-wallet view ranks the largest 50 raw balances on EVM networks or 20 on Solana, then sets aside independently identified infrastructure and verified contract accounts without filling their places with smaller holders. Contract accounts may hold assets for users; setting one aside does not prove it is a pool or locker. Other retrieved balances remain available through search and the full investigation.',
    'The top-wallet activity factor uses the first 15 remaining wallet positions. Unread positions stay unread; smaller wallets do not replace them. The score uses independently retrieved inputs for this stated scope. Verified critical findings from the full investigation still override that score. Wallet groups describe documented connections, not a count of people.',
    'Connections only appear when the investigation has supporting funding, transfer or deployment evidence. Connected groups may share a source of funds; they are not automatically one person. Unconnected wallets are not automatically independent.',
  ], detailTitle: 'What a first-minute label establishes', details: [
    "First-minute labels from a live pool proof refer only to transaction initiators in that selected pool. They do not establish the token's first-ever launch or beneficial ownership. The assessment links to the creation record, interval and transaction evidence.",
  ], takeaway: 'Inspect the wallet, its source and its relationship evidence before interpreting a group.' },
  { id: 'labels', name: 'Flags & findings', icon: Fingerprint, title: 'Labels you can challenge', lead: 'Every flag needs a basis. Every inference has a scope.', paragraphs: [
    'Creator and authority labels require provider evidence. Early buyers and snipers require timestamped activity and a verified trading start in the stated scope. Accumulation and coordinated-selling labels describe only the observed trade sample. Every finding identifies its basis.',
    'Exchange, bridge, pool and burn labels describe known address functions where sources supply them. Unclassified means the investigation lacks a supported label.',
  ], detailTitle: 'Independent findings and external labels', details: [
    'SwarmEngine flags are explicitly marked provider-reported and do not establish verified launch timing. External classifications remain separate from independently verified findings.',
  ], takeaway: 'A label is a claim you can inspect, not a substitute for its supporting evidence.' },
  { id: 'time', name: 'Activity & time', icon: Timer, title: 'Time is a partial record', lead: 'Playback follows observed events. It cannot fill in missing history.', paragraphs: [
    'Playback reveals observed buys, sells, transfers and funding events in timestamp order. Cumulative counts describe those events only.',
    'Current holdings are shown separately from event playback. Historical balances are not reconstructed from incomplete trade samples.',
  ], detailTitle: 'Pool timing is a bounded proof', details: [
    "A verified interval belongs to its stated pool and transactions. It is not proof of the token's first-ever launch across every venue. Missing venues and unsupported records remain outside that proof.",
  ], takeaway: 'Read the interval and coverage alongside the event sequence.' },
  { id: 'coverage', name: 'Coverage & freshness', icon: ListFilter, title: 'Coverage is part of the result', lead: 'Missing evidence changes what the report can conclude.', paragraphs: [
    'Public providers can be delayed, truncated, unavailable or unsupported on a chain. A missing finding is not proof of safety. Provider page exhaustion applies to the indexed scope; missing venues and unsupported records remain explicit. Check Sources & coverage in each report.',
    'While a live report is visible, market data refreshes every 60 seconds and holder snapshots every 5 minutes. Background tabs pause refresh. An unsuccessful refresh preserves the previous report.',
  ], detailTitle: 'Refresh the whole investigation', details: [
    'Refresh investigation requests a new scan. The periodic market and holder updates are narrower snapshots; they do not establish complete historical coverage. A cached report retains its original capture time.',
  ], takeaway: 'Read the timestamps and missing coverage before relying on an apparently clean result.' },
  { id: 'privacy', name: 'Privacy & exports', icon: LockKeyhole, title: 'Your data and public providers', lead: 'Read-only investigation. No wallet connection or signature.', paragraphs: [
    'TraceForge never requests wallet access or a signature. Scanned token addresses are sent to the market, security and configured blockchain RPC providers identified in the report.',
    'Watchlists are stored in this browser. Export JSON to keep the exact observed report, including its timestamps and limitations.',
  ], detailTitle: 'Check each provider at the source', details: [
    'The report identifies the providers used for that investigation. Their own documentation and privacy terms describe their services. A configured provider is not a promise that every request will succeed.',
  ], takeaway: 'Export the report when you need to preserve the evidence as it was observed.' },
] as const;

const channels = [
  { name: 'Market context', detail: 'Price, liquidity & pairs', icon: Search, chapter: 0 },
  { name: 'Token controls', detail: 'Security & authority evidence', icon: ShieldCheck, chapter: 2 },
  { name: 'Holder snapshots', detail: 'Balances & wallet flags', icon: Users, chapter: 1 },
  { name: 'Activity records', detail: 'Trades, transfers & funding', icon: GitBranch, chapter: 3 },
] as const;

const providers = [
  ['DexScreener', 'https://docs.dexscreener.com/api/reference'],
  ['GoPlus', 'https://docs.gopluslabs.io'],
  ['Alchemy', 'https://www.alchemy.com/docs'],
  ['Bitquery', 'https://docs.bitquery.io'],
  ['SwarmEngine API', 'https://swarmengine.tech/docs'],
  ['SwarmEngine privacy', 'https://swarmengine.tech/privacy'],
] as const;

export function MethodologyPage({ paused }: { paused: boolean }) {
  const [active, setActive] = useState(0);
  const [moving, setMoving] = useState(false);
  const diagram = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const uid = useId();
  const chapter = chapters[active];

  useEffect(() => {
    const element = diagram.current;
    if (!element) return;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let onScreen = false;
    const update = () => setMoving(!paused && !document.hidden && !media.matches && onScreen);
    const observer = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; update(); }, { threshold: .1 });
    observer.observe(element);
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => { observer.disconnect(); media.removeEventListener('change', update); document.removeEventListener('visibilitychange', update); };
  }, [paused]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = chapters.length - 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % chapters.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + chapters.length - 1) % chapters.length;
    else return;
    event.preventDefault(); setActive(next); tabRefs.current[next]?.focus();
  }

  function changeChapter(index: number, focusHeading = false) {
    setActive(index);
    if (focusHeading) requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  return <section className="methodology-page" aria-labelledby={`${uid}-title`} data-moving={moving}>
    <header className="mp-heading">
      <h1 id={`${uid}-title`}>Evidence before certainty.</h1>
      <p>How TraceForge Engine analyzes token holders, wallet connections and contract risks.</p>
    </header>

    <div className="mp-flow" ref={diagram}>
      <div className="mp-channels" aria-label="Explore evidence channels">
        {channels.map((channel, index) => <button key={channel.name} type="button" className="mp-channel" aria-pressed={active === channel.chapter} onClick={() => changeChapter(channel.chapter)} aria-controls={`${uid}-reader`}>
          <channel.icon size={21} strokeWidth={1.5}/><span><strong>{channel.name}</strong><small>{channel.detail}</small></span><ArrowDown size={15} className="mp-channel-arrow"/>
        </button>)}
      </div>
      <div className="mp-path-field" aria-hidden="true">
        <svg viewBox="0 0 1000 174" preserveAspectRatio="none">
          {channels.map((channel, index) => {
            const x = 125 + index * 250;
            const d = `M${x} 0 V48 Q${x} 72 ${x < 500 ? x + 24 : x - 24} 72 H${x < 500 ? 476 : 524} Q500 72 500 96 V174`;
            return <g key={channel.name} data-selected={active === channel.chapter} style={{ animationDelay: `${index * -.8}s` }}><path className="mp-path-base" d={d}/><path className="mp-path-signal" d={d} pathLength={100} style={{ animationDelay: `${index * -.8}s` }}/><rect className="mp-port" x={x - 4} y={8} width={8} height={8}/></g>;
          })}
        </svg>
        <div className="mp-evidence-junction"><Network size={23} strokeWidth={1.5}/><span>Evidence + scope</span></div>
      </div>
      <div className="mp-flow-result"><button type="button" onClick={() => changeChapter(4)} aria-controls={`${uid}-reader`}><span>Independent report</span><ArrowUpRight size={18}/></button><p>Conceptual evidence flow.</p></div>
    </div>

    <div className="mp-reading-layout" id={`${uid}-reader`}>
      <nav className="mp-chapters" aria-label="Methodology chapters">
        <h2>Explore the method</h2>
        <div className="mp-tabs" role="tablist" aria-label="Methodology chapters">
          {chapters.map((item, index) => <button key={item.id} ref={element => { tabRefs.current[index] = element; }} id={`${uid}-tab-${item.id}`} role="tab" type="button" aria-selected={active === index} aria-controls={`${uid}-panel-${item.id}`} tabIndex={active === index ? 0 : -1} onKeyDown={event => onTabKey(event, index)} onClick={() => changeChapter(index)}><item.icon size={17} strokeWidth={1.6}/><span>{item.name}</span><ArrowRight size={15}/></button>)}
        </div>
        <p>Choose a chapter, or use the arrow keys to move between them.</p>
      </nav>

      <div key={chapter.id} className="mp-chapter" id={`${uid}-panel-${chapter.id}`} role="tabpanel" aria-labelledby={`${uid}-tab-${chapter.id}`} tabIndex={0}>
        <div className="mp-chapter-copy">
          <h2 ref={heading} tabIndex={-1}>{chapter.title}</h2>
          <p className="mp-lead">{chapter.lead}</p>
          {chapter.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          <details className="mp-detail"><summary>{chapter.detailTitle}<ChevronDown size={18}/></summary><div>{chapter.details.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></details>
          <div className="mp-takeaway"><Check size={19}/><p>{chapter.takeaway}</p></div>
        </div>
        <div className="mp-chapter-navigation"><button type="button" disabled={active === 0} onClick={() => changeChapter(active - 1, true)}><ArrowLeft size={16}/>Previous chapter</button><button type="button" disabled={active === chapters.length - 1} onClick={() => changeChapter(active + 1, true)}>Next chapter<ArrowRight size={16}/></button></div>
      </div>
    </div>

    <TokenAnalysisGuide/>
    <section className="mp-provider-links" aria-labelledby={`${uid}-providers`}><div><h2 id={`${uid}-providers`}>Read the original documentation.</h2><p>These links describe the services. The report lists the providers used for a particular scan.</p></div><div>{providers.map(([name, href]) => <a key={href} href={href} target="_blank" rel="noreferrer">{name}<ArrowUpRight size={16}/><span className="sr-only"> (opens in a new tab)</span></a>)}</div></section>
  </section>;
}
