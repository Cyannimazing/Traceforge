"use client";
import EngineConsole from './engine-console';
import ReportOverview from './report-overview';
import ReportHeader from './report-header';
import {MethodologyPage} from './methodology-page';
import DiscoveryRadar, {type DiscoveryProfile, type DiscoveryMeta} from './discovery-radar';
import AmbientConsole from './ambient-console';
import ReportFeed from './report-feed';
import {rememberReport} from '../lib/report-feed';
import {parseTokenPath,tokenReportPath,tokenRouteTarget,parseWorkspacePath,workspacePath,type WorkspaceView,type TokenRouteTarget} from '../lib/token-route';
import { gsap } from 'gsap';
import {createPortal} from 'react-dom';
import HolderWorkspace from './holder-workspace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, BookOpen, Check, Copy, Download, ExternalLink, Globe2, Link2, LoaderCircle, RefreshCw, ScanLine, Search, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { CHAINS, short, validateToken, sameToken, formatMoney, type Chain } from '@/lib/analysis';
import { mergeReportRefresh } from '@/lib/report-refresh';
import {holderScope} from '@/lib/holder-scope';
import type {MapShareBasis} from '@/lib/holder-map-basis';
import {searchRequestUrl} from '@/lib/search-coordinator';
import { getDisplayAssessment } from '@/lib/verdict-summary';
import type { InvestigationReport, ScanEvent } from '@/lib/investigation-types';
import { ForgeMark } from './brand';
import ChainPicker from './chain-picker';
import { EvidencePanel, count, label, type Selection } from './investigation-panels';
import './console.css';
import './radar-workspace.css';
import './evidence-modal.css';

