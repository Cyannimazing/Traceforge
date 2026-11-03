import test from 'node:test';
import assert from 'node:assert/strict';
import {createSolanaHistoryCrawler,historyCrawlerStep,type HistoryCrawlerView} from '../src/lib/solana-history-crawler';
import type {SolanaArchiveStatus} from '../src/lib/solana-history-archive';
import {createSolanaHistoryArchive} from '../src/lib/solana-history-archive';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import fixture from './fixtures/alchemy-solana-pump-history.json';
const status=(changes:Partial<SolanaArchiveStatus>={}):SolanaArchiveStatus=>({token:'token-a',status:'partial',pages:1,transactions:100,trades:12,transfers:20,hasMore:true,message:'Saved',...changes});
const flush=async()=>{await new Promise<void>(resolve=>setImmediate(resolve));};
function harness(request:(method:'GET'|'POST',signal:AbortSignal)=>Promise<SolanaArchiveStatus|null>,token='token-a',refresh?:()=>void|Promise<void>){
 let time=0,refreshes=0;const settled:SolanaArchiveStatus[]=[],views:HistoryCrawlerView[]=[],timers:{callback:()=>void,delay:number,due:number,canceled:boolean}[]=[];
 const crawler=createSolanaHistoryCrawler({token,request,onView:v=>views.push(v),onSettled:progress=>{settled.push(progress);},onRefresh:()=>{refreshes++;return refresh?.();},now:()=>time,schedule:(callback,delay)=>{const item={callback,delay,due:time+delay,canceled:false};timers.push(item);return()=>{item.canceled=true;};}});
 const pending=()=>timers.filter(t=>!t.canceled).sort((a,b)=>a.due-b.due);
 return {crawler,views,settled,get time(){return time;},get refreshes(){return refreshes;},get pending(){return pending();},async tick(){const t=pending()[0];assert(t);t.canceled=true;time=Math.max(time,t.due);t.callback();await flush();}};
}

test('terminal notification waits for successful final refresh and fires once',async()=>{
 let resolve!:()=>void,attempt=0;
 const h=harness(async()=>status({status:'exhausted',hasMore:false}),'token-a',()=>{if(++attempt===1)throw Error('Busy');return new Promise<void>(r=>{resolve=r;});});
 h.crawler.setActive(true);await h.tick();assert.equal(h.settled.length,0);
 await h.tick();assert.equal(h.settled.length,0);resolve();await flush();assert.equal(h.settled.length,1);assert.equal(h.settled[0].status,'exhausted');
 h.crawler.setActive(false);h.crawler.setActive(true);await flush();assert.equal(h.settled.length,1);h.crawler.dispose();
});

test('unsupported configuration settles as incomplete after refresh without posting or claiming exhaustion',async()=>{
 const calls:string[]=[];const h=harness(async method=>{calls.push(method);return status({status:'unsupported',hasMore:false,transactions:0,pages:0,trades:0,transfers:0});});
 h.crawler.setActive(true);await h.tick();assert.deepEqual(calls,['GET']);assert.equal(h.refreshes,1);assert.equal(h.settled[0]?.status,'unsupported');assert.equal(h.pending.length,0);h.crawler.dispose();
});
test('continuous worker retrieves status then sequential batches until provider exhaustion',async()=>{
 const calls:string[]=[];let pages=0;const h=harness(async method=>{calls.push(method);return method==='GET'?null:status({pages:++pages,transactions:pages*100,status:pages===3?'exhausted':'partial',hasMore:pages!==3});});
 h.crawler.setActive(true);for(let i=0;i<4;i++)await h.tick();
 assert.deepEqual(calls,['GET','POST','POST','POST']);assert.equal(h.pending.length,0);assert.equal(h.refreshes,1);
 h.crawler.setActive(false);h.crawler.setActive(true);assert.equal(h.pending.length,0);assert.equal(h.refreshes,1);
});
test('hidden or manual pause aborts a batch and stale completion cannot update current token',async()=>{
 let resolve!:(v:SolanaArchiveStatus)=>void;let signal!:AbortSignal;
 const h=harness(async(_method,s)=>{signal=s;return new Promise(r=>{resolve=r;});});h.crawler.setActive(true);await h.tick();
 h.crawler.setActive(false);assert(signal.aborted);resolve(status());await flush();
 assert.equal(h.views.at(-1)?.progress,null);assert.equal(h.pending.length,0);assert.equal(h.refreshes,0);
 h.crawler.dispose();
});
test('resume while aborted transport is settling does not overlap workers',async()=>{
 let resolve!:(v:SolanaArchiveStatus)=>void,calls=0;
 const h=harness(async()=>{calls++;return new Promise(r=>{resolve=r;});});h.crawler.setActive(true);await h.tick();
 h.crawler.setActive(false);h.crawler.setActive(true);assert.equal(h.pending.length,0);assert.equal(calls,1);
 resolve(status());await flush();assert.equal(h.pending.length,1);await h.tick();assert.equal(calls,2);h.crawler.dispose();
});
test('provider cooldown and running lease poll status without posting another batch',async()=>{
 const calls:string[]=[];let n=0;const h=harness(async method=>{calls.push(method);return n++===0?status({status:'cooldown',retryAt:45000}):status({status:'running'});});
 h.crawler.setActive(true);await h.tick();assert.equal(h.pending[0].delay,45000);await h.tick();assert.deepEqual(calls,['GET','GET']);assert.equal(h.pending[0].delay,2000);h.crawler.dispose();
});
test('capped and hasMore false are terminal but never rewritten to exhausted',()=>{
 assert.equal(historyCrawlerStep(status({status:'capped',hasMore:false}),true,0).method,null);
 assert.equal(historyCrawlerStep(status({hasMore:false}),true,0).method,null);
});
test('token mismatch is rejected and disposed workers never publish later results',async()=>{
 const h=harness(async()=>status({token:'token-b'}));h.crawler.setActive(true);await h.tick();assert.equal(h.views.at(-1)?.progress,null);assert.match(h.views.at(-1)?.error||'',/different token/);h.crawler.dispose();
 let resolve!:(v:SolanaArchiveStatus)=>void;const old=harness(async()=>new Promise(r=>{resolve=r;}));old.crawler.setActive(true);await old.tick();old.crawler.dispose();const count=old.views.length;resolve(status({status:'exhausted',hasMore:false}));await flush();assert.equal(old.views.length,count);assert.equal(old.refreshes,0);
});

