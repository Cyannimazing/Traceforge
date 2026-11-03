import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiscoveryService,DiscoveryUnavailable,parseDiscoveryProfiles,parseDiscoveryPools,enrichDiscoveryProfile} from '../src/lib/discovery';

const token='0x'+'a'.repeat(40),second='0x'+'b'.repeat(40),pair='0x'+'c'.repeat(40),start=Date.UTC(2026,10,2);
const profiles=()=>[{chainId:'ethereum',tokenAddress:token,description:'Public profile'}];
const market=(overrides:Record<string,unknown>={})=>({chainId:'ethereum',baseToken:{address:token,name:'Example token',symbol:'EX'},pairAddress:pair,pairCreatedAt:start-60_000,priceUsd:'0.0000012',liquidity:{usd:2000},volume:{h24:500},priceChange:{h24:-3.5},...overrides});
const poolFeed=(network='eth',address=token)=>({data:[{id:`${network}_${pair}`,type:'pool',attributes:{address:pair,pool_created_at:new Date(start-60_000).toISOString(),base_token_price_usd:'0.25',reserve_in_usd:'12000',volume_usd:{h24:'100'},price_change_percentage:{h24:'-2.5'}},relationships:{base_token:{data:{id:`${network}_${address}`,type:'token'}}}}],included:[{id:`${network}_${address}`,type:'token',attributes:{address,name:'New pool token',symbol:'NEW'}}]});

test('network pool parser binds included identity and preserves pool-only age and provenance',()=>{
 const result=parseDiscoveryPools(poolFeed(),'ethereum',new Date(start).toISOString(),start);assert.equal(result.length,1);assert.equal(result[0].address,token);assert.equal(result[0].source,'GeckoTerminal new pools');assert.equal(result[0].pairAgeSeconds,60);assert.equal(result[0].priceChange24h,-2.5);assert.equal(result[0].liquidityUsd,12000);
 assert.equal(parseDiscoveryPools(poolFeed('base'),'ethereum','capture',start).length,0);
 const mismatch=poolFeed();mismatch.included[0].attributes.address=second;assert.equal(parseDiscoveryPools(mismatch,'ethereum','capture',start).length,0);
 const future=poolFeed();future.data[0].attributes.pool_created_at=new Date(start+1000).toISOString();assert.equal(parseDiscoveryPools(future,'ethereum','capture',start)[0].pairCreatedAt,null);
});

test('network feeds supplement a Solana-only profile list with all four chains and bounded concurrency',async()=>{
 let active=0,peak=0;const urls:string[]=[];
 const service=createDiscoveryService({now:()=>start,fetcher:async url=>{const u=String(url);urls.push(u);peak=Math.max(peak,++active);await new Promise(resolve=>setTimeout(resolve,5));active--;if(u.includes('token-profiles'))return Response.json([{chainId:'solana',tokenAddress:'A'.repeat(32)}]);if(u.includes('geckoterminal')){const network=u.split('/networks/')[1].split('/')[0];return Response.json(network==='solana'?{data:[],included:[]}:poolFeed(network));}return Response.json([]);}});
 const result=await service.get();assert.equal(peak,2);assert.deepEqual(new Set(result.tokens.map(t=>t.chain)),new Set(['ethereum','base','bsc','solana']));assert.equal(urls.filter(u=>u.includes('new_pools')).length,4);assert(result.sources?.some(s=>s.name==='GeckoTerminal new pools'&&s.chain==='ethereum'));
});

test('known wrapped native base selects the genuine quote candidate without copying base price changes',()=>{
 const wrapped='0x4200000000000000000000000000000000000006',feed:any=poolFeed('base',wrapped);
 feed.data[0].relationships.quote_token={data:{id:`base_${second}`,type:'token'}};feed.data[0].attributes.quote_token_price_usd='0.003';feed.included.push({id:`base_${second}`,type:'token',attributes:{address:second,name:'Candidate',symbol:'CAND'}});
 const result=parseDiscoveryPools(feed,'base',new Date(start).toISOString(),start);assert.equal(result[0].address,second);assert.equal(result[0].priceUsd,.003);assert.equal(result[0].priceChange24h,null);assert.equal(result[0].name,'Candidate');
 feed.included[0].attributes.symbol='TOKEN';assert.equal(parseDiscoveryPools(feed,'base','capture',start)[0].address,second,'address identity, not symbol, determines common quote');
});

test('network pool feeds deduplicate candidates and cap at twenty per network',()=>{
 const feed:any={data:[],included:[]};for(let i=1;i<=30;i++){const item=poolFeed('base','0x'+i.toString(16).padStart(40,'0'));feed.data.push(...item.data,...item.data);feed.included.push(...item.included);}
 assert.equal(parseDiscoveryPools(feed,'base','capture',start).length,20);
});

