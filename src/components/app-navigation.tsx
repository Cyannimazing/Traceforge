'use client';

import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import {ArrowUpRight, BookOpen, Bookmark, Radar, ScanLine, Search} from 'lucide-react';
import {workspacePath, type WorkspaceView} from '../lib/token-route';
import {ForgeLogo} from './brand';
import OfficialXLink from './official-x-link';
import './app-navigation.css';

const routes = [
 {id:'scanner',label:'Scan',description:'Follow the evidence',icon:ScanLine},
 {id:'discover',label:'Discover',description:'Explore recent markets',icon:Radar},
 {id:'watchlist',label:'Watchlist',description:'Saved on this device',icon:Bookmark},
 {id:'methodology',label:'Methodology',description:'Understand the assessment',icon:BookOpen},
] as const;

type Props = {view:WorkspaceView; watchlistCount:number; paused:boolean; onNavigate:(view:WorkspaceView)=>void; onHome:()=>void; onSearch:()=>void};

export default function AppNavigation({view,watchlistCount,paused,onNavigate,onHome,onSearch}:Props){
 const [open,setOpen]=useState(false),[inView,setInView]=useState(true);
 const [marker,setMarker]=useState({x:0,width:0});
 const root=useRef<HTMLElement>(null),navigation=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
 const navId=useId();
 useEffect(()=>{setOpen(false);},[view]);
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting));observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 useLayoutEffect(()=>{
  const nav=navigation.current;if(!nav)return;
  const measure=()=>{const active=nav.querySelector<HTMLElement>('[aria-current="page"]');if(active)setMarker({x:active.offsetLeft,width:active.offsetWidth});};
  measure();const observer=new ResizeObserver(measure);observer.observe(nav);
  return()=>observer.disconnect();
 },[view,watchlistCount,open]);
 useEffect(()=>{
  const media=matchMedia('(min-width:901px)');
  const resize=()=>{if(media.matches){if(document.activeElement===toggle.current)navigation.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();setOpen(false);}else if(navigation.current?.contains(document.activeElement)){toggle.current?.focus({preventScroll:true});}};
  media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);
 },[]);
 useEffect(()=>{
  if(!open)return;
  navigation.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);toggle.current?.focus();}
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k')setOpen(false);
  };
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node)){if(navigation.current?.contains(document.activeElement))toggle.current?.focus({preventScroll:true});setOpen(false);}};
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
 },[open]);
 const style={'--an-marker-x':`${marker.x}px`,'--an-marker-width':marker.width} as CSSProperties;
 return <header ref={root} className="topbar app-navigation" data-open={open} data-animate={!paused&&inView} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  <div className="an-inner">
   <a className="an-brand" href="/" aria-label="TraceForge home" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setOpen(false);onHome();}}>
    <ForgeLogo/>
   </a>
   <nav ref={navigation} id={navId} className="an-routes" aria-label="Main navigation" style={style}>
    <span className="an-route-marker" aria-hidden="true"/>
    {routes.map(({id,label,description,icon:Icon})=><a key={id} className="an-route" href={workspacePath(id)} aria-current={view===id?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setOpen(false);onNavigate(id);}}>
     <Icon className="an-route-icon" size={17} aria-hidden="true"/><span className="an-route-copy"><span>{label}{id==='watchlist'&&<span className="an-count" aria-label={`${watchlistCount} saved tokens`}>{watchlistCount}</span>}</span><small>{description}</small></span><ArrowUpRight className="an-route-arrow" size={17} aria-hidden="true"/>
    </a>)}
   </nav>
   <div className="an-actions">
    <OfficialXLink className="an-social"/>
    <button className="an-search" type="button" aria-label="Focus token search" aria-keyshortcuts="Control+k Meta+k" onClick={()=>{setOpen(false);onSearch();}}><Search size={17} aria-hidden="true"/><span>Token search</span><kbd>Ctrl K</kbd></button>
    <button ref={toggle} className="an-toggle" type="button" aria-expanded={open} aria-controls={navId} aria-label={open?'Close navigation':'Open navigation'} onClick={()=>setOpen(value=>!value)}><span>{open?'Close':'Menu'}</span><span className="an-toggle-lines" aria-hidden="true"><i/><i/></span></button>
   </div>
  </div>
 </header>;
}