test('initial transport errors back off and honor Retry-After even before any saved progress',async()=>{
 const h=harness(async()=>{throw Object.assign(new Error('Cooldown'),{retryAt:45000});});
 h.crawler.setActive(true);await h.tick();assert.equal(h.pending[0].delay,45000);await h.tick();assert.equal(h.pending[0].delay,10000);h.crawler.dispose();
 assert.equal(historyCrawlerStep(null,false,0,1).delay,5000);
 assert.equal(historyCrawlerStep(null,false,0,10).delay,60000);
});

test('stalled batches back off and periodically refresh only when distinct transactions advance',async()=>{
 let n=0;const h=harness(async method=>method==='GET'?status():status({pages:++n>2?2:1,transactions:n>2?101:100}));
 h.crawler.setActive(true);await h.tick();await h.tick();assert.equal(h.pending[0].delay,5000);await h.tick();assert.equal(h.pending[0].delay,10000);await h.tick();assert.equal(h.pending[0].delay,1000);assert.equal(h.refreshes,0);h.crawler.dispose();
 const progressing=harness(async()=>status({pages:++n,transactions:n*100}));progressing.crawler.setActive(true);for(let i=0;i<35;i++)await progressing.tick();assert.equal(progressing.refreshes,1);progressing.crawler.dispose();
});

test('increasing page counters without new transactions cannot reset backoff or refresh reports',async()=>{
 let pages=1;const h=harness(async()=>status({pages:pages++,transactions:100}));h.crawler.setActive(true);await h.tick();
 for(const delay of [5000,10000,20000,40000,60000]){await h.tick();assert.equal(h.pending[0].delay,delay);}
 assert.equal(h.refreshes,0);assert.match(h.views.at(-1)?.error||'',/transaction/i);h.crawler.dispose();
});

test('malformed progress cannot turn a running history into completed history',async()=>{
 const h=harness(async()=>status({status:'exhausted',hasMore:true}));h.crawler.setActive(true);await h.tick();assert.equal(h.views.at(-1)?.progress,null);assert.match(h.views.at(-1)?.error||'',/invalid/);assert.equal(h.refreshes,0);h.crawler.dispose();
});

