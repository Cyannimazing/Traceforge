import {validateToken,isMarketPairId,type Chain} from './analysis';
import {latestDiscoveryProfiles} from './discovery-order';

const ORIGIN='https://api.dexscreener.com',TTL=30_000,STALE_LIMIT=10*60_000,MAX_BYTES=2*1024*1024;
const GECKO_ORIGIN='https://api.geckoterminal.com',NETWORKS={ethereum:'eth',base:'base',bsc:'bsc',solana:'solana',robinhood:'robinhood'} as const;
const CHAINS=Object.keys(NETWORKS) as Chain[];
// Address identities, never user-controlled symbols. Deployment references:
// developers.circle.com/stablecoins/usdc-contract-addresses,
// docs.base.org/specifications/reference/base-contracts,
// github.com/pancakeswap/pancake-info-api/blob/develop/v2-documentation.md,
// solana.com/docs/tokens/basics/sync-native. This is a discovery orientation
// preference, not a claim that stablecoins or wrapped assets are risk-free.
const COMMON_QUOTES:Record<Chain,Set<string>>={
 ethereum:new Set(['0x0000000000000000000000000000000000000000','0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2','0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48']),
 base:new Set(['0x0000000000000000000000000000000000000000','0x4200000000000000000000000000000000000006','0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']),
 bsc:new Set(['0x0000000000000000000000000000000000000000','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c']),
 solana:new Set(['So11111111111111111111111111111111111111112','EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']),
 robinhood:new Set(['0x0000000000000000000000000000000000000000']),
};
type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
const text=(value:unknown,max=160):string|null=>typeof value==='string'&&value.trim()?value.slice(0,max):null;
const finite=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:null;
const positive=(value:unknown):number|null=>{const n=typeof value==='string'&&value.length<=80&&/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)?Number(value):finite(value);return n!==null&&Number.isFinite(n)&&n>=0?n:null;};
const addressKey=(chain:Chain,address:string)=>`${chain}:${chain==='solana'?address:address.toLowerCase()}`;
export type DiscoveryProfile={chain:Chain;address:string;description:string;name:string|null;symbol:string|null;priceUsd:number|null;liquidityUsd:number|null;volume24hUsd:number|null;priceChange24h:number|null;pairAddress:string|null;pairCreatedAt:string|null;pairAgeSeconds:number|null;marketFetchedAt:string|null;marketStatus:'available'|'unavailable'|'stale';source?:'DEX Screener latest token profiles'|'GeckoTerminal new pools';marketSource?:'DEX Screener'|'GeckoTerminal'};
export type DiscoverySource={name:'DEX Screener latest token profiles'|'GeckoTerminal new pools';chain?:Chain;status:'available'|'unavailable';fetchedAt:string|null;providerResponseAt:string|null;providerCacheAgeSeconds:number|null};
export type DiscoveryResponse={tokens:DiscoveryProfile[];fetchedAt:string;servedAt:string;source:'DEX Screener latest token profiles'|'DEX Screener profiles + GeckoTerminal new pools';sources?:DiscoverySource[];providerResponseAt:string|null;providerCacheAgeSeconds:number|null;sourcePublishedAt:null;cache:{status:'fresh'|'cached'|'stale';ageSeconds:number;ttlSeconds:30};refreshAfterMs:number;partial:boolean;warnings:string[]};
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
  profiles.push({chain,address,description:text(row.description)||'',name:null,symbol:null,priceUsd:null,liquidityUsd:null,volume24hUsd:null,priceChange24h:null,pairAddress:null,pairCreatedAt:null,pairAgeSeconds:null,marketFetchedAt:null,marketStatus:'unavailable',source:'DEX Screener latest token profiles'});
  if(profiles.length===18)break;
 }
 return profiles;
}

/** Official network new_pools feed. A pool creation time is neither token birth
 * nor a token-profile publication time. Included metadata must match its ID.
 * https://docs.coingecko.com/reference/latest-pools-network */
