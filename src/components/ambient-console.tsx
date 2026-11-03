"use client";
import {useEffect,useRef} from 'react';
import './ambient-console.css';

/** One shared, silent light field. Motion is decorative, never measured activity. */
export default function AmbientConsole({paused=false,active=false,className=''}:{paused?:boolean;active?:boolean;className?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const element=canvas.current,parent=element?.parentElement;if(!element||!parent)return;
  const context=element.getContext('2d');if(!context)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');let frame=0,last=0,time=0,width=1,height=1,intersecting=true,disposed=false;
  let pointer={x:0,y:0},offset={x:0,y:0};
  const allowed=()=>!disposed&&!paused&&!document.hidden&&!media.matches&&intersecting;
  const draw=(delta:number)=>{
   time+=delta;offset.x+=(pointer.x-offset.x)*.045;offset.y+=(pointer.y-offset.y)*.045;context.clearRect(0,0,width,height);
   // One shared phase keeps both edge bands in sync. The console owns its light.
   const phase=time*(active?.0004:.00024);
   for(let band=0;band<2;band++)for(let line=0;line<10;line++){
    const base=height*(band===0?.17:.85)+(line-4.5)*8;
    const yAt=(x:number)=>base+Math.sin(x/width*Math.PI*1.7+phase+band*1.2+line*.08)*Math.min(60,height*.09)+Math.sin(x/width*Math.PI*3-phase*.6)*12+offset.y*.5;
    context.beginPath();
    for(let step=0;step<=80;step++){const x=step/80*width,y=yAt(x);if(!step)context.moveTo(x,y);else context.lineTo(x,y);}
    context.lineWidth=line%3===0?.9:.6;context.strokeStyle=`rgba(205,205,205,${line%3===0?.19:.085})`;context.stroke();
    const head=((time*.00005+line*.097+band*.5)%1)*(width+80)-40+offset.x;
    context.beginPath();context.moveTo(head,yAt(head));context.lineTo(head+28,yAt(head+28));context.strokeStyle='rgba(230,230,230,.3)';context.stroke();
   }
  };
  const tick=(stamp:number)=>{frame=0;if(!allowed())return;if(!last||stamp-last>=1000/45){draw(last?Math.min(50,stamp-last):0);last=stamp;}frame=requestAnimationFrame(tick);};
  const sync=()=>{cancelAnimationFrame(frame);frame=0;last=0;if(allowed())frame=requestAnimationFrame(tick);else draw(0);};
  const resize=()=>{const rect=parent.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);const dpr=Math.min(devicePixelRatio||1,1.5);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);draw(0);};
  const move=(event:PointerEvent)=>{if(!allowed()||event.pointerType==='touch')return;const rect=parent.getBoundingClientRect();pointer={x:((event.clientX-rect.left)/width-.5)*30,y:((event.clientY-rect.top)/height-.5)*30};};
  const leave=()=>{pointer={x:0,y:0};};
  const globalSurface=parent.classList.contains('workspace-atmosphere');
  const pointerSurface:EventTarget=globalSurface?window:parent;
  const handlePointer:EventListener=event=>move(event as PointerEvent);
  const resizeObserver=new ResizeObserver(resize),observer=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;sync();});resizeObserver.observe(parent);observer.observe(element);pointerSurface.addEventListener('pointermove',handlePointer);pointerSurface.addEventListener('pointerleave',leave);if(globalSurface)window.addEventListener('blur',leave);document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);resize();sync();
  return()=>{disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();observer.disconnect();pointerSurface.removeEventListener('pointermove',handlePointer);pointerSurface.removeEventListener('pointerleave',leave);if(globalSurface)window.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);};
 },[paused,active]);
 return <canvas ref={canvas} className={`ambient-console ${className}`} aria-hidden="true"/>;
}