test('real archive repeated cursor responses slow the worker until new transactions and an actual end arrive',async()=>{
 const token='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump',dir=mkdtempSync(join(tmpdir(),'traceforge-crawler-'));
 let h:ReturnType<typeof harness>,providerCalls=0,recovered=false;const requests:{method:string;time:number}[]=[];
 const archive=createSolanaHistoryArchive({dbPath:join(dir,'history.sqlite'),rpcUrl:'https://solana-mainnet.g.alchemy.com/v2/test',now:()=>h?.time||0,fetcher:async()=>{providerCalls++;return Response.json({result:recovered?{data:[fixture[1]],paginationToken:null}:{data:[fixture[0]],paginationToken:'repeated'}});}});
 h=harness(async(method,signal)=>{requests.push({method,time:h.time});return method==='GET'?archive.status(token):archive.advance(token,{signal});},token);
 try{
  h.crawler.setActive(true);await h.tick();await h.tick();
  assert.equal(providerCalls,2);assert.equal(h.views.at(-1)?.progress?.status,'cooldown');assert.ok(h.pending.some(t=>t.delay===60000));assert.equal(h.views.at(-1)?.progress?.hasMore,true);
  for(let i=0;i<5&&providerCalls<3;i++)await h.tick();const refreshed=h.refreshes;assert.equal(providerCalls,3);assert.equal(h.pending[0].delay,60000);
  const posts=requests.filter(r=>r.method==='POST');assert.ok(posts[1].time-posts[0].time>=60000);
  recovered=true;await h.tick();await h.tick();assert.equal(h.views.at(-1)?.progress?.status,'exhausted');assert.equal(h.views.at(-1)?.progress?.transactions,2);assert.equal(h.pending.length,0);assert.equal(h.refreshes,refreshed+1);
 }finally{h.crawler.dispose();archive.close();rmSync(dir,{recursive:true,force:true});}
});

test('failed terminal report refresh retries independently without recrawling an exhausted provider',async()=>{
 const methods:string[]=[];let attempt=0;
 const h=harness(async method=>{methods.push(method);return method==='GET'?null:status({status:'exhausted',hasMore:false});},'token-a',()=>{if(++attempt<3)throw Error('Quiet refresh unavailable');});
 h.crawler.setActive(true);await h.tick();await h.tick();assert.equal(h.refreshes,1);assert.match(h.views.at(-1)?.error||'',/report refresh/i);assert.equal(h.pending[0]?.delay,5000);
 await h.tick();assert.equal(h.refreshes,2);assert.equal(h.pending[0]?.delay,10000);await h.tick();assert.equal(h.refreshes,3);assert.equal(h.pending.length,0);assert.equal(h.views.at(-1)?.error,'');assert.deepEqual(methods,['GET','POST']);h.crawler.dispose();
});

test('paused terminal report completion cannot mark success and resumes a refresh while remaining provider-terminal',async()=>{
 const resolve:(()=>void)[]=[];const methods:string[]=[];
 const h=harness(async method=>{methods.push(method);return status({status:'exhausted',hasMore:false});},'token-a',()=>new Promise<void>(r=>resolve.push(r)));
 h.crawler.setActive(true);await h.tick();assert.equal(h.refreshes,1);h.crawler.setActive(false);resolve[0]();await flush();assert.equal(h.pending.length,0);assert.equal(h.settled.length,0);
 h.crawler.setActive(true);await flush();assert.equal(h.refreshes,2);resolve[1]();await flush();assert.equal(h.pending.length,0);assert.deepEqual(methods,['GET']);assert.equal(h.settled.length,1);h.crawler.dispose();
});

test('slow periodic report refresh allows archive batches to continue and follows with the final latest report',async()=>{
 let posts=0;const resolve:(()=>void)[]=[];
 const h=harness(async method=>method==='GET'?null:status({pages:++posts,transactions:posts*100,status:posts===35?'exhausted':'partial',hasMore:posts!==35}),'token-a',()=>new Promise<void>(r=>resolve.push(r)));
 h.crawler.setActive(true);for(let i=0;i<50&&posts<35;i++)await h.tick();assert.equal(posts,35);assert.equal(h.refreshes,1);assert.equal(h.pending.length,0);
 resolve[0]();await flush();assert.equal(h.refreshes,2);resolve[1]();await flush();assert.equal(h.pending.length,0);assert.equal(h.views.at(-1)?.error,'');h.crawler.dispose();
});

test('additional transfer records in existing transactions count as evidence progress and refresh the report',async()=>{
 let posts=0;
 const h=harness(async method=>method==='GET'?status():status({pages:++posts+1,transactions:100,transfers:20+posts}));
 h.crawler.setActive(true);await h.tick();
 for(let i=0;i<40&&posts<35;i++)await h.tick();
 assert.equal(posts,35);assert.equal(h.views.at(-1)?.progress?.transactions,100);assert.equal(h.views.at(-1)?.progress?.transfers,55);assert.equal(h.views.at(-1)?.error,'');assert.equal(h.refreshes,1);assert.equal(h.pending[0].delay,1000);h.crawler.dispose();
});
