import {validateToken,type Chain} from './analysis';

const ORIGIN='https://api.dexscreener.com',TTL=30_000,STALE_LIMIT=10*60_000,MAX_BYTES=2*1024*1024;
type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const text=(value:unknown,max=160):string|null=>typeof value==='string'&&value.trim()?value.slice(0,max):null;
const finite=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const positive=(value:unknown):number|null=>{const n=typeof value==='string'&&value.length<=80&&/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)?Number(value):finite(value);return n!==null&&Number.isFinite(n)&&n>=0?n:null;};
const addressKey=(chain:Chain,address:string)=>`${chain}:${chain==='solana'?address:address.toLowerCase()}`;
export type DiscoveryProfile={chain:Chain;address:string;description:string;name:string|null;symbol:string|null;priceUsd:number|null;liquidityUsd:number|null;volume24hUsd:number|null;priceChange24h:number|null;pairAddress:string|null;pairCreatedAt:string|null;pairAgeSeconds:number|null;marketFetchedAt:string|null;marketStatus:'available'|'unavailable'|'stale'};
export type DiscoveryResponse={tokens:DiscoveryProfile[];fetchedAt:string;servedAt:string;source:'DEX Screener latest token profiles';providerResponseAt:string|null;providerCacheAgeSeconds:number|null;sourcePublishedAt:null;cache:{status:'fresh'|'cached'|'stale';ageSeconds:number;ttlSeconds:30};refreshAfterMs:number;partial:boolean;warnings:string[]};
export class DiscoveryUnavailable extends Error{constructor(public retryAfterMs:number,public rateLimited=false){super('Recent token profiles are unavailable. You can still scan an address.');}}
type Snapshot=Omit<DiscoveryResponse,'servedAt'|'cache'|'refreshAfterMs'>;
type Payload={value:unknown;fetchedAt:string;providerResponseAt:string|null;providerCacheAgeSeconds:number|null};

export function parseDiscoveryProfiles(value:unknown):DiscoveryProfile[]{
 if(!Array.isArray(value))throw new Error('Invalid profile feed');
 const seen=new Set<string>(),profiles:DiscoveryProfile[]=[];
 for(const valueRow of value.slice(0,1000)){
  const row=object(valueRow);if(typeof row.chainId!=='string'||typeof row.tokenAddress!=='string'||validateToken(row.chainId,row.tokenAddress))continue;
  const chain=row.chainId as Chain,address=chain==='solana'?row.tokenAddress:row.tokenAddress.toLowerCase(),key=addressKey(chain,address);
  if(seen.has(key))continue;seen.add(key);
  profiles.push({chain,address,description:text(row.description)||'',name:null,symbol:null,priceUsd:null,liquidityUsd:null,volume24hUsd:null,priceChange24h:null,pairAddress:null,pairCreatedAt:null,pairAgeSeconds:null,marketFetchedAt:null,marketStatus:'unavailable'});
  if(profiles.length===18)break;
 }
 return profiles;
}

/** Most-liquid matching base-token pair, never token creation or profile age. */
export function enrichDiscoveryProfile(profile:DiscoveryProfile,value:unknown,fetchedAt:string,now:number):DiscoveryProfile{
 if(!Array.isArray(value))throw new Error('Invalid market batch');
 const pair=value.slice(0,1000).map(object).filter(row=>row.chainId===profile.chain&&typeof object(row.baseToken).address==='string'&&addressKey(profile.chain,String(object(row.baseToken).address))===addressKey(profile.chain,profile.address)).sort((a,b)=>(positive(object(b.liquidity).usd)??-1)-(positive(object(a.liquidity).usd)??-1))[0];
 if(!pair)return profile;
 const base=object(pair.baseToken),created=finite(pair.pairCreatedAt),validCreated=created!==null&&Number.isSafeInteger(created)&&created>=Date.UTC(2009,0,1)&&created<=now?created:null;
 return {...profile,name:text(base.name,100),symbol:text(base.symbol,32),priceUsd:positive(pair.priceUsd),liquidityUsd:positive(object(pair.liquidity).usd),volume24hUsd:positive(object(pair.volume).h24),priceChange24h:finite(object(pair.priceChange).h24),pairAddress:typeof pair.pairAddress==='string'&&!validateToken(profile.chain,pair.pairAddress)?pair.pairAddress:null,pairCreatedAt:validCreated===null?null:new Date(validCreated).toISOString(),pairAgeSeconds:validCreated===null?null:Math.floor((now-validCreated)/1000),marketFetchedAt:fetchedAt,marketStatus:'available'};
}

async function boundedJson(response:Response):Promise<unknown>{
 const size=Number(response.headers.get('content-length'));if(Number.isFinite(size)&&size>MAX_BYTES){await response.body?.cancel();throw Error('Response too large');}
 if(!response.body)throw Error('Empty response');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>MAX_BYTES){await reader.cancel();throw Error('Response too large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(data));
}
function waitForConsumer<T>(task:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return task;signal.throwIfAborted();
 return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});task.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}

/** Shared thirty-second server cache and single flight bound upstream work even
 * when many browser tabs poll. Cancellation detaches one consumer; the bounded
 * shared fetch may still finish for other consumers. No upstream cache busting. */
