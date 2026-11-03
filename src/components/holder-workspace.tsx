"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ArrowUpRight, Check, ChevronDown, Search, X } from 'lucide-react';
import { short } from '@/lib/analysis';
import { holderScope } from '@/lib/holder-scope';
import { buildCurrentHolderGraph } from '@/lib/current-holder-graph';
import type { InvestigationReport, InvestigatedWallet, WalletCategory } from '@/lib/investigation-types';
import { ActivityTimeline, type Selection } from './investigation-panels';
import './holder-workspace.css';
import ProviderShareHistory from './provider-share-history';

type Props = { report: InvestigationReport; selection: Selection | null; onSelect: (selection: Selection) => void; onExpand?: () => void; loading: boolean; paused: boolean };
type Tab = 'holders' | 'infrastructure' | 'addresses' | 'connections' | 'activity' | 'history' | 'checks' | 'sources';
type Sort = 'share' | 'entry';
const baseTabs: { id: Tab; title: string }[] = [{ id: 'holders', title: 'Holders' }, { id: 'infrastructure', title: 'Infrastructure' }, { id: 'connections', title: 'Connections' }, { id: 'activity', title: 'Activity' }, { id: 'checks', title: 'Contract checks' }, { id: 'sources', title: 'Sources' }, {id:'addresses',title:'Traced addresses'}];
const roleNames: Record<WalletCategory | 'funder' | 'seller', string> = { creator: 'Creator', authority: 'Current owner / authority', sniper: 'Possible sniper', fresh: 'Fresh wallet', insider: 'Possible insider', 'early-buyer': 'Early buyer', accumulator: 'Accumulator', funder: 'Funder', seller: 'Seller', 'shared-funder': 'Shared funding recipient', 'deployer-linked': 'Creator-linked', 'coordinated-seller': 'Related seller', pool: 'Liquidity pool', exchange: 'Exchange', bridge: 'Bridge', burn: 'Burn address', contract: 'Contract', unclassified: 'Role not identified' };
type Role = keyof typeof roleNames;
const roleOrder: Role[] = ['creator', 'authority', 'sniper', 'fresh', 'insider', 'early-buyer', 'accumulator', 'funder', 'seller', 'shared-funder', 'deployer-linked', 'coordinated-seller', 'pool', 'exchange', 'bridge', 'burn', 'contract', 'unclassified'];
const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }) : 'Not reported';
const compactDate = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not reported';
const number = (value: number) => value > 0 && value < 0.0001 ? '<0.0001' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
const finite = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const noop = () => {};

