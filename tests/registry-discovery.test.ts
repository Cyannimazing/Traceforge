import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HistoryStore} from '../src/lib/history-store';
import {createRegistryDiscovery} from '../src/lib/registry-discovery';
import type {RegistryReader} from '../src/lib/factory-registry';
const token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const market=async()=>({candidates:[{pool,venue:'test',source:'market'}],observedCandidates:1,excluded:0,truncated:false,completeRegistry:false as const,fetchedAt:new Date().toISOString(),detail:'Candidate feed only.'});
test('configured factory discovery persists separately and never upgrades total venue coverage',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'traceforge-registry-'));let store=new HistoryStore(join(dir,'registry.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});let calls=0;
 const reader:RegistryReader={head:async()=>({number:14000000,hash:hash(14000000)}),blockHash:async(_c,n)=>hash(n),logs:async(_c,r)=>{calls++;return {logs:[],through:r.to,source:'test'};}};
 const first=await createRegistryDiscovery({store,reader,market})('ethereum',token);assert.equal(first.registry?.status,'complete');assert.equal(first.completeRegistry,false);assert.equal(first.candidates[0].pool,pool);assert.equal(calls,4);
 store.close();store=new HistoryStore(join(dir,'registry.sqlite'));const next=await createRegistryDiscovery({store,reader,market})('ethereum',token);assert.equal(next.registry?.anchor,14000000);assert.equal(calls,4);
});
test('unfinished registry resumes its covered cursor across service instances while market outage preserves it',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'traceforge-registry-'));const store=new HistoryStore(join(dir,'registry.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});const seen:number[]=[];
 const reader:RegistryReader={head:async()=>({number:14000000,hash:hash(14000000)}),blockHash:async(_c,n)=>hash(n),logs:async(_c,r)=>{seen.push(r.from);return {logs:[],through:r.from+10,source:'test'};}};
 const first=await createRegistryDiscovery({store,reader,market})('ethereum',token);assert.equal(first.registry?.status,'partial');assert.equal(first.registry?.completedRanges,4);
 const second=await createRegistryDiscovery({store,reader,market:async()=>{throw Error('outage');}})('ethereum',token);assert.equal(second.registry?.completedRanges,8);assert.equal(seen[4],seen[3]+11);assert.equal(second.completeRegistry,false);assert.match(second.detail,/unavailable/);
});

test('durable registry cooldown avoids another scan while preserving pending ranges',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'traceforge-registry-'));let store=new HistoryStore(join(dir,'registry.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});let calls=0;
 const reader:RegistryReader={head:async()=>({number:14000000,hash:hash(14000000)}),blockHash:async(_c,n)=>hash(n),logs:async()=>{calls++;throw Object.assign(Error('rate limited'),{retryAfterMs:60000});}};
 const first=await createRegistryDiscovery({store,reader,market})('ethereum',token);store.close();store=new HistoryStore(join(dir,'registry.sqlite'));
 const second=await createRegistryDiscovery({store,reader,market})('ethereum',token);
 assert.equal(calls,1);assert.equal(first.registry?.completedRanges,0);assert.equal(second.registry?.pendingRanges,4);assert.equal(second.registry?.status,'partial');assert((second.registry?.retryAt||0)>Date.now());
});


test('explicit discovery rechecks a completed durable registry and scans newly finalized factory intervals',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'traceforge-registry-'));const store=new HistoryStore(join(dir,'registry.sqlite'));t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 let head=14000000;const queries:{from:number;to:number}[]=[];
 const reader:RegistryReader={head:async()=>({number:head,hash:hash(head)}),blockHash:async(_c,n)=>hash(n),logs:async(_c,r)=>{queries.push({from:r.from,to:r.to});return {logs:[],through:r.to,source:'test'};}};
 const discover=createRegistryDiscovery({store,reader,market});await discover('ethereum',token);head+=100;
 const next=await discover('ethereum',token);assert.equal(next.registry?.anchor,head);assert.equal(next.registry?.status,'complete');assert.equal(next.registry?.completedRanges,8);
 assert.deepEqual(queries.slice(4),Array.from({length:4},()=>({from:14000001,to:14000100})));assert.equal(next.completeRegistry,false);
});
