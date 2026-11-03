'use client';

import {useEffect,useMemo,useRef,useState} from 'react';

import {ArrowUpRight,RefreshCw,Search,Radio,ChevronRight} from 'lucide-react';

import {gsap} from 'gsap';

import {CHAINS,short,formatMoney,sameToken,type Chain} from '@/lib/analysis';

import {FEED_KEY,FEED_EVENT,parseFeed,type FeedItem} from '../lib/report-feed';
import './discovery-radar.css';



export type DiscoveryProfile={chain:Chain;address:string;description:string;name?:string|null;symbol?:string|null;priceUsd?:number|null;liquidityUsd?:number|null;volume24hUsd?:number|null;priceChange24h?:number|null;pairAddress?:string|null;pairCreatedAt?:string|null;marketFetchedAt?:string|null;marketStatus?:'available'|'unavailable'|'stale'};

export type DiscoveryMeta={fetchedAt?:string;servedAt?:string;source?:string;sourcePublishedAt?:string|null;cache?:{status:'fresh'|'cached'|'stale';ageSeconds:number;ttlSeconds:number};partial?:boolean;warnings?:string[]};

const chainOrder:Chain[]=['ethereum','base','bsc','solana'];

const coordinate=(value:number)=>Number(value.toFixed(3));

const hash=(text:string)=>Array.from(text).reduce((value,char)=>(value*31+char.charCodeAt(0))>>>0,7);