test('DEX outage still serves network pools while per-network failures retain dated rows',async()=>{
 let now=start,failBase=false;
 const service=createDiscoveryService({now:()=>now,fetcher:async url=>{const u=String(url);if(u.includes('dexscreener'))return new Response('',{status:503});const network=u.split('/networks/')[1].split('/')[0];if(network==='base'&&failBase)return new Response('',{status:503});return Response.json(network==='solana'?{data:[],included:[]}:poolFeed(network),{headers:{date:new Date(start).toUTCString(),age:'12'}});}});
 const first=await service.get();assert(first.tokens.some(t=>t.chain==='base'));assert(first.warnings.some(w=>w.includes('DEX Screener')));assert.equal(first.sources?.find(s=>s.chain==='base')?.providerCacheAgeSeconds,12);
 now+=31000;failBase=true;const next=await service.get(),base=next.tokens.find(t=>t.chain==='base')!;assert.equal(base.marketStatus,'stale');assert.equal(base.marketFetchedAt,first.tokens.find(t=>t.chain==='base')?.marketFetchedAt);assert(next.warnings.some(w=>w.includes('base new-pool')));
});

test('one provider cooldown does not suppress the other provider refresh',async()=>{
 let now=start,dexCalls=0,geckoCalls=0;
 const service=createDiscoveryService({now:()=>now,fetcher:async url=>{if(String(url).includes('dexscreener')){dexCalls++;return new Response('',{status:429,headers:{'retry-after':'90'}});}geckoCalls++;return Response.json(poolFeed(String(url).split('/networks/')[1].split('/')[0]));}});
 await service.get();now+=31000;await service.get();assert.equal(dexCalls,1);assert.equal(geckoCalls,8);
});

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
test('one profile request and one bounded market batch per chain produce deterministic time-tied ordering',async()=>{
 const urls:string[]=[];
 const service=createDiscoveryService({now:()=>start,fetcher:async(url,options)=>{urls.push(String(url));assert.equal(options?.cache,'no-store');assert.equal(options?.redirect,'error');if(String(url).includes('token-profiles'))return Response.json([...profiles(),{chainId:'ethereum',tokenAddress:second},{chainId:'base',tokenAddress:token}]);return Response.json(String(url).includes('/ethereum/')?[market(),market({baseToken:{address:second,name:'Second',symbol:'SEC'}})]:[market({chainId:'base'})]);}});
 const result=await service.get();assert.equal(urls.length,7);assert(urls.some(url=>url.endsWith(`/ethereum/${token},${second}`)));assert.deepEqual(result.tokens.map(t=>t.chain),['base','ethereum','ethereum']);assert.equal(result.cache.status,'fresh');assert.equal(result.sourcePublishedAt,null);
});
test('cached responses preserve source capture time, update served age, and fetch again after thirty seconds',async()=>{
 let time=start,calls=0;
 const service=createDiscoveryService({now:()=>time,fetcher:async url=>{calls++;return Response.json(String(url).includes('token-profiles')?profiles():[market()],{headers:{date:new Date(start-10000).toUTCString(),age:'10'}});}});
 const first=await service.get();assert.equal(first.providerResponseAt,new Date(start-10000).toISOString());assert.equal(first.providerCacheAgeSeconds,10);
 time+=15000;const cached=await service.get();assert.equal(calls,6);assert.equal(cached.fetchedAt,first.fetchedAt);assert.notEqual(cached.servedAt,first.servedAt);assert.equal(cached.cache.status,'cached');assert.equal(cached.cache.ageSeconds,15);assert.equal(cached.tokens[0].pairAgeSeconds,75);
 time+=15001;const fresh=await service.get();assert.equal(calls,12);assert.equal(fresh.cache.status,'fresh');assert.notEqual(fresh.fetchedAt,first.fetchedAt);
});
test('simultaneous consumers share one upstream fetch and cancelling one does not cancel the other',async()=>{
 let resolve!:()=>void,calls=0;const gate=new Promise<void>(done=>{resolve=done;});
 const service=createDiscoveryService({now:()=>start,fetcher:async url=>{calls++;if(String(url).includes('token-profiles')){await gate;return Response.json(profiles());}return Response.json([market()]);}});
 const controller=new AbortController(),a=service.get({signal:controller.signal}),b=service.get();controller.abort(Error('Cancelled'));await assert.rejects(a,/Cancelled/);resolve();const result=await b;assert.equal(calls,6);assert.equal(result.tokens[0].symbol,'EX');
});
test('profile failure returns last successful snapshot with original timestamp and stale status',async()=>{
 let time=start,fail=false,calls=0;
 const service=createDiscoveryService({now:()=>time,fetcher:async url=>{calls++;if(fail)throw Error('private diagnostics');return Response.json(String(url).includes('token-profiles')?profiles():[market()]);}});
 const first=await service.get();time+=31000;fail=true;const stale=await service.get();assert.equal(stale.fetchedAt,first.fetchedAt);assert.equal(stale.cache.status,'stale');assert.equal(stale.partial,true);assert.equal(stale.tokens[0].name,'Example token');assert(!JSON.stringify(stale).includes('private diagnostics'));
 await service.get();assert.equal(calls,11,'Failed refresh must not immediately repeat');time+=600001;await assert.rejects(service.get(),DiscoveryUnavailable);
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
  await assert.rejects(service.get(),(error:unknown)=>error instanceof DiscoveryUnavailable&&error.rateLimited&&error.retryAfterMs===90000);time+=10000;await assert.rejects(service.get(),(error:unknown)=>error instanceof DiscoveryUnavailable&&error.retryAfterMs===80000);assert.equal(calls,2,'Each provider is contacted once before its independent cooldown');
 }
});
test('invalid or oversized profile responses fail closed while valid empty feed remains empty',async()=>{
 for(const response of [()=>Response.json({error:'upstream'}),()=>new Response('x'.repeat(2*1024*1024+1))]){
  const service=createDiscoveryService({fetcher:async()=>response()});await assert.rejects(service.get(),DiscoveryUnavailable);
 }
 let calls=0;const empty=createDiscoveryService({fetcher:async url=>{calls++;return Response.json(String(url).includes('geckoterminal')?{data:[],included:[]}:[]);}});const result=await empty.get();assert.equal(result.tokens.length,0);assert.equal(result.partial,false);assert.equal(calls,5);
});
test('pre-cancelled consumer performs no upstream requests',async()=>{
 let calls=0;const service=createDiscoveryService({fetcher:async()=>{calls++;return Response.json([]);}}),controller=new AbortController();controller.abort(Error('Cancel'));await assert.rejects(service.get({signal:controller.signal}),/Cancel/);assert.equal(calls,0);
});

