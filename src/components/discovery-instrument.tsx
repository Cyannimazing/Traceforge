'use client';

import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {gsap} from 'gsap';
import {ArrowUpRight,Crosshair,Radio} from 'lucide-react';
import {CHAINS,formatMoney,short,type Chain} from '@/lib/analysis';
import {discoveryLayout} from '@/lib/discovery-layout';
import type {DiscoveryProfile} from './discovery-radar';
import './discovery-instrument.css';

type Props={profiles:DiscoveryProfile[];active:DiscoveryProfile|undefined;loading:boolean;animate:boolean;now:number;fetchedAt?:string;onSelect:(id:string)=>void};
const networks:Chain[]=['ethereum','base','bsc','solana'];
const profileId=(p:DiscoveryProfile)=>`${p.chain}:${p.address}`;
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const money=(v:number|null|undefined)=>finite(v)?formatMoney(v):'Unavailable';
const precision=(v:number)=>Number(v.toFixed(3));
const point=(radius:number,angle:number)=>({x:precision(240+Math.sin(angle*Math.PI/180)*radius),y:precision(240-Math.cos(angle*Math.PI/180)*radius)});
const elapsed=(value:string|undefined,now:number)=>{const at=value?Date.parse(value):NaN;return Number.isFinite(at)&&now?`${Math.max(0,Math.floor((now-at)/1000))}s ago`:'Not retrieved';};

