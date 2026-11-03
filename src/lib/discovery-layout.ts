export type DiscoveryContact={id:string;x:number;y:number;bearing:number};
const hash=(text:string)=>{let n=2166136261;for(const char of text){n^=char.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
/** Stable for an identical contact set. Bearings are visual slots, never chain,
 * market direction or risk. A bounded 16-contact set leaves room for touch. */
export function discoveryLayout(ids:string[]):DiscoveryContact[]{
 const sorted=[...new Set(ids)].sort((a,b)=>hash(a)-hash(b)||a.localeCompare(b)).slice(0,16);
 const points:DiscoveryContact[]=[];
 for(let index=0;index<sorted.length;index++){
  const id=sorted[index],sector=360/sorted.length;
  const bearing=(index*sector+sector*.35+((hash(`${id}:angle`)%100)/100-.5)*Math.min(8,sector*.2))%360;
  let best:DiscoveryContact|undefined,bestDistance=-1;
  // Keep the set spread around a full turn. Radial candidates break a uniform
  // ring while maximizing spacing, rather than forcing networks into wedges.
  const preferred=82+hash(`${id}:radius`)%90;
  for(const radius of [preferred,174,108,145,76]){
   const radians=bearing*Math.PI/180;
   const candidate={id,bearing,x:240+Math.sin(radians)*radius,y:240-Math.cos(radians)*radius};
   const distance=points.length?Math.min(...points.map(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y))):60;
   if(distance>=46){best=candidate;break;}
   if(distance>bestDistance){best=candidate;bestDistance=distance;}
  }
  points.push(best!);
 }
 return points;
}
