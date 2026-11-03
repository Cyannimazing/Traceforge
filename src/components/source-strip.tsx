'use client';
import {useEffect,useRef,useState} from 'react';
const sources=[
 ['DEX Screener','Market snapshots and latest token profiles','dexscreener.jpg'],
 ['GoPlus','Contract and token security checks','goplus.png'],
 ['GeckoTerminal','Pool trading records','geckoterminal.png'],
 ['Blockscout','Explorer records where supported','blockscout.png'],
 ['Alchemy','Configured Solana, Ethereum and Base RPC records','alchemy.svg'],
];

export default function SourceStrip(){
 const root=useRef<HTMLDivElement>(null),[moving,setMoving]=useState(false);
 useEffect(()=>{const preference=matchMedia('(prefers-reduced-motion: reduce)');let inView=false;const update=()=>setMoving(inView&&!document.hidden&&!preference.matches);const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;update();});if(root.current)observer.observe(root.current);document.addEventListener('visibilitychange',update);preference.addEventListener('change',update);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);preference.removeEventListener('change',update);};},[]);
 return <div ref={root} data-moving={moving} className="source-provider-strip" aria-label="Data sources used by TraceForge. Provider brands identify sources, not endorsements.">
  <span className="sr-only">Data sources</span>
  <div className="source-provider-window"><div className="source-provider-track">{[0,1,2,3].map(copy=><ul key={copy} aria-hidden={copy>0?true:undefined}>{sources.map(([name,description,logo])=><li key={name} title={description}><img src={`/providers/${logo}`} alt="" width="28" height="28" loading="eager"/>{name}</li>)}</ul>)}</div></div>
 </div>;
}
