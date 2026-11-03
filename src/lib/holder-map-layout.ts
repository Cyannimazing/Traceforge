export type HolderMapPoint={share:number|null};
export type HolderMapGeometry={x:number;y:number;radius:number};

/** One common area scale, apart from the explicit minimum marker. Padding and
 * separation reserve room for the map's bounded five-pixel decorative drift.
 * Deterministic shelf packing is a guaranteed fallback, never dropped holders. */
export function layoutHolderMap(holders:readonly HolderMapPoint[],width=700,height=400):HolderMapGeometry[]{
 if(!holders.length)return [];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<160||height<160||holders.length>100)throw Error('Unsupported holder map dimensions or count.');
 const padding=32,gap=14,minRadius=7,w=width-padding*2,h=height-padding*2;
 const weights=holders.map(holder=>typeof holder.share==='number'&&Number.isFinite(holder.share)&&holder.share>0?holder.share:0);
 const maximum=Math.max(...weights,0),order=weights.map((_,i)=>i).sort((a,b)=>weights[b]-weights[a]||a-b);
 function pack(scale:number):HolderMapGeometry[]|null{
  const radii=weights.map(weight=>Math.max(minRadius,Math.sqrt(weight)*scale));
  const rows:{indices:number[];width:number;height:number}[]=[];let row={indices:[] as number[],width:0,height:0};
  for(const i of order){const diameter=radii[i]*2;if(diameter>w||diameter>h)return null;if(row.indices.length&&row.width+gap+diameter>w){rows.push(row);row={indices:[],width:0,height:0};}row.width+=(row.indices.length?gap:0)+diameter;row.height=Math.max(row.height,diameter);row.indices.push(i);}
  if(row.indices.length)rows.push(row);const total=rows.reduce((sum,r)=>sum+r.height,0)+gap*(rows.length-1);if(total>h)return null;
  const result:HolderMapGeometry[]=new Array(holders.length);let top=(height-total)/2;
  rows.forEach((row,index)=>{let left=(width-row.width)/2;const indices=index%2?[...row.indices].reverse():row.indices;for(const i of indices){result[i]={x:left+radii[i],y:top+row.height/2,radius:radii[i]};left+=radii[i]*2+gap;}top+=row.height+gap;});return result;
 }
 let low=0,high=maximum?Math.min(92,w/2,h/2)/Math.sqrt(maximum):0,best=pack(0);
 if(!best)throw Error('Holder markers cannot fit the supplied dimensions.');
 for(let pass=0;pass<40&&high>0;pass++){const mid=(low+high)/2,candidate=pack(mid);if(candidate){low=mid;best=candidate;}else high=mid;}
 // Start from a spatially neutral spiral, then relax only if every result can
 // meet the same bounds and separation guarantees as the fallback packing.
 const relaxed=best.map((node,index)=>{const angle=index*Math.PI*(3-Math.sqrt(5))-.7,fraction=Math.sqrt((index+.3)/holders.length);return {...node,x:width/2+Math.cos(angle)*(w/2-node.radius)*fraction,y:height/2+Math.sin(angle)*(h/2-node.radius)*fraction};});
 for(let pass=0;pass<160;pass++){
  for(let i=0;i<relaxed.length;i++)for(let j=i+1;j<relaxed.length;j++){const a=relaxed[i],b=relaxed[j],dx=b.x-a.x,dy=b.y-a.y,distance=Math.hypot(dx,dy),minimum=a.radius+b.radius+gap;if(distance<minimum){const shift=(minimum-distance)*.51,ux=distance?dx/distance:1,uy=distance?dy/distance:0;a.x-=ux*shift;a.y-=uy*shift;b.x+=ux*shift;b.y+=uy*shift;}}
  for(const node of relaxed){node.x=Math.max(padding+node.radius,Math.min(width-padding-node.radius,node.x));node.y=Math.max(padding+node.radius,Math.min(height-padding-node.radius,node.y));}
 }
 const safe=relaxed.every((node,i)=>relaxed.slice(i+1).every(other=>Math.hypot(node.x-other.x,node.y-other.y)>=node.radius+other.radius+gap-.001));
 return safe?relaxed:best;
}
