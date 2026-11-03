import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryService,DiscoveryUnavailable,parseDiscoveryProfiles,enrichDiscoveryProfile} from '../src/lib/discovery';

const token='0x'+'a'.repeat(40),second='0x'+'b'.repeat(40),pair='0x'+'c'.repeat(40),start=Date.UTC(2026,10,2);
const profiles=()=>[{chainId:'ethereum',tokenAddress:token,description:'Public profile'}];
const market=(overrides:Record<string,unknown>={})=>({chainId:'ethereum',baseToken:{address:token,name:'Example token',symbol:'EX'},pairAddress:pair,pairCreatedAt:start-60_000,priceUsd:'0.0000012',liquidity:{usd:2000},volume:{h24:500},priceChange:{h24:-3.5},...overrides});

test('profile parser bounds and deduplicates chain addresses without treating profiles as new launches',()=>{
 const rows=[...profiles(),{chainId:'ethereum',tokenAddress:token.toUpperCase().replace('0X','0x')},{chainId:'unsupported',tokenAddress:token},{chainId:'solana',tokenAddress:'A'.repeat(32)},{chainId:'solana',tokenAddress:'a'.repeat(32)}];
 const parsed=parseDiscoveryProfiles(rows);assert.equal(parsed.length,3);assert.equal(parsed[0].address,token);assert.equal(parsed[0].pairCreatedAt,null);assert.equal(parsed[0].name,null);
 const many=Array.from({length:40},(_,i)=>({chainId:'base',tokenAddress:'0x'+i.toString(16).padStart(40,'0'),description:'x'.repeat(200)}));assert.equal(parseDiscoveryProfiles(many).length,18);assert.equal(parseDiscoveryProfiles(many)[0].description.length,160);assert.throws(()=>parseDiscoveryProfiles({error:'bad'}));
});
test('market enrichment binds chain and base-token, selecting most-liquid pair with pair-only age',()=>{
 const profile=parseDiscoveryProfiles(profiles())[0];
 const result=enrichDiscoveryProfile(profile,[market(),market({liquidity:{usd:3000},pairCreatedAt:start-120000}),market({chainId:'base',liquidity:{usd:999999}}),market({baseToken:{address:second},quoteToken:{address:token},liquidity:{usd:999999}})],new Date(start).toISOString(),start);
 assert.equal(result.name,'Example token');assert.equal(result.symbol,'EX');assert.equal(result.pairAgeSeconds,120);assert.equal(result.liquidityUsd,3000);assert.equal(result.priceUsd,.0000012);assert.equal(result.priceChange24h,-3.5);assert.equal(result.marketStatus,'available');assert.equal(result.pairCreatedAt,new Date(start-120000).toISOString());
});
test('future, malformed and second-unit creation timestamps remain unavailable instead of age zero',()=>{
 const profile=parseDiscoveryProfiles(profiles())[0];
 for(const pairCreatedAt of [start+1,Math.floor(start/1000),'yesterday',NaN,null])assert.equal(enrichDiscoveryProfile(profile,[market({pairCreatedAt})],'capture',start).pairAgeSeconds,null);
 const result=enrichDiscoveryProfile(profile,[market({priceUsd:'',liquidity:{usd:-1},volume:{h24:null},priceChange:{h24:'bad'},pairAddress:'https://bad.invalid'})],'capture',start);assert.equal(result.priceUsd,null);assert.equal(result.liquidityUsd,null);assert.equal(result.volume24hUsd,null);assert.equal(result.priceChange24h,null);assert.equal(result.pairAddress,null);
 const zero=enrichDiscoveryProfile(profile,[market({priceUsd:'0',liquidity:{usd:0},volume:{h24:0}})],'capture',start);assert.equal(zero.priceUsd,0);assert.equal(zero.liquidityUsd,0);
});
test('one profile request and one bounded market batch per chain preserve feed order',async()=>{
 const urls:string[]=[];
 const service=createDiscoveryService({now:()=>start,fetcher:async(url,options)=>{urls.push(String(url));assert.equal(options?.cache,'no-store');assert.equal(options?.redirect,'error');if(String(url).includes('token-profiles'))return Response.json([...profiles(),{chainId:'ethereum',tokenAddress:second},{chainId:'base',tokenAddress:token}]);return Response.json(String(url).includes('/ethereum/')?[market(),market({baseToken:{address:second,name:'Second',symbol:'SEC'}})]:[market({chainId:'base'})]);}});
 const result=await service.get();assert.equal(urls.length,3);assert(urls.some(url=>url.endsWith(`/ethereum/${token},${second}`)));assert.deepEqual(result.tokens.map(t=>t.chain),['ethereum','ethereum','base']);assert.equal(result.cache.status,'fresh');assert.equal(result.sourcePublishedAt,null);
});
test('cached responses preserve source capture time, update served age, and fetch again after thirty seconds',async()=>{
 let time=start,calls=0;
 const service=createDiscoveryService({now:()=>time,fetcher:async url=>{calls++;return Response.json(String(url).includes('token-profiles')?profiles():[market()],{headers:{date:new Date(start-10000).toUTCString(),age:'10'}});}});
 const first=await service.get();assert.equal(first.providerResponseAt,new Date(start-10000).toISOString());assert.equal(first.providerCacheAgeSeconds,10);
 time+=15000;const cached=await service.get();assert.equal(calls,2);assert.equal(cached.fetchedAt,first.fetchedAt);assert.notEqual(cached.servedAt,first.servedAt);assert.equal(cached.cache.status,'cached');assert.equal(cached.cache.ageSeconds,15);assert.equal(cached.tokens[0].pairAgeSeconds,75);
 time+=15001;const fresh=await service.get();assert.equal(calls,4);assert.equal(fresh.cache.status,'fresh');assert.notEqual(fresh.fetchedAt,first.fetchedAt);
});
test('simultaneous consumers share one upstream fetch and cancelling one does not cancel the other',async()=>{
 let resolve!:()=>void,calls=0;const gate=new Promise<void>(done=>{resolve=done;});
 const service=createDiscoveryService({now:()=>start,fetcher:async url=>{calls++;if(String(url).includes('token-profiles')){await gate;return Response.json(profiles());}return Response.json([market()]);}});
 const controller=new AbortController(),a=service.get({signal:controller.signal}),b=service.get();controller.abort(Error('Cancelled'));await assert.rejects(a,/Cancelled/);resolve();const result=await b;assert.equal(calls,2);assert.equal(result.tokens[0].symbol,'EX');
});
test('profile failure returns last successful snapshot with original timestamp and stale status',async()=>{
 let time=start,fail=false,calls=0;
 const service=createDiscoveryService({now:()=>time,fetcher:async url=>{calls++;if(fail)throw Error('private diagnostics');return Response.json(String(url).includes('token-profiles')?profiles():[market()]);}});
 const first=await service.get();time+=31000;fail=true;const stale=await service.get();assert.equal(stale.fetchedAt,first.fetchedAt);assert.equal(stale.cache.status,'stale');assert.equal(stale.partial,true);assert.equal(stale.tokens[0].name,'Example token');assert(!JSON.stringify(stale).includes('private diagnostics'));
 await service.get();assert.equal(calls,3,'Failed refresh must not immediately repeat');time+=600001;await assert.rejects(service.get(),DiscoveryUnavailable);
});
test('partial market failure preserves fresh profiles and labels older enrichment as stale',async()=>{
 let time=start,fail=false;
 const service=createDiscoveryService({now:()=>time,fetcher:async url=>{if(String(url).includes('token-profiles'))return Response.json(profiles());if(fail)return new Response('',{status:503});return Response.json([market()]);}});
 const first=await service.get();time+=31000;fail=true;const partial=await service.get();assert.equal(partial.cache.status,'fresh');assert.equal(partial.partial,true);assert.equal(partial.tokens[0].marketStatus,'stale');assert.equal(partial.tokens[0].marketFetchedAt,first.tokens[0].marketFetchedAt);assert.equal(partial.tokens[0].liquidityUsd,2000);
});
test('rate limits honor numeric and HTTP-date Retry-After without repeated provider requests',async()=>{
 for(const retry of ['90',new Date(start+90000).toUTCString()]){
  let calls=0,time=start;
  const service=createDiscoveryService({now:()=>time,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':retry,date:new Date(start).toUTCString()}});}});
  await assert.rejects(service.get(),(error:unknown)=>error instanceof DiscoveryUnavailable&&error.rateLimited&&error.retryAfterMs===90000);time+=10000;await assert.rejects(service.get(),(error:unknown)=>error instanceof DiscoveryUnavailable&&error.retryAfterMs===80000);assert.equal(calls,1);
 }
});
test('invalid or oversized profile responses fail closed while valid empty feed remains empty',async()=>{
 for(const response of [()=>Response.json({error:'upstream'}),()=>new Response('x'.repeat(2*1024*1024+1))]){
  const service=createDiscoveryService({fetcher:async()=>response()});await assert.rejects(service.get(),DiscoveryUnavailable);
 }
 let calls=0;const empty=createDiscoveryService({fetcher:async()=>{calls++;return Response.json([]);}});const result=await empty.get();assert.equal(result.tokens.length,0);assert.equal(result.partial,false);assert.equal(calls,1);
});
test('pre-cancelled consumer performs no upstream requests',async()=>{
 let calls=0;const service=createDiscoveryService({fetcher:async()=>{calls++;return Response.json([]);}}),controller=new AbortController();controller.abort(Error('Cancel'));await assert.rejects(service.get({signal:controller.signal}),/Cancel/);assert.equal(calls,0);
});
