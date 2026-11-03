import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwarmClient, normalizeSwarmReport } from '../src/lib/swarm';
import {createProviderInvestigationService} from '../src/lib/provider-investigation-service';
import {fixtureReport} from '../src/lib/investigation-fixture';

const token = '0x861d669d1596ab7d62a5ec835ecb4e0aabbdcec1', wallet = '0x1814627bf0923ab8124f9403fd125c4fcf222489', other = '0x6742843c2557891875ce0389cfebf0ec503d5fb2';
const sample = () => ({ chain: 'bsc', token, score: 59, band: 'RISKY', reason: 'swarm of 2 wallets', scanned_at: 1793551382, creator: wallet, header: { name: 'Test token', symbol: 'TEST', decimals: 18, supply: 1e27, holders_count: 908 }, holders: [{ address: wallet, share: .2, share_supply: .01, balance: 1e24, cluster: 0, signals: { dev: true, sniper: false, unread: false, kind: 'mint', tx_count: 15 } }], links: [{ a: wallet, b: other, kind: 'direct', level: 'proven', via: '0x' + '1'.repeat(64) }], clusters: [{ id: 0, wallets: [wallet, other], share: .3, level: 'proven' }], security: { checks: [{ id: 'owner', level: 'warn', title: 'Owner is active', detail: `owner ${wallet} still controls owner-only functions` }] }, gates: ['soft: two wallets'], unread: [other] });

test('normalization preserves provider attribution, distinct share denominators and unknown owner', () => {
  const r = normalizeSwarmReport(sample(), 'bsc', token, '2026-11-02T00:00:00Z');
  assert.equal(r.attribution, 'provider-reported'); assert.equal(r.holders[0].shareFloat, .2); assert.equal(r.holders[0].shareSupply, .01);
  assert.equal(r.holders[0].balanceRaw, null); assert.equal(r.header.supplyRaw, null); assert.equal(r.currentOwner, null); assert.equal(r.creator, wallet);
  assert.equal(r.holders[0].signals.sniper, false); assert.equal(r.holders[0].signals.fresh, null); assert.equal(r.groups[0].providerLevel, 'proven');
  assert(!('launchVerified' in r)); assert(!('hands' in r)); assert(!('confidence' in r));
});

test('zero EVM identity is not an active creator or owner, while a burn holder remains a holder',()=>{
 const zero='0x'+'0'.repeat(40),raw=sample();
 const report=normalizeSwarmReport({...raw,creator:zero,owner:zero,holders:[{...raw.holders[0],address:zero}]},'bsc',token,'2026-11-02T00:00:00Z');
 assert.equal(report.creator,null);assert.equal(report.currentOwner,null);assert.equal(report.holders[0].address,zero);
});

test('stored report uses fixed origin and ten-minute cache without mutating cached data', async () => {
  let requests = 0, time = 1000000;
  const client = createSwarmClient({ now: () => time, fetcher: async (url, init) => { requests++; assert(String(url).startsWith('https://swarmengine.tech/api/token/bsc/')); assert.equal(init?.redirect, 'error'); return Response.json({ result: sample() }); } });
  const first = await client('bsc', token); first.report!.holders.length = 0;
  const cached = await client('bsc', token.toUpperCase().replace('0X', '0x'));
  assert.equal(cached.cached, true); assert.equal(cached.report?.holders.length, 1); assert.equal(requests, 1);
  time += 600001; assert.equal((await client('bsc', token)).cached, false); assert.equal(requests, 2);
});

test('absent stored report triggers only one bounded scan and supports a pending job', async () => {
  const urls: string[] = [];
  const client = createSwarmClient({ fetcher: async url => { urls.push(String(url)); return urls.length === 1 ? Response.json({ result: null }) : Response.json({ job: 'scan_123', status: 'running' }, { status: 202 }); } });
  const result = await client('bsc', token);
  assert.equal(result.status, 'pending'); assert.equal(result.job, 'scan_123'); assert.equal(urls.length, 2); assert(urls[1].endsWith('&chain=bsc&wait=5'));
});

test('404 stored report can return a completed synchronous scan while stored-only mode never starts one', async () => {
  let calls = 0;
  const client = createSwarmClient({ fetcher: async () => ++calls % 2 ? new Response('', { status: 404 }) : Response.json(sample()) });
  assert.equal((await client('bsc', token)).status, 'available'); assert.equal(calls, 2);
  let storedCalls = 0;
  const stored = createSwarmClient({ fetcher: async () => { storedCalls++; return Response.json({ result: null }); } });
  assert.equal((await stored('bsc', token, { allowScan: false })).status, 'unavailable'); assert.equal(storedCalls, 1);
});

