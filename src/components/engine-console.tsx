"use client";
import {useEffect,useId,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ArrowUpRight,Check,LoaderCircle,X} from 'lucide-react';
import {gsap} from 'gsap';
import type {InvestigationReport,ScanEvent} from '../lib/investigation-types';
import './engine-console.css';
import SourceStrip from './source-strip';

type StageEvent=Extract<ScanEvent,{type:'stage'}>;
export type EngineConsoleProps={report:InvestigationReport|null;stages:StageEvent[];loading:boolean;paused:boolean;onExample:()=>void;onInspect:()=>void;compact?:boolean;entry?:ReactNode;onCancel?:()=>void};
type NodeKey='market'|'holders'|'funding'|'trades'|'contract'|'assessment';
type NodeDefinition={key:NodeKey;title:string;description:string;matches:(name:string)=>boolean};
const NODES:NodeDefinition[]=[
 {key:'market',title:'Market',description:'Price, liquidity and trading activity from the returned market snapshot. One pool does not describe every trading venue.',matches:name=>name==='public-data'||name==='market-context'},
 {key:'holders',title:'Holders',description:'Holder balances, supply shares and wallet roles, with snapshot times and source records.',matches:name=>name==='Holders'||name==='solana-snapshot'||name==='public-history'},
 {key:'funding',title:'Funding',description:'Available funding and transfer relationships. Shared funding does not establish common ownership.',matches:name=>name.startsWith('Funding batch')||name==='public-history'},
 {key:'trades',title:'Trades',description:'Timestamped entries, buys and sells from the available sources. First observed activity is not automatically token launch.',matches:name=>['Earliest buys','Recent trades','Trading start','public-history','pool-first-minute','rpc-history','history'].includes(name)},
 {key:'contract',title:'Contract',description:'Reported contract findings, creator and current authority. Missing checks stay unassessed.',matches:name=>name==='public-data'||name==='solana-snapshot'},
 {key:'assessment',title:'Verdict',description:'The findings behind the verdict: contract controls, holder concentration and wallet connections.',matches:name=>name==='assessment'},
];
const PURPOSE:Record<NodeKey,string>={market:'Liquidity and trading activity',holders:'Who holds the supply',funding:'Where wallets got funds',trades:'Early buys and sell patterns',contract:'Creator and control checks',assessment:'What the evidence means'};
const stageTitle=(stage:string)=>(({
 'provider-report':'Reading provider analysis','clock-check':'Checking source timestamps','public-data':'Reading market and contract data',
 'public-history':'Tracing public wallet history','history':'Loading indexed history','market-context':'Refreshing market data',
 'pool-first-minute':'Verifying first-minute trades','assessment':'Building the verdict','solana-snapshot':'Verifying token accounts',
 'independent-scan':'Independent sources selected','cache':'Loading a previous investigation',
 } as Record<string,string>)[stage]||stage.replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase()));