export function createDiscoveryService(deps:{fetcher?:typeof fetch;now?:()=>number}={}){
 const now=deps.now||Date.now,fetcher=deps.fetcher||fetch;
 let last:Snapshot|undefined,lastAt=0,nextAttemptAt=0,cooldownUntil=0,flight:Promise<Snapshot>|undefined;
 const request=async(path:string,signal:AbortSignal):Promise<Payload>=>{
  if(now()<cooldownUntil)throw new DiscoveryUnavailable(cooldownUntil-now(),true);
  const response=await fetcher(ORIGIN+path,{headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal});
  if(response.status===429){
   const retry=response.headers.get('retry-after'),seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Number(retry)*1000:NaN,headerDate=Date.parse(response.headers.get('date')||''),until=Date.parse(retry||'');
   const delay=Number.isFinite(seconds)?seconds:Number.isFinite(until)?Math.max(0,until-(Number.isFinite(headerDate)?headerDate:now())):60_000;
   cooldownUntil=Math.max(cooldownUntil,now()+(Number.isSafeInteger(delay)?delay:60_000));await response.body?.cancel();throw new DiscoveryUnavailable(cooldownUntil-now(),true);
  }
  if(!response.ok){await response.body?.cancel();throw new DiscoveryUnavailable(TTL);}
  const value=await boundedJson(response),captured=now(),date=Date.parse(response.headers.get('date')||''),age=response.headers.get('age');
  return {value,fetchedAt:new Date(captured).toISOString(),providerResponseAt:Number.isFinite(date)?new Date(date).toISOString():null,providerCacheAgeSeconds:age!==null&&/^\d+$/.test(age)&&Number.isSafeInteger(Number(age))?Number(age):null};
 };
 const refresh=async():Promise<Snapshot>=>{
  const signal=AbortSignal.timeout(20_000),profiles=await request('/token-profiles/latest/v1',signal),tokens=parseDiscoveryProfiles(profiles.value),chains=[...new Set(tokens.map(t=>t.chain))],warnings:string[]=[];
  const batches=await Promise.allSettled(chains.map(async chain=>({chain,payload:await request(`/tokens/v1/${chain}/${tokens.filter(t=>t.chain===chain).map(t=>encodeURIComponent(t.address)).join(',')}`,signal)})));
  let enriched=[...tokens];
  for(let i=0;i<batches.length;i++){
   const batch=batches[i],chain=chains[i];
   if(batch.status==='fulfilled'&&Array.isArray(batch.value.payload.value)){
    enriched=enriched.map(profile=>profile.chain===chain?enrichDiscoveryProfile(profile,batch.value.payload.value,batch.value.payload.fetchedAt,now()):profile);
   }else{
    warnings.push(`${chain} market enrichment is unavailable; profile results remain visible.`);
    enriched=enriched.map(profile=>{if(profile.chain!==chain)return profile;const previous=last?.tokens.find(t=>addressKey(t.chain,t.address)===addressKey(profile.chain,profile.address));return previous?.marketFetchedAt?{...previous,description:profile.description,marketStatus:'stale'}:profile;});
   }
  }
  if(enriched.some(t=>t.marketStatus==='unavailable'))warnings.push('Some profiles have no matching base-token market pair. Pair age and market values remain unavailable.');
  const snapshot:Snapshot={tokens:enriched,fetchedAt:profiles.fetchedAt,source:'DEX Screener latest token profiles',providerResponseAt:profiles.providerResponseAt,providerCacheAgeSeconds:profiles.providerCacheAgeSeconds,sourcePublishedAt:null,partial:warnings.length>0,warnings};
  last=snapshot;lastAt=now();nextAttemptAt=lastAt+TTL;return snapshot;
 };
 const present=(snapshot:Snapshot,status:DiscoveryResponse['cache']['status'],extraWarnings:string[]=[]):DiscoveryResponse=>{
  const captured=now();return {...structuredClone(snapshot),tokens:snapshot.tokens.map(token=>({...token,pairAgeSeconds:token.pairCreatedAt?Math.max(0,Math.floor((captured-Date.parse(token.pairCreatedAt))/1000)):null})),servedAt:new Date(captured).toISOString(),cache:{status,ageSeconds:Math.max(0,Math.floor((captured-Date.parse(snapshot.fetchedAt))/1000)),ttlSeconds:30},refreshAfterMs:Math.max(TTL,cooldownUntil-captured,nextAttemptAt-captured),partial:snapshot.partial||status==='stale',warnings:[...snapshot.warnings,...extraWarnings]};
 };
 return {async get(options:{signal?:AbortSignal}={}):Promise<DiscoveryResponse>{
  options.signal?.throwIfAborted();
  const time=now(),hasRecent=last&&time>=lastAt&&time-lastAt<STALE_LIMIT;
  if(hasRecent&&time-lastAt<TTL)return present(last!,'cached');
  if(time<Math.max(nextAttemptAt,cooldownUntil)){
   if(hasRecent)return present(last!,'stale',['Discovery refresh is temporarily unavailable. The last successful profile snapshot is retained.']);
   throw new DiscoveryUnavailable(Math.max(TTL,nextAttemptAt-time,cooldownUntil-time),time<cooldownUntil);
  }
  if(!flight){
   const task=refresh();flight=task;
   task.catch(()=>{nextAttemptAt=Math.max(now()+TTL,cooldownUntil);}).finally(()=>{if(flight===task)flight=undefined;});
  }
  try{return present(await waitForConsumer(flight,options.signal),'fresh');}
  catch(error){options.signal?.throwIfAborted();if(last&&now()>=lastAt&&now()-lastAt<STALE_LIMIT)return present(last,'stale',['Discovery refresh failed. The last successful profile snapshot is retained with its original timestamp.']);throw error instanceof DiscoveryUnavailable?error:new DiscoveryUnavailable(TTL);}
 }};
}
