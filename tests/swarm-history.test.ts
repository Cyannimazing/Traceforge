import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSwarmReport,swarmTransaction} from '../src/lib/swarm';
import {bridgeSwarmReport} from '../src/lib/swarm-bridge';

const token='0x'+'1'.repeat(40),wallet='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),pool='0x'+'4'.repeat(40),burn='0x000000000000000000000000000000000000dead',tx='0x'+'a'.repeat(64);
const raw=()=>({chain:'ethereum',token,header:{name:'Synthetic test',symbol:'TEST'},holders:[{address:wallet,share:.2,share_supply:.01,signals:{}}],scanned_at:1000});
const normalize=(value:unknown)=>normalizeSwarmReport(value,'ethereum',token,'2026-11-02T00:00:00Z');

test('historical supply-share samples retain denominators and zero values without inventing transaction events',()=>{
 const provider=normalize({...raw(),launch_ts:95,timeline:{t:[100,110,120],blocks:[10,11,12],share:{[wallet]:[.9,.1,0]}}});
 assert.equal(provider.launchAt,new Date(95000).toISOString());assert.equal(provider.history?.denominator,'total-supply');assert.deepEqual(provider.history?.frames.map(f=>f.shares[wallet]),[.9,.1,0]);assert.deepEqual(provider.history?.frames.map(f=>f.block),[10,11,12]);assert.equal(provider.history?.issues.length,0);
 const report=bridgeSwarmReport(provider);assert.equal(report.investigation.timeline.length,0);assert.equal(report.investigation.coverage.launchVerified,false);assert.equal(report.investigation.coverage.earliestTradeAt,undefined);assert(!report.investigation.wallets[0].categories.includes('coordinated-seller'));assert.equal(report.investigation.wallets[0].sold,undefined);
});
test('malformed partial history skips unordered timestamps and retains missing samples as null',()=>{
 const provider=normalize({...raw(),timeline:{t:[100,101,101,99,'bad',102],blocks:[1,2,3,4,5],share:{[wallet]:[.5,null],[other]:[0,2,0,0,0,.4],invalid:[1]}}});
 const history=provider.history!;assert.deepEqual(history.frames.map(f=>f.timestamp),[100,101,102].map(t=>new Date(t*1000).toISOString()));assert.deepEqual(history.frames.map(f=>f.shares[wallet]),[.5,null,null]);assert.deepEqual(history.frames.map(f=>f.shares[other]),[0,null,.4]);assert.equal(history.frames[2].block,null);assert.equal(history.truncated,true);assert(history.issues.length>=3);assert.deepEqual(history.wallets,[wallet,other]);
});
test('history and infrastructure input limits are explicit and bounded',()=>{
 const series=Object.fromEntries(Array.from({length:101},(_,i)=>['0x'+(i+100).toString(16).padStart(40,'0'),Array(121).fill(.01)]));
 const provider=normalize({...raw(),timeline:{t:Array.from({length:121},(_,i)=>100+i),blocks:Array.from({length:121},(_,i)=>i),share:series}});
 assert.equal(provider.history?.frames.length,120);assert.equal(provider.history?.wallets.length,100);assert.equal(provider.history?.truncated,true);assert.equal(provider.truncated,true);
 const invalid=normalize({...raw(),timeline:{t:['invalid'],blocks:[1],share:{[wallet]:[0]}}});assert.equal(invalid.history?.frames.length,0);assert.equal(invalid.history?.truncated,true);
});
test('provider infrastructure adds distinct reported burn/pool roles and total-supply shares',()=>{
 const provider=normalize({...raw(),infra:[{address:burn,label:'burn',share_supply:.79},{address:pool,label:'DEX pool',share_supply:.1349},{address:other,label:'unverified friendly name',share_supply:.01}]});
 const report=bridgeSwarmReport(provider),burnWallet=report.investigation.wallets.find(w=>w.address===burn)!,poolWallet=report.investigation.wallets.find(w=>w.address===pool)!;
 assert.equal(burnWallet.share,79);assert.equal(burnWallet.categorySources?.burn,'swarm');assert.equal(poolWallet.categorySources?.pool,'swarm');assert.equal(poolWallet.share,13.489999999999998);assert.equal(report.investigation.wallets.find(w=>w.address===other)?.categories[0],'unclassified');assert.equal(report.holders.length,4);
});
test('untrusted infrastructure labels cannot resolve prototype properties into categories',()=>{
 for(const label of ['constructor','__proto__','toString']){
  const provider=normalize({...raw(),infra:[{address:other,label,share_supply:.1}]});
  assert.equal(provider.infrastructure?.[0].category,null);assert.deepEqual(bridgeSwarmReport(provider).investigation.wallets.find(w=>w.address===other)?.categories,['unclassified']);
 }
});
test('fresh and insider flags overlap without inferring creator or verified launch timing',()=>{
 const provider=normalize({...raw(),holders:[{address:wallet,signals:{fresh:true,insider:true,sniper:true,dev:true}}]});
 const result=bridgeSwarmReport(provider),w=result.investigation.wallets[0];assert.deepEqual(new Set(w.categories),new Set(['fresh','insider','sniper']));assert.equal(w.categorySources?.fresh,'swarm');assert.equal(result.investigation.coverage.launchVerified,false);
});
test('entry references expose actual reported times and distinguish transfer, mint and buy without amounts',()=>{
 for(const kind of ['transfer','mint','buy','sell','unknown']){
  const provider=normalize({...raw(),holders:[{address:wallet,signals:{kind,entry_ts:100,entry_tx:tx,entry_from:other}}]});const report=bridgeSwarmReport(provider),entry=report.investigation.evidence.find(e=>e.id.startsWith('swarm:entry:'))!;
  assert.equal(entry.transaction,tx);assert.equal(entry.timestamp,new Date(100000).toISOString());assert.equal(entry.attribution,'provider-reported');assert.equal(entry.amount,undefined);assert.equal(entry.amountRaw,undefined);
  assert.equal(report.investigation.timeline.length,kind==='unknown'?0:1);if(kind!=='unknown')assert.equal(report.investigation.timeline[0].kind,kind==='mint'?'transfer':kind);
  assert.equal(report.investigation.wallets[0].firstBuyAt,kind==='buy'?entry.timestamp:undefined);
  if(kind==='sell'){assert.equal(entry.from,wallet);assert.equal(entry.to,undefined);}else assert.equal(entry.to,wallet);
  if(kind==='mint')assert.match(entry.description,/not a purchase/);
 }
});
test('transaction format validation rejects addresses, URLs and malformed signatures',()=>{
 assert.equal(swarmTransaction('ethereum',tx),tx);assert.equal(swarmTransaction('ethereum',wallet),null);assert.equal(swarmTransaction('ethereum','https://example.com/'+tx),null);assert.equal(swarmTransaction('solana','1'.repeat(64)),'1'.repeat(64));assert.equal(swarmTransaction('solana','1'.repeat(88)),null);assert.equal(swarmTransaction('solana','0'.repeat(88)),null);
 const report=bridgeSwarmReport(normalize({...raw(),holders:[{address:wallet,signals:{kind:'buy',entry_ts:100,entry_tx:wallet}}]}));assert.equal(report.investigation.timeline.length,0);assert(!report.investigation.evidence.some(e=>e.transaction));
});
test('link transaction references retain report time explicitly rather than inventing transaction time',()=>{
 const report=bridgeSwarmReport(normalize({...raw(),links:[{a:wallet,b:other,kind:'direct',via:tx},{a:other,b:wallet,kind:'shared-funder',via:pool}]}));
 const first=report.investigation.evidence.find(e=>e.id==='swarm:link:0')!,second=report.investigation.evidence.find(e=>e.id==='swarm:link:1')!;
 assert.equal(first.transaction,tx);assert.equal(first.timestamp,new Date(1000000).toISOString());assert.match(first.description,/not the transaction time/);assert.equal(second.transaction,undefined);assert.equal(report.investigation.timeline.length,0);
});
test('entry without time remains a labeled reference and bounded metrics exclude malformed values',()=>{
 const provider=normalize({...raw(),holders:[{address:wallet,signals:{kind:'buy',entry_tx:tx}}],metrics:{hands:11,wallets:48,impact:.17,biggest:.2,fresh:-1,snipers:'0',concentration:2,dev:.001},parts:{swarm:25.6,dev:10,unknown:99,insiders:Infinity},gates:['soft: grouped wallets']});
 assert.deepEqual(provider.metrics,{hands:11,wallets:48,impact:.17,biggest:.2,dev:.001});assert.deepEqual(provider.scoreParts,{swarm:25.6,dev:10});assert.equal(provider.gates.length,1);
 const report=bridgeSwarmReport(provider);assert.equal(report.investigation.timeline.length,0);assert.match(report.investigation.evidence.find(e=>e.id.startsWith('swarm:entry:'))!.description,/No entry time was supplied/);
});