const numeric=(value:number)=>value.toLocaleString('en-US');
const coordinate=(value:number)=>Number(value.toFixed(3));
function observed(key:NodeKey,report:InvestigationReport){const inv=report.investigation;switch(key){
 case 'market':return report.market?'Snapshot received':'Unavailable';
 case 'holders':return `${numeric(inv.wallets.filter(wallet=>wallet.share!==null||wallet.balance!==undefined).length)} balance records`;
 case 'funding':return `${numeric(inv.relationships.length)} reported links`;
 case 'trades':return `${numeric(inv.timeline.length)} event records`;
 case 'contract':return `${report.checks.filter(check=>check.status!=='unknown').length} / ${report.checks.length} checks assessed`;
 case 'assessment':return {critical:'Danger',caution:'Caution',insufficient:'Caution - limited evidence',clear:'No red flags in scope'}[inv.assessment.status];
}}
function nodeState(node:NodeDefinition,stages:StageEvent[],loading:boolean,report:InvestigationReport|null){
 const matching=stages.filter(event=>node.matches(event.stage)),latest=new Map<string,StageEvent>();for(const event of matching)latest.set(event.stage,event);
 const running=[...latest.values()].find(event=>event.status==='running');
 if(running)return {state:loading?'running':'stopped',label:loading?'Reading source':'Interrupted',detail:running.detail};
 const last=matching.at(-1);if(last)return {state:last.status==='unavailable'?'unavailable':'received',label:last.status==='unavailable'?'Unavailable':'Response received',detail:last.detail};
 if(report)return {state:'received',label:'Report received',detail:''};
 const provider=stages.findLast(event=>event.stage==='provider-report');
 if(loading&&provider?.status==='running')return {state:'waiting',label:'Awaiting provider report',detail:'The provider request is in progress. This individual section has not been received.'};
 if(loading&&provider?.status==='complete')return {state:'waiting',label:'Awaiting assembled report',detail:'The provider responded. This section will appear with the assembled report.'};
 return {state:'idle',label:'Not started',detail:''};
}
function TracePaths({highlight,running}:{highlight:NodeKey;running:NodeKey[]}){return <svg className="source-traces" viewBox="0 0 1200 450" preserveAspectRatio="none" aria-hidden="true">{NODES.map((node,index)=>{const left=index<3,y=85+(index%3)*140,start=left?205:995,end=left?425:775;const path=`M${start} ${y}C${left?320:880} ${y} ${left?325:875} 225 ${end} 225`;return <g key={node.key} data-highlight={highlight===node.key} data-running={running.includes(node.key)} style={{'--trace-delay':`${index*-.8}s`} as CSSProperties}><path d={path} className="source-trace-base"/><path d={path} className="source-trace-packet" pathLength="100"/><circle cx={start} cy={y} r="2" className="source-trace-junction"/></g>;})}</svg>;}
function CenterRadar(){return <svg className="source-center-radar" viewBox="0 0 240 240" aria-hidden="true"><circle cx="120" cy="120" r="109" className="source-radar-edge"/>{[42,65,87].map(radius=><circle cx="120" cy="120" r={radius} key={radius} className="source-radar-range"/>)}<path d="M120 11v53M120 176v53M11 120h53M176 120h53" className="source-radar-cross"/>{Array.from({length:48},(_,index)=>{const angle=index*7.5*Math.PI/180,radius=index%4===0?103:107;return <line key={index} x1={coordinate(120+Math.cos(angle)*radius)} y1={coordinate(120+Math.sin(angle)*radius)} x2={coordinate(120+Math.cos(angle)*111)} y2={coordinate(120+Math.sin(angle)*111)} className="source-radar-tick"/>;})}<g className="source-radar-sweep"><path d="M120 120V12A108 108 0 0 1 174 26.5Z" className="source-radar-sector"/><path d="M120 120V12"/><circle cx="120" cy="12" r="2"/></g><circle cx="120" cy="120" r="98" className="source-radar-orbit"/><circle cx="120" cy="120" r="50" className="source-radar-plate"/><circle cx="120" cy="120" r="53" className="radar-focus-ring"/></svg>;}
function SourceMini({kind}:{kind:NodeKey}){return <svg className={`source-mini source-mini-${kind}`} viewBox="0 0 88 48" aria-hidden="true">{kind==='market'?<><path className="mini-rule" d="M5 39H83"/><path className="mini-trace" pathLength="100" d="M5 32H20L29 19L41 27L56 10L69 17H83"/><circle cx="56" cy="10" r="3" className="mini-point"/></>:kind==='holders'?<>{[[20,12],[44,12],[68,12],[20,35],[44,35],[68,35]].map(([x,y],index)=><circle key={index} cx={x} cy={y} r={index===1?7:4.5} className={index===1?'mini-point':'mini-dot'}/>)}</>:kind==='funding'?<><path className="mini-trace" pathLength="100" d="M12 24H32L53 8H76M32 24H76M32 24L53 40H76"/>{[[12,24],[76,8],[76,24],[76,40]].map(([x,y],index)=><circle key={index} cx={x} cy={y} r="3" className="mini-point"/>)}</>:kind==='trades'?<><path className="mini-rule" d="M6 24H82"/><path className="mini-trace" pathLength="100" d="M14 16V32M28 8V22M42 23V40M56 12V29M70 7V20"/><path className="mini-tick" pathLength="100" d="M11 21h6M25 14h6M39 31h6M53 20h6M67 12h6"/></>:kind==='contract'?<><path className="mini-trace" pathLength="100" d="M26 7H14V41H26M62 7H74V41H62M33 17H55M33 25H55M33 33H45"/><path className="mini-rule" d="M41 4v4M47 40v4"/></>:<><path className="mini-trace" pathLength="100" d="M28 12H79M28 24H64M28 36H72"/><path className="mini-tick" pathLength="100" d="M9 11l3 3 6-6M9 23l3 3 6-6M9 35l3 3 6-6"/></>}</svg>;}


