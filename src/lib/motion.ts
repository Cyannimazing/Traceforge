'use client';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {SplitText} from 'gsap/SplitText';

/** Shared, deliberately exaggerated motion presets. Every preset is a no-op
 * under prefers-reduced-motion, and only animates transform/opacity/filter. */
let registered=false;
export function registerMotion(){
 if(registered||typeof window==='undefined')return;
 gsap.registerPlugin(ScrollTrigger,SplitText);
 gsap.defaults({ease:'expo.out',duration:1.1});
 registered=true;
}
export const reducedMotion=()=>typeof window==='undefined'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE={expo:'expo.out',back:'back.out(1.8)',elastic:'elastic.out(1,0.55)',inOut:'expo.inOut'} as const;

/** Staggered rise reveal. Transform and opacity only (compositor-friendly):
 * no blur or scale on large blocks, which repaint every frame and shimmer text. */
export function reveal(targets:gsap.TweenTarget,options:{y?:number;stagger?:number;delay?:number;scroll?:Element|null}={}){
 if(reducedMotion())return null;registerMotion();
 return gsap.fromTo(targets,{y:options.y??56,opacity:0},{y:0,opacity:1,duration:1.2,stagger:options.stagger??.1,delay:options.delay??0,ease:'power4.out',force3D:true,clearProps:'transform,opacity',
  ...(options.scroll?{scrollTrigger:{trigger:options.scroll,start:'top 90%',once:true}}:{})});
}

/** Masked line-by-line headline entrance. Returns a revert function. */
export function splitHeadline(element:HTMLElement,delay=0){
 if(reducedMotion())return ()=>{};registerMotion();
 const split=SplitText.create(element,{type:'lines,words',mask:'lines',linesClass:'mo-line'});
 gsap.fromTo(split.words,{yPercent:120,rotate:4,opacity:0},{yPercent:0,rotate:0,opacity:1,duration:1.35,stagger:.045,delay,ease:EASE.expo});
 return ()=>split.revert();
}

/** Count a numeric leaf text node up from zero, keeping its formatting.
 * Mutates the existing React-owned text node in place (never replaces it) and
 * returns a restore function so an interrupted count never leaves a wrong value. */
export function countUp(element:HTMLElement,duration=1.6):()=>void{
 const node=element.firstChild;
 if(reducedMotion()||element.childNodes.length!==1||!node||node.nodeType!==Node.TEXT_NODE)return ()=>{};registerMotion();
 const text=node.nodeValue||'',match=text.match(/-?[d,]*.?d+/);if(!match)return ()=>{};
 const raw=match[0],target=Number(raw.replace(/,/g,'')),decimals=(raw.split('.')[1]||'').length,grouped=raw.includes(',');
 if(!Number.isFinite(target)||target===0)return ()=>{};
 // If React writes a new value mid-count, stop and leave React's value alone.
 let last:string|null=null,owned=true;
 const restore=()=>{if(owned&&node.nodeValue===last)node.nodeValue=text;owned=false;};
 const state={v:0};
 const tween=gsap.to(state,{v:target,duration,ease:'expo.out',onUpdate:()=>{if(last!==null&&node.nodeValue!==last){owned=false;tween.kill();return;}last=text.replace(raw,state.v.toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:grouped}));node.nodeValue=last;},onComplete:restore,onInterrupt:restore});
 return ()=>{tween.kill();restore();};
}

/** Magnetic pull toward the pointer (desktop pointers only). */
export function magnetic(element:HTMLElement,strength=.35,max=10){
 if(reducedMotion()||!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return ()=>{};
 const x=gsap.quickTo(element,'x',{duration:.6,ease:'expo.out'}),y=gsap.quickTo(element,'y',{duration:.6,ease:'expo.out'});
 const move=(e:PointerEvent)=>{const r=element.getBoundingClientRect();x(gsap.utils.clamp(-max,max,(e.clientX-r.left-r.width/2)*strength));y(gsap.utils.clamp(-max,max,(e.clientY-r.top-r.height/2)*strength));};
 const leave=()=>{gsap.to(element,{x:0,y:0,duration:1,ease:EASE.elastic});};
 element.addEventListener('pointermove',move);element.addEventListener('pointerleave',leave);
 return ()=>{element.removeEventListener('pointermove',move);element.removeEventListener('pointerleave',leave);gsap.set(element,{clearProps:'transform'});};
}

/** Pointer-following radial spotlight via CSS custom properties (--mx/--my). */
export function spotlight(root:HTMLElement,selector:string){
 if(!window.matchMedia('(hover:hover) and (pointer:fine)').matches)return ()=>{};
 const move=(e:PointerEvent)=>{const card=(e.target as HTMLElement|null)?.closest<HTMLElement>(selector);if(!card||!root.contains(card))return;const r=card.getBoundingClientRect();card.style.setProperty('--mx',`${e.clientX-r.left}px`);card.style.setProperty('--my',`${e.clientY-r.top}px`);};
 root.addEventListener('pointermove',move,{passive:true});
 return ()=>root.removeEventListener('pointermove',move);
}
