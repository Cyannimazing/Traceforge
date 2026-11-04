import {packSiblings,packEnclose} from 'd3-hierarchy';

export type HolderMapPoint={share:number|null};
export type HolderMapGeometry={x:number;y:number;radius:number};

/** An irregular front chain keeps wallets in one bounded, organic constellation.
 * The clearance varies, never the visual area scale. The first three holders
 * anchor the field; the remaining ranks do not dictate a row or concentric ring.
 * Every pair reserves the complete independent-motion envelope. */
export function layoutHolderMap(holders:readonly HolderMapPoint[],width=700,height=400):HolderMapGeometry[]{
 if(!holders.length)return [];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<160||height<160||holders.length>500)throw Error('Unsupported holder map dimensions or count.');
 const gap=8,fieldRadius=Math.min(width,height)/2-36;
 const minRadius=Math.min(7,700/holders.length)*Math.min(1,fieldRadius/164);
 const irregularity=2.2*Math.min(1,100/holders.length)*Math.min(1,(fieldRadius/164)**2);
 const weights=holders.map(holder=>typeof holder.share==='number'&&Number.isFinite(holder.share)&&holder.share>0?holder.share:0);
 const maximum=Math.max(...weights,0),ranked=weights.map((_,i)=>i).sort((a,b)=>weights[b]-weights[a]||a-b);
 const noise=(index:number)=>{let value=Math.imul(index+1,0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return ((value^(value>>>16))>>>0)/0xffffffff;};
 const order=[...ranked.slice(0,3),...ranked.slice(3).sort((a,b)=>noise(a)-noise(b)||a-b)];
 function pack(scale:number):HolderMapGeometry[]|null{
  const circles=order.map(index=>{const radius=Math.max(minRadius,Math.sqrt(weights[index])*scale);return {index,x:0,y:0,radius,r:radius+gap/2+noise(index)*irregularity};});
  packSiblings(circles);const enclosing=packEnclose(circles);
  if(!enclosing||enclosing.r>fieldRadius+gap/2)return null;
  const angle=.413,cos=Math.cos(angle),sin=Math.sin(angle),result:HolderMapGeometry[]=new Array(holders.length);
  for(const circle of circles){const x=circle.x-enclosing.x,y=circle.y-enclosing.y;result[circle.index]={x:width/2+x*cos-y*sin,y:height/2+x*sin+y*cos,radius:circle.radius};}
  return result;
 }
 let low=0,high=maximum?Math.min(140,fieldRadius)/Math.sqrt(maximum):0,best=pack(0);
 if(!best)throw Error('Holder markers cannot fit the supplied dimensions.');
 for(let pass=0;pass<36&&high>0;pass++){const middle=(low+high)/2,candidate=pack(middle);if(candidate){low=middle;best=candidate;}else high=middle;}
 return best;
}
