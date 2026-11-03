'use client';

import {useEffect,useMemo,useRef,useState} from 'react';

import {ArrowUpRight,RefreshCw,Search,Radio} from 'lucide-react';

import {gsap} from 'gsap';

import {CHAINS,short,formatMoney,sameToken,type Chain} from '@/lib/analysis';

import {FEED_KEY,FEED_EVENT,parseFeed,type FeedItem} from '../lib/report-feed';
import './discovery-radar.css';
import DiscoveryInstrument from './discovery-instrument';
import {latestDiscoveryProfiles} from '@/lib/discovery-order';
import {latestDiscoveryAssessment} from '@/lib/discovery-assessment';



export type DiscoveryProfile={chain:Chain;address:string;description:string;name?:string|null;symbol?:string|null;priceUsd?:number|null;liquidityUsd?:number|null;volume24hUsd?:number|null;priceChange24h?:number|null;pairAddress?:string|null;pairCreatedAt?:string|null;marketFetchedAt?:string|null;marketStatus?:'available'|'unavailable'|'stale'};

export type DiscoveryMeta={fetchedAt?:string;servedAt?:string;source?:string;sourcePublishedAt?:string|null;cache?:{status:'fresh'|'cached'|'stale';ageSeconds:number;ttlSeconds:number};partial?:boolean;warnings?:string[]};

const chainOrder:Chain[]=['ethereum','base','bsc','solana'];



function age(value:string|null|undefined,now:number){if(!value)return 'Not supplied';const elapsed=now-Date.parse(value);if(!Number.isFinite(elapsed)||elapsed<0)return 'Not supplied';const minutes=Math.floor(elapsed/60000);return minutes<60?`${minutes}m`:minutes<1440?`${Math.floor(minutes/60)}h ${minutes%60}m`:`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`;}

const time=(value?:string)=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'Not fetched';



export default function DiscoveryRadar({profiles,loading,error,meta,paused,onRefresh,onScan,compact=false,onOpen}:{profiles:DiscoveryProfile[];loading:boolean;error:string;meta:DiscoveryMeta;paused:boolean;onRefresh:()=>void;onScan:(chain:Chain,address:string)=>void;compact?:boolean;onOpen?:()=>void}){

 const [chain,setChain]=useState<Chain|'all'>('all'),[query,setQuery]=useState(''),[selected,setSelected]=useState<string|null>(null),[now,setNow]=useState(0),[onscreen,setOnscreen]=useState(true),[documentVisible,setDocumentVisible]=useState(true);

 const [assessments,setAssessments]=useState<Record<string,FeedItem|null>>({}),[savedReports,setSavedReports]=useState<FeedItem[]>([]),[assessmentEpoch,setAssessmentEpoch]=useState(0);
 const assessed=useRef(new Map<string,number>());
 const visible=useMemo(()=>{
  const matches=profiles.filter(p=>(chain==='all'||p.chain===chain)&&`${p.name||''} ${p.symbol||''} ${p.address}`.toLowerCase().includes(query.toLowerCase()));
  return latestDiscoveryProfiles(matches).slice(0,16);
 },[profiles,chain,query]);
 const profileKey=visible.map(p=>`${p.chain}:${p.address}`).join('|');
 useEffect(()=>{const read=()=>{try{setSavedReports(parseFeed(localStorage.getItem(FEED_KEY)||'[]'));}catch{setSavedReports([]);}};read();window.addEventListener(FEED_EVENT,read);window.addEventListener('storage',read);return()=>{window.removeEventListener(FEED_EVENT,read);window.removeEventListener('storage',read);};},[]);
 useEffect(()=>{
  if(!onscreen||!documentVisible||document.hidden)return;
  const controller=new AbortController();let cancelled=false,cursor=0,retryTimer:ReturnType<typeof setTimeout>|undefined;
  const queue=profileKey.split('|').filter(Boolean).filter(key=>(assessed.current.get(key)||0)<=Date.now());
  const worker=async()=>{while(cursor<queue.length&&!cancelled){const key=queue[cursor++],separator=key.indexOf(':'),network=key.slice(0,separator),address=key.slice(separator+1);
   try{const response=await fetch(`/api/discover/assessment?chain=${network}&token=${encodeURIComponent(address)}`,{signal:controller.signal});if(cancelled)return;
    const data=response.ok?await response.json():null;if(cancelled)return;const parsed=data?.item?parseFeed(JSON.stringify([data.item])):[];
    const item=parsed.find(value=>value.chain===network&&sameToken(value.chain,value.token,address))||null;
    assessed.current.delete(key);assessed.current.set(key,Date.now()+(item?60000:20000));
    while(assessed.current.size>512)assessed.current.delete(assessed.current.keys().next().value!);
    setAssessments(previous=>{if(!item&&Object.hasOwn(previous,key))return previous;const next={...previous,[key]:item};for(const staleKey of Object.keys(next).slice(0,Math.max(0,Object.keys(next).length-512)))delete next[staleKey];return next;});
   }catch{if(!cancelled){assessed.current.delete(key);assessed.current.set(key,Date.now()+20000);while(assessed.current.size>512)assessed.current.delete(assessed.current.keys().next().value!);}}
  }};
  void Promise.all([worker(),worker()]).finally(()=>{if(!cancelled)retryTimer=setTimeout(()=>setAssessmentEpoch(value=>value+1),20000);});return()=>{cancelled=true;clearTimeout(retryTimer);controller.abort();};
 },[profileKey,onscreen,documentVisible,meta.fetchedAt,assessmentEpoch]);

 const root=useRef<HTMLElement>(null),list=useRef<HTMLDivElement>(null);
 const [motionAllowed,setMotionAllowed]=useState(false);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{setMotionAllowed(!media.matches&&!document.hidden);setDocumentVisible(!document.hidden);};sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);return()=>{media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};},[]);
 const animate=!paused&&onscreen&&motionAllowed;

 const active=visible.find(p=>`${p.chain}:${p.address}`===selected)||visible[0];

 useEffect(()=>{const tick=()=>{if(!document.hidden)setNow(Date.now());};tick();const interval=setInterval(tick,1000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(interval);document.removeEventListener('visibilitychange',tick);};},[]);

 useEffect(()=>{if(!root.current)return;const observer=new IntersectionObserver(([entry])=>setOnscreen(entry.isIntersecting));observer.observe(root.current.querySelector('.dr-instrument')||root.current);return()=>observer.disconnect();},[compact]);

 useEffect(()=>{if(!animate||!list.current?.querySelector('[data-contact]'))return;const context=gsap.context(()=>{gsap.fromTo('[data-contact]',{opacity:.4,y:10},{opacity:1,y:0,duration:.5,stagger:.045,ease:'power3.out',clearProps:'transform,opacity'});},list);return()=>context.revert();},[meta.fetchedAt,chain,animate]);

 const select=(id:string)=>setSelected(id);

 const stale=meta.cache?.status==='stale'||!!error;

 const seconds=meta.fetchedAt&&now?Math.max(0,Math.floor((now-Date.parse(meta.fetchedAt))/1000)):null;

 return <section ref={root} className={`discovery-radar ${compact?'dr-compact':''}`} data-animate={animate} aria-label="Token discovery radar">

  <div className="dr-console">

  <header className="dr-heading"><div><h2>Discovery<span className="dr-pulse"/></h2><p>Latest token profiles and pool listings. Select a token to investigate.</p></div>{compact?<button className="dr-open" onClick={onOpen}>Open radar<ArrowUpRight size={17}/></button>:<button className="dr-refresh" disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading?'spin':''}/>{loading?'Fetching':'Refresh feed'}</button>}</header>

  <div className="dr-status"><span role="status"><i className={stale?'is-stale':''}/>{loading?'Fetching public profiles':stale?'Last available snapshot':'Auto-refresh every 30s'}</span><span>{profiles.length} profiles</span><span>Fetched {time(meta.fetchedAt)}{seconds!=null&&`  -  ${seconds}s ago`}</span></div>

  {!compact&&<div className="dr-tools"><div className="dr-networks" role="group" aria-label="Filter discovery network">{(['all',...chainOrder] as const).map(value=><button key={value} aria-pressed={chain===value} onClick={()=>setChain(value)}>{value==='all'?'All networks':CHAINS[value].name}</button>)}</div><label className="dr-search"><Search size={16}/><span className="sr-only">Search discovery tokens</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find name or address"/></label></div>}

  <div className="dr-workspace">{!compact&&<DiscoveryInstrument profiles={visible} active={active} loading={loading} animate={animate} now={now} fetchedAt={meta.fetchedAt} onSelect={select}/>}

  {!compact&&active&&<div className="dr-selected-target"><div><span>Selected profile</span><strong>{active.symbol||short(active.address)}</strong><small>{CHAINS[active.chain].name}</small></div><div><span>Pair age</span><strong>{age(active.pairCreatedAt,now)}</strong></div><div><span>Liquidity</span><strong>{formatMoney(active.liquidityUsd)==='-'?'Unavailable':formatMoney(active.liquidityUsd)}</strong></div><button onClick={()=>onScan(active.chain,active.address)}>Investigate<ArrowUpRight size={16}/></button></div>}

  </div>

  </div>

  <div className="dr-latest">

  <div className="dr-list-heading"><span>Latest pairs</span><span>Newest first - {visible.length} listings</span></div>

  <div ref={list} className="dr-token-grid">{visible.map((profile,i)=>{const id=`${profile.chain}:${profile.address}`,isSelected=active?.address===profile.address&&active?.chain===profile.chain,assessment=latestDiscoveryAssessment(savedReports.find(item=>item.chain===profile.chain&&sameToken(item.chain,item.token,profile.address)),assessments[id]);return <article data-contact data-contact-id={id} key={id} className={`dr-token-card ${!compact&&isSelected?'is-selected':''}`}>
   <a className="dr-card-open" href={`/token/${profile.chain}/${encodeURIComponent(profile.address)}`} aria-label={`Investigate ${profile.symbol||short(profile.address)} on ${CHAINS[profile.chain].name}`} onPointerEnter={()=>setSelected(id)} onFocus={()=>setSelected(id)} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onScan(profile.chain,profile.address);}}/>
   <div className="dr-card-select"><span className="dr-card-index">{String(i+1).padStart(2,'0')}</span><span className="dr-card-identity"><strong>{profile.symbol||short(profile.address)}</strong><span>{profile.name||'Token listing'}</span></span><span className="dr-card-network">{CHAINS[profile.chain].name}</span></div>
   {assessment&&<div className="dr-verdict-row"><span className="dr-verdict-badge" data-tone={assessment.status} title={`${assessment.reason}. Retrieved ${new Date(assessment.fetchedAt).toLocaleString()}.`}>{assessment.title}{assessment.score!=null&&<strong>{assessment.score}</strong>}</span><small>{assessment.score!=null?'Scan score':'Saved assessment'}</small><time dateTime={assessment.providerTimestamp||assessment.fetchedAt}>{assessment.providerTimestamp?'Source scan':'Retrieved'} {new Date(assessment.providerTimestamp||assessment.fetchedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div>}
   <dl><div><dt>24h volume</dt><dd>{formatMoney(profile.volume24hUsd)==='-'?'Not supplied':formatMoney(profile.volume24hUsd)}</dd></div><div><dt>Pair age</dt><dd>{profile.pairCreatedAt?<time dateTime={profile.pairCreatedAt}>{age(profile.pairCreatedAt,now)}</time>:'Not supplied'}</dd></div></dl>
   {profile.marketStatus==='stale'&&<small className="dr-market-stale">Older market snapshot - {time(profile.marketFetchedAt||undefined)}</small>}
   <div className="dr-card-foot"><span title={profile.address}>{short(profile.address)}</span><span className="dr-card-action">Scan<ArrowUpRight size={15}/></span></div>
  </article>;})}{!visible.length&&<div className="dr-empty"><Radio size={30}/><strong>{loading?'Fetching public profiles':'No profiles in view'}</strong><p>{error||(chain==='all'?'Try another network or search.':meta.warnings?.find(warning=>warning.toLowerCase().includes(chain))||`No ${CHAINS[chain].name} listings were returned by the available sources. Refresh the feed or scan an address.`)}</p></div>}</div>

  {error&&<p className="dr-error" role="alert">{error} {profiles.length>0&&'Last successful profiles are preserved.'}</p>}

  <footer className="dr-footer"><span>Source: {meta.source||'Public token and pool listings'}{meta.partial?'  -  Some market data unavailable':''}</span><span>Listings are not verdicts. Pair age is not token age.</span></footer>

  </div>

 </section>;

}
