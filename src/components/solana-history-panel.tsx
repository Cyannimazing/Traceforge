'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,History,LoaderCircle,Square} from 'lucide-react';
import {createSolanaHistoryCrawler,type HistoryCrawlerView} from '@/lib/solana-history-crawler';
import './history-panel.css';

export default function SolanaHistoryPanel({token,disabled,onRefresh,onProgress,onSettled}:{token:string;disabled:boolean;onRefresh:()=>void|Promise<void>;onProgress?:(state:string,detail?:string)=>void;onSettled?:(state:string)=>void}){
 const [view,setView]=useState<HistoryCrawlerView>({progress:null,busy:false,error:''}),[paused,setPaused]=useState(false),[visible,setVisible]=useState(true);
 const worker=useRef<ReturnType<typeof createSolanaHistoryCrawler>|null>(null),refresh=useRef(onRefresh),progressRef=useRef(onProgress),settledRef=useRef(onSettled);
 refresh.current=onRefresh;progressRef.current=onProgress;settledRef.current=onSettled;
 useEffect(()=>{const update=()=>setVisible(document.visibilityState==='visible');update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{
  setView({progress:null,busy:false,error:''});setPaused(false);
  const url=`/api/history/solana?token=${encodeURIComponent(token)}`;
  const crawler=createSolanaHistoryCrawler({token,onView:next=>{setView(next);progressRef.current?.(next.progress?.status||'running',next.progress?`${next.progress.transactions.toLocaleString()} transactions saved across ${next.progress.pages.toLocaleString()} pages. ${next.progress.hasMore?'Retrieving the remaining history.':'Applying the final evidence.'}`:undefined);},onRefresh:()=>refresh.current(),onSettled:progress=>settledRef.current?.(progress.status),request:async(method,signal)=>{
   const response=await fetch(url,{method,signal,cache:'no-store'});
   if(!response.ok){
    const message=response.status===429?'Provider cooldown. Saved progress will resume automatically.':'History is temporarily unavailable. Saved progress will retry automatically.';
    const failure=new Error(message) as Error&{retryAt?:number};
    const retry=response.headers.get('Retry-After'),seconds=retry===null?NaN:Number(retry),date=retry?Date.parse(retry):NaN;
    if(Number.isFinite(seconds))failure.retryAt=Date.now()+Math.max(1000,seconds*1000);else if(Number.isFinite(date))failure.retryAt=date;
    throw failure;
   }
   const data=await response.json();
   if(!data||typeof data!=='object'||!('progress' in data))throw Error('History status could not be read. Saved progress will retry automatically.');
   return data.progress||null;
  }});
  worker.current=crawler;
  return()=>{crawler.dispose();if(worker.current===crawler)worker.current=null;};
 },[token]);
 useEffect(()=>{worker.current?.setActive(!paused&&visible&&!disabled&&document.visibilityState==='visible');},[token,paused,visible,disabled]);
 const {progress,busy,error}=view,exhausted=progress?.status==='exhausted',capped=progress?.status==='capped',terminal=!!progress&&(!progress.hasMore||exhausted||capped);
 const state=exhausted?'Provider index complete':capped?'Storage limit - history incomplete':progress?.status==='unsupported'?'Historical provider unavailable - incomplete':terminal?'Crawl stopped - history incomplete':paused?'Crawling stopped':!visible?'Paused while tab is hidden':disabled?'Waiting for report refresh':progress?.status==='cooldown'?'Waiting for provider cooldown':busy?'Retrieving and saving history':'Continuing saved history';
 return <section className="history-panel solana-crawl" aria-label="Continuous Solana history">
  <div className="history-heading"><div><h2><History size={17}/>Transaction history</h2><p>Automatically follows saved pages to the end of the provider index. You can leave this tab open while it works.</p></div>
   {!terminal&&<button type="button" className="secondary" onClick={()=>{if(!paused){worker.current?.setActive(false);settledRef.current?.('stopped');}setPaused(value=>!value);}}>{paused?<ArrowRight size={14}/>:<Square size={12}/>} {paused?'Resume crawling':'Stop crawling'}</button>}
  </div>
  <div className="crawl-progress"><p className="crawl-state" role="status">{busy?<LoaderCircle size={14} className="spin"/>:<span className="crawl-state-dot"/>}{state}</p>
   <dl className="crawl-metrics"><div><dt>Transactions saved</dt><dd>{(progress?.transactions||0).toLocaleString()}</dd></div><div><dt>Pages saved</dt><dd>{(progress?.pages||0).toLocaleString()}</dd></div><div><dt>Trades decoded</dt><dd>{(progress?.trades||0).toLocaleString()}</dd></div></dl>
  </div>
  {progress?.message&&<p className="history-message">{progress.message}</p>}
  {progress?.status==='cooldown'&&progress.retryAt&&<p className="history-message">Next attempt after {new Date(progress.retryAt).toLocaleTimeString()}. The saved cursor is preserved.</p>}
  <p className="history-scope">Completion means the provider returned no further mint-address pages at this retrieval. Other addresses, unsupported programs and token-wide launch coverage remain separate. Reports refresh periodically as pages arrive.</p>
  {error&&<p className="history-error" role="alert">{error}</p>}
 </section>;
}
