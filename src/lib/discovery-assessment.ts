/** Prefer the latest retrieval without discarding a usable report on a miss. */
export function latestDiscoveryAssessment<T extends {fetchedAt:string}>(...items:(T|null|undefined)[]):T|undefined{
 let latest:T|undefined,latestAt=-Infinity;
 for(const item of items){
  if(!item)continue;
  const at=Date.parse(item.fetchedAt);
  if(!Number.isFinite(at))continue;
  if(!latest||at>latestAt){latest=item;latestAt=at;}
 }
 return latest;
}