export function parseDiscoveryPools(value:unknown,chain:Chain,fetchedAt:string,now:number):DiscoveryProfile[]{
 const payload=object(value);if(!Array.isArray(payload.data))throw Error('Invalid network pool feed');
 const network=NETWORKS[chain],prefix=`${network}_`,included=new Map<string,Row>();
 for(const raw of (Array.isArray(payload.included)?payload.included:[]).slice(0,1000)){const row=object(raw);if(row.type==='token'&&typeof row.id==='string')included.set(row.id,row);}
 const result:DiscoveryProfile[]=[];
 for(const raw of payload.data.slice(0,100)){
  const row=object(raw),a=object(row.attributes),relations=object(row.relationships);
  if(row.type!=='pool'||typeof a.address!=='string'||row.id!==prefix+a.address)continue;
  const member=(side:'base_token'|'quote_token')=>{const relation=object(object(relations[side]).data),id=relation.id;if(relation.type!=='token'||typeof id!=='string'||!id.startsWith(prefix))return null;const attributes=object(included.get(id)?.attributes),address=attributes.address;return typeof address==='string'&&!validateToken(chain,address)&&id===prefix+address?{attributes,address}:null;};
  const base=member('base_token'),quote=member('quote_token'),common=(address:string)=>COMMON_QUOTES[chain].has(chain==='solana'?address:address.toLowerCase());
  if(!base)continue;
  const reversed=common(base.address),chosen=reversed?quote:base;
  if(!chosen||common(chosen.address))continue;
  const address=chosen.address,metadata=chosen.attributes;
  if(validateToken(chain,a.address)&&!(chain!=='solana'&&/^0x[0-9a-f]{64}$/i.test(a.address)))continue;
  const created=typeof a.pool_created_at==='string'?Date.parse(a.pool_created_at):NaN,validCreated=Number.isFinite(created)&&created>=Date.UTC(2009,0,1)&&created<=now?created:null;
  const change=object(a.price_change_percentage).h24,changeNumber=typeof change==='string'&&/^-?\d+(?:\.\d+)?$/.test(change)?Number(change):finite(change);
  result.push({chain,address:chain==='solana'?address:address.toLowerCase(),description:'Recently indexed pool. Pool creation does not establish token launch or safety.',name:text(metadata.name,100),symbol:text(metadata.symbol,32),priceUsd:positive(reversed?a.quote_token_price_usd:a.base_token_price_usd),liquidityUsd:positive(a.reserve_in_usd),volume24hUsd:positive(object(a.volume_usd).h24),priceChange24h:!reversed&&changeNumber!==null&&Number.isFinite(changeNumber)?changeNumber:null,pairAddress:a.address,pairCreatedAt:validCreated===null?null:new Date(validCreated).toISOString(),pairAgeSeconds:validCreated===null?null:Math.floor((now-validCreated)/1000),marketFetchedAt:fetchedAt,marketStatus:'available',source:'GeckoTerminal new pools',marketSource:'GeckoTerminal'});
 }
 const seen=new Set<string>();return latestDiscoveryProfiles(result).filter(profile=>{const key=addressKey(chain,profile.address);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,20);
}

/** Most-liquid matching base-token pair, never token creation or profile age. */
export function enrichDiscoveryProfile(profile:DiscoveryProfile,value:unknown,fetchedAt:string,now:number):DiscoveryProfile{
 if(!Array.isArray(value))throw new Error('Invalid market batch');
 const pair=value.slice(0,1000).map(object).filter(row=>row.chainId===profile.chain&&typeof object(row.baseToken).address==='string'&&addressKey(profile.chain,String(object(row.baseToken).address))===addressKey(profile.chain,profile.address)).sort((a,b)=>(positive(object(b.liquidity).usd)??-1)-(positive(object(a.liquidity).usd)??-1))[0];
 if(!pair)return profile;
 const base=object(pair.baseToken),created=finite(pair.pairCreatedAt),validCreated=created!==null&&Number.isSafeInteger(created)&&created>=Date.UTC(2009,0,1)&&created<=now?created:null;
 return {...profile,name:text(base.name,100),symbol:text(base.symbol,32),priceUsd:positive(pair.priceUsd),liquidityUsd:positive(object(pair.liquidity).usd),volume24hUsd:positive(object(pair.volume).h24),priceChange24h:finite(object(pair.priceChange).h24),pairAddress:isMarketPairId(profile.chain,pair.pairAddress)?pair.pairAddress:null,pairCreatedAt:validCreated===null?null:new Date(validCreated).toISOString(),pairAgeSeconds:validCreated===null?null:Math.floor((now-validCreated)/1000),marketFetchedAt:fetchedAt,marketStatus:'available',marketSource:'DEX Screener'};
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
 let last:Snapshot|undefined,lastAt=0,nextAttemptAt=0,flight:Promise<Snapshot>|undefined;
 const cooldowns=new Map<string,number>();
 const retainMarket=(at:string|null|undefined)=>{const age=at?now()-Date.parse(at):NaN;return Number.isFinite(age)&&age>=0&&age<STALE_LIMIT;};
 const request=async(origin:string,path:string,signal:AbortSignal):Promise<Payload>=>{
  signal.throwIfAborted();const cooldownUntil=cooldowns.get(origin)||0;
  if(now()<cooldownUntil)throw new DiscoveryUnavailable(cooldownUntil-now(),true);
  const response=await fetcher(origin+path,{headers:{Accept:'application/json'},cache:'no-store',redirect:'error',signal});
  if(response.status===429){
   const retry=response.headers.get('retry-after'),seconds=retry&&/^\d+(?:\.\d+)?$/.test(retry)?Number(retry)*1000:NaN,headerDate=Date.parse(response.headers.get('date')||''),until=Date.parse(retry||'');
   const delay=Number.isFinite(seconds)?seconds:Number.isFinite(until)?Math.max(0,until-(Number.isFinite(headerDate)?headerDate:now())):60_000;
   const untilTime=Math.max(cooldowns.get(origin)||0,now()+(Number.isSafeInteger(delay)?delay:60_000));cooldowns.set(origin,untilTime);await response.body?.cancel();throw new DiscoveryUnavailable(untilTime-now(),true);
  }
  if(!response.ok){await response.body?.cancel();throw new DiscoveryUnavailable(TTL);}
  const value=await boundedJson(response),captured=now(),date=Date.parse(response.headers.get('date')||''),age=response.headers.get('age');
  return {value,fetchedAt:new Date(captured).toISOString(),providerResponseAt:Number.isFinite(date)?new Date(date).toISOString():null,providerCacheAgeSeconds:age!==null&&/^\d+$/.test(age)&&Number.isSafeInteger(Number(age))?Number(age):null};
 };
 const boundedJobs=async<T>(jobs:(()=>Promise<T>)[]):Promise<PromiseSettledResult<T>[]>=>{
  const results:PromiseSettledResult<T>[]=new Array(jobs.length);let cursor=0;
  await Promise.all(Array.from({length:Math.min(2,jobs.length)},async()=>{for(;;){const i=cursor++;if(i>=jobs.length)return;try{results[i]={status:'fulfilled',value:await jobs[i]()};}catch(reason){results[i]={status:'rejected',reason};}}}));return results;
 };
 const refresh=async():Promise<Snapshot>=>{
  const signal=AbortSignal.timeout(20_000),warnings:string[]=[],sources:DiscoverySource[]=[],failures:unknown[]=[];
  const feeds=await boundedJobs([
   async()=>{const payload=await request(ORIGIN,'/token-profiles/latest/v1',signal);return {payload,tokens:parseDiscoveryProfiles(payload.value)};},
   ...CHAINS.map(chain=>async()=>{const payload=await request(GECKO_ORIGIN,`/api/v2/networks/${NETWORKS[chain]}/new_pools?include=base_token,quote_token,dex&page=1`,signal);return {payload,tokens:parseDiscoveryPools(payload.value,chain,payload.fetchedAt,now())};}),
  ]);
  for(let i=0;i<feeds.length;i++){
   const feed=feeds[i],chain=i?CHAINS[i-1]:undefined,name=i?'GeckoTerminal new pools' as const:'DEX Screener latest token profiles' as const;
   if(feed.status==='fulfilled')sources.push({name,chain,status:'available',fetchedAt:feed.value.payload.fetchedAt,providerResponseAt:feed.value.payload.providerResponseAt,providerCacheAgeSeconds:feed.value.payload.providerCacheAgeSeconds});
   else {failures.push(feed.reason);sources.push({name,chain,status:'unavailable',fetchedAt:null,providerResponseAt:null,providerCacheAgeSeconds:null});warnings.push(i?`${chain} new-pool feed is unavailable; retained rows keep their original market timestamp.`:'DEX Screener profile feed is unavailable; network pool results remain available.');}
  }
  if(feeds.every(feed=>feed.status==='rejected'))throw failures.find(error=>error instanceof DiscoveryUnavailable&&error.rateLimited)||new DiscoveryUnavailable(TTL);
  const profiles=feeds[0],tokens=profiles.status==='fulfilled'?profiles.value.tokens:[],chains=[...new Set(tokens.map(t=>t.chain))];
  const batches=await boundedJobs(chains.map(chain=>async()=>({chain,payload:await request(ORIGIN,`/tokens/v1/${chain}/${tokens.filter(t=>t.chain===chain).map(t=>encodeURIComponent(t.address)).join(',')}`,signal)})));
  let enriched=[...tokens];
  for(let i=0;i<batches.length;i++){
   const batch=batches[i],chain=chains[i];
   if(batch.status==='fulfilled'&&Array.isArray(batch.value.payload.value)){
    enriched=enriched.map(profile=>profile.chain===chain?enrichDiscoveryProfile(profile,batch.value.payload.value,batch.value.payload.fetchedAt,now()):profile);
   }else{
    warnings.push(`${chain} market enrichment is unavailable; profile results remain visible.`);
    enriched=enriched.map(profile=>{if(profile.chain!==chain)return profile;const previous=last?.tokens.find(t=>addressKey(t.chain,t.address)===addressKey(profile.chain,profile.address));return previous&&retainMarket(previous.marketFetchedAt)?{...previous,description:profile.description,marketStatus:'stale'}:profile;});
   }
  }
  const merged=new Map(enriched.map(profile=>[addressKey(profile.chain,profile.address),profile]));
  for(let i=1;i<feeds.length;i++){
   const feed=feeds[i],chain=CHAINS[i-1];
   const additions=feed.status==='fulfilled'?feed.value.tokens:(last?.tokens.filter(t=>t.chain===chain&&retainMarket(t.marketFetchedAt))||[]).map(t=>({...t,marketStatus:'stale' as const}));
   const quality={available:2,stale:1,unavailable:0};
   for(const profile of additions){const key=addressKey(profile.chain,profile.address),previous=merged.get(key);if(!previous||quality[profile.marketStatus]>quality[previous.marketStatus]||(quality[profile.marketStatus]===quality[previous.marketStatus]&&latestDiscoveryProfiles([previous,profile])[0]===profile))merged.set(key,profile);}
  }
  const counts=new Map<Chain,number>();enriched=latestDiscoveryProfiles([...merged.values()]).filter(token=>{const count=counts.get(token.chain)||0;if(count>=20)return false;counts.set(token.chain,count+1);return true;});
  if(enriched.some(t=>t.marketStatus==='unavailable'))warnings.push('Some profiles have no matching base-token market pair. Pair age and market values remain unavailable.');
  const metadata=profiles.status==='fulfilled'?profiles.value.payload:null;
  const snapshot:Snapshot={tokens:enriched,fetchedAt:new Date(now()).toISOString(),source:'DEX Screener profiles + GeckoTerminal new pools',sources,providerResponseAt:metadata?.providerResponseAt??null,providerCacheAgeSeconds:metadata?.providerCacheAgeSeconds??null,sourcePublishedAt:null,partial:warnings.length>0,warnings};
  last=snapshot;lastAt=now();nextAttemptAt=lastAt+TTL;return snapshot;
 };
 const present=(snapshot:Snapshot,status:DiscoveryResponse['cache']['status'],extraWarnings:string[]=[]):DiscoveryResponse=>{
  const captured=now();return {...structuredClone(snapshot),tokens:snapshot.tokens.map(token=>({...token,pairAgeSeconds:token.pairCreatedAt?Math.max(0,Math.floor((captured-Date.parse(token.pairCreatedAt))/1000)):null})),servedAt:new Date(captured).toISOString(),cache:{status,ageSeconds:Math.max(0,Math.floor((captured-Date.parse(snapshot.fetchedAt))/1000)),ttlSeconds:30},refreshAfterMs:Math.max(TTL,nextAttemptAt-captured),partial:snapshot.partial||status==='stale',warnings:[...snapshot.warnings,...extraWarnings]};
 };
 return {async get(options:{signal?:AbortSignal}={}):Promise<DiscoveryResponse>{
  options.signal?.throwIfAborted();
  const time=now(),hasRecent=last&&time>=lastAt&&time-lastAt<STALE_LIMIT;
  if(hasRecent&&time-lastAt<TTL)return present(last!,'cached');
  if(time<nextAttemptAt){
   if(hasRecent)return present(last!,'stale',['Discovery refresh is temporarily unavailable. The last successful profile snapshot is retained.']);
   throw new DiscoveryUnavailable(Math.max(TTL,nextAttemptAt-time),[...cooldowns.values()].some(until=>time<until));
  }
  if(!flight){
   const task=refresh();flight=task;
   task.catch(()=>{nextAttemptAt=Math.max(now()+TTL,...cooldowns.values());}).finally(()=>{if(flight===task)flight=undefined;});
  }
  try{return present(await waitForConsumer(flight,options.signal),'fresh');}
  catch(error){options.signal?.throwIfAborted();if(last&&now()>=lastAt&&now()-lastAt<STALE_LIMIT)return present(last,'stale',['Discovery refresh failed. The last successful profile snapshot is retained with its original timestamp.']);throw error instanceof DiscoveryUnavailable?error:new DiscoveryUnavailable(TTL);}
 }};
}