type Saved={chain:Chain;token:string;name:string;symbol:string};
type Profile=DiscoveryProfile;
type Stage=Extract<ScanEvent,{type:'stage'}>;
const WETH='0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export default function Workbench({initialTarget,initialView='scanner'}:{initialTarget?:TokenRouteTarget;initialView?:WorkspaceView}){
 const [menuOpen,setMenuOpen]=useState(false);
 const [shareBasis,setShareBasis]=useState<MapShareBasis>('float');
 const [autoChain,setAutoChain]=useState(!initialTarget);
 const [discoveryMeta,setDiscoveryMeta]=useState<DiscoveryMeta>({});
 const discoveryRequest=useRef(0),discoveryAbort=useRef<AbortController|null>(null);
 const [editToken,setEditToken]=useState(true),[chain,setChain]=useState<Chain>(initialTarget?.chain||'ethereum'),[token,setToken]=useState(initialTarget?.token||''),[report,setReport]=useState<InvestigationReport|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[view,setView]=useState<WorkspaceView>(initialView),[saved,setSaved]=useState<Saved[]>([]),[profiles,setProfiles]=useState<Profile[]>([]),[profilesLoading,setProfilesLoading]=useState(true),[profileError,setProfileError]=useState(''),[selection,setSelection]=useState<Selection|null>(null),[stages,setStages]=useState<Stage[]>([]),[visible,setVisible]=useState(true),[reduced,setReduced]=useState(false),[refreshing,setRefreshing]=useState(''),[evidenceOpen,setEvidenceOpen]=useState(false);
 const reportVisible=!!report&&!loading,scanBusy=loading;
 const evidenceReturnFocus=useRef<HTMLElement|SVGElement|null>(null);
 const openEvidence=useCallback(()=>{if(!evidenceOpen)evidenceReturnFocus.current=document.activeElement as HTMLElement|SVGElement;setEvidenceOpen(true);},[evidenceOpen]);
 const closeEvidence=useCallback(()=>{setEvidenceOpen(false);setSelection(null);requestAnimationFrame(()=>{const target=evidenceReturnFocus.current; if(target?.isConnected&&target.getClientRects().length)target.focus();else document.querySelector<HTMLButtonElement>('.ro-inspect')?.focus();});},[]);
 useEffect(()=>{if(evidenceOpen)document.querySelector<HTMLButtonElement>('[aria-label="Close evidence panel"]')?.focus();},[evidenceOpen,selection?.id]);
 useEffect(()=>{
  if(!evidenceOpen)return;
  const dialog=document.querySelector<HTMLElement>('.evidence-overlay');if(!dialog)return;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const surrounding=Array.from(document.querySelectorAll<HTMLElement>('.workspace>.topbar, .console-shell main>*')).filter(element=>element!==dialog&&!element.contains(dialog));
  const previous=surrounding.map(element=>[element,element.inert] as const);surrounding.forEach(element=>{element.inert=true;});
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const items=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"],summary')).filter(element=>element.getClientRects().length>0);if(!items.length){event.preventDefault();return;}const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',trap);return()=>{document.body.style.overflow=overflow;previous.forEach(([element,inert])=>{element.inert=inert;});document.removeEventListener('keydown',trap);};
 },[evidenceOpen]);
 const [scanRun,setScanRun]=useState(0);
 const reportFocus=useRef<'heading'|'refresh'|null>(null);
 const lastScan=useRef<{chain:Chain;token:string;fresh:boolean;navigation:'push'|'none';detectNetwork:boolean}|null>(null);
 const input=useRef<HTMLInputElement>(null),abort=useRef<AbortController|null>(null),requestId=useRef(0),reportRef=useRef(report),loadingRef=useRef(false),completedReport=useRef<InvestigationReport|null>(null);
 reportRef.current=report;loadingRef.current=loading;
 useEffect(()=>{if(report&&!report.fixture&&!loading)completedReport.current=report;},[report,loading]);
 useEffect(()=>{try{const data=JSON.parse(localStorage.getItem('traceforge.watchlist.v1')||'[]');if(Array.isArray(data))setSaved(data.filter(x=>x&&typeof x.token==='string'&&typeof x.chain==='string'&&!validateToken(x.chain,x.token)&&typeof x.name==='string'&&typeof x.symbol==='string'));}catch{setNotice('Saved preferences could not be read.');}const media=matchMedia('(prefers-reduced-motion: reduce)');setReduced(media.matches);const change=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden);media.addEventListener('change',change);document.addEventListener('visibilitychange',visibility);visibility();return()=>{media.removeEventListener('change',change);document.removeEventListener('visibilitychange',visibility);abort.current?.abort();};},[]);
 const discover=useCallback(async()=>{discoveryAbort.current?.abort();const controller=new AbortController();discoveryAbort.current=controller;const generation=++discoveryRequest.current;setProfilesLoading(true);try{const response=await fetch('/api/discover',{signal:controller.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw new Error(data.error||'Discovery is temporarily unavailable.');if(generation!==discoveryRequest.current)return;setProfiles(Array.isArray(data.tokens)?data.tokens:[]);setDiscoveryMeta(data);setProfileError(data.cache?.status==='stale'?'The source could not refresh. Showing its last available snapshot.':'');}catch(e){if(generation===discoveryRequest.current&&e instanceof Error&&e.name!=='AbortError')setProfileError(e.message);}finally{if(generation===discoveryRequest.current)setProfilesLoading(false);}},[]);
 useEffect(()=>{if(!visible||view!=='discover')return;void discover();const timer=setInterval(()=>void discover(),30000);return()=>{clearInterval(timer);discoveryAbort.current?.abort();++discoveryRequest.current;};},[discover,visible,view]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();setEvidenceOpen(false);setSelection(null);setMenuOpen(false);showView('scanner',true,false);setTimeout(()=>input.current?.focus(),0);}if(e.key==='Escape'){if(evidenceOpen)closeEvidence();if(menuOpen){setMenuOpen(false);document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();}}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[evidenceOpen,closeEvidence,menuOpen,scanBusy]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(timer);},[notice]);
 useEffect(()=>{if(!report||report.fixture||!visible||view!=='scanner')return;const current={chain:report.chain,token:report.token,expanded:!report.providerAnalysis&&report.investigation.coverage.holderLimit>100};const controllers=new Set<AbortController>();let alive=true;
  const refresh=async(mode:'market'|'holders')=>{if(loadingRef.current||document.hidden)return;const controller=new AbortController(),generation=requestId.current;controllers.add(controller);setRefreshing(mode);try{const response=await fetch(`/api/scan?chain=${current.chain}&token=${encodeURIComponent(current.token)}&mode=${mode}${current.expanded?'&expanded=1':''}`,{signal:controller.signal});if(!response.ok)throw new Error('Refresh unavailable');const next:InvestigationReport=await response.json();if(alive&&generation===requestId.current)setReport(previous=>!previous||previous.fixture||previous.chain!==current.chain||!sameToken(previous.chain,previous.token,current.token)?previous:mergeReportRefresh(previous,next,mode));}catch(e){if(alive&&e instanceof Error&&e.name!=='AbortError')setNotice('Live refresh unavailable. Your last completed report is preserved.');}finally{controllers.delete(controller);if(alive)setRefreshing('');}};
  const market=setInterval(()=>void refresh('market'),60000),holders=setInterval(()=>void refresh('holders'),300000);return()=>{alive=false;clearInterval(market);clearInterval(holders);controllers.forEach(c=>c.abort());};
 },[report?.chain,report?.token,report?.fixture,report?.investigation.coverage.holderLimit,report?.providerAnalysis?.provider,visible,view]);
 async function scan(nextChain=chain,nextToken=token,fresh=false,navigation:'push'|'none'='push',detectNetwork=false){
  lastScan.current={chain:nextChain,token:nextToken,fresh,navigation,detectNetwork};
  let chosenChain=nextChain,address=nextToken.trim();
  const validation=detectNetwork?(validateToken('ethereum',address)&&validateToken('solana',address)?'Enter a valid token contract address.':null):validateToken(chosenChain,address);
  if(validation){setEditToken(true);setError(validation);requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));return;}
  const hadVisibleReport=!!reportRef.current&&!loadingRef.current;
  abort.current?.abort();const controller=new AbortController();abort.current=controller;const id=++requestId.current;
  reportFocus.current=null;setScanRun(id);setToken(address);setView('scanner');setLoading(true);setError('');setStages([]);setSelection(null);setEvidenceOpen(false);
  if(hadVisibleReport)requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));
  try{
   if(detectNetwork){
    setStages([{type:'stage',stage:'resolve',status:'running',detail:'Identifying the network from the address and available public market records.'}]);
    const resolution=await fetch('/api/resolve?token='+encodeURIComponent(address),{signal:controller.signal,cache:'no-store'}),resolved=await resolution.json();
    if(id!==requestId.current)return;
    if(!resolution.ok)throw new Error(resolved.error||'Network detection is unavailable. Select a network and retry.');
    if(typeof resolved.chain!=='string'||!Object.hasOwn(CHAINS,resolved.chain)||typeof resolved.token!=='string'||validateToken(resolved.chain,resolved.token))throw new Error('Network detection returned an invalid result. Select a network and retry.');
    chosenChain=resolved.chain;address=resolved.token;
    setStages([{type:'stage',stage:'resolve',status:'complete',detail:resolved.notice||('Selected '+CHAINS[chosenChain].name+' using '+String(resolved.method).replaceAll('-',' ')+'.')}]);
    if(resolved.notice)setNotice(resolved.notice);
   }
   const target=tokenRouteTarget(chosenChain,address)!;address=target.token;setChain(chosenChain);setToken(address);
   const path=tokenReportPath(chosenChain,address)!;if(navigation==='push'&&window.location.pathname!==path)window.history.pushState(null,'',path);
   if(reportRef.current&&(reportRef.current.chain!==chosenChain||!sameToken(chosenChain,reportRef.current.token,address)||reportRef.current.fixture)){setReport(null);reportRef.current=null;}
   const response=await fetch(searchRequestUrl(chosenChain,address,fresh),{signal:controller.signal});if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||('Scan could not start ('+response.status+').'));}if(!response.body)throw new Error('Streaming is unavailable. Retry the scan.');
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',received=false;
   const process=(block:string)=>{const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');if(!data)return;const event=JSON.parse(data) as ScanEvent;if(id!==requestId.current)return;if(event.type==='stage')setStages(previous=>[...previous.filter(s=>s.stage!==event.stage),event]);else if(event.type==='error')throw new Error(event.message);else if(event.type==='report'){received=true;reportFocus.current='heading';setEvidenceOpen(false);setSelection(null);setReport(event.report);setEditToken(false);completedReport.current=event.report;rememberReport(event.report);requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));}};
   while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replaceAll('\r','');let boundary=buffer.indexOf('\n\n');while(boundary>=0){process(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);boundary=buffer.indexOf('\n\n');}}if(buffer.trim())process(buffer);if(!received)throw new Error('The scan ended before a report was returned. Please retry.');
  }catch(e){controller.abort();if(id===requestId.current&&e instanceof Error&&e.name!=='AbortError'){setError(e.message);const earlier=completedReport.current,retained=earlier&&earlier.chain===chosenChain&&sameToken(chosenChain,earlier.token,address)?earlier:null;reportFocus.current=retained?'refresh':null;setReport(retained);if(detectNetwork)setEditToken(true);}}
  finally{if(id===requestId.current)setLoading(false);}
 }

 function retryScan(){const last=lastScan.current;return last?scan(last.chain,last.token,last.fresh,last.navigation,last.detectNetwork):scan();}
 async function example(initialSelection:Selection|null=null){if(window.location.pathname!=='/')window.history.pushState(null,'','/');abort.current?.abort();const id=++requestId.current;setLoading(false);setError('');setStages([]);try{const {fixtureReport}=await import('@/lib/investigation-fixture');if(id!==requestId.current)return;setReport(fixtureReport);setEditToken(false);requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));setChain(fixtureReport.chain);setToken(fixtureReport.token);setSelection(initialSelection);setEvidenceOpen(!!initialSelection);setView('scanner');}catch{if(id===requestId.current)setError('The example could not load. Try a live scan.');}}
 function goHome(navigate=true,focusPage=true){

  abort.current?.abort();++requestId.current;loadingRef.current=false;reportRef.current=null;
  setLoading(false);setReport(null);setToken('');setError('');setStages([]);setSelection(null);setEvidenceOpen(false);setMenuOpen(false);setEditToken(true);setView('scanner');setRefreshing('');
  if(navigate&&window.location.pathname!=='/')window.history.pushState(null,'','/');
  requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'instant'});if(focusPage)document.querySelector<HTMLElement>('main')?.focus({preventScroll:true});});
 }
 function showView(next:WorkspaceView,navigate=true,focusPage=true){
  if(next==='scanner'){goHome(navigate,focusPage);return;}
  abort.current?.abort();++requestId.current;loadingRef.current=false;
  setLoading(false);setRefreshing('');setView(next);setMenuOpen(false);setSelection(null);setEvidenceOpen(false);
  const path=workspacePath(next);if(navigate&&window.location.pathname!==path)window.history.pushState(null,'',path);
  requestAnimationFrame(()=>{window.scrollTo({top:0,behavior:'instant'});if(focusPage)document.querySelector<HTMLElement>('main')?.focus({preventScroll:true});});
 }
 const routeActions=useRef({scan,goHome,showView});routeActions.current={scan,goHome,showView};
 useEffect(()=>{
  const followLocation=()=>{const target=parseTokenPath(window.location.pathname);if(target)void routeActions.current.scan(target.chain,target.token,false,'none');else {const next=parseWorkspacePath(window.location.pathname);if(next)routeActions.current.showView(next,false);}};
  // Delay the initial read so Strict Mode cleanup does not launch a duplicate scan.
  const initial=setTimeout(()=>{if(parseTokenPath(window.location.pathname))followLocation();},0);
  window.addEventListener('popstate',followLocation);
  return()=>{clearTimeout(initial);window.removeEventListener('popstate',followLocation);};
 },[]);
 async function copyReportLink(){if(!report||report.fixture)return;const path=tokenReportPath(report.chain,report.token);if(!path)return;try{await navigator.clipboard.writeText(new URL(path,window.location.origin).href);setNotice('Report link copied. Opening it retrieves the latest available report.');}catch{setNotice('Clipboard unavailable. Copy the report URL from your address bar.');}}
 function persist(next:Saved[]){try{localStorage.setItem('traceforge.watchlist.v1',JSON.stringify(next));setSaved(next);setNotice('Watchlist updated on this device.');}catch{setNotice('Browser storage is unavailable. Your watchlist was not saved.');}}
 const watched=!!report&&saved.some(x=>x.chain===report.chain&&sameToken(report.chain,x.token,report.token));
 function toggleWatch(){if(!report||report.fixture)return;persist(watched?saved.filter(x=>!(x.chain===report.chain&&sameToken(report.chain,x.token,report.token))):[...saved,{chain:report.chain,token:report.token,name:report.name,symbol:report.symbol}]);}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);setNotice('Address copied.');}catch{setNotice('Clipboard unavailable. Select the address to copy it.');}}
 function download(){if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`traceforge-${report.fixture?'example-':''}${report.chain}-${report.token}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 const select=useCallback((value:Selection)=>{if(!evidenceOpen)evidenceReturnFocus.current=document.activeElement as HTMLElement|SVGElement;setSelection(value);setEvidenceOpen(true);},[evidenceOpen]);
 useEffect(()=>{
  const titles:Record<WorkspaceView,string>={scanner:'TraceForge Engine - Token investigation',discover:'Discovery - TraceForge Engine',watchlist:'Watchlist - TraceForge Engine',methodology:'Methodology - TraceForge Engine'};
  document.title=view==='scanner'&&report?`${report.symbol.slice(0,40)} - TraceForge report`:titles[view];
 },[view,report?.symbol,report?.token]);
 const paused=reduced||!visible;
 const assessment=report?getDisplayAssessment(report):null;
 useEffect(()=>{if(!reportVisible||!reportFocus.current)return;const target=reportFocus.current==='refresh'?'.rh-refresh':'.rh-name h1';reportFocus.current=null;requestAnimationFrame(()=>document.querySelector<HTMLElement>(target)?.focus({preventScroll:true}));},[reportVisible,scanRun]);
 useEffect(()=>{if(loading&&view==='scanner'){document.querySelector<HTMLButtonElement>('.source-scan-controls button')?.focus({preventScroll:true});}},[loading,view]);
 useEffect(()=>{if(!evidenceOpen||paused)return;const context=gsap.context(()=>{const mobile=matchMedia('(max-width:760px)').matches;gsap.fromTo('.evidence-scrim',{opacity:0},{opacity:1,duration:.25,ease:'power2.out',clearProps:'opacity'});gsap.fromTo('.evidence-overlay',{x:mobile?0:44,y:mobile?36:0,opacity:.65},{x:0,y:0,opacity:1,duration:.42,ease:'expo.out',clearProps:'transform,opacity'});});return()=>context.revert();},[evidenceOpen,paused]);
 useEffect(()=>{if(paused)return;const main=document.querySelector('.console-shell main');if(!main)return;const targets=Array.from(main.children).filter(element=>element.matches('.console-intro,.token-context,.report-overview,.discovery-radar,.utility-view,.methodology-view'));if(!targets.length)return;const context=gsap.context(()=>{gsap.fromTo(targets,{y:view==='discover'?0:12,opacity:.65},{y:0,opacity:1,duration:.55,stagger:.06,ease:'power3.out',clearProps:'transform,opacity'});});return()=>context.revert();},[view,report?.token,paused]);

 function cancelScan(){abort.current?.abort();++requestId.current;setLoading(false);const earlier=completedReport.current;const retained=earlier&&earlier.chain===chain&&sameToken(chain,earlier.token,token)?earlier:null;reportFocus.current=retained?'refresh':null;setReport(retained);setNotice(retained?'Scan canceled. The last completed report is preserved.':'Scan canceled.');if(!retained)setTimeout(()=>input.current?.focus({preventScroll:true}),0);}
 const scanEntry=<div className={report?'report-token-entry':'token-entry'}>
  <form className={`scan-bar ${report?'':'token-launcher'}`} data-collapsed={!!report&&!editToken} onSubmit={e=>{e.preventDefault();void scan(chain,token,false,'push',autoChain);}}>
   <label htmlFor="token" className={report?'sr-only':'token-entry-label'}>Contract address</label>
   <input ref={input} id="token" placeholder={autoChain?'Paste a token contract address':chain==='solana'?'Paste a Solana token address':'Paste a token contract - 0x...'} value={token} onChange={e=>{setToken(e.target.value);if(error)setError('');}} spellCheck={false} autoComplete="off" aria-invalid={!!error} aria-describedby={error&&!report?'token-error':undefined}/>
   <div className="token-entry-actions"><ChainPicker value={autoChain?'auto':chain} onChange={value=>{setAutoChain(value==='auto');if(value!=='auto')setChain(value);}}/><button className="primary" disabled={loading} type="submit">{loading?<LoaderCircle size={17} className="spin"/>:<ArrowUpRight size={18}/>}<span>{loading?'Tracing':'Trace token'}</span></button></div>
  </form>
  <div className="scan-options" data-collapsed={!!report&&!editToken}>
   <span className="token-entry-note">Independent evidence scan</span>
   <button className="text-link" onClick={()=>void scan('ethereum',WETH)}>Try WETH<ArrowUpRight size={13}/></button>
  </div>
  {!report&&error&&<p className="token-entry-error" id="token-error" role="alert"><TriangleAlert size={15}/>{error}</p>}
  {!report&&<p className="token-entry-note">Public blockchain data. No wallet connection.</p>}
 </div>;

 return <div className={`app-shell console-shell ${view==='scanner'?'studio-workspace':''} ${reportVisible&&view==='scanner'?'studio-active':''}`} data-motion={paused?'off':'on'}><div className="workspace"><div className="workspace-atmosphere"><AmbientConsole paused={paused}/></div><header className="topbar"><div className="topbar-inner"><button className="wordmark" onClick={()=>goHome()} aria-label="TraceForge home"><ForgeMark size={29}/><strong>TRACEFORGE</strong></button><nav className={`console-nav ${menuOpen?'is-open':''}`} aria-label="Main navigation">{([{id:'scanner',label:'Scan'},{id:'discover',label:'Discover'},{id:'watchlist',label:'Watchlist'},{id:'methodology',label:'Methodology'}] as const).map(item=><a key={item.id} href={workspacePath(item.id)} aria-current={view===item.id?'page':undefined} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();showView(item.id);}}>{item.label}{item.id==='watchlist'&&<span>{saved.length}</span>}</a>)}</nav><div className="top-right"><span className="connection"><span className="status-dot"/>READ-ONLY</span><button className="command-key" aria-label="Focus token search" onClick={()=>{showView('scanner',true,false);setTimeout(()=>input.current?.focus(),0);}}><kbd>Ctrl K</kbd></button><button className="mobile-menu" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={()=>setMenuOpen(!menuOpen)}>{menuOpen?<X size={18}/>:<span>Menu</span>}</button></div></div></header><main tabIndex={-1} className={reportVisible&&view==='scanner'?'has-report':view==='scanner'?'is-home':''}>
 {view==='scanner'?<>
  {reportVisible&&report?<><ReportHeader report={report} refreshing={refreshing} watched={watched} editToken={editToken} search={scanEntry} onHome={()=>goHome()} onChangeToken={()=>{setEditToken(previous=>!previous);requestAnimationFrame(()=>input.current?.focus({preventScroll:true}));}} onWatch={toggleWatch} onCopyAddress={()=>void copy(report.token)} onCopyLink={()=>void copyReportLink()} onDownload={download} onRefresh={()=>void scan(report.chain,report.token,true)}/>
  {error&&<div className="error-strip" role="alert"><TriangleAlert size={17}/><span>{error} Your last completed report is still visible.</span><button className="text-link" onClick={()=>void retryScan()}>Retry</button><button aria-label="Dismiss error" onClick={()=>setError('')}><X size={15}/></button></div>}
  <ReportOverview shareBasis={shareBasis} onShareBasisChange={setShareBasis} key={`overview:${report.chain}:${report.token}:${!!report.fixture}`} selection={selection} report={report} paused={paused} onSelect={select} onInspect={()=>{setSelection(null);openEvidence();}}/>
 <HolderWorkspace shareBasis={shareBasis} onShareBasisChange={setShareBasis} key={`${report.chain}:${report.token}:${!!report.fixture}`} report={report} selection={selection} onSelect={select} loading={loading} paused={paused}/>
 <ReportFeed paused={paused} onScan={(c,t)=>void scan(c,t)}/>
 {evidenceOpen&&createPortal(<div className="evidence-modal"><button type="button" className="evidence-scrim" tabIndex={-1} aria-hidden="true" onClick={closeEvidence}/><div className="evidence-overlay" role="dialog" aria-modal="true" aria-label="Investigation evidence panel"><EvidencePanel report={report} selection={selection} onSelect={select} onClose={closeEvidence} copy={value=>void copy(value)}/></div></div>,document.body)}
 </>:<><EngineConsole runId={scanRun} entry={scanEntry} onCancel={cancelScan} report={null} stages={stages} loading={scanBusy} paused={paused} onExample={()=>void example()} onInspect={()=>showView('methodology')}/></>}
 </>:view==='watchlist'?<section className="utility-view"><div className="page-heading"><div><h1>Your investigation watchlist.</h1><p>Stored on this device. Open a token to fetch fresh public evidence.</p></div><Bookmark size={23}/></div>{saved.length?saved.map(s=><div className="watch-row" key={`${s.chain}-${s.token}`}><span className="saved-symbol">{s.symbol.slice(0,3)}</span><div><h2>{s.name}<span>{s.symbol}</span></h2><p>{CHAINS[s.chain].name} - {short(s.token)}</p></div><button className="secondary" onClick={()=>void scan(s.chain,s.token)}>Investigate<ArrowUpRight size={14}/></button><button className="icon-button" aria-label={`Remove ${s.name} from watchlist`} onClick={()=>persist(saved.filter(x=>x!==s))}><X size={16}/></button></div>):<div className="utility-empty"><Bookmark size={31}/><h2>Keep a token in your sights.</h2><p>Investigate a token, then select Watch to save it here.</p><button className="primary" onClick={()=>{showView('scanner',true,false);setTimeout(()=>input.current?.focus(),0);}}>Start an investigation<ArrowRight size={15}/></button></div>}</section>:view==='discover'?<DiscoveryRadar profiles={profiles} loading={profilesLoading} error={profileError} meta={discoveryMeta} paused={paused} onRefresh={()=>void discover()} onScan={(c,t)=>void scan(c,t)}/>:<MethodologyPage paused={paused}/>}
 {(view!=='scanner'||reportVisible)&&<footer><span><ForgeMark size={20}/>TraceForge Engine</span><span>Public evidence. Explicit limits.</span><button onClick={()=>showView('methodology')}>Methodology<ArrowUpRight size={12}/></button></footer>}</main></div>{notice&&<div className="toast" role="status">{notice}</div>}</div>;
}
