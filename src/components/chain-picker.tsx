"use client";
import { useEffect,useId,useRef,useState } from 'react';
import { Check,ChevronDown,Feather } from 'lucide-react';
import { CHAINS,type Chain } from '@/lib/analysis';
import './brand.css';
export type ChainChoice=Chain|'auto';
const chains:ChainChoice[]=['auto',...Object.keys(CHAINS) as Chain[]];
const chainName=(chain:ChainChoice)=>chain==='auto'?'Auto Chain':CHAINS[chain].name;
export function ChainGlyph({chain}:{chain:ChainChoice}) {
  if(chain==='robinhood')return <Feather size={20} strokeWidth={1.5} aria-hidden="true"/>;
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">{chain==='auto'?<g stroke="#bdbdbd" strokeWidth="1.5"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><circle cx="12" cy="12" r="4"/><path d="M12 6v3M12 15v3M6 12h3M15 12h3"/></g>:chain==='ethereum'?<><path d="m12 2 6 10-6 4-6-4Z" fill="#b6c6d5"/><path d="m6 14 6 8 6-8-6 4Z" fill="#718597"/><path d="m12 2 0 14 6-4Z" fill="#7d91a2"/></>:chain==='base'?<><circle cx="12" cy="12" r="9" fill="#547cdd"/><path d="M3 12h13" stroke="white" strokeWidth="2"/></>:chain==='bsc'?<g stroke="#d8b45f" strokeWidth="2"><path d="m12 3 4 4-4 4-4-4Zm0 10 4 4-4 4-4-4ZM2 12l3-3 3 3-3 3Zm14 0 3-3 3 3-3 3Z"/></g>:<g fill="#90cabb"><path d="m6 4 15 0-3 4H3Zm-3 6h15l3 4H6Zm3 6h15l-3 4H3Z"/></g>}</svg>;
}
export default function ChainPicker({value,onChange,disabled=false}:{value:ChainChoice;onChange:(value:ChainChoice)=>void;disabled?:boolean}) {
  const [open,setOpen]=useState(false),[index,setIndex]=useState(chains.indexOf(value));const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);const id=useId();
  useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[]);
  useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
  useEffect(()=>{setIndex(chains.indexOf(value));},[value]);
  function select(i:number){onChange(chains[i]);setOpen(false);trigger.current?.focus({preventScroll:true});}
  return <div ref={root} className="tf-chain-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <button ref={trigger} className="tf-chain-trigger" type="button" role="combobox" aria-label="Blockchain" aria-expanded={open} aria-controls={id} aria-haspopup="listbox" aria-activedescendant={open?`${id}-${index}`:undefined} disabled={disabled} onClick={()=>{setIndex(chains.indexOf(value));setOpen(!open);}} onKeyDown={e=>{
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setOpen(true);setIndex(i=>e.key==='Home'?0:e.key==='End'?chains.length-1:Math.max(0,Math.min(chains.length-1,(open?i:chains.indexOf(value))+(e.key==='ArrowDown'?1:-1))));}
      else if(e.key==='Escape'){e.preventDefault();setOpen(false);}
      else if((e.key==='Enter'||e.key===' ')&&open){e.preventDefault();select(index);}
      else if(e.key.length===1&&/[a-z]/i.test(e.key)){const found=chains.findIndex(c=>chainName(c).toLowerCase().startsWith(e.key.toLowerCase()));if(found>=0){setOpen(true);setIndex(found);}}
    }}><ChainGlyph chain={value}/><span>{chainName(value)}</span><ChevronDown size={14} className={open?'is-open':''}/></button>
    {open&&<div id={id} role="listbox" aria-label="Blockchain networks" className="tf-chain-menu">{chains.map((chain,i)=><div id={`${id}-${i}`} key={chain} role="option" aria-selected={chain===value} className={`tf-chain-option ${i===index?'is-focused':''}`} onPointerMove={()=>setIndex(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>select(i)}><ChainGlyph chain={chain}/><span>{chainName(chain)}<small>{chain==='auto'?'Detect network':chain==='solana'?'SPL tokens':'EVM contracts'}</small></span>{chain===value&&<Check size={15}/>}</div>)}</div>}
  </div>;
}