test('numeric and HTTP-date retry-after impose provider-wide cooldown without alternate requests', async () => {
  for (const header of ['90', 'Mon, 02 Nov 2026 00:01:30 GMT']) {
    let calls = 0, time = 1000;
    const client = createSwarmClient({ now: () => time, fetcher: async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': header, date: 'Mon, 02 Nov 2026 00:00:00 GMT' } }); } });
    const first = await client('bsc', token); assert.equal(first.retryAfterMs, 90000);
    time += 2000; const second = await client('base', other); assert.equal(second.status, 'rate-limited'); assert.equal(second.retryAfterMs, 88000); assert.equal(calls, 1);
  }
});

test('invalid addresses and unsupported chains perform no network requests', async () => {
  let calls = 0; const client = createSwarmClient({ fetcher: async () => { calls++; throw Error('unexpected'); } });
  assert.equal((await client('bsc', 'https://elsewhere.invalid/')).status, 'invalid');
  assert.equal((await client('arbitrum' as 'bsc', token)).status, 'invalid'); assert.equal(calls, 0);
});

test('wrong token, wrong chain, malformed reports and server failures do not trigger new scans', async () => {
  for (const response of [{ result: { ...sample(), token: other } }, { result: { ...sample(), chain: 'base' } }, { result: {} }, { error: 'private diagnostics with secret' }]) {
    let calls = 0; const client = createSwarmClient({ fetcher: async () => { calls++; return Response.json(response); } });
    const result = await client('bsc', token); assert.equal(result.status, 'unavailable'); assert.equal(calls, 1); assert(!JSON.stringify(result).includes('secret'));
  }
});

test('response limit catches declared and streamed oversized bodies without retry', async () => {
  for (const declared of [true, false]) {
    let calls = 0;
    const client = createSwarmClient({ fetcher: async () => { calls++; return new Response('x'.repeat(3 * 1024 * 1024 + 1), declared ? { headers: { 'content-length': String(3 * 1024 * 1024 + 1) } } : {}); } });
    assert.equal((await client('bsc', token)).status, 'unavailable'); assert.equal(calls, 1);
  }
});

test('caller cancellation propagates before and during provider requests', async () => {
  const first = new AbortController(); first.abort(Error('cancelled')); let calls = 0;
  const client = createSwarmClient({ fetcher: async () => { calls++; throw Error('unexpected'); } });
  await assert.rejects(client('bsc', token, { signal: first.signal }), /cancelled/); assert.equal(calls, 0);
  const controller = new AbortController();
  const pending = createSwarmClient({ fetcher: async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); queueMicrotask(() => controller.abort(Error('cancelled'))); }) });
  await assert.rejects(pending('bsc', token, { signal: controller.signal }), /cancelled/);
});

test('bounded normalization preserves exact string integers, tiny shares and missing values', () => {
  const input = sample(); input.holders[0].balance = '1000000000000000000000000' as unknown as number; input.holders[0].share_supply = 1e-25;
  const r = normalizeSwarmReport(input, 'bsc', token, '2026-11-02T00:00:00Z');
  assert.equal(r.holders[0].balanceRaw, '1000000000000000000000000'); assert.equal(r.holders[0].shareSupply, 1e-25); assert.equal(r.header.priceUsd, null);
  const bounded = normalizeSwarmReport({ ...input, links: Array.from({ length: 2001 }, () => input.links[0]) }, 'bsc', token, '2026-11-02T00:00:00Z');
  assert.equal(bounded.relationships.length, 2000); assert.equal(bounded.truncated, true);
});


test('provider lookup and scan share a ten-second deadline, preserving independent fallback time',async()=>{
 let elapsed=0,calls=0,fallbackCalls=0;const deadlines:{at:number;controller:AbortController}[]=[],outer=new AbortController();
 const advance=(ms:number)=>{elapsed+=ms;for(const d of deadlines)if(elapsed>=d.at&&!d.controller.signal.aborted)d.controller.abort(new DOMException('Budget expired','TimeoutError'));if(elapsed>=80000)outer.abort(Error('Stream deadline'));};
 const client=createSwarmClient({now:()=>elapsed,timeoutSignal:ms=>{const controller=new AbortController();deadlines.push({at:elapsed+ms,controller});return controller.signal;},fetcher:async(_url,init)=>{
  calls++;assert.equal(deadlines.length,1,'One shared provider budget is required');
  if(calls===1){advance(4000);return Response.json({result:null});}
  return new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});queueMicrotask(()=>advance(deadlines[0].at-elapsed));});
 }});
 const service=createProviderInvestigationService({provider:client,independent:{scan:async(_chain,_token,options)=>{fallbackCalls++;assert.equal(elapsed,10000);assert.equal(outer.signal.aborted,false);advance(67000);options?.signal?.throwIfAborted();return {...fixtureReport,chain:'bsc',token};}}});
 const result=await service.scan('bsc',token,{signal:outer.signal});
 assert.equal(calls,2);assert.equal(fallbackCalls,1);assert.equal(deadlines.length,1);assert.equal(elapsed,77000);assert.equal(outer.signal.aborted,false);assert(result.sources.some(s=>s.name==='Swarm provider report'&&s.status==='unavailable'));
});

test('stored-only lookup shares the short budget and never initiates a scan on timeout',async()=>{
 let calls=0;const timeout=new AbortController();let budget=0;
 const client=createSwarmClient({timeoutSignal:ms=>{budget=ms;return timeout.signal;},fetcher:async(_url,init)=>{calls++;assert.equal(budget,10000);return new Promise<Response>((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});queueMicrotask(()=>timeout.abort(new DOMException('Budget expired','TimeoutError')));});}});
 const caller=new AbortController(),result=await client('bsc',token,{signal:caller.signal,allowScan:false});assert.equal(result.status,'unavailable');assert.equal(budget,10000);assert.equal(calls,1);assert.equal(caller.signal.aborted,false);
});
