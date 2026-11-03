"use client";
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { short } from '@/lib/analysis';
import type { SwarmReport } from '@/lib/swarm';
import type { Selection } from './investigation-panels';
import './provider-share-history.css';

const percentage=(value:number|null)=>value==null?'Not reported':`${(value*100).toLocaleString(undefined,{maximumFractionDigits:3})}%`;
const date=(value:string)=>new Date(value).toLocaleString();
const LABEL='Sampled holders total';
export default function ProviderShareHistory({provider,selectedWallet,knownWallets,onSelect}:{provider:SwarmReport;selectedWallet?:string;knownWallets:string[];onSelect:(selection:Selection)=>void}) {
 const history=provider.history,id=useId();
 const [cursor,setCursor]=useState(0),[wallet,setWallet]=useState<string|null>(null),[search,setSearch]=useState('');
 useEffect(()=>{setCursor(0);setWallet(null);setSearch('');},[provider.token,provider.providerTimestamp]);
 useEffect(()=>{if(selectedWallet&&history?.wallets.includes(selectedWallet))setWallet(selectedWallet);},[selectedWallet,history]);
 const series=useMemo(()=>history?.frames.map(frame=>{
  if(wallet)return frame.shares[wallet]??null;
  if(!history.wallets.length)return null;
  const shares=history.wallets.map(address=>frame.shares[address]);
  if(shares.some(value=>value==null))return null;
  const total=shares.reduce<number>((sum,value)=>sum+(value??0),0);
  return total<=1.000001?Math.min(1,total):null;
 })||[],[history,wallet]);
 if(!history?.frames.length)return <div className="hw-empty"><strong>Historical holdings were not returned</strong><p>This provider report does not contain usable supply-share snapshots. Wallet flags and entry references remain available in the holder drawer; they are not a reconstructed event ledger.</p></div>;
 const frames=history.frames,index=Math.min(cursor,frames.length-1),frame=frames[index],value=series[index]??null;
 const first=Date.parse(frames[0].timestamp),last=Date.parse(frames.at(-1)!.timestamp),span=Math.max(1,last-first);
 const max=Math.min(1,Math.max(.001,...series.filter((v):v is number=>v!=null))*1.12);
 const x=(i:number)=>frames.length===1?390:48+(Date.parse(frames[i].timestamp)-first)/span*700;
 const y=(v:number)=>190-v/max*154;
 let pen=false;const path=series.map((v,i)=>{if(v==null){pen=false;return '';}const command=pen?'L':'M';pen=true;return `${command}${x(i).toFixed(2)},${y(v).toFixed(2)}`;}).join(' ');
 const visibleWallets=history.wallets.filter(address=>address.toLowerCase().includes(search.trim().toLowerCase())).slice(0,12);
 const selectFrame=(clientX:number,rect:DOMRect)=>{const target=first+Math.max(0,Math.min(1,(clientX-rect.left)/rect.width))*span;let nearest=0;for(let i=1;i<frames.length;i++)if(Math.abs(Date.parse(frames[i].timestamp)-target)<Math.abs(Date.parse(frames[nearest].timestamp)-target))nearest=i;setCursor(nearest);};
 return <section className="provider-history" aria-labelledby={`${id}-title`}>
  <header><div><h3 id={`${id}-title`}>Reported holdings over time</h3><p>SwarmEngine supply-share snapshots. Changes do not establish buys, sells or coordinated activity.</p></div><span>{frames.length} snapshots · {history.wallets.length} wallets</span></header>
  <div className="ph-selection"><button type="button" aria-pressed={wallet===null} onClick={()=>setWallet(null)}>{LABEL}</button><label><Search size={15}/><span className="hw-sr-only">Find a historical wallet</span><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a wallet address" type="search"/></label></div>
  <div className="ph-wallets" aria-label="Wallet series">{visibleWallets.map(address=><button type="button" key={address} title={address} aria-label={`Show supply-share history for ${address}`} aria-pressed={wallet===address} onClick={()=>setWallet(address)}>{short(address)}</button>)}{!visibleWallets.length&&<span>No matching historical wallets.</span>}{visibleWallets.length<history.wallets.length&&!search&&<span>Showing 12 wallets. Search to find another.</span>}</div>
  <div className="ph-readout"><div><span>{wallet?short(wallet):LABEL}</span><strong>{percentage(value)}</strong><small>of total supply</small></div><div><time dateTime={frame.timestamp}>{date(frame.timestamp)}</time><span>{frame.block==null?'Block not reported':`Block ${frame.block.toLocaleString()}`}</span></div>{wallet&&knownWallets.includes(wallet)&&<button type="button" onClick={()=>onSelect({kind:'wallet',id:wallet})}>Inspect wallet <ArrowUpRight size={14}/></button>}</div>
  <svg className="ph-chart" viewBox="0 0 780 220" role="img" aria-labelledby={`${id}-chart-title ${id}-chart-desc`} onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);const rect=event.currentTarget.getBoundingClientRect();selectFrame(event.clientX,new DOMRect(rect.left+rect.width*48/780,rect.top,rect.width*700/780,rect.height));}} onPointerMove={event=>{if(event.buttons!==1)return;const rect=event.currentTarget.getBoundingClientRect();selectFrame(event.clientX,new DOMRect(rect.left+rect.width*48/780,rect.top,rect.width*700/780,rect.height));}}>
   <title id={`${id}-chart-title`}>{wallet?short(wallet):LABEL}: reported share of total supply</title><desc id={`${id}-chart-desc`}>Use the snapshot slider below to inspect each reported timestamp and value. Missing points are gaps, not zero. This chart is not a transaction timeline.</desc>
   {[0,.5,1].map(step=><g key={step}><line x1="48" y1={y(max*step)} x2="748" y2={y(max*step)} className="ph-rule"/><text x="40" y={y(max*step)+4} textAnchor="end">{(max*step*100).toLocaleString(undefined,{maximumFractionDigits:2})}%</text></g>)}
   <path d={path} className="ph-line"/><line x1={x(index)} y1="24" x2={x(index)} y2="190" className="ph-cursor"/>{value!=null&&<circle cx={x(index)} cy={y(value)} r="4" className="ph-point"/>}
  </svg>
  <div className="ph-controls"><button type="button" aria-label="Previous holdings snapshot" disabled={index===0} onClick={()=>setCursor(index-1)}><ChevronLeft size={17}/></button><label htmlFor={`${id}-slider`} className="hw-sr-only">Historical holdings snapshot</label><input id={`${id}-slider`} type="range" min="0" max={frames.length-1} value={index} onChange={event=>setCursor(Number(event.target.value))} aria-valuetext={`${date(frame.timestamp)}, ${wallet?short(wallet):LABEL}, ${percentage(value)} of total supply`}/><button type="button" aria-label="Next holdings snapshot" disabled={index===frames.length-1} onClick={()=>setCursor(index+1)}><ChevronRight size={17}/></button><output>{index+1} / {frames.length}</output></div>
  <div className="ph-times"><time dateTime={frames[0].timestamp}>{date(frames[0].timestamp)}</time><time dateTime={frames.at(-1)!.timestamp}>{date(frames.at(-1)!.timestamp)}</time></div>
  <p className="ph-limit">Only the provider's sampled wallets and timestamps are shown. Missing shares create gaps. The sampled total is unavailable when any included wallet lacks a share. Snapshot changes are not transaction evidence.{history.truncated?' This history was truncated.':''}</p>
  {!!history.issues.length&&<details><summary>History coverage limits ({history.issues.length})</summary><ul>{history.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></details>}
 </section>;
}
