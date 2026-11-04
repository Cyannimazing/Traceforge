"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowUpRight,ChevronLeft,ChevronRight,TriangleAlert,Radio,CircleCheck} from 'lucide-react';
import {CHAINS,type Chain} from '../lib/analysis';
import {FEED_KEY,FEED_EVENT,readRememberedReports,type FeedItem} from '../lib/report-feed';
import {BROWSER_STORAGE_EVENT,REPORT_HISTORY_CONSENT_KEY,reportHistoryEnabled} from '../lib/browser-storage';
import './report-feed.css';
import {assessmentLabel,presentationText} from '@/lib/assessment-presentation';

export default function ReportFeed({paused,onScan}:{paused:boolean;onScan:(chain:Chain,token:string)=>void}){
 const [items,setItems]=useState<FeedItem[]>([]),[index,setIndex]=useState(0),[held,setHeld]=useState(false),[inView,setInView]=useState(false),[historyEnabled,setHistoryEnabled]=useState(false);
 const root=useRef<HTMLElement>(null);
 useEffect(()=>{
  const read=()=>{setItems(readRememberedReports());setHistoryEnabled(reportHistoryEnabled());setIndex(0);};
  const storage=(event:StorageEvent)=>{if(event.key===null||event.key===FEED_KEY||event.key===REPORT_HISTORY_CONSENT_KEY)read();};
  const observer=new IntersectionObserver(([entry])=>setInView(entry.isIntersecting));if(root.current)observer.observe(root.current);
  read();window.addEventListener(FEED_EVENT,read);window.addEventListener(BROWSER_STORAGE_EVENT,read);window.addEventListener('storage',storage);
  return()=>{observer.disconnect();window.removeEventListener(FEED_EVENT,read);window.removeEventListener(BROWSER_STORAGE_EVENT,read);window.removeEventListener('storage',storage);};
 },[]);
 useEffect(()=>{if(paused||held||!inView||items.length<2)return;const timer=setInterval(()=>setIndex(value=>(value+1)%items.length),7000);return()=>clearInterval(timer);},[paused,held,inView,items.length]);
 const item=items[index]||items[0];
 return <section className="report-feed" aria-labelledby="report-feed-title" ref={root} onPointerEnter={()=>setHeld(true)} onPointerLeave={()=>setHeld(false)} onFocusCapture={()=>setHeld(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setHeld(false);}} data-paused={paused}>
  <header><div><h2 id="report-feed-title"><Radio size={16}/>Report feed</h2><p>{historyEnabled?'Your completed scans, saved on this device. ':'Report history is off. '}<a href="/cookies#storage-controls">{historyEnabled?'Manage storage':'Choose browser storage'}</a></p></div>{items.length>0&&<div className="report-feed-counts"><span data-tone="critical">{items.filter(i=>i.status==='critical').length} {assessmentLabel('critical')}</span><span data-tone="caution">{items.filter(i=>i.status==='caution'||i.status==='insufficient').length} {assessmentLabel('caution')}</span></div>}</header>
  {item?<div className="report-feed-content"><article key={`${item.chain}:${item.token}:${item.fetchedAt}`} className="report-feed-item" data-tone={item.status}>
   <div className="report-feed-verdict">{item.status==='clear'?<CircleCheck size={18}/>:<TriangleAlert size={18}/>}<strong>{/swarm/i.test(item.source)?item.title:assessmentLabel(item.status)}</strong></div>
   <div className="report-feed-message"><strong>{item.symbol||item.name}<span>{CHAINS[item.chain].name}</span></strong><p>{presentationText(item.reason,/swarm/i.test(item.source)?'provider':'independent')}</p><small>{item.source} · Retrieved <time dateTime={item.fetchedAt}>{new Date(item.fetchedAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></small></div>
   <button className="report-feed-open" onClick={()=>onScan(item.chain,item.token)}>Recheck token<ArrowUpRight size={15}/></button>
  </article><div className="report-feed-navigation"><span>{index+1} / {items.length}</span><button aria-label="Previous report" disabled={items.length<2} onClick={()=>setIndex(value=>(value-1+items.length)%items.length)}><ChevronLeft size={16}/></button><button aria-label="Next report" disabled={items.length<2} onClick={()=>setIndex(value=>(value+1)%items.length)}><ChevronRight size={16}/></button></div></div>:<div className="report-feed-empty"><Radio size={20}/><div><strong>{historyEnabled?'No completed reports yet':'Optional history is off'}</strong><p>{historyEnabled?'Future completed scans can appear here.':'Enable history in storage settings to keep report summaries on this device.'}</p></div></div>}
 </section>;
}
