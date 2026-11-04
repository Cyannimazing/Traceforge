"use client";
import {useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {ArrowUpRight,Check,LoaderCircle,X} from 'lucide-react';
import ScanAperture from './scan-aperture';
import type {InvestigationReport,ScanEvent} from '../lib/investigation-types';
import './engine-console.css';
import {assessmentLabel} from '@/lib/assessment-presentation';
import SourceStrip from './source-strip';

type StageEvent=Extract<ScanEvent,{type:'stage'}>;
export type EngineConsoleProps={report:InvestigationReport|null;stages:StageEvent[];loading:boolean;paused:boolean;onExample:()=>void;onInspect:()=>void;compact?:boolean;entry?:ReactNode;onCancel?:()=>void;runId?:number};
type NodeKey='market'|'holders'|'funding'|'trades'|'contract'|'assessment';
type NodeDefinition={key:NodeKey;title:string;description:string;matches:(name:string)=>boolean};
const NODES:NodeDefinition[]=[
 {key:'market',title:'Market',description:'Price, liquidity and trading activity from the returned market snapshot. One pool does not describe every trading venue.',matches:name=>['resolve','public-data','market-context','pool-reserves'].includes(name)},
 {key:'holders',title:'Holders',description:'Holder balances, supply shares and wallet roles, with snapshot times and source records.',matches:name=>['Holders','holder-rpc','solana-snapshot','public-history','wallet-activity'].includes(name)},
 {key:'funding',title:'Funding',description:'Available funding and transfer relationships. Shared funding does not establish common ownership.',matches:name=>name.startsWith('Funding batch')||name==='public-history'},
 {key:'trades',title:'Trades',description:'Timestamped entries, buys and sells from the available sources. First observed activity is not automatically token launch.',matches:name=>['Earliest buys','Recent trades','Trading start','public-history','pool-first-minute','rpc-history','history'].includes(name)},
 {key:'contract',title:'Contract',description:'Reported contract findings, creator and current authority. Missing checks stay unassessed.',matches:name=>name==='public-data'||name==='solana-snapshot'||name==='control-probes'},
 {key:'assessment',title:'Assessment',description:'The findings behind the assessment: contract controls, holder concentration and wallet connections.',matches:name=>name==='assessment'},
];
const PURPOSE:Record<NodeKey,string>={market:'Liquidity and trading activity',holders:'Token holders and supply shares',funding:'Wallet funding and connections',trades:'Early buys and sell patterns',contract:'Creator, owner and contract checks',assessment:'Clear, Watch or High risk'};
const stageTitle=(stage:string)=>(({
 'resolve':'Identifying token network','provider-report':'Reading provider analysis','clock-check':'Checking source timestamps','public-data':'Reading market and contract data',
 'public-history':'Tracing public wallet history','history':'Loading indexed history','market-context':'Refreshing market data',
 'pool-first-minute':'Verifying first-minute trades','assessment':'Building the assessment','solana-snapshot':'Verifying token accounts',
 'wallet-activity':'Checking holder activity','control-probes':'Verifying contract controls','rpc-history':'Reading bounded wallet history',
 'holder-rpc':'Verifying holder balances','pool-reserves':'Inspecting pool reserves',
 'independent-scan':'Independent sources selected','cache':'Loading a previous investigation',
 } as Record<string,string>)[stage]||stage.replaceAll('-',' ').replace(/^./,letter=>letter.toUpperCase()));
const numeric=(value:number)=>value.toLocaleString('en-US');
function observed(key:NodeKey,report:InvestigationReport){const inv=report.investigation;switch(key){
 case 'market':return report.market?'Snapshot received':'Unavailable';
 case 'holders':return `${numeric(inv.wallets.filter(wallet=>wallet.share!==null||wallet.balance!==undefined).length)} balance records`;
 case 'funding':return `${numeric(inv.relationships.length)} reported links`;
 case 'trades':return `${numeric(inv.timeline.length)} event records`;
 case 'contract':return `${report.checks.filter(check=>check.status!=='unknown').length} / ${report.checks.length} checks assessed`;
 case 'assessment':return `${assessmentLabel(inv.assessment.status)}${inv.assessment.status==='insufficient'?' - limited evidence':''}`;
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
type FlowGeometry={width:number;height:number;paths:{key:NodeKey;d:string;x:number;y:number}[]};
function TracePaths({highlight,running,geometry}:{highlight:NodeKey;running:NodeKey[];geometry:FlowGeometry|null}){
 if(!geometry)return null;
 return <svg className="source-traces" viewBox={'0 0 '+geometry.width+' '+geometry.height} preserveAspectRatio="none" aria-hidden="true">{geometry.paths.map((path,index)=><g key={path.key} data-highlight={highlight===path.key} data-running={running.includes(path.key)} style={{'--trace-delay':index*-.8+'s'} as CSSProperties}><path d={path.d} className="source-trace-base"/><path d={path.d} className="source-trace-packet" pathLength="100"/><circle cx={path.x} cy={path.y} r="2" className="source-trace-junction"/></g>)}</svg>;
}
function SourceMini({kind}:{kind:NodeKey}){return <svg className={`source-mini source-mini-${kind}`} viewBox="0 0 88 48" aria-hidden="true">{kind==='market'?<><path className="mini-rule" d="M5 39H83"/><path className="mini-trace" pathLength="100" d="M5 32H20L29 19L41 27L56 10L69 17H83"/><circle cx="56" cy="10" r="3" className="mini-point"/></>:kind==='holders'?<>{[[20,12],[44,12],[68,12],[20,35],[44,35],[68,35]].map(([x,y],index)=><circle key={index} cx={x} cy={y} r={index===1?7:4.5} className={index===1?'mini-point':'mini-dot'}/>)}</>:kind==='funding'?<><path className="mini-trace" pathLength="100" d="M12 24H32L53 8H76M32 24H76M32 24L53 40H76"/>{[[12,24],[76,8],[76,24],[76,40]].map(([x,y],index)=><circle key={index} cx={x} cy={y} r="3" className="mini-point"/>)}</>:kind==='trades'?<><path className="mini-rule" d="M6 24H82"/><path className="mini-trace" pathLength="100" d="M14 16V32M28 8V22M42 23V40M56 12V29M70 7V20"/><path className="mini-tick" pathLength="100" d="M11 21h6M25 14h6M39 31h6M53 20h6M67 12h6"/></>:kind==='contract'?<><path className="mini-trace" pathLength="100" d="M26 7H14V41H26M62 7H74V41H62M33 17H55M33 25H55M33 33H45"/><path className="mini-rule" d="M41 4v4M47 40v4"/></>:<><path className="mini-trace" pathLength="100" d="M28 12H79M28 24H64M28 36H72"/><path className="mini-tick" pathLength="100" d="M9 11l3 3 6-6M9 23l3 3 6-6M9 35l3 3 6-6"/></>}</svg>;}


export default function EngineConsole({report,stages,loading,paused,onExample,onInspect,compact=false,entry,onCancel,runId=0}:EngineConsoleProps){
 const root=useRef<HTMLElement>(null),id=useId();
 const [flow,setFlow]=useState<FlowGeometry|null>(null);
 const [selected,setSelected]=useState<NodeKey>('assessment'),[hovered,setHovered]=useState<NodeKey|null>(null);
 const [visible,setVisible]=useState(true),[reduced,setReduced]=useState(false),[inView,setInView]=useState(true);
 const started=useRef<number|null>(null),seen=useRef<StageEvent[]>([]);
 const [elapsed,setElapsed]=useState(0),[received,setReceived]=useState<{event:StageEvent;time:number;elapsed:number}[]>([]);
 useLayoutEffect(()=>{
  const grid=root.current?.querySelector<HTMLElement>('.source-engine-grid');if(!grid)return;
  const update=()=>{
   const bounds=grid.getBoundingClientRect(),target=grid.querySelector<HTMLElement>('.scan-aperture,.token-entry,.source-report-entry');if(!target||!bounds.width||!bounds.height)return;
   const end=target.getBoundingClientRect(),ports=grid.querySelectorAll('.sa-port');
   const paths=NODES.flatMap((node,index)=>{
    const panel=grid.querySelector('.source-panel-'+node.key);if(!panel)return [];
    const from=panel.getBoundingClientRect(),left=index<3,startX=(left?from.right:from.left)-bounds.left,startY=from.top+from.height/2-bounds.top;
    const port=loading?ports[index]?.querySelector('rect:not(.sa-port-outline)')?.getBoundingClientRect():undefined;
    const endX=port?port.x+port.width/2-bounds.left:(left?end.left:end.right)-bounds.left;
    const endY=port?port.y+port.height/2-bounds.top:end.top+end.height/2+(index%3-1)*Math.min(60,end.height*.28)-bounds.top;
    const bend=(startX+endX)/2;
    return [{key:node.key,d:'M'+startX+' '+startY+'C'+bend+' '+startY+' '+bend+' '+endY+' '+endX+' '+endY,x:startX,y:startY}];
   });
   const next={width:bounds.width,height:bounds.height,paths};setFlow(previous=>JSON.stringify(previous)===JSON.stringify(next)?previous:next);
  };
  const observer=new ResizeObserver(update);observer.observe(grid);const entry=grid.querySelector('.source-entry');if(entry)observer.observe(entry);const target=grid.querySelector('.scan-aperture,.token-entry,.source-report-entry');if(target)observer.observe(target);grid.querySelectorAll('.source-panel').forEach(panel=>observer.observe(panel));update();return()=>observer.disconnect();
 },[loading,compact]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>{setReduced(media.matches);setVisible(!document.hidden);};sync();media.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);const observer=new IntersectionObserver(([item])=>setInView(item.isIntersecting));if(root.current)observer.observe(root.current);return()=>{observer.disconnect();media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);};},[]);
 useEffect(()=>{if(loading){started.current=performance.now();seen.current=[];setReceived([]);setElapsed(0);}},[loading,runId]);
 useEffect(()=>{if(!loading||!visible||!inView)return;const update=()=>setElapsed(Math.floor((performance.now()-(started.current??performance.now()))/1000));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[loading,runId,visible,inView]);
 useEffect(()=>{if(!loading)return;const additions=stages.filter(event=>!seen.current.includes(event));if(!additions.length)return;seen.current=[...stages];const time=Date.now();setReceived(previous=>[...previous,...additions.map(event=>({event,time,elapsed:Math.floor((performance.now()-(started.current??performance.now()))/1000)}))].slice(-30));},[stages,loading,runId]);
 const latest=new Map<string,StageEvent>();for(const event of stages)latest.set(event.stage,event);
 const activeStage=loading?[...latest.values()].findLast(event=>event.status==='running'):undefined;
 const activeNode=activeStage?NODES.find(node=>node.matches(activeStage.stage)):undefined;
 const moving=!paused&&!reduced&&visible&&inView,highlight=hovered||activeNode?.key||selected;
 const running=NODES.filter(node=>nodeState(node,stages,loading,report).state==='running').map(node=>node.key);
 const completed=[...latest.values()].filter(event=>event.status==='complete').length;
 useEffect(()=>{if(activeNode)setSelected(activeNode.key);},[activeNode?.key]);
 const step=activeStage?stageTitle(activeStage.stage):'Opening source connections';
 const recent=received.slice(-2),lastReceipt=received.at(-1);
 const pulseKey=lastReceipt?`${lastReceipt.time}:${lastReceipt.event.stage}:${lastReceipt.event.status}:${received.length}`:'';
 return <section ref={root} className={`engine-console source-console${compact?' source-compact':''}`} data-moving={moving} data-scanning={loading} aria-labelledby={`${id}-title`}>
  <header className="source-console-header">{compact?<h2 id={`${id}-title`}>Investigation activity</h2>:<h1 id={`${id}-title`}>Investigate a token.</h1>}<p>Crypto token analysis, from holders to contract risks.</p></header>
  <div className="source-engine-grid">
   <TracePaths highlight={highlight} running={running} geometry={flow}/>
   <div className={`source-entry ${loading?'is-scanning':''}`}>
    <span className="source-entry-origin" aria-hidden="true"/>
    {loading?<div className="source-scan-instrument"><ScanAperture elapsed={elapsed} moving={moving} pulseKey={pulseKey} states={NODES.map(node=>({id:node.title,state:nodeState(node,stages,loading,report).state}))}/></div>:entry||<div className="source-report-entry"><strong>{report?`${numeric(report.investigation.wallets.length)} wallets in this report`:'Start with a token address'}</strong><p>{report?'Explore the evidence behind each source.':'Choose a network and enter the contract you want to investigate.'}</p><button type="button" onClick={report?onInspect:onExample}>{report?'Inspect report':'Explore an example'}<ArrowUpRight size={16}/></button></div>}
    {!loading&&stages.length>0&&!report&&<p className="source-stopped" role="status">Scan stopped. Enter a token to start again.</p>}
   </div>
   {[NODES[0],NODES[3],NODES[1],NODES[4],NODES[2],NODES[5]].map((node,index)=>{const state=nodeState(node,stages,loading,report);return <button type="button" key={node.key} className={`source-panel source-panel-${node.key}`} style={{gridColumn:index%2===0?1:3,gridRow:Math.floor(index/2)+1}} data-state={state.state} aria-pressed={selected===node.key} aria-description={node.description} onClick={()=>setSelected(node.key)} onPointerEnter={()=>setHovered(node.key)} onPointerLeave={()=>setHovered(null)} onFocus={()=>setHovered(node.key)} onBlur={()=>setHovered(null)}><SourceMini kind={node.key}/><span className="source-panel-copy"><strong>{node.title}</strong><span>{loading&&!['waiting','idle'].includes(state.state)?state.label:report?observed(node.key,report):PURPOSE[node.key]}</span></span><span className="source-panel-corner" aria-hidden="true">{state.state==='running'?<LoaderCircle size={14}/>:state.state==='received'?<Check size={14}/>:<ArrowUpRight size={14}/>}</span></button>;})}
   <div className="source-scan-dock" data-active={loading} aria-hidden={!loading} inert={!loading}>
    <div className="source-scan-status"><div className="source-scan-caption" role={loading?'status':undefined}><strong title={step}>{step}</strong><p tabIndex={loading?0:-1}>{activeStage?.detail||'Waiting for the first source response.'}</p></div><div className="source-scan-controls">{onCancel&&<button type="button" onClick={onCancel}><X size={14}/>Cancel scan</button>}</div></div>
    <div className="source-event-log"><span>Source activity <small>{completed} completed {completed===1?'stage':'stages'}</small></span><ol aria-label="Recent source responses">{Array.from({length:2},(_,index)=>{const item=recent[index];return item?<li key={`${item.event.stage}-${item.time}-${index}`}><time dateTime={new Date(item.time).toISOString()} title="Received on this device">{new Date(item.time).toLocaleTimeString('en-GB',{hour12:false})}</time><span title={stageTitle(item.event.stage)}>{stageTitle(item.event.stage)}</span><strong>{item.event.status==='complete'?'Received':item.event.status==='unavailable'?'Unavailable':'Requesting'}</strong></li>:<li key={`empty-${index}`} className="source-event-empty" aria-hidden="true"><i/><i/><i/></li>;})}</ol></div>
   </div>
  </div>
  <div className="source-console-detail"><SourceStrip/></div>
 </section>;
}
