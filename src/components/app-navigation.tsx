'use client';

import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties} from 'react';
import {gsap} from 'gsap';
import {ArrowUpRight, BookOpen, Bookmark, Radar, ScanLine, Search} from 'lucide-react';
import {workspacePath, type WorkspaceView} from '../lib/token-route';
import {magnetic, reducedMotion} from '../lib/motion';
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
 const [open,setOpen]=useState(false),[inView,setInView]=useState(true),[scrolled,setScrolled]=useState(false);
 const [origin,setOrigin]=useState({x:'100%',y:'0px'});
 const root=useRef<HTMLElement>(null),navigation=useRef<HTMLElement>(null),toggle=useRef<HTMLButtonElement>(null);
 const indicator=useRef<HTMLSpanElement>(null),search=useRef<HTMLButtonElement>(null);
 const placed=useRef<{x:number;width:number}|null>(null);
 const navId=useId();
 const animate=!paused&&inView;
 useEffect(()=>{setOpen(false);},[view]);
 useEffect(()=>{
  const element=root.current;if(!element)return;
  const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting));observer.observe(element);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  const onScroll=()=>setScrolled(window.scrollY>40);onScroll();
  window.addEventListener('scroll',onScroll,{passive:true});return()=>window.removeEventListener('scroll',onScroll);
 },[]);
 // Active pill glides smoothly from the previous route to the new one.
 useLayoutEffect(()=>{
  const nav=navigation.current,pill=indicator.current;if(!nav||!pill)return;
  const place=(instant:boolean)=>{
   const active=nav.querySelector<HTMLElement>('[aria-current="page"]');
   if(!active||getComputedStyle(pill).display==='none'){gsap.set(pill,{opacity:0});placed.current=null;return;}
   const target={x:active.offsetLeft,width:active.offsetWidth},from=placed.current;placed.current=target;
   gsap.killTweensOf(pill);
   if(instant||!from||reducedMotion()){gsap.set(pill,{x:target.x,width:target.width,opacity:1});return;}
   gsap.to(pill,{x:target.x,width:target.width,opacity:1,duration:.7,ease:'expo.inOut'});
  };
  place(false);
  const observer=new ResizeObserver(()=>place(true));observer.observe(nav);
  return()=>observer.disconnect();
 },[view,watchlistCount,open]);
 useEffect(()=>{const element=search.current;return element?magnetic(element):undefined;},[]);
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
 const toggleMenu=()=>{
  const button=toggle.current;
  if(button){const r=button.getBoundingClientRect();setOrigin({x:`${r.left+r.width/2}px`,y:`${r.top+r.height/2-62}px`});}
  setOpen(value=>!value);
 };
 const style={'--an-origin-x':origin.x,'--an-origin-y':origin.y} as CSSProperties;
 return <header ref={root} className="topbar app-navigation" data-open={open} data-scrolled={scrolled} data-animate={animate} onBlur={event=>{if(event.relatedTarget&&!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  <div className="an-inner">
   <a className="an-brand" href="/" aria-label="TraceForge home" onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setOpen(false);onHome();}}>
    <ForgeLogo/>
   </a>
   <nav ref={navigation} id={navId} className="an-routes" aria-label="Main navigation" style={style}>
    <span ref={indicator} className="an-indicator" aria-hidden="true"/>
    {routes.map(({id,label,description,icon:Icon},index)=><a key={id} className="an-route" style={{'--i':index} as CSSProperties} href={workspacePath(id)} aria-current={view===id?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setOpen(false);onNavigate(id);}}>
     <Icon className="an-route-icon" size={17} aria-hidden="true"/>
     <span className="an-route-copy">
      <span><span className="an-roll" data-label={label}><span>{label}</span></span>{id==='watchlist'&&<span className="an-count" aria-label={`${watchlistCount} saved tokens`}>{watchlistCount}</span>}</span>
      <small>{description}</small>
     </span>
     <ArrowUpRight className="an-route-arrow" size={17} aria-hidden="true"/>
    </a>)}
   </nav>
   <div className="an-actions">
    <OfficialXLink className="an-social"/>
    <button ref={search} className="an-search" type="button" aria-label="Focus token search" aria-keyshortcuts="Control+k Meta+k" onClick={()=>{setOpen(false);onSearch();}}><Search size={17} aria-hidden="true"/><span>Token search</span><kbd>Ctrl K</kbd></button>
    <button ref={toggle} className="an-toggle" type="button" aria-expanded={open} aria-controls={navId} aria-label={open?'Close navigation':'Open navigation'} onClick={toggleMenu}><span>{open?'Close':'Menu'}</span><span className="an-toggle-lines" aria-hidden="true"><i/><i/><i/></span></button>
   </div>
  </div>
  <span className="an-backdrop" aria-hidden="true" onClick={()=>{setOpen(false);toggle.current?.focus({preventScroll:true});}}/>
 </header>;
}
