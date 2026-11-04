"use client";

import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {gsap} from 'gsap';

/** Keep the drawer mounted through its exit so focus and scroll stay protected. */
export default function EvidenceModal({open,reducedMotion,onClose,onExited,children}:{open:boolean;reducedMotion:boolean;onClose:()=>void;onExited:()=>void;children:ReactNode}){
 const [present,setPresent]=useState(open);
 const root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),scrim=useRef<HTMLButtonElement>(null);
 const callbacks=useRef({onClose,onExited});callbacks.current={onClose,onExited};
 const entered=useRef(false);

 useLayoutEffect(()=>{if(open)setPresent(true);},[open]);
 useLayoutEffect(()=>{
  if(!present||!root.current||!panel.current||!scrim.current)return;
  const drawer=panel.current,backdrop=scrim.current,mobile=matchMedia('(max-width:760px)').matches;
  const finish=()=>{entered.current=false;setPresent(false);callbacks.current.onExited();};
  if(reducedMotion||document.hidden){
   gsap.set([drawer,backdrop],{clearProps:'transform,opacity,willChange'});
   if(!open)finish();else entered.current=true;
   return;
  }
  if(open&&!entered.current){
   gsap.set(drawer,{xPercent:mobile?0:105,yPercent:mobile?105:0});
   gsap.set(backdrop,{opacity:0});
  }
  entered.current=true;
  gsap.set([drawer,backdrop],{willChange:'transform,opacity'});
  const timeline=gsap.timeline({onComplete:()=>{
   gsap.set([drawer,backdrop],{clearProps:'willChange'});
   if(!open)finish();
  }});
  if(open){
   timeline.to(backdrop,{opacity:1,duration:.36,ease:'power2.out'},0)
    .to(drawer,{xPercent:0,yPercent:0,duration:.62,ease:'expo.out'},0);
  }else{
   timeline.to(drawer,{xPercent:mobile?0:105,yPercent:mobile?105:0,duration:.3,ease:'power3.in'},0)
    .to(backdrop,{opacity:0,duration:.32,ease:'power2.in'},.04);
  }
  // Kill without reverting: a quick reopen continues from its current position.
  return()=>{timeline.kill();};
 },[open,present,reducedMotion]);

 useLayoutEffect(()=>{
  if(!present||!root.current||!panel.current)return;
  const modal=root.current,dialog=panel.current,returnFocus=document.activeElement as HTMLElement|SVGElement|null;
  const previousOverflow=document.body.style.overflow;
  const surrounding=Array.from(document.body.children).filter((element):element is HTMLElement=>element instanceof HTMLElement&&element!==modal&&!element.contains(modal));
  const previousInert=surrounding.map(element=>[element,element.inert] as const);
  document.body.style.overflow='hidden';surrounding.forEach(element=>{element.inert=true;});
  (dialog.querySelector<HTMLButtonElement>('[aria-label="Close evidence panel"]')||dialog).focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();callbacks.current.onClose();return;}
   if(event.key!=='Tab')return;
   const items=Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"],summary')).filter(element=>element.getClientRects().length>0);
   if(!items.length){event.preventDefault();dialog.focus();return;}
   const first=items[0],last=items[items.length-1];
   if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{
   document.removeEventListener('keydown',key);document.body.style.overflow=previousOverflow;
   previousInert.forEach(([element,inert])=>{element.inert=inert;});
   if(returnFocus?.isConnected&&returnFocus.getClientRects().length)returnFocus.focus({preventScroll:true});
   else document.querySelector<HTMLButtonElement>('.ro-inspect')?.focus({preventScroll:true});
  };
 },[present]);

 if(!present)return null;
 return createPortal(<div ref={root} className="evidence-modal" data-state={open?'open':'closing'}>
  <button ref={scrim} type="button" className="evidence-scrim" tabIndex={-1} aria-hidden="true" onPointerDown={event=>event.preventDefault()} onClick={()=>callbacks.current.onClose()}/>
  <div ref={panel} className="evidence-overlay" role="dialog" aria-modal="true" aria-label="Investigation evidence panel" tabIndex={-1}>{children}</div>
 </div>,document.body);
}
