'use client';
import {useEffect,useRef,useState} from 'react';
import {History,LoaderCircle,Square} from 'lucide-react';
import {createSolanaHistoryCrawler,type HistoryCrawlerView} from '@/lib/solana-history-crawler';
import {createEvmArchiveTransport} from '@/lib/evm-archive-transport';
import type {Chain} from '@/lib/analysis';
import type {EvmTransferArchiveStatus} from '@/lib/evm-transfer-archive';
import './history-panel.css';

export default function EvmTransferHistoryPanel({chain,token,disabled,onRefresh,onProgress,onSettled}:{chain:Chain;token:string;disabled:boolean;onRefresh:()=>void|Promise<void>;onProgress?:(state:string,detail?:string)=>void;onSettled?:(state:string)=>void}){
 const normalized=token.toLowerCase(),supported=chain==='ethereum'||chain==='base';
 const [view,setView]=useState<HistoryCrawlerView>({progress:null,busy:false,error:''}),[stopped,setStopped]=useState(false),[visible,setVisible]=useState(true),[unsupported,setUnsupported]=useState('');
 const worker=useRef<ReturnType<typeof createSolanaHistoryCrawler>|null>(null),refreshRef=useRef(onRefresh),progressRef=useRef(onProgress),settledRef=useRef(onSettled);refreshRef.current=onRefresh;progressRef.current=onProgress;settledRef.current=onSettled;
 useEffect(()=>{const update=()=>setVisible(document.visibilityState==='visible');update();document.addEventListener('visibilitychange',update);return()=>document.removeEventListener('visibilitychange',update);},[]);
 useEffect(()=>{
  setView({progress:null,busy:false,error:''});setStopped(false);setUnsupported('');
  if(!supported){progressRef.current?.('unsupported');settledRef.current?.('unsupported');return;}
  const request=createEvmArchiveTransport({chain:chain as 'ethereum'|'base',token:normalized,onUnsupported:message=>{setUnsupported(message);crawler.setActive(false);progressRef.current?.('unsupported');settledRef.current?.('unsupported');}});
  const crawler=createSolanaHistoryCrawler({token:normalized,onView:next=>{setView(next);progressRef.current?.(next.progress?.status||'running',next.progress?`${next.progress.transactions.toLocaleString()} transactions saved across ${next.progress.pages.toLocaleString()} pages. ${next.progress.hasMore?'Retrieving the remaining history.':'Applying the final evidence.'}`:undefined);},onRefresh:()=>Promise.resolve(refreshRef.current()),onSettled:progress=>settledRef.current?.(progress.status),request});
  worker.current=crawler;return()=>{crawler.dispose();if(worker.current===crawler)worker.current=null;};
 },[chain,normalized,supported]);
 useEffect(()=>{worker.current?.setActive(supported&&!unsupported&&!stopped&&visible&&!disabled&&document.visibilityState==='visible');},[chain,normalized,supported,unsupported,stopped,visible,disabled]);
 const {busy,error}=view,progress=view.progress as EvmTransferArchiveStatus|null,done=progress?.status==='exhausted'&&!progress.hasMore;
 const state=!supported||unsupported?'No compatible archive configured':stopped?'Crawling stopped':done?'Provider pages exhausted at saved block':!visible?'Paused while tab is hidden':disabled?'Waiting for report refresh':progress?.status==='cooldown'?'Waiting for provider cooldown':busy?'Retrieving indexed transfers':'Continuing saved transfer pages';
 return <section className="history-panel" aria-label="Continuous ERC20 transfer history">
  <div className="history-heading"><div><h2><History size={17}/>ERC20 transfer history</h2><p>Checks the finalized head and follows saved provider cursors automatically. Successful pages survive reloads and server restarts.</p></div>
   {supported&&!unsupported&&!done&&!stopped&&<button type="button" className="secondary" onClick={()=>{worker.current?.setActive(false);setStopped(true);progressRef.current?.('stopped');settledRef.current?.('stopped');}}><Square size={12}/> Stop crawling</button>}
  </div>
  <div className="crawl-progress"><p className="crawl-state" role="status">{busy?<LoaderCircle size={14} className="spin"/>:<span className="crawl-state-dot"/>}{state}</p><dl className="crawl-metrics"><div><dt>Transactions indexed</dt><dd>{(progress?.transactions||0).toLocaleString()}</dd></div><div><dt>Transfers saved</dt><dd>{(progress?.transfers||0).toLocaleString()}</dd></div><div><dt>Pages saved</dt><dd>{(progress?.pages||0).toLocaleString()}</dd></div></dl></div>
  {(!supported||unsupported)&&<p className="history-message">{unsupported||'A compatible authorized ERC20 archive is not configured for this chain. This history is unsupported, not complete.'}</p>}
  {progress?.message&&<p className="history-message">{progress.message}</p>}
  {progress?.finalizedBlock!=null&&<p className="history-message">Finalized anchor: block {progress.finalizedBlock.toLocaleString()}.{progress.retryAt&&progress.retryAt>Date.now()?` Next attempt after ${new Date(progress.retryAt).toLocaleTimeString()}.`:''}</p>}
  <p className="history-scope">Indexed transfers are not receipt-verified buys, sells or sniper labels. Exhaustion applies to this ERC20 provider index at its saved block. Native funding, other providers and launch coverage remain separate scopes.</p>
  {error&&!unsupported&&<p className="history-error" role="alert">{error}</p>}
 </section>;
}
