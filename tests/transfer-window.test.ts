import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createTransferWindow,TRANSFER_WINDOW_LIMIT} from '../src/lib/transfer-window';

const token='0x'+'1'.repeat(40),hash='0x'+'c'.repeat(64),URL_='https://eth-mainnet.g.alchemy.com/v2/test';
const a=(n:number)=>'0x'+n.toString(16).padStart(40,'0');
type Opts={totalRows:number;total?:number|null;rateLimitOnce?:boolean};
function chain(opts:Opts){
 let served=0,rateLimited=false;const calls:string[]=[];
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);
  if(url.includes('blockscout'))return opts.total===undefined||opts.total===null?new Response('nope',{status:404}):Response.json({transfers_count:String(opts.total)});
  const body=JSON.parse(String(init?.body));calls.push(body.method);
  if(body.method==='eth_getBlockByNumber')return Response.json({jsonrpc:'2.0',id:body.id,result:{number:'0x64',hash}});
  if(opts.rateLimitOnce&&!rateLimited){rateLimited=true;return new Response('',{status:429,headers:{'retry-after':'1'}});}
  const params=body.params[0],max=parseInt(params.maxCount,16),start=params.pageKey?Number(params.pageKey):0;
  const rows=Array.from({length:Math.min(max,opts.totalRows-start)},(_,i)=>{const n=start+i;return {blockNum:'0x'+(100-Math.floor(n/1000)).toString(16),hash,from:a(1000+(n%7)),to:a(2000+(n%5)),rawContract:{address:token,value:'0x'+(n%5===0?100:1).toString(16)}};});
  served+=rows.length;const next=start+rows.length;
  return Response.json({jsonrpc:'2.0',id:body.id,result:{transfers:rows,...(next<opts.totalRows?{pageKey:String(next)}:{})}});
 };
 return {fetcher,calls,served:()=>served};
}
const store=(fetcher:typeof fetch,limit?:number,now?:()=>number)=>createTransferWindow({dbPath:join(mkdtempSync(join(tmpdir(),'tw-')),'w.sqlite'),rpcUrls:{ethereum:URL_},fetcher,limit,now});

test('the default window limit is 150,000 transfers',()=>{assert.equal(TRANSFER_WINDOW_LIMIT,150000);});

test('a token under the cap is read completely',async()=>{
 const c=chain({totalRows:2500,total:2500}),w=store(c.fetcher);
 const r=await w.advance('ethereum',token,{pages:10});
 assert.equal(r.summary.status,'complete');assert.equal(r.summary.read,2500);assert.equal(r.summary.total,2500);assert.match(r.summary.detail,/full history/);
});

test('a token over the cap stops exactly at the limit and is marked capped',async()=>{
 const c=chain({totalRows:5000,total:9000000}),w=store(c.fetcher,3000);
 let r=await w.advance('ethereum',token,{pages:2});assert.equal(r.summary.status,'partial');assert.equal(r.summary.read,2000);
 r=await w.advance('ethereum',token,{pages:10});
 assert.equal(r.summary.status,'capped');assert.equal(r.summary.read,3000);assert.equal(c.served(),3000);
 assert.match(r.summary.detail,/too large for a full crawl/);assert.match(r.summary.detail,/9,000,000/);
 // A capped window does not read further.
 await w.advance('ethereum',token,{pages:10});assert.equal(c.served(),3000);
});

test('candidates are ranked by net inflow and include recent recipients',async()=>{
 const c=chain({totalRows:1000,total:1000}),w=store(c.fetcher);
 const r=await w.advance('ethereum',token,{pages:2});
 // Recipient a(2000) receives every n%5===0 transfer worth 100, so it has the largest net inflow.
 assert.equal(r.candidates[0],a(2000));assert.ok(r.candidates.includes(a(2004)));
 assert.ok(!r.candidates.includes(a(1000)),"pure senders are not nominated");
});

test('rate limits cool down and resume without losing progress',async()=>{
 let clock=1_000_000;const c=chain({totalRows:1500,total:null,rateLimitOnce:true}),w=store(c.fetcher,undefined,()=>clock);
 let r=await w.advance('ethereum',token,{pages:5});assert.equal(r.summary.status,'cooldown');assert.equal(r.summary.total,null);
 clock+=2000;r=await w.advance('ethereum',token,{pages:5});assert.equal(r.summary.status,'complete');assert.equal(r.summary.read,1500);
});

test('non-Alchemy endpoints report the window as unavailable',async()=>{
 const w=createTransferWindow({dbPath:join(mkdtempSync(join(tmpdir(),'tw-')),'w.sqlite'),rpcUrls:{bsc:'https://bsc-rpc.publicnode.com'}});
 const r=await w.advance('bsc',token);assert.equal(r.summary.status,'unavailable');assert.deepEqual(r.candidates,[]);
});
