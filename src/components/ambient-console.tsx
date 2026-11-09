"use client";
import {useEffect,useRef} from 'react';
import './ambient-console.css';

/** Window event that sends a one-off surge ripple through the grid. */
export const SURGE_EVENT='traceforge:surge';

/** Crypto dot grid: an even field of mint dots. Waves roll across it, ripples
 * pop out like block confirmations, the cursor lights a soft area and a scan
 * makes everything faster and brighter. Decorative only, never measured data. */
export default function AmbientConsole({paused=false,active=false,className=''}:{paused?:boolean;active?:boolean;className?:string}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const activeRef=useRef(active);activeRef.current=active;
 useEffect(()=>{
  const element=canvas.current,parent=element?.parentElement;if(!element||!parent)return;
  const context=element.getContext('2d');if(!context)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)'),fine=matchMedia('(hover:hover) and (pointer:fine)');
  let frame=0,last=0,time=0,width=1,height=1,intersecting=true,disposed=false,energy=activeRef.current?1:0,nextRipple=600;
  const pointer={x:-9999,y:-9999,strength:0,target:0};
  type Ripple={x:number;y:number;born:number;power:number};
  const ripples:Ripple[]=[];
  const GAP=26,BUCKETS=8;
  let cols=0,rows=0,ox=0,oy=0;
  const layout=()=>{cols=Math.ceil(width/GAP)+1;rows=Math.ceil(height/GAP)+1;ox=(width-(cols-1)*GAP)/2;oy=(height-(rows-1)*GAP)/2;};
  const allowed=()=>!disposed&&!paused&&!document.hidden&&!media.matches&&intersecting;
  const ripple=(x:number,y:number,power=1)=>{ripples.push({x,y,born:time,power});if(ripples.length>10)ripples.shift();};
  const draw=(delta:number)=>{
   time+=delta;
   const target=activeRef.current?1:0;energy+=(target-energy)*Math.min(1,delta/1200*2.4);
   pointer.strength+=(pointer.target-pointer.strength)*Math.min(1,delta*.006);
   nextRipple-=delta*(1+energy*3);
   if(nextRipple<=0){ripple(Math.random()*width,Math.random()*height,.7+Math.random()*.5);nextRipple=900+Math.random()*1600;}
   const t=time*.001*(1+energy*1.6),speed=.32+energy*.25;
   context.clearRect(0,0,width,height);
   const paths=Array.from({length:BUCKETS},()=>new Path2D());
   const live=ripples.filter(r=>time-r.born<3200);ripples.length=0;ripples.push(...live);
   for(let j=0;j<rows;j++){const y=oy+j*GAP;
    for(let i=0;i<cols;i++){const x=ox+i*GAP;
     // Two rolling waves give the field a constant, ocean-like motion.
     let v=.5+.5*Math.sin(x*.0062+y*.0031-t*speed*3.1);
     v=v*v*v*.55+(.5+.5*Math.sin(x*.0021-y*.0049+t*speed*1.7))**4*.35;
     for(const r of live){const age=(time-r.born)/1000,dist=Math.hypot(x-r.x,y-r.y),front=age*340,band=dist-front;
      if(band>-60&&band<60)v+=Math.cos(band/60*Math.PI/2)**2*r.power*Math.max(0,1-age/3.2);}
     if(pointer.strength>.01){const d2=(x-pointer.x)**2+(y-pointer.y)**2;if(d2<90000)v+=Math.exp(-d2/22000)*.9*pointer.strength;}
     v=Math.min(1,v*(1+energy*.6));
     const b=Math.min(BUCKETS-1,Math.floor(v*BUCKETS));const size=1+v*1.4;
     paths[b].rect(x-size/2,y-size/2,size,size);
    }
   }
   for(let b=0;b<BUCKETS;b++){context.fillStyle=`rgba(142,240,180,${(.07+b/(BUCKETS-1)*.78).toFixed(3)})`;context.fill(paths[b]);}
  };
  const tick=(stamp:number)=>{frame=0;if(!allowed())return;draw(last?Math.min(48,stamp-last):16);last=stamp;frame=requestAnimationFrame(tick);};
  const sync=()=>{cancelAnimationFrame(frame);frame=0;last=0;if(allowed())frame=requestAnimationFrame(tick);else draw(0);};
  const resize=()=>{const rect=parent.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);const dpr=Math.min(devicePixelRatio||1,1.5);element.width=Math.round(width*dpr);element.height=Math.round(height*dpr);context.setTransform(dpr,0,0,dpr,0,0);layout();draw(0);};
  const move=(event:PointerEvent)=>{if(event.pointerType==='touch'||!fine.matches)return;const rect=parent.getBoundingClientRect();pointer.x=event.clientX-rect.left;pointer.y=event.clientY-rect.top;pointer.target=1;};
  const leave=()=>{pointer.target=0;};
  const click=(event:PointerEvent)=>{if(!allowed())return;const rect=parent.getBoundingClientRect();ripple(event.clientX-rect.left,event.clientY-rect.top,1);};
  const onSurge=()=>{ripple(width/2,height*.35,1.4);};
  const resizeObserver=new ResizeObserver(resize),observer=new IntersectionObserver(([entry])=>{intersecting=entry.isIntersecting;sync();});
  resizeObserver.observe(parent);observer.observe(element);
  window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerdown',click,{passive:true});document.documentElement.addEventListener('pointerleave',leave);window.addEventListener('blur',leave);
  window.addEventListener(SURGE_EVENT,onSurge);document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);
  resize();sync();
  return()=>{disposed=true;cancelAnimationFrame(frame);resizeObserver.disconnect();observer.disconnect();window.removeEventListener('pointermove',move);window.removeEventListener('pointerdown',click);document.documentElement.removeEventListener('pointerleave',leave);window.removeEventListener('blur',leave);window.removeEventListener(SURGE_EVENT,onSurge);document.removeEventListener('visibilitychange',sync);media.removeEventListener('change',sync);};
 },[paused]);
 return <canvas ref={canvas} className={`ambient-console ${className}`} aria-hidden="true"/>;
}