function RolePicker({ value, onChange }: { value: Role | 'all'; onChange: (value: Role | 'all') => void }) {
  const choices: { value: Role | 'all'; label: string }[] = [{ value: 'all', label: 'All roles' }, ...roleOrder.map(role => ({ value: role, label: roleNames[role] }))];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 260 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', at: 0 });
  const id = useId();
  const show = () => { setActive(choices.findIndex(choice => choice.value === value)); setOpen(true); };
  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(rect.width, window.innerWidth - 32), height = Math.min(352, window.innerHeight - 32);
      const top = window.innerHeight - rect.bottom >= height + 8 ? rect.bottom + 6 : Math.max(16, rect.top - height - 6);
      setPosition({ top, left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), width });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => { window.removeEventListener('resize', positionMenu); window.removeEventListener('scroll', positionMenu, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => { if (open) menu.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') { setOpen(false); if (event.key === 'Escape') event.preventDefault(); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) { onChange(choices[active].value); setOpen(false); } else show(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const current = open ? active : choices.findIndex(choice => choice.value === value);
      setActive(event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : event.key === 'ArrowDown' ? (current + 1) % choices.length : (current - 1 + choices.length) % choices.length);
      setOpen(true); return;
    }
    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const now = Date.now(); search.current = { text: now - search.current.at > 700 ? event.key.toLowerCase() : search.current.text + event.key.toLowerCase(), at: now };
      const match = choices.findIndex(choice => choice.label.toLowerCase().startsWith(search.current.text));
      if (match >= 0) setActive(match);
      setOpen(true);
    }
  };
  return <div className="hw-role-picker"><span id={`${id}-label`}>Role</span><button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-option-${active}` : undefined} onClick={() => open ? setOpen(false) : show()} onKeyDown={keyDown} onBlur={event => { if (!menu.current?.contains(event.relatedTarget as Node | null)) setOpen(false); }}><span id={`${id}-value`}>{value === 'all' ? 'All roles' : roleNames[value]}</span><ChevronDown size={16} /></button>{open && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label="Filter wallet roles" className="hw-role-menu" style={position}>{choices.map((choice, index) => <button type="button" key={choice.value} id={`${id}-option-${index}`} role="option" aria-selected={choice.value === value} data-index={index} data-active={index === active} tabIndex={-1} onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()} onClick={() => { onChange(choice.value); setOpen(false); trigger.current?.focus(); }}><span>{choice.label}</span>{choice.value === value && <Check size={15} />}</button>)}</div>, document.body)}</div>;
}

export default function HolderWorkspace({ report, selection, onSelect, onExpand, loading, paused }: Props) {
  const [tab, setTab] = useState<Tab>('holders');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<Role | 'all'>('all');
  const [sort, setSort] = useState<Sort>('share');
  const [descending, setDescending] = useState(true);
  const [expandedWallet, setExpandedWallet] = useState<string|null>(null);
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const inv = report.investigation;
  const scope = useMemo(()=>holderScope(report),[report]);
  const currentGraph = useMemo(()=>buildCurrentHolderGraph(report),[report]);
  const linkedGroups = useMemo(()=>{
    const adjacency=new Map<string,Set<string>>();
    for(const edge of currentGraph.edges)for(const [a,b] of [[edge.from,edge.to],[edge.to,edge.from]]){const neighbors=adjacency.get(a)||new Set<string>();neighbors.add(b);adjacency.set(a,neighbors);}
    const groups=new Map<string,{wallets:string[];evidenceIds:string[]}>(),visited=new Set<string>();
    for(const first of adjacency.keys()){
      if(visited.has(first))continue;const pending=[first],wallets:string[]=[];
      while(pending.length){const a=pending.pop()!;if(visited.has(a))continue;visited.add(a);wallets.push(a);pending.push(...(adjacency.get(a)||[]));}
      const members=new Set(wallets),evidenceIds=[...new Set(currentGraph.edges.filter(e=>members.has(e.from)&&members.has(e.to)).flatMap(e=>e.evidenceIds))];
      for(const a of wallets)groups.set(a,{wallets,evidenceIds});
    }
    return groups;
  },[currentGraph]);
  const coverage = inv.coverage, provider = report.providerAnalysis;
  const providerOnly = !!provider && inv.evidence.every(record => record.attribution === 'provider-reported');
  const tabs: {id:Tab;title:string}[] = provider ? [...baseTabs.slice(0,3),{id:'history',title:'Provider history'},...baseTabs.slice(3)] : baseTabs;
  useEffect(()=>{if(!provider&&tab==='history')setTab('holders');},[provider,tab]);
  const hasTrades = inv.timeline.some(event => event.kind === 'buy' || event.kind === 'sell');
  const normalize = (address: string) => report.chain === 'solana' ? address : address.toLowerCase();
  const rows = useMemo(() => {
    const normalized = (address: string) => report.chain === 'solana' ? address : address.toLowerCase();
    const funders = new Set(inv.relationships.filter(edge => edge.kind === 'funding').map(edge => normalized(edge.from)));
    const sellers = new Set(inv.timeline.filter(event => event.kind === 'sell').map(event => normalized(event.wallet)));
    const evidenceById=new Map(inv.evidence.map(record=>[record.id,record]));
    const independentSellers=new Set(inv.timeline.filter(event=>event.kind==='sell'&&evidenceById.get(event.evidenceId)?.attribution!=='provider-reported').map(event=>normalized(event.wallet)));
    const independentFunders=new Set(inv.relationships.filter(edge=>edge.kind==='funding'&&edge.attribution!=='provider-reported').map(edge=>normalized(edge.from)));
    const byAddress=new Map(inv.wallets.map(wallet=>[normalized(wallet.address),wallet]));
    const snapshot=tab==='infrastructure'?scope.infrastructure:scope.holders;
    const wallets:InvestigatedWallet[]=tab==='holders'||tab==='infrastructure'?snapshot.map(holder=>{
      const existing=byAddress.get(normalized(holder.address)),categories=[...(existing?.categories||['unclassified' as const])];
      if(report.market?.pairAddress&&normalized(holder.address)===normalized(report.market.pairAddress)&&!categories.includes('pool'))categories.push('pool');
      return {...existing,address:holder.address,share:holder.share,categories,evidenceIds:existing?.evidenceIds||[]};
    }):inv.wallets;
    return wallets.map(wallet => {
      const roles: Role[] = [...wallet.categories.filter(category => category !== 'unclassified')];
      if (funders.has(normalized(wallet.address))) roles.push('funder');
      if (sellers.has(normalized(wallet.address))) roles.push('seller');
      if (!roles.length) roles.push('unclassified');
      const reportedRoles:Role[]=roles.filter(value=>value==='seller'?!independentSellers.has(normalized(wallet.address)):value==='funder'?!independentFunders.has(normalized(wallet.address)):wallet.categorySources?.[value]==='swarm');
      const records=[...new Set(wallet.evidenceIds)].flatMap(key=>{const record=evidenceById.get(key);return record&&record.source.trim()&&Number.isFinite(Date.parse(record.timestamp))?[record]:[];});
      const proofIds=new Set(records.filter(record=>record.attribution!=='provider-reported'&&record.transaction).map(record=>record.id));
      const buy=inv.timeline.filter(event=>event.kind==='buy'&&normalized(event.wallet)===normalized(wallet.address)&&proofIds.has(event.evidenceId)).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))[0];
      const creation=records.find(record=>record.id.startsWith('identity:creator:')&&proofIds.has(record.id));
      const incoming=records.filter(record=>record.kind==='transfer'&&record.to&&record.token&&normalized(record.token)===normalized(report.token)&&normalized(record.to)===normalized(wallet.address)&&proofIds.has(record.id)).sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))[0];
      const entry=creation?{label:'Creator',at:creation.timestamp}:buy?{label:'Buy',at:buy.timestamp}:incoming?{label:'Transfer',at:incoming.timestamp}:providerOnly&&wallet.firstBuyAt?{label:'Reported buy',at:wallet.firstBuyAt}:{label:'Not observed',at:undefined};
      const observedTransactions=new Set(records.filter(record=>record.transaction&&record.attribution!=='provider-reported').map(record=>record.transaction)).size;
      return { wallet, roles: roleOrder.filter(value => roles.includes(value)),reportedRoles,entry,recordCount:records.length,observedTransactions };

    });
  }, [inv, report.chain,report.token,report.market?.pairAddress,scope,tab,providerOnly]);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return rows.filter(({ wallet, roles }) => (role === 'all' || roles.includes(role)) && (!search || `${wallet.address} ${wallet.label || ''} ${roles.map(value => roleNames[value]).join(' ')}`.toLowerCase().includes(search))).sort((a, b) => {
      const left = sort==='entry' ? (a.entry.at ? Date.parse(a.entry.at):null):a.wallet.share, right = sort==='entry' ? (b.entry.at ? Date.parse(b.entry.at):null):b.wallet.share;
      if (!finite(left)) return finite(right) ? 1 : a.wallet.address.localeCompare(b.wallet.address);
      if (!finite(right)) return -1;
      return (descending ? right - left : left - right) || a.wallet.address.localeCompare(b.wallet.address);
    });
  }, [rows, query, role, sort, descending]);
  const selectWallet = (wallet: InvestigatedWallet) => onSelect({ kind: 'wallet', id: wallet.address });
  const changeSort = (value: Sort) => { if (sort === value) setDescending(!descending); else { setSort(value); setDescending(value !== 'entry'); } };
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next == null) return;
    event.preventDefault(); setTab(tabs[next].id); tabRefs.current[next]?.focus();
  };
  const sortHeading = (value: Sort, title: string) => <th className={value === 'entry' ? '' : 'hw-number'} aria-sort={sort === value ? descending ? 'descending' : 'ascending' : 'none'}><button onClick={() => changeSort(value)}>{title}{sort === value && (descending ? <ArrowDown size={14} /> : <ArrowUp size={14} />)}</button></th>;
  const quantity = (value: number | undefined) => finite(value) ? <>{number(value)} <span className="hw-unit">{report.symbol || 'tokens'}</span></> : <span className="hw-muted">{hasTrades ? 'Amount unavailable' : 'Not checked'}</span>;
  const knownProviderNegatives = provider && (role === 'sniper' || role === 'fresh' || role === 'insider') && provider.holders.length > 0 && provider.holders.every(holder=>holder.signals[role] === false);
  const emptyRole = knownProviderNegatives ? 'No provider flags for this role in the returned holder sample. This does not establish complete historical coverage.' : providerOnly ? 'SwarmEngine did not return this role in the report. Missing labels do not establish that the activity never occurred.' : role === 'sniper' || role === 'early-buyer' ? (!coverage.launchVerified && !coverage.poolTiming) || !hasTrades ? 'Not checked - verified launch history is unavailable.' : 'No wallets meet this timing label in the observed sample.' : role === 'funder' || role === 'shared-funder' ? !inv.evidence.some(evidence => evidence.kind === 'transfer') ? 'Not checked - transfer history is unavailable.' : 'No matching funding role is identified in this sample.' : role === 'accumulator' || role === 'seller' || role === 'coordinated-seller' ? !hasTrades ? 'Not checked - trade history is unavailable.' : 'No matching trading role is identified in this sample.' : 'This role is not identified in this sample.';

  return <section className="holder-workspace" aria-label="Holder investigation workspace">
    <div className="hw-heading"><div><h2>Holders & roles</h2><p>{providerOnly ? 'Reported holdings and wallet roles from SwarmEngine.' : 'Reported holdings, observed roles and the records behind them.'}</p></div>{onExpand&&<button className="hw-expand" aria-label={loading ? providerOnly ? 'Running independent investigation' : 'Expanding investigation sample' : providerOnly ? 'Run independent investigation with a larger sample' : 'Expand sample investigation'} onClick={onExpand} disabled={loading || !!report.fixture}>{loading ? providerOnly ? 'Scanning...' : 'Expanding...' : providerOnly ? 'Run independent scan' : 'Expand sample'}<ArrowUpRight size={16} /></button>}</div>
    <div className="hw-scope"><span className={coverage.status !== 'complete' ? 'hw-warning' : ''}>{report.fixture ? 'Synthetic example' : providerOnly ? 'SwarmEngine - provider-reported' : coverage.status === 'complete' ? 'Provider sample' : `${coverage.status === 'partial' ? 'Partial' : 'Unavailable'} coverage`}</span><span className="hw-date-full">Captured {date(coverage.fetchedAt)}</span><time className="hw-date-compact" dateTime={coverage.fetchedAt} title={date(coverage.fetchedAt)} aria-label={`Captured ${date(coverage.fetchedAt)}`}>Captured {compactDate(coverage.fetchedAt)}</time>{coverage.truncated && <span className="hw-scope-detail">Provider-limited sample</span>}{report.fixture && <span className="hw-scope-detail">Fabricated records for demonstration</span>}</div>
    <div className="hw-tabs" role="tablist" aria-label="Investigation sections">{tabs.map((item, index) => <button key={item.id} ref={element => { tabRefs.current[index] = element; }} role="tab" id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => tabKey(event, index)}>{item.title}</button>)}</div>
    <div className="hw-panel" id={`${id}-panel-${tab}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} tabIndex={0}>
      {(tab === 'holders'||tab==='infrastructure'||tab==='addresses') && <>
        <p className="hw-table-note">{tab==='holders'?`${scope.holders.length} current sampled holders. ${scope.infrastructure.length} identified pool, exchange, bridge or burn addresses are listed separately in Infrastructure. Other traced addresses are not added to this holder list.`:tab==='infrastructure'?`${scope.infrastructure.length} infrastructure addresses from the same ${scope.allSnapshot.length}-address snapshot. Their balances remain in the supply denominator; they are excluded only from the default holder list.`:`${rows.length} addresses found across holdings, trades, funding and authorities. These are not all current holders.`}</p>
        <div className="hw-filters"><label className="hw-search"><Search size={17} /><span className="hw-sr-only">Search wallet address, name or role</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search address, name or role" />{query && <button aria-label="Clear wallet search" onClick={() => setQuery('')}><X size={16} /></button>}</label><RolePicker value={role} onChange={setRole} /><span className="hw-row-count" role="status" aria-label={`${filtered.length} of ${rows.length} ${tab==='holders'?'sampled holders':tab==='infrastructure'?'infrastructure addresses':'traced addresses'}`}>{filtered.length} / {rows.length} {tab==='holders'?'holders':'addresses'}</span></div>
        <div className="hw-mobile-sort" role="group" aria-label="Sort wallet cards"><span>Sort by</span>{(['share','entry'] as const).map(value=><button key={value} aria-pressed={sort===value} onClick={()=>changeSort(value)} aria-label={`Sort by ${value==='share'?'supply share':'observed entry'}${sort===value?`, currently ${descending?'descending':'ascending'}. Activate to reverse order.`:''}`}>{value==='share'?'Share':'Entry'}{sort===value&&(descending?<ArrowDown size={15}/>:<ArrowUp size={15}/>)}</button>)}<small>{sort==='share'?(descending?'Largest first':'Smallest first'):(descending?'Latest first':'Earliest first')}</small></div>
        <div className="hw-table-scroll" role="region" aria-label="Holder table, scroll horizontally for all columns" tabIndex={0}>
          <table className="hw-table hw-compact-table"><colgroup><col className="hw-col-rank"/><col className="hw-col-wallet"/><col className="hw-col-share"/><col className="hw-col-entry"/><col className="hw-col-flags"/><col className="hw-col-links"/><col className="hw-col-evidence"/></colgroup>
            <caption className="hw-sr-only">Current source-snapshot holdings. Shares use total token supply. Entry is the earliest observed event of the displayed type, not a verified first-ever acquisition.</caption>
            <thead><tr><th className="hw-rank">#</th><th>Wallet</th>{sortHeading('share','Share')} {sortHeading('entry','Entry')}<th>Flags</th><th>Links</th><th className="hw-number">Evidence</th></tr></thead>
            <tbody>{filtered.map(({wallet,roles,reportedRoles,entry,recordCount,observedTransactions},index)=>{
              const address=normalize(wallet.address),group=linkedGroups.get(address),expanded=expandedWallet===address;
              const ordered=role!=='all'&&roles.includes(role)?[role,...roles.filter(value=>value!==role)]:roles;
              const flags=ordered.filter(value=>value!=='unclassified');
              return <Fragment key={wallet.address}>
                <tr className={selection?.kind==='wallet'&&normalize(selection.id)===address?'hw-selected':''} onClick={()=>selectWallet(wallet)}>
                  <td className="hw-rank">{index+1}</td>
                  <td><div className="hw-wallet-cell"><button className="hw-wallet" onClick={event=>{event.stopPropagation();selectWallet(wallet);}} title={wallet.address} aria-label={`Inspect wallet ${wallet.address}`}><span><strong>{short(wallet.address)}</strong>{wallet.label&&<small title={wallet.label}>{wallet.label}</small>}</span><ArrowUpRight size={13}/></button><button className="hw-row-toggle" aria-label={`${expanded?'Hide':'Show'} activity details for ${short(wallet.address)}`} aria-expanded={expanded} onClick={event=>{event.stopPropagation();setExpandedWallet(expanded?null:address);}}><ChevronDown size={14}/></button></div></td>
                  <td className="hw-number"><span title="Percentage of reported total token supply">{finite(wallet.share)?`${number(wallet.share)}%`:<span className="hw-muted">Unknown</span>}</span></td>
                  <td className="hw-entry"><span className={entry.at?'':'hw-muted'}>{entry.label}</span>{entry.at&&<time dateTime={entry.at} title={`Observed ${date(entry.at)} - not necessarily the first-ever acquisition`}>{new Date(entry.at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time>}</td>
                  <td><div className="hw-roles">{flags.slice(0,2).map(value=><span key={value} title={`${roleNames[value]}${reportedRoles.includes(value)?' - provider-reported':' - evidence-linked role'}${(value==='sniper'||value==='early-buyer')&&!coverage.launchVerified&&!!coverage.poolTiming&&!reportedRoles.includes(value)?' - selected pool timing only':''}`} className={`hw-role ${value==='creator'||value==='authority'?'hw-role-identity':''}`}>{value==='authority'?'Authority':value==='shared-funder'?'Shared funding':roleNames[value]}{reportedRoles.includes(value)&&<small> reported</small>}</span>)}{flags.length>2&&<button className="hw-more-roles" onClick={event=>{event.stopPropagation();selectWallet(wallet);}} aria-label={`Inspect all flags: ${flags.map(value=>roleNames[value]).join(', ')}`}>+{flags.length-2}</button>}{!flags.length&&<span className="hw-muted" title="No evidence-backed role identified">-</span>}</div></td>
                  <td>{group?<button className="hw-link-count" title="Documented connections, not common ownership" onClick={event=>{event.stopPropagation();onSelect({kind:'group',id:`current:${address}`,wallets:group.wallets,evidenceIds:group.evidenceIds});}}>{group.wallets.length} linked</button>:<span className="hw-muted" title="No qualified connection to another displayed current holder">-</span>}</td>
                  <td className="hw-number">{recordCount?<button className="hw-evidence-count" onClick={event=>{event.stopPropagation();selectWallet(wallet);}} aria-label={`Inspect ${recordCount} evidence records for ${wallet.address}`}>{recordCount}<ArrowUpRight size={13}/></button>:<span className="hw-muted" title="No attached records">-</span>}</td>
                </tr>
                {expanded&&<tr className="hw-expanded-row"><td colSpan={7}><div className="hw-wallet-detail"><dl><div><dt>First observed buy</dt><dd>{date(wallet.firstBuyAt)}</dd></div><div><dt>Bought in observed trades</dt><dd>{quantity(wallet.bought)}</dd></div><div><dt>Sold in observed trades</dt><dd>{quantity(wallet.sold)}</dd></div><div><dt>Observed transactions</dt><dd>{observedTransactions||'None returned'}</dd></div></dl><p>Transaction counts and trade amounts cover retrieved records, not lifetime activity.</p><button onClick={()=>selectWallet(wallet)}>Inspect wallet evidence <ArrowUpRight size={14}/></button></div></td></tr>}
              </Fragment>;
            })}</tbody>
          </table>
        </div>
        <div className="hw-mobile-cards" role="list" aria-label={tab==='holders'?'Current sampled holders':tab==='infrastructure'?'Infrastructure addresses':'Traced addresses'}>{filtered.map(({wallet,roles,reportedRoles,entry,recordCount,observedTransactions},index)=>{
          const address=normalize(wallet.address),group=linkedGroups.get(address),expanded=expandedWallet===address;
          const ordered=role!=='all'&&roles.includes(role)?[role,...roles.filter(value=>value!==role)]:roles;
          const flags=ordered.filter(value=>value!=='unclassified');
          const selected=selection?.kind==='wallet'&&normalize(selection.id)===address;
          const detailId=`${id}-card-detail-${index}`;
          return <article role="listitem" className={`hw-mobile-card${selected?' hw-selected':''}`} key={wallet.address}>
            <header className="hw-card-header"><button className="hw-card-wallet" onClick={()=>selectWallet(wallet)} aria-label={`Inspect wallet ${wallet.address}`}><span className="hw-card-rank">{index+1}</span><span><strong>{short(wallet.address)}</strong>{wallet.label&&<small>{wallet.label}</small>}</span><ArrowUpRight size={16}/></button><div className="hw-card-share"><span>Supply share</span><strong>{finite(wallet.share)?`${number(wallet.share)}%`:'Unknown'}</strong></div></header>
            <div className="hw-card-roles" aria-label="Wallet roles">{flags.map(value=><span key={value} className={`hw-role ${value==='creator'||value==='authority'?'hw-role-identity':''}`}>{roleNames[value]}{reportedRoles.includes(value)&&<small> - provider-reported</small>}{(value==='sniper'||value==='early-buyer')&&!coverage.launchVerified&&!!coverage.poolTiming&&!reportedRoles.includes(value)&&<small> - selected pool timing only</small>}</span>)}{!flags.length&&<span className="hw-muted">Role not identified</span>}</div>
            <dl className="hw-card-entry"><div><dt>Observed entry</dt><dd><strong>{entry.label}</strong>{entry.at&&<time dateTime={entry.at}>{date(entry.at)}</time>}</dd></div></dl>
            <div className="hw-card-actions">{recordCount?<button onClick={()=>selectWallet(wallet)} aria-label={`Inspect ${recordCount} evidence records for ${wallet.address}`}><span>Evidence</span><strong>{recordCount}</strong><ArrowUpRight size={14}/></button>:<span className="hw-card-no-evidence">No attached evidence</span>}{group?<button onClick={()=>onSelect({kind:'group',id:`current:${address}`,wallets:group.wallets,evidenceIds:group.evidenceIds})} aria-label={`Inspect documented group of ${group.wallets.length} linked wallets`}><span>Linked wallets</span><strong>{group.wallets.length}</strong><ArrowUpRight size={14}/></button>:<span className="hw-card-no-links">No documented links</span>}</div>
            <button className="hw-card-expand" aria-expanded={expanded} aria-controls={expanded?detailId:undefined} onClick={()=>setExpandedWallet(expanded?null:address)}><span>{expanded?'Hide activity details':'Activity details'}</span><ChevronDown size={16}/></button>
            {expanded&&<div className="hw-wallet-detail hw-card-detail" id={detailId}><dl><div><dt>Wallet address</dt><dd className="hw-card-full-address">{wallet.address}</dd></div><div><dt>First observed buy</dt><dd>{date(wallet.firstBuyAt)}</dd></div><div><dt>Bought in observed trades</dt><dd>{quantity(wallet.bought)}</dd></div><div><dt>Sold in observed trades</dt><dd>{quantity(wallet.sold)}</dd></div><div><dt>Observed transactions</dt><dd>{observedTransactions||'None returned'}</dd></div></dl><p>Transaction counts and trade amounts cover retrieved records, not lifetime activity.</p><button onClick={()=>selectWallet(wallet)}>Inspect wallet evidence<ArrowUpRight size={14}/></button></div>}
          </article>;
        })}</div>
        {!filtered.length && <div className="hw-empty"><strong>{query ? 'No matching wallets' : role !== 'all' ? roleNames[role] : tab==='infrastructure'?'No infrastructure in this snapshot':scope.allSnapshot.length?'No holder wallets in this snapshot':'Holder addresses unavailable'}</strong><p>{query ? 'Try a shorter address, another name or clear your filters.' : role !== 'all' ? emptyRole : tab==='infrastructure'?'No snapshot address has a supported infrastructure label or matches the market pair. Unidentified addresses remain in Holders.':scope.allSnapshot.length?'All retrieved snapshot addresses are identified infrastructure. Open Infrastructure to inspect them.':'The available sources did not return holder addresses. Check Sources for the missing coverage.'}</p>{(query || role !== 'all') && <button onClick={() => { setQuery(''); setRole('all'); }}>Clear filters</button>}</div>}
        <div className="hw-table-note">{coverage.poolTiming && <p>Timing labels apply only to the verified first trading minute of pool {short(coverage.poolTiming.pool)}. They do not establish token-wide launch history.</p>}<p>Share is a percentage of total token supply at the source snapshot. Entry shows an observed event, not a verified first-ever acquisition. Open a row for dated activity and trade amounts. Links describe documented current-holder connections, not shared ownership.</p><p>{provider ? 'Roles marked reported are SwarmEngine classifications. Its possible-sniper label has not been independently checked against verified launch history. Independently assessed timing roles apply only to the stated verified intervals. Creator and current owner / authority remain separate roles. A label does not establish common ownership or bot activity.' : 'Accumulators bought more than they sold in this sample. Creator and current owner / authority are separate roles. Early-buyer and possible-sniper labels require verified indexed trading history; a timing label does not prove bot activity.'}</p>{report.fixture && <p>Expand is unavailable for the synthetic example. Scan a live contract to request more evidence.</p>}</div>
      </>}
      {tab === 'connections' && <div className="hw-details"><div className="hw-section-intro"><h3>{providerOnly ? 'Provider-reported connections' : 'Documented connections'}</h3><p>{provider ? 'Each relationship shows its source. SwarmEngine links are provider-reported; underlying transactions are not independently verified. Connections do not establish shared ownership.' : 'Transfers are observations. Shared funding and related selling are inferences; neither establishes shared ownership.'}</p></div>{inv.relationships.length ? <ul className="hw-connections">{inv.relationships.map(edge => <li key={edge.id}><button onClick={() => onSelect({ kind: 'relationship', id: edge.id })}><span><span className="hw-connection-title">{short(edge.from)} <span className="hw-muted">to</span> {short(edge.to)}</span><span className="hw-connection-description">{edge.description}</span><span className="hw-muted">{edge.attribution === 'provider-reported' ? 'Provider-reported' : edge.kind === 'shared-funder' ? 'Inferred' : 'Observed'}  -  {edge.kind.replaceAll('-', ' ')}  -  {edge.evidenceIds.length} evidence {edge.evidenceIds.length === 1 ? "record" : "records"}</span></span><ArrowUpRight size={16} /></button></li>)}</ul> : <div className="hw-empty"><strong>{inv.evidence.some(e => e.kind === 'transfer') ? 'No connections identified in this sample' : 'Connections not checked'}</strong><p>{inv.evidence.some(e => e.kind === 'transfer') ? 'The observed records do not establish a configured connection.' : 'Transfer history is unavailable. This does not establish that these wallets are unrelated.'}</p></div>}{inv.findings.filter(finding => finding.id.startsWith('selling:') || finding.id.startsWith('funder:')).map(finding => <button className="hw-finding" key={finding.id} onClick={() => onSelect({ kind: 'finding', id: finding.id })}><span><strong>{finding.title}</strong><span>{finding.description}</span><small>{finding.attribution === 'provider-reported' ? 'Provider-reported' : finding.certainty}  -  {finding.evidenceIds.length} evidence {finding.evidenceIds.length === 1 ? "record" : "records"}</small></span><ArrowUpRight size={16} /></button>)}</div>}
      {tab === 'history' && provider && <ProviderShareHistory provider={provider} selectedWallet={selection?.kind==='wallet'?selection.id:undefined} knownWallets={inv.wallets.map(wallet=>wallet.address)} onSelect={onSelect}/>}
      {tab === 'activity' && <div className="hw-activity"><ActivityTimeline report={report} paused={paused} onSelect={onSelect} onActive={noop} /><p className="hw-table-note">Playback shows the sampled event sequence. Snapshot supply shares are not reconstructed historical balances.</p></div>}
      {tab === 'checks' && <div className="hw-details"><div className="hw-section-intro"><h3>Contract & authority checks</h3><p>Provider-reported checks. “No flag” applies only to that check and is not an independent contract audit.</p></div>{report.checks.length ? <div className="hw-checks">{report.checks.map(check => <article key={check.key}><div><h4>{check.title}</h4><span className={`hw-check-state hw-check-${check.status}`}>{check.status === 'clear' ? 'No flag' : check.status === 'unknown' ? 'Not assessed' : check.status === 'critical' ? 'Critical' : 'Warning'}</span></div><p>{check.description}</p><p className="hw-muted">Reported value: {check.value}</p>{inv.findings.some(finding => finding.id === `security:${check.key}`) && <button onClick={() => onSelect({ kind: 'finding', id: `security:${check.key}` })}>Inspect provider evidence<ArrowUpRight size={14} /></button>}</article>)}</div> : <div className="hw-empty"><strong>Contract checks unavailable</strong><p>No contract conclusion can be drawn. Review source availability in Sources.</p></div>}</div>}
      {tab === 'sources' && <div className="hw-details"><div className="hw-section-intro"><h3>Sources & investigation scope</h3><p>{coverage.source}</p>{provider && <p><a href={provider.sourceUrl} target="_blank" rel="noreferrer">Open original SwarmEngine report</a><br/>Provider scan: {date(provider.providerTimestamp || undefined)}. Retrieved: {date(provider.fetchedAt)}.</p>}</div><dl className="hw-coverage"><div><dt>Coverage</dt><dd>{coverage.status}</dd></div><div><dt>{coverage.poolTiming ? 'Selected pool first swap' : 'Indexed trading start'}</dt><dd>{coverage.poolTiming ? date(coverage.poolTiming.firstSwapAt) : coverage.launchVerified ? date(coverage.earliestTradeAt) : 'Not verified'}</dd></div><div><dt>Requested sample</dt><dd>{coverage.holderLimit} holders  -  {coverage.buyerLimit} buyers  -  {coverage.fundingHops} funding hops</dd></div><div><dt>Provider truncation</dt><dd>{coverage.truncated ? 'Yes - bounded sample' : 'Not reported as truncated'}</dd></div><div><dt>Evidence captured</dt><dd>{date(coverage.fetchedAt)}</dd></div></dl>{coverage.reasons.length > 0 && <ul className="hw-coverage-reasons">{coverage.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}<div className="hw-sources">{report.sources.map((source, index) => <article key={`${source.name}-${index}`}><div><h4>{source.name}</h4><span className={source.status === 'available' ? 'hw-muted' : 'hw-warning'}>{source.status}</span></div><p>{source.detail}</p><p className="hw-muted">{source.status === 'available' ? 'Fetched' : 'Last successful fetch, if retained'}: {date(source.fetchedAt)}</p></article>)}</div></div>}
    </div>
  </section>;
}