function age(value:string|null|undefined,now:number){if(!value)return 'Not supplied';const elapsed=now-Date.parse(value);if(!Number.isFinite(elapsed)||elapsed<0)return 'Not supplied';const minutes=Math.floor(elapsed/60000);return minutes<60?`${minutes}m`:minutes<1440?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`;}

const time=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Not fetched';



export default function DiscoveryRadar({profiles,loading,error,meta,paused,onRefresh,onScan,compact=false,onOpen}:{profiles:DiscoveryProfile[];loading:boolean;error:string;meta:DiscoveryMeta;paused:boolean;onRefresh:()=>void;onScan:(chain:Chain,address:string)=>void;compact?:boolean;onOpen?:()=>void}){

 const [chain,setChain]=useState<Chain|'all'>('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null),[now,setNow]=useState(0),[onscreen,setOnscreen]=useState(true);

 const [assessments,setAssessments]=useState<Record<string,FeedItem|null>>({}),[savedReports,setSavedReports]=useState<FeedItem[]>([]);
 const assessed=useRef(new Set<string>());
 const profileKey=profiles.slice(0,16).map(p=>`${p.chain}:${p.address}`).join('|');
 useEffect(()=>{const read=()=>{try{setSavedReports(parseFeed(localStorage.getItem(FEED_KEY)||'[]'));}catch{setSavedReports([]);}};read();window.addEventListener(FEED_EVENT,read);window.addEventListener('storage',read);return()=>{window.removeEventListener(FEED_EVENT,read);window.removeEventListener('storage',read);};},[]);
 useEffect(()=>{
  if(!onscreen||document.hidden)return;
  const controller=new AbortController();let cancelled=false,cursor=0;
  const queue=profileKey.split('|').filter(Boolean).filter(key=>!assessed.current.has(key));
  const worker=async()=>{while(cursor<queue.length&&!cancelled){const key=queue[cursor++],separator=key.indexOf(':'),network=key.slice(0,separator),address=key.slice(separator+1);
   try{const response=await fetch(`/api/discover/assessment?chain=${network}&token=${encodeURIComponent(address)}`,{signal:controller.signal});if(cancelled)return;
    const data=response.ok?await response.json():null;const parsed=data?.item?parseFeed(JSON.stringify([data.item])):[];
    const item=parsed.find(value=>value.chain===network&&sameToken(value.chain,value.token,address))||null;
    assessed.current.add(key);setAssessments(previous=>({...previous,[key]:item}));
   }catch{if(!cancelled){assessed.current.add(key);setAssessments(previous=>({...previous,[key]:null}));}}
  }};
  void Promise.all([worker(),worker()]);return()=>{cancelled=true;controller.abort();};
 },[profileKey,onscreen]);

 const root=useRef<HTMLElement>(null),list=useRef<HTMLDivElement>(null),needle=useRef<SVGGElement>(null);

 const visible=useMemo(()=>profiles.filter(p=>(chain==='all'||p.chain===chain)&&`${p.name||''} ${p.symbol||''} ${p.address}`.toLowerCase().includes(query.toLowerCase())).slice(0,16),[profiles,chain,query]);

 const active=visible.find(p=>`${p.chain}:${p.address}`===selected)||visible[0];

 const points=useMemo(()=>visible.map((profile)=>{const bearing=chainOrder.indexOf(profile.chain)*90+10+hash(profile.address)%68;const radius=70+hash(`${profile.address}:r`)%112;const theta=bearing*Math.PI/180;return{profile,x:240+Math.sin(theta)*radius,y:240-Math.cos(theta)*radius,id:`${profile.chain}:${profile.address}`};}),[visible]);

 useEffect(()=>{const tick=()=>{if(!document.hidden)setNow(Date.now());};tick();const interval=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',tick);};},[]);

 useEffect(()=>{if(!root.current)return;const observer=new IntersectionObserver(([entry])=>setOnscreen(entry.isIntersecting));observer.observe(root.current.querySelector('.dr-instrument')||root.current);return()=>observer.disconnect();},[compact]);

 useEffect(()=>{if(paused||!onscreen||!needle.current)return;const animation=gsap.to(needle.current,{rotation:360,svgOrigin:'240 240',duration:7,repeat:-1,ease:'none'});return()=>{animation.revert();};},[paused,onscreen,compact]);

 useEffect(()=>{if(paused||!onscreen||!list.current?.querySelector('[data-contact]'))return;const context=gsap.context(()=>{gsap.fromTo('[data-contact]',{opacity:.4,y:10},{opacity:1,y:0,duration:.5,stagger:.045,ease:'power3.out',clearProps:'transform,opacity'});},list);return()=>context.revert();},[meta.fetchedAt,chain,paused,onscreen]);

 const select=(id:string)=>setSelected(id);

 const stale=meta.cache?.status==='stale'||!!error;

 const seconds=meta.fetchedAt&&now?Math.max(0,Math.floor((now-Date.parse(meta.fetchedAt))/1000)):null;

 return <section ref={root} className={`discovery-radar ${compact?'dr-compact':''}`} data-animate={!paused&&onscreen} aria-label="Token discovery radar">

  <header className="dr-heading"><div><h2>Discovery<span className="dr-pulse"/></h2><p>Latest public token profiles. Select a token to investigate.</p></div>{compact?<button className="dr-open" onClick={onOpen}>Open radar<ArrowUpRight size={17}/></button>:<button className="dr-refresh" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading?'spin':''}/>{loading?'Fetching':'Refresh feed'}</button>}</header>

  <div className="dr-status"><span role="status"><i className={stale?'is-stale':''}/>{loading?'Fetching public profiles':stale?'Last available snapshot':'Auto-refresh every 30s'}</span><span>{profiles.length} profiles</span><span>Fetched {time(meta.fetchedAt)}{seconds!=null&&`  -  ${seconds}s ago`}</span></div>

  {!compact&&<div className="dr-tools"><div className="dr-networks" role="group" aria-label="Filter discovery network">{(['all',...chainOrder] as const).map(value=><button key={value} aria-pressed={chain===value} onClick={()=>setChain(value)}>{value==='all'?'All networks':CHAINS[value].name}</button>)}</div><label className="dr-search"><Search size={16}/><span className="sr-only">Search discovery tokens</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find name or address"/></label></div>}

  <div className="dr-workspace">{!compact&&<div className="dr-instrument" onPointerMove={event=>{if(paused||event.pointerType==='touch')return;const box=event.currentTarget.getBoundingClientRect();event.currentTarget.style.setProperty('--dr-pointer-x',`${((event.clientX-box.left)/box.width-.5)*16}px`);event.currentTarget.style.setProperty('--dr-pointer-y',`${((event.clientY-box.top)/box.height-.5)*12}px`);}} onPointerLeave={event=>{event.currentTarget.style.setProperty('--dr-pointer-x','0px');event.currentTarget.style.setProperty('--dr-pointer-y','0px');}}><div className="dr-bearings"><span>ETHEREUM</span><span>BASE</span><span>BNB CHAIN</span><span>SOLANA</span></div><svg viewBox="0 0 480 480" aria-label="Profiles arranged by network, not market performance" role="group">

   <g aria-hidden="true" className="dr-range">{[52,100,148,196,212].map(r=><circle key={r} cx="240" cy="240" r={r}/>)}{Array.from({length:72},(_,i)=>{const a=i*5*Math.PI/180;return <line key={i} x1={coordinate(240+Math.sin(a)*(i%3===0?202:207))} y1={coordinate(240-Math.cos(a)*(i%3===0?202:207))} x2={coordinate(240+Math.sin(a)*212)} y2={coordinate(240-Math.cos(a)*212)}/>;})}<path d="M28 240H452M240 28V452"/><path d="M90 90L390 390M90 390L390 90" className="dr-diagonals"/></g>

   <g ref={needle} aria-hidden="true" className="dr-sweep">{Array.from({length:16},(_,i)=><path key={i} d="M240 240L240 29" transform={`rotate(${-i*2} 240 240)`} style={{opacity:(1-i/16)*.26}}/>)}<path className="dr-leading" d="M240 240L240 29"/></g>

   <g className="dr-origin" aria-hidden="true"><path d="M232 240H248M240 232V248"/><circle cx="240" cy="240" r="17"/></g>

   {points.map(({profile,x,y,id},index)=>{const isSelected=active?.address===profile.address&&active?.chain===profile.chain;return <g key={id} className={`dr-contact ${isSelected?'is-selected':''}`} transform={`translate(${x} ${y})`} role="button" tabIndex={0} aria-label={`Select ${profile.symbol||short(profile.address)} on ${CHAINS[profile.chain].name}`} aria-pressed={isSelected} onClick={()=>select(id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(id);}}}><circle className="dr-contact-hit" r="16"/><circle className="dr-contact-echo" r="9" style={{animationDelay:`${index*.36}s`}}/><path className="dr-contact-bracket" d="M-11 -4V-11H-4M4 -11H11V-4M11 4V11H4M-4 11H-11V4"/><circle className="dr-contact-core" r="3.5"/>{isSelected&&<text x="16" y="4">{(profile.symbol||short(profile.address)).slice(0,13)}</text>}</g>;})}

  </svg><div className="dr-scope-note"><Radio size={13}/><span>{loading?'Retrieving profiles...':'Sweep is visual. Signals are retrieved profiles.'}</span></div></div>}

  {!compact&&active&&<div className="dr-selected-target"><div><span>Selected profile</span><strong>{active.symbol||short(active.address)}</strong><small>{CHAINS[active.chain].name}</small></div><div><span>Pair age</span><strong>{age(active.pairCreatedAt,now)}</strong></div><div><span>Liquidity</span><strong>{formatMoney(active.liquidityUsd)==='-'?'Unavailable':formatMoney(active.liquidityUsd)}</strong></div><button onClick={()=>onScan(active.chain,active.address)}>Investigate<ArrowUpRight size={16}/></button></div>}

  </div>

  <div className="dr-list-heading"><span>{compact?'Ready to investigate':'Profiles in view'}</span><span>{visible.length} profiles  -  Select any token to scan</span></div>

  <div ref={list} className="dr-token-grid">{visible.map((profile,i)=>{const id=`${profile.chain}:${profile.address}`,isSelected=active?.address===profile.address&&active?.chain===profile.chain,assessment=savedReports.find(item=>item.chain===profile.chain&&sameToken(item.chain,item.token,profile.address))||assessments[id];return <article data-contact data-contact-id={id} key={id} className={`dr-token-card ${!compact&&isSelected?'is-selected':''}`}>

   <button className="dr-card-select" aria-pressed={isSelected} onClick={()=>setSelected(id)} aria-label={`Select ${profile.symbol||short(profile.address)}`}><span className="dr-card-index">{String(i+1).padStart(2,'0')}</span><span className="dr-card-identity"><strong>{profile.symbol||short(profile.address)}</strong><span>{profile.name||'Token profile'}</span></span><span className="dr-card-network">{CHAINS[profile.chain].name}</span></button>

   <div className="dr-verdict-row"><button className="dr-verdict-badge" data-tone={assessment?.status||'unassessed'} onClick={()=>onScan(profile.chain,profile.address)} title={assessment?`${assessment.reason}. Retrieved ${new Date(assessment.fetchedAt).toLocaleString()}. ${assessment.score==null?'No numerical score supplied.':'Number is the SwarmEngine provider score, not a safety probability.'}`:'No completed assessment available. Scan this token to investigate.'}>{assessment?.title||'Not scanned'}{assessment?.score!=null&&<strong>{assessment.score}</strong>}</button><small>{assessment?.score!=null?'SwarmEngine score':assessment?'Saved assessment':'No verdict yet'}</small>{assessment&&<time dateTime={assessment.providerTimestamp||assessment.fetchedAt}>{assessment.providerTimestamp?'Source scan':'Retrieved'} {new Date(assessment.providerTimestamp||assessment.fetchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time>}</div>
   <dl><div><dt>24h volume</dt><dd>{formatMoney(profile.volume24hUsd)==='-'?'Not supplied':formatMoney(profile.volume24hUsd)}</dd></div><div><dt>Pair age</dt><dd>{age(profile.pairCreatedAt,now)}</dd></div></dl>

   <div className="dr-card-foot"><span title={profile.address}>{short(profile.address)}</span><button onClick={()=>onScan(profile.chain,profile.address)} aria-label={`Investigate ${profile.symbol||short(profile.address)}`}>Scan<ArrowUpRight size={15}/></button></div>

   {profile.marketStatus==='stale'&&<small className="dr-market-stale">Older market snapshot  -  {time(profile.marketFetchedAt||undefined)}</small>}

  </article>;})}{!visible.length&&<div className="dr-empty"><Radio size={30}/><strong>{loading?'Fetching public profiles':'No profiles in view'}</strong><p>{error||'Try another network or search.'}</p></div>}</div>

  {error&&<p className="dr-error" role="alert">{error} {profiles.length>0&&'Last successful profiles are preserved.'}</p>}

  <footer className="dr-footer"><span>Source: DEX Screener latest profiles{meta.partial?'  -  Some market data unavailable':''}</span><span>Listings are not verdicts. Pair age is not token age.</span></footer>

 </section>;

}
