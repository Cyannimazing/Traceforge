'use client';

import {useEffect,useId,useRef,useState} from 'react';
import './scan-aperture.css';

export type ScanApertureProps={elapsed:number;moving:boolean;pulseKey:string;states:{id:string;state:string}[]};
const portState=(state:string)=>/^(running|loading|active|pending-request)$/i.test(state)?'running':/^(complete|completed|available|success|succeeded|received)$/i.test(state)?'complete':/^(unavailable|failed|error|unsupported|blocked)$/i.test(state)?'unavailable':'pending';
const PORT_ANGLES=[-150,180,150,-30,0,30];
const point=(angle:number,radius:number)=>({x:160+Math.cos(angle*Math.PI/180)*radius,y:160+Math.sin(angle*Math.PI/180)*radius});

/** Elapsed is seconds. Rings and beam are decorative, never completion metrics. */
export default function ScanAperture({elapsed,moving,pulseKey,states}:ScanApertureProps){
 const root=useRef<HTMLDivElement>(null),previousPulse=useRef(pulseKey),id=useId();
 const [allowed,setAllowed]=useState(false),[response,setResponse]=useState('');
 useEffect(()=>{
  const preference=matchMedia('(prefers-reduced-motion: reduce)');let inView=true;
  const update=()=>setAllowed(!document.hidden&&!preference.matches&&inView);
  const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;update();});
  if(root.current)observer.observe(root.current);preference.addEventListener('change',update);document.addEventListener('visibilitychange',update);update();
  return()=>{observer.disconnect();preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);};
 },[]);
 const animate=moving&&allowed;
 useEffect(()=>{if(previousPulse.current!==pulseKey){previousPulse.current=pulseKey;if(pulseKey&&animate)setResponse(pulseKey);}},[pulseKey,animate]);
 const seconds=Number.isFinite(elapsed)?Math.max(0,Math.floor(elapsed)):0;
 const time=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
 const ports=Array.from({length:6},(_,index)=>({id:states[index]?.id||`Source ${index+1}`,state:states[index]?.state||'Not started'}));
 return <div className="scan-aperture" ref={root} data-moving={animate} role="group" aria-label="Scan activity instrument" aria-describedby={`${id}-description`}>
  <span data-scan-anchor="true" className="scan-aperture-anchor" aria-hidden="true"/>
  <svg className="scan-aperture-dial" viewBox="0 0 320 320" fill="none" aria-hidden="true">
   <path className="sa-brackets" d="M14 48V14h34M272 14h34v34M306 272v34h-34M48 306H14v-34"/>
   <circle className="sa-boundary" cx="160" cy="160" r="147"/>
   <circle className="sa-guide" cx="160" cy="160" r="114"/>
   <circle className="sa-guide sa-inner-guide" cx="160" cy="160" r="90"/>
   <path className="sa-crosshair" d="M160 29v69M160 222v69M29 160h69M222 160h69"/>
   <g className="sa-graduations">{Array.from({length:60},(_,index)=>{const start=point(index*6,index%5===0?130:135),end=point(index*6,140);return <path key={index} d={`M${start.x} ${start.y}L${end.x} ${end.y}`} className={index%5===0?'sa-major':''}/>;})}</g>
   <g className="sa-rotor sa-rotor-outer"><circle cx="160" cy="160" r="121" strokeDasharray="96 24 8 42 58 150 12 91 45 235"/><path d="M160 34v10M160 276v10"/></g>
   <g className="sa-rotor sa-rotor-inner"><circle cx="160" cy="160" r="101" strokeDasharray="30 10 66 120 12 50 44 303"/><circle cx="160" cy="160" r="97" strokeDasharray="3 13"/></g>
   <g className="sa-sweep"><path className="sa-beam-trail" d="M160 160L258 82M160 160L266 90M160 160L272 100"/><path className="sa-beam" d="M160 160L279 111"/><path className="sa-beam-tip" d="M274 101l9 20"/></g>
   <circle className="sa-pulse sa-pulse-first" cx="160" cy="160" r="126"/>
   <circle className="sa-pulse sa-pulse-second" cx="160" cy="160" r="126"/>
   {response&&<circle key={response} className="sa-response-flash" cx="160" cy="160" r="138"/>}
   <circle className="sa-center-mask" cx="160" cy="160" r="65"/>
   <circle className="sa-center-edge" cx="160" cy="160" r="65"/>
   <path className="sa-center-index" d="M155 91h10M155 229h10M91 155v10M229 155v10"/>
   {ports.map((port,index)=>{const p=point(PORT_ANGLES[index],147),q=point(PORT_ANGLES[index],126);return <g key={index} className="sa-port" data-state={portState(port.state)}><title>{port.id}: {port.state}</title><path d={`M${q.x} ${q.y}L${p.x} ${p.y}`}/><rect x={p.x-4} y={p.y-4} width="8" height="8"/><rect className="sa-port-outline" x={p.x-7} y={p.y-7} width="14" height="14"/></g>;})}
  </svg>
  <div className="scan-aperture-readout"><span className="scan-aperture-time" aria-label={`${Math.floor(seconds/60)} minutes ${seconds%60} seconds elapsed`}>{time}</span><span className="scan-aperture-label">Elapsed</span></div>
  <div className="scan-aperture-accessible" id={`${id}-description`}>Decorative sweep; it does not indicate scan completion. Source states:<ul>{ports.map((port,index)=><li key={index}>{port.id}: {port.state}</li>)}</ul></div>
 </div>;
}