export default function DiscoveryInstrument({profiles,active,loading,animate,now,fetchedAt,onSelect}:Props){
 const root=useRef<HTMLDivElement>(null),surface=useRef<SVGSVGElement>(null);
 const [visible,setVisible]=useState(true),[documentVisible,setDocumentVisible]=useState(true),[reduced,setReduced]=useState(false);
 const titleId=useId(),descriptionId=useId();
 const points=useMemo(()=>discoveryLayout(profiles.map(profileId)),[profiles]);
 const byId=useMemo(()=>new Map(profiles.map(p=>[profileId(p),p])),[profiles]);
 const selectedId=active?profileId(active):null;
 const selectedPoint=points.find(p=>p.id===selectedId);
 const pointKey=points.map(p=>p.id).join('|');
 const running=animate&&visible&&documentVisible&&!reduced;
 const mix=networks.map(chain=>({chain,count:profiles.filter(p=>p.chain===chain).length}));
 const ranked=[...profiles].filter(p=>finite(p.volume24hUsd)).sort((a,b)=>b.volume24hUsd!-a.volume24hUsd!).slice(0,3);
 const maxVolume=ranked[0]?.volume24hUsd||0;
 const available=profiles.filter(p=>p.marketStatus==='available').length;
 const ratio=active&&finite(active.volume24hUsd)&&finite(active.liquidityUsd)&&active.liquidityUsd>0?active.volume24hUsd/active.liquidityUsd:null;
 const price=active&&finite(active.priceUsd)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumSignificantDigits:5}).format(active.priceUsd):'Unavailable';

 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion=()=>setReduced(media.matches),visibility=()=>setDocumentVisible(!document.hidden);
  motion();visibility();media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);
  const observer=new IntersectionObserver(([entry])=>setVisible(entry.isIntersecting),{threshold:.05});
  if(root.current)observer.observe(root.current);
  return()=>{observer.disconnect();media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};
 },[]);

 useEffect(()=>{
  if(!running||!root.current)return;
  const context=gsap.context(()=>{
   gsap.to('.di-beam',{rotation:360,svgOrigin:'240 240',duration:8,repeat:-1,ease:'none'});
   gsap.to('.di-orbit-arc',{rotation:-360,svgOrigin:'240 240',duration:40,repeat:-1,ease:'none'});
   gsap.utils.toArray<SVGCircleElement>('.di-ripple').forEach((circle,index)=>{
    gsap.fromTo(circle,{attr:{r:44},opacity:0},{keyframes:[{opacity:.35,duration:.25},{attr:{r:202},opacity:0,duration:3.75,ease:'power1.out'}],delay:index*2,repeat:-1,repeatDelay:0});
   });
   root.current!.querySelectorAll<SVGGElement>('[data-di-bearing]').forEach(contact=>{
    const delay=Number(contact.dataset.diBearing)/360*8;
    gsap.fromTo(contact.querySelector('.di-contact-echo'),{attr:{r:5},opacity:0},{keyframes:[{opacity:.85,duration:.08},{attr:{r:25},opacity:0,duration:.82,ease:'power2.out'}],delay,repeat:-1,repeatDelay:7.1});
    gsap.fromTo(contact.querySelector('.di-contact-flash'),{opacity:0},{keyframes:[{opacity:1,duration:.08},{opacity:0,duration:.82}],delay,repeat:-1,repeatDelay:7.1});
   });
  },root);
  return()=>context.revert();
 },[running,pointKey]);

 useEffect(()=>{
  if(!running||!root.current)return;
  const context=gsap.context(()=>{
   gsap.fromTo('.di-contact.is-selected .di-target-brackets',{opacity:.3,scale:1.15},{opacity:1,scale:1,transformOrigin:'50% 50%',duration:.4,ease:'power3.out'});
   gsap.fromTo('.di-meter-fill',{scaleX:.12},{scaleX:1,transformOrigin:'left center',duration:.55,stagger:.045,ease:'power3.out'});
  },root);
  return()=>context.revert();
 },[selectedId,fetchedAt,running]);

 function keyboard(event:React.KeyboardEvent<SVGGElement>,id:string){
  if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(id);return;}
  if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const index=points.findIndex(p=>p.id===id);
   const next=event.key==='Home'?0:event.key==='End'?points.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+points.length)%points.length;
   surface.current?.querySelectorAll<SVGGElement>('[data-di-bearing]')[next]?.focus();
  }
 }

 return <div className="dr-instrument di-instrument" ref={root} data-motion={running?'running':'still'}>
  <aside className="di-readout di-composition" aria-label="Profile composition">
   <div className="di-readout-heading"><Radio size={15}/><h3>In the field</h3><span>{profiles.length}</span></div>
   <div className="di-network-strip" aria-hidden="true">{mix.filter(m=>m.count).map((m,index)=><span key={m.chain} style={{flex:m.count,opacity:1-index*.18}}/>)}</div>
   <dl className="di-network-list">{mix.map(({chain,count})=><div key={chain}><dt>{CHAINS[chain].name}</dt><dd>{String(count).padStart(2,'0')}<span className="di-network-meter" aria-hidden="true"><i className="di-meter-fill" style={{width:`${profiles.length?count/profiles.length*100:0}%`}}/></span></dd></div>)}</dl>
   <div className="di-retrieval"><span className="di-status-dot"/><span>{loading?'Retrieving profiles':`${available} market snapshots available`}</span></div>
   <div className="di-retrieval-time"><span>Feed retrieved</span><time dateTime={fetchedAt}>{elapsed(fetchedAt,now)}</time></div>
   <p className="di-data-note">Selected feed only. Movement shows the discovery sweep, not new trades.</p>
  </aside>

  <div className="di-scope">
   <div className="di-scope-top"><span>{loading?'Retrieving contacts':'Explore the feed'}</span><span>{String(points.length).padStart(2,'0')} contacts</span></div>
   <svg ref={surface} className="di-radar" viewBox="0 0 480 480" role="group" aria-labelledby={titleId} aria-describedby={descriptionId}>
    <title id={titleId}>Interactive token discovery field</title>
    <desc id={descriptionId}>Token positions are decorative, not risk, location or network. Select a contact with Enter or Space. Arrow keys move between contacts. The token list below provides the same selections.</desc>
    <g className="di-grid" aria-hidden="true">
     {[48,96,144,192,213].map(r=><circle key={r} cx="240" cy="240" r={r}/>)}
     <path d="M240 27V192M240 288V453M27 240H192M288 240H453"/>
     {[45,135,225,315].map(angle=>{const a=point(49,angle),b=point(192,angle);return <line className="di-diagonal" key={angle} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}
     {Array.from({length:120},(_,i)=>{const a=point(i%10===0?202:i%5===0?207:210,i*3),b=point(215,i*3);return <line key={i} className={i%10===0?'di-major-tick':''} x1={a.x} y1={a.y} x2={b.x} y2={b.y}/>;})}
    </g>
    <g className="di-bearings" aria-hidden="true">{[0,90,180,270].map(angle=>{const p=point(231,angle);return <text key={angle} x={p.x} y={p.y+3} textAnchor="middle">{String(angle).padStart(3,'0')}</text>;})}</g>
    <g className="di-beam" aria-hidden="true">
     <path className="di-beam-sector" d="M240 240L116.6 70.2A210 210 0 0 1 240 30Z"/>
     {Array.from({length:18},(_,i)=><path key={i} d="M240 240V30" transform={`rotate(${-i*2} 240 240)`} style={{opacity:.24*(1-i/18)}}/>)}
     <path className="di-beam-edge" d="M240 240V29"/><circle cx="240" cy="29" r="3"/>
    </g>
    <g aria-hidden="true" className="di-ripples"><circle className="di-ripple" cx="240" cy="240" r="44"/><circle className="di-ripple" cx="240" cy="240" r="44"/></g>
    <g className="di-orbit-arc" aria-hidden="true"><path d="M240 18A222 222 0 0 1 379.7 67.5M240 462A222 222 0 0 1 100.3 412.5"/></g>
    <g className="di-center" aria-hidden="true"><circle cx="240" cy="240" r="39"/><path d="M196 240H203M277 240H284M240 196V203M240 277V284"/><text x="240" y="242" textAnchor="middle">{String(points.length).padStart(2,'0')}</text><text className="di-center-unit" x="240" y="258" textAnchor="middle">PROFILES</text></g>
    {selectedPoint&&<g aria-hidden="true" className="di-selected-guide"><path d={`M${selectedPoint.x} ${selectedPoint.y}H${selectedPoint.x<240?30:450}`}/></g>}
    {points.map(({id,x,y,bearing})=>{const profile=byId.get(id)!;const selected=id===selectedId;return <g key={id} data-di-bearing={bearing} className={`di-contact${selected?' is-selected':''}`} transform={`translate(${precision(x)} ${precision(y)})`} role="button" tabIndex={0} aria-pressed={selected} aria-label={`Select ${profile.symbol||short(profile.address)} on ${CHAINS[profile.chain].name}`} onClick={()=>onSelect(id)} onKeyDown={event=>keyboard(event,id)}>
     <title>{profile.name||profile.symbol||short(profile.address)} - {CHAINS[profile.chain].name}</title>
     <circle className="di-contact-hit" r="23"/><circle className="di-contact-echo" r="5"/><circle className="di-contact-flash" r="9"/><circle className="di-contact-core" r={selected?5:3.5}/>
     <path className="di-target-brackets" d="M-15 -7V-15H-7M7 -15H15V-7M15 7V15H7M-7 15H-15V7"/>
     {selected&&<text className="di-contact-name" x={x>315?-21:21} y="4" textAnchor={x>315?'end':'start'}>{(profile.symbol||short(profile.address)).slice(0,11)}</text>}
    </g>;})}
   </svg>
   <div className="di-scope-bottom"><Crosshair size={13}/><span>{profiles.length?'Select a contact to inspect its market snapshot':'Profiles appear here after retrieval'}</span></div>
  </div>

  <aside className="di-readout di-market" aria-label="Selected profile market snapshot">
   <div className="di-readout-heading"><Crosshair size={15}/><h3>Selected contact</h3></div>
   <div className="di-selected-identity"><strong title={active?.name||active?.address}>{active?.symbol||active&&short(active.address)||'No contact'}</strong><span>{active?CHAINS[active.chain].name:'Choose a token'}</span></div>
   <div className="di-price"><span>Price</span><strong>{price}</strong></div>
   <dl className="di-market-values"><div><dt>Liquidity</dt><dd>{money(active?.liquidityUsd)}</dd></div><div><dt>24h volume</dt><dd>{money(active?.volume24hUsd)}</dd></div><div><dt>Volume / liquidity</dt><dd>{ratio===null?'Unavailable':`${ratio.toFixed(2)}x`}</dd></div></dl>
   <div className="di-volume-heading"><span>Highest 24h volume</span><small>In this feed</small></div>
   <div className="di-volume-list">{ranked.map(profile=><button key={profileId(profile)} className={profileId(profile)===selectedId?'is-selected':''} onClick={()=>onSelect(profileId(profile))} aria-label={`Select ${profile.symbol||short(profile.address)}, 24 hour volume ${money(profile.volume24hUsd)}`}><span>{profile.symbol||short(profile.address)}<ArrowUpRight size={12}/></span><strong>{money(profile.volume24hUsd)}</strong><i className="di-volume-track" aria-hidden="true"><i className="di-meter-fill" style={{width:`${maxVolume?profile.volume24hUsd!/maxVolume*100:0}%`}}/></i></button>)}{!ranked.length&&<p className="di-data-note">Volume data not supplied.</p>}</div>
   <p className="di-data-note">{active?.marketStatus==='stale'?'Older market snapshot retained.':active?.marketFetchedAt?`Market retrieved ${elapsed(active.marketFetchedAt,now)}.`:'Market snapshot time unavailable.'}</p>
  </aside>
 </div>;
}