test('newer pool listings are sorted before per-network caps so old DEX profiles cannot crowd them out',async()=>{
 const old=Array.from({length:18},(_,i)=>'0x'+(100+i).toString(16).padStart(40,'0'));
 const fresh:any={data:[],included:[]};for(let i=1;i<=20;i++){const item=poolFeed('eth','0x'+i.toString(16).padStart(40,'0'));fresh.data.push(...item.data);fresh.included.push(...item.included);}
 const service=createDiscoveryService({now:()=>start,fetcher:async url=>{const u=String(url);return Response.json(u.includes('token-profiles')?old.map(tokenAddress=>({chainId:'ethereum',tokenAddress})):u.includes('/tokens/v1/')?old.map(address=>market({baseToken:{address},pairCreatedAt:start-86400000})):u.includes('/networks/eth/')?fresh:{data:[],included:[]});}});
 const result=await service.get();assert.equal(result.tokens.length,20);assert(result.tokens.every(t=>t.source==='GeckoTerminal new pools'));assert(!result.tokens.some(t=>old.includes(t.address)));
});

test('newest valid duplicate pool wins within a network and across providers with its provenance',async()=>{
 const old=poolFeed(),fresh=poolFeed();old.data[0].attributes.pool_created_at=new Date(start-120000).toISOString();fresh.data[0].attributes.pool_created_at=new Date(start-10000).toISOString();
 const combined={data:[...old.data,...fresh.data],included:fresh.included};assert.equal(parseDiscoveryPools(combined,'ethereum','capture',start)[0].pairAgeSeconds,10);
 const service=createDiscoveryService({now:()=>start,fetcher:async url=>Response.json(String(url).includes('token-profiles')?profiles():String(url).includes('/tokens/v1/')?[market()]:String(url).includes('/networks/eth/')?combined:{data:[],included:[]})});
 const result=await service.get();assert.equal(result.tokens.length,1);assert.equal(result.tokens[0].pairAgeSeconds,10);assert.equal(result.tokens[0].source,'GeckoTerminal new pools');assert.equal(result.tokens[0].marketSource,'GeckoTerminal');
});

test('concurrent shorter Retry-After cannot overwrite a longer provider cooldown',async()=>{
 let now=start,calls=0,ready!:()=>void;const both=new Promise<void>(resolve=>{ready=resolve;}),pending:((response:Response)=>void)[]=[];
 const service=createDiscoveryService({now:()=>now,fetcher:async url=>{if(String(url).includes('dexscreener'))return Response.json([]);calls++;if(calls>2)return Response.json({data:[],included:[]});return new Promise<Response>(resolve=>{pending.push(resolve);if(pending.length===2)ready();});}});
 const first=service.get();await both;pending[0](new Response('',{status:429,headers:{'retry-after':'120'}}));await new Promise(resolve=>setTimeout(resolve,5));pending[1](new Response('',{status:429,headers:{'retry-after':'1'}}));await first;
 now+=31000;await service.get();assert.equal(calls,2);
});

test('repeated DEX enrichment failures cannot retain market values beyond ten minutes',async()=>{
 let now=start,failed=false;const service=createDiscoveryService({now:()=>now,fetcher:async url=>String(url).includes('token-profiles')?Response.json(profiles()):String(url).includes('geckoterminal')?Response.json({data:[],included:[]}):failed?new Response('',{status:503}):Response.json([market()])});
 await service.get();failed=true;now+=31000;assert.equal((await service.get()).tokens[0].marketStatus,'stale');now+=570001;const result=await service.get();assert.equal(result.tokens[0].marketStatus,'unavailable');assert.equal(result.tokens[0].marketFetchedAt,null);assert.equal(result.tokens[0].liquidityUsd,null);
});
