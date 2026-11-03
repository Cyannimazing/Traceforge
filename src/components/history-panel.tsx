'use client';
import {useEffect,useRef,useState} from 'react';
import {Check,ChevronDown,History,LoaderCircle,Pause} from 'lucide-react';
import type {InvestigationReport} from '@/lib/investigation-types';
import type {HistoryJob} from '@/lib/history-store';
import {createEvmHistoryCrawler,type EvmCrawlerView} from '@/lib/evm-history-crawler';
import {short} from '@/lib/analysis';
import './history-panel.css';

export default function HistoryPanel({report,disabled,onApply,onProgress,onSettled}:{report:InvestigationReport;disabled:boolean;onApply:(history:HistoryJob)=>void|Promise<void>;onProgress?:(state:string)=>void;onSettled?:(state:string)=>void}){
 const supported=!report.fixture&&(report.chain==='ethereum'||report.chain==='base');
 const [enabled,setEnabled]=useState(true),[open,setOpen]=useState(false),[view,setView]=useState<EvmCrawlerView>({job:null,busy:false,error:'',state:'idle'});
 const applyRef=useRef(onApply),progressRef=useRef(onProgress),settledRef=useRef(onSettled);applyRef.current=onApply;progressRef.current=onProgress;settledRef.current=onSettled;
 const crawlerRef=useRef<ReturnType<typeof createEvmHistoryCrawler>|null>(null),activeConfig=useRef({enabled,disabled});activeConfig.current={enabled,disabled};
 const url=`/api/history?chain=${report.chain}&token=${encodeURIComponent(report.token)}`;
 useEffect(()=>{setEnabled(true);setOpen(false);setView({job:null,busy:false,error:'',state:'idle'});},[url]);
 useEffect(()=>{
  if(!supported){progressRef.current?.('unsupported');settledRef.current?.('unsupported');return;}
  const crawler=createEvmHistoryCrawler({chain:report.chain as 'ethereum'|'base',token:report.token,
   onView:next=>{setView(next);progressRef.current?.(next.state);},onApply:history=>applyRef.current(history),onSettled:state=>settledRef.current?.(state),
   request:async(action,signal)=>{
    const response=await fetch(url,{method:action==='GET'?'GET':'POST',headers:action==='GET'?undefined:{'Content-Type':'application/json'},body:action==='GET'?undefined:JSON.stringify({action,expanded:true}),signal,cache:'no-store',keepalive:action==='pause'}),data=await response.json();
    if(!response.ok){const error=Object.assign(Error(data.error||'History request failed; saved checkpoints are preserved.'),{retryAt:response.status===429?Date.now()+60000:undefined});throw error;}
    return data;
   }});
  crawlerRef.current=crawler;const visibility=()=>crawler.setActive(activeConfig.current.enabled&&!activeConfig.current.disabled&&!document.hidden);visibility();document.addEventListener('visibilitychange',visibility);
  return()=>{document.removeEventListener('visibilitychange',visibility);crawler.dispose();if(crawlerRef.current===crawler)crawlerRef.current=null;};
 },[url,supported,report.chain,report.token]);
 useEffect(()=>{crawlerRef.current?.setActive(enabled&&!disabled&&!document.hidden);},[enabled,disabled]);
 const job=view.job,running=enabled&&!disabled&&(view.state==='running'||view.state==='waiting');
 const status=!supported?'Unavailable on this chain':view.state==='scope-complete'?'Configured pool scope checked':view.state==='blocked'?'Coverage incomplete':view.state==='waiting'?'Waiting for provider':!enabled?'Stopped - progress saved':view.busy?'Retrieving historical evidence':'Continuing saved checkpoints';
 return <section className="history-panel" aria-label="Historical pool investigation">
  <div className="history-heading"><History size={18}/><div><h2>Trace historical pool windows</h2><p>{supported?'Saved factory ranges and pool windows continue automatically. Verified evidence is added as it arrives.':report.fixture?'Example evidence only. Live Ethereum and Base scans support resumable pool verification.':'Continuous pool verification supports Ethereum and Base. This chain has no configured compatible adapter; it is not marked complete.'}</p></div><span className="history-status" role="status">{running?<LoaderCircle size={13} className="spin"/>:view.state==='scope-complete'?<Check size={13}/>:null}{status}</span></div>
  {supported&&<><div className="history-actions">
   {enabled&&view.state!=='scope-complete'&&view.state!=='blocked'&&<button className="secondary" disabled={disabled} onClick={()=>{crawlerRef.current?.setActive(false);setEnabled(false);settledRef.current?.('stopped');}}><Pause size={14}/> Stop pool history</button>}
   {job&&<button className="text-link history-expand" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{job.verifiedPools} / {job.totalPools} pool windows verified<ChevronDown size={14}/></button>}
  </div>
  {job&&<p className="history-message">{job.message}</p>}
  {job?.registry&&<p className="history-message">Factory discovery: {job.registry.discovered} candidates, {job.registry.completedRanges} saved ranges. {job.registry.status==='complete'?'Configured factory ranges exhausted at the saved anchor; other venues remain outside coverage.':'Remaining ranges continue automatically while this tab is visible.'}{job.registry.retryAt&&job.registry.retryAt>Date.now()?` Provider cooldown until ${new Date(job.registry.retryAt).toLocaleTimeString()}.`:''}</p>}
  {view.state==='blocked'&&<p className="history-message">A provider, unsupported pool or configured candidate limit prevented full verification. This is not a completed token history.</p>}
  {open&&job&&<div className="history-details"><p>{job.discoveryNote}</p><div className="history-table-scroll"><table><caption className="sr-only">Historical scan progress by pool</caption><thead><tr><th>Pool</th><th>Step</th><th>Verified ranges</th><th>Verified transactions</th><th>Result</th></tr></thead><tbody>{job.pools.map(pool=><tr key={pool.pool}><td><code title={pool.pool}>{short(pool.pool)}</code></td><td>{pool.phase.replaceAll('-',' ')}</td><td>{pool.completedRanges}</td><td>{pool.verifiedTransactions} / {pool.discoveredTransactions}</td><td><strong>{pool.status==='complete'?'Verified':pool.status==='blocked'?'Unavailable':pool.status==='running'?'Checking':pool.status==='queued'?'Waiting':'Saved'}</strong><small>{pool.message}</small></td></tr>)}</tbody></table></div></div>}
  <p className="history-scope">This worker verifies configured factory ranges and each selected pool's first minute. It does not retrieve every token transfer or establish the token's first-ever launch. Provider limits, unlisted venues and unsupported pools remain explicit.</p>
  </>}
  {view.error&&<p className="history-error" role="alert">{view.error}</p>}
 </section>;
}
