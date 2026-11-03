import test from 'node:test';import assert from 'node:assert/strict';
import {createEvmArchiveTransport} from '../src/lib/evm-archive-transport';
import type {EvmTransferArchiveStatus} from '../src/lib/evm-transfer-archive';
const token='0x'+'1'.repeat(40),signal=new AbortController().signal;
const state=(patch:Partial<EvmTransferArchiveStatus>={}):EvmTransferArchiveStatus=>({chain:'ethereum',token,status:'exhausted',transactions:1,pages:1,trades:0,transfers:1,hasMore:false,message:'saved',finalizedBlock:10,fromBlock:0,headChecks:0,indexComplete:true,...patch});
test('previous exhaustion checks a fresh head once, then follows the new range without a manual action',async()=>{
 const calls:any[]=[];let current=state();const request=createEvmArchiveTransport({chain:'ethereum',token,fetcher:async(_,init)=>{calls.push([init?.method,init?.body]);if(init?.body)current=state({headChecks:1,status:'partial',hasMore:true,indexComplete:false,finalizedBlock:20});return Response.json({progress:current});}});
 const p=await request('GET',signal);assert.equal(p?.status,'partial');await request('GET',signal);await request('POST',signal);assert.equal(calls.filter(c=>c[1]).length,1);assert.equal(calls[1][1],JSON.stringify({action:'update'}));
});
test('a successful no-new-head check settles but failed head checks cannot reuse old exhaustion',async()=>{
 let attempts=0;const request=createEvmArchiveTransport({chain:'ethereum',token,fetcher:async(_,init)=>Response.json({progress:init?.body&&++attempts>1?state({headChecks:1}):state()})});
 await assert.rejects(request('GET',signal),/not been checked/);assert.equal((await request('GET',signal))?.headChecks,1);await request('GET',signal);assert.equal(attempts,2);
});
test('cooldown preserves pending head check and does not incorrectly settle',async()=>{
 let time=0,calls=0;const request=createEvmArchiveTransport({chain:'ethereum',token,now:()=>time,fetcher:async(_,init)=>{if(init?.body){calls++;return Response.json({progress:calls===1?state({status:'cooldown',retryAt:5000}):state({headChecks:1})});}return Response.json({progress:state()});}});
 assert.equal((await request('GET',signal))?.hasMore,true);time=6000;assert.equal((await request('GET',signal))?.hasMore,false);assert.equal(calls,2);
});
test('fresh and partial archives do not request an update; unsupported and canceled responses cannot continue',async()=>{
 let updates=0;const request=createEvmArchiveTransport({chain:'ethereum',token,fetcher:async(_,init)=>{if(init?.body)updates++;return Response.json({progress:state({status:'partial',hasMore:true,indexComplete:false})});}});await request('GET',signal);await request('POST',signal);assert.equal(updates,0);
 let unsupported=0;const missing=createEvmArchiveTransport({chain:'ethereum',token,onUnsupported:()=>unsupported++,fetcher:async()=>Response.json({supported:false},{status:501})});assert.equal(await missing('GET',signal),null);assert.equal(unsupported,1);
 const aborted=new AbortController();aborted.abort();await assert.rejects(request('GET',aborted.signal),{name:'AbortError'});
});
