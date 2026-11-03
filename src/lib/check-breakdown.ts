import type {Check} from './analysis';

/** Completed contract checks, not a safety probability or wallet-risk score. */
export function checkBreakdown(checks:Check[]){
 const priority={clear:0,unknown:1,warning:2,critical:3};
 const unique=new Map<string,Check>();
 for(const check of checks){
  // Successful decoding repeats the individual checks. Unresolved or adverse
  // extension summaries can carry the only evidence of unsupported controls.
  if(check.key==='solana_extensions'&&check.status==='clear')continue;
  const old=unique.get(check.key);if(!old||priority[check.status]>priority[old.status])unique.set(check.key,check);
 }
 const items=[...unique.values()];
 const counts=[items.filter(c=>c.status==='clear').length,items.filter(c=>c.status==='warning').length,items.filter(c=>c.status==='critical').length];
 const completed=counts.reduce((a,b)=>a+b,0),unchecked=items.filter(c=>c.status==='unknown').length;
 const exact=counts.map(n=>completed?n/completed*100:0),percentages=exact.map(Math.floor);
 const remainder=completed?100-percentages.reduce((a,b)=>a+b,0):0;
 const order=exact.map((value,index)=>({index,fraction:value-percentages[index]})).sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
 for(let i=0;i<remainder;i++)percentages[order[i].index]++;
 return {completed,unchecked,items,buckets:counts.map((count,index)=>({label:['Passed','Warning','Failed'][index],count,percent:completed?percentages[index]:null}))};
}
