import {packSiblings,packEnclose} from 'd3-hierarchy';

export type HolderMapPoint={share:number|null};
export type HolderMapGeometry={x:number;y:number;radius:number};

/** Front-chain circle packing keeps every wallet in one bounded constellation.
 * One common area scale preserves holding ratios above the minimum marker.
 * Padding reserves the complete animation envelope; there is no shelf fallback. */
export function layoutHolderMap(holders:readonly HolderMapPoint[],width=700,height=400):HolderMapGeometry[]{
 if(!holders.length)return [];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<160||height<160||holders.length>100)throw Error('Unsupported holder map dimensions or count.');
 const gap=8,minRadius=7,fieldRadius=Math.min(width,height)/2-36;
 const weights=holders.map(holder=>typeof holder.share==='number'&&Number.isFinite(holder.share)&&holder.share>0?holder.share:0);
 const maximum=Math.max(...weights,0),order=weights.map((_,i)=>i).sort((a,b)=>weights[b]-weights[a]||a-b);
 function pack(scale:number):HolderMapGeometry[]|null{
  const circles=order.map(index=>({index,x:0,y:0,r:Math.max(minRadius,Math.sqrt(weights[index])*scale)+gap/2}));
  packSiblings(circles);const enclosing=packEnclose(circles);
  if(!enclosing||enclosing.r>fieldRadius+gap/2)return null;
  const angle=.413,cos=Math.cos(angle),sin=Math.sin(angle),result:HolderMapGeometry[]=new Array(holders.length);
  for(const circle of circles){const x=circle.x-enclosing.x,y=circle.y-enclosing.y;result[circle.index]={x:width/2+x*cos-y*sin,y:height/2+x*sin+y*cos,radius:circle.r-gap/2};}
  return result;
 }
 let low=0,high=maximum?Math.min(92,fieldRadius)/Math.sqrt(maximum):0,best=pack(0);
 if(!best)throw Error('Holder markers cannot fit the supplied dimensions.');
 for(let pass=0;pass<36&&high>0;pass++){const middle=(low+high)/2,candidate=pack(middle);if(candidate){low=middle;best=candidate;}else high=middle;}
 return best;
}