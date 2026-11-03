/** Cross-network pair chronology. A pool's creation time is not token birth
 * or profile publication. Unknown times remain at the end of the feed. */
export function latestDiscoveryProfiles<T extends {chain:string;address:string;pairCreatedAt?:string|null}>(rows:readonly T[]):T[]{
 const at=(row:T)=>{const n=row.pairCreatedAt?Date.parse(row.pairCreatedAt):NaN;return Number.isFinite(n)&&n>0?n:-Infinity;};
 return [...rows].sort((a,b)=>{
  const first=at(a),second=at(b);
  return first!==second?first>second?-1:1:`${a.chain}:${a.address}`.localeCompare(`${b.chain}:${b.address}`);
 });
}