export default function EngineConsole({report,stages,loading,paused,onExample,onInspect,compact=false,entry,onCancel}:EngineConsoleProps){
 const root=useRef<HTMLElement>(null),id=useId();
 const [selected,setSelected]=useState<NodeKey>('assessment'),[hovered,setHovered]=useState<NodeKey|null>(null);
 const [visible,setVisible]=useState(true),[reduced,setReduced]=useState(false),[inView,setInView]=useState(true);
 const started=useRef<number|null>(null),seen=useRef<StageEvent[]>([]);
 const [elapsed,setElapsed]=useState(0),[received,setReceived]=useState<{event:StageEvent;time:number;elapsed:number}[]>([]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{setReduced(media.matches);setVisible(!document.hidden);};sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);const observer=new IntersectionObserver(([item])=>setInView(item.isIntersecting));if(root.current)observer.observe(root.current);return()=>{observer.disconnect();media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};},[]);
 useEffect(()=>{if(loading){started.current=performance.now();seen.current=[];setReceived([]);setElapsed(0);}},[loading]);
 useEffect(()=>{if(!loading||!visible||!inView)return;const update=()=>setElapsed(Math.floor((performance.now()-(started.current??performance.now()))/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[loading,visible,inView]);
 useEffect(()=>{if(!loading)return;const additions=stages.filter(event=>!seen.current.includes(event));if(!additions.length)return;seen.current=[...stages];const time=Date.now();setReceived(previous=>[...previous,...additions.map(event=>({event,time,elapsed:Math.floor((performance.now()-(started.current??performance.now()))/1000)}))].slice(-30));},[stages,loading]);
 const latest=new Map<string,StageEvent>();for(const event of stages)latest.set(event.stage,event);
 const activeStage=loading?[...latest.values()].findLast(event=>event.status==='running'):undefined;
 const activeNode=activeStage?NODES.find(node=>node.matches(activeStage.stage)):undefined;
 const moving=!paused&&!reduced&&visible&&inView,highlight=hovered||activeNode?.key||selected;
 const chosen=NODES.find(node=>node.key===selected)!,chosenState=nodeState(chosen,stages,loading,report);
 const running=NODES.filter(node=>nodeState(node,stages,loading,report).state==='running').map(node=>node.key);
 const completed=[...latest.values()].filter(event=>event.status==='complete').length;
 useEffect(()=>{if(activeNode)setSelected(activeNode.key);},[activeNode?.key]);
 useEffect(()=>{if(!moving||!root.current)return;const context=gsap.context(()=>{const detail=root.current?.querySelector('.source-detail-copy');if(detail)gsap.fromTo(detail,{opacity:.65,y:4},{opacity:1,y:0,duration:.25,ease:'power3.out',clearProps:'transform,opacity'});},root);return()=>context.revert();},[selected,moving]);
 const providerPending=activeStage?.stage==='provider-report';
 const step=activeStage?stageTitle(activeStage.stage):'Opening source connections';
 return <section ref={root} className={`engine-console source-console${compact?' source-compact':''}`} data-moving={moving} data-scanning={loading} aria-labelledby={`${id}-title`}>
  <header className="source-console-header">{compact?<h2 id={`${id}-title`}>Investigation activity</h2>:<h1 id={`${id}-title`}>Investigate a token.</h1>}<p>{loading?'Following the evidence, one source at a time.':'Understand the wallets, the connections and the risks.'}</p></header>
  <div className="source-engine-grid">
   <TracePaths highlight={highlight} running={running}/>
   <div className={`source-entry ${loading?'is-scanning':''}`}>
    {loading?<><div className="source-scan-instrument"><CenterRadar/><div className="source-scan-clock"><strong>{Math.floor(elapsed/60).toString().padStart(2,'0')}:{(elapsed%60).toString().padStart(2,'0')}</strong><span>elapsed</span></div></div><div className="source-scan-caption" role="status"><strong>{step}</strong><p>{activeStage?.detail||'Waiting for the first source response.'}</p></div><div className="source-scan-controls"><span>{completed} completed {completed===1?'stage':'stages'}</span>{onCancel&&<button type="button" onClick={onCancel}><X size={14}/>Cancel scan</button>}</div></>:entry||<div className="source-report-entry"><strong>{report?`${numeric(report.investigation.wallets.length)} wallets in this report`:'Start with a token address'}</strong><p>{report?'Explore the evidence behind each source.':'Choose a network and enter the contract you want to investigate.'}</p><button type="button" onClick={report?onInspect:onExample}>{report?'Inspect report':'Explore an example'}<ArrowUpRight size={16}/></button></div>}
    {!loading&&stages.length>0&&!report&&<p className="source-stopped" role="status">Scan stopped. Enter a token to start again.</p>}
   </div>
   {[NODES[0],NODES[3],NODES[1],NODES[4],NODES[2],NODES[5]].map((node,index)=>{const state=nodeState(node,stages,loading,report);return <button type="button" key={node.key} className={`source-panel source-panel-${node.key}`} style={{gridColumn:index%2===0?1:3,gridRow:Math.floor(index/2)+1}} data-state={state.state} aria-pressed={selected===node.key} aria-controls={`${id}-detail`} onClick={()=>setSelected(node.key)} onPointerEnter={()=>setHovered(node.key)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(node.key)} onBlur={()=>setHovered(null)}><SourceMini kind={node.key}/><span className="source-panel-copy"><strong>{node.title}</strong><span>{loading&&!['waiting','idle'].includes(state.state)?state.label:report?observed(node.key,report):PURPOSE[node.key]}</span></span><span className="source-panel-corner" aria-hidden="true">{state.state==='running'?<LoaderCircle size={14}/>:state.state==='received'?<Check size={14}/>:<ArrowUpRight size={14}/>}</span></button>;})}
  </div>
  {loading&&received.length>0&&<div className="source-event-log"><span>Source activity <small>Received on this device</small></span><ol>{received.slice(-4).map((item,index)=><li key={`${item.event.stage}-${item.time}-${index}`}><time dateTime={new Date(item.time).toISOString()}>{new Date(item.time).toLocaleTimeString('en-GB',{hour12:false})}</time><span>{stageTitle(item.event.stage)}</span><strong>{item.event.status==='complete'?'Received':item.event.status==='unavailable'?'Unavailable':'Requesting'}</strong></li>)}</ol></div>}
  <div className="source-console-detail" id={`${id}-detail`}><div className="source-detail-copy" aria-live="polite"><strong>{chosen.title}</strong><p>{chosen.description}</p>{loading&&chosenState.detail&&<small>{chosenState.detail}</small>}</div><SourceStrip/></div>
  <footer className="source-console-footer"><span>{report?'Report retains original source timestamps.':loading?'Progress follows actual source responses.':'Decorative traces illustrate the investigation flow.'}</span><strong>{report?`Coverage: ${report.investigation.coverage.status}`:loading?'Scan in progress':'No scan running'}</strong></footer>
 </section>;
}
