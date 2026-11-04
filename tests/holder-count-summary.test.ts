import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {holderCountSummary} from '../src/lib/holder-count-summary';
test('recorded total, checked holders and traced addresses remain separate quantities',()=>{const r=structuredClone(fixtureReport);r.holderCount=239;r.sources.push({name:'Robinhood Pons Transfer candidate history',status:'available',fetchedAt:r.fetchedAt,detail:'Transfer-ledger count: 239 recorded holder accounts at this safe anchor.'});const counts=holderCountSummary(r);assert.equal(counts.total,239);assert.equal(counts.derived,true);assert.ok(counts.analyzed<counts.total!);assert.equal(counts.traced,r.investigation.wallets.length);assert.equal(counts.analyzed+counts.infrastructure,r.holders.length);});
test('authenticated token-index ledger counts remain source-derived and distinct from independently checked accounts',()=>{
 const r=structuredClone(fixtureReport);r.holderCount=239;r.sources.push({name:'Alchemy Robinhood token-transfer index',status:'available',fetchedAt:r.fetchedAt,detail:'Transfer-ledger count: 239 recorded holder accounts at this safe anchor.'});
 assert.equal(holderCountSummary(r).derived,true);assert.equal(holderCountSummary(r).allRecordedChecked,false);
 r.sources.at(-1)!.status='unavailable';assert.equal(holderCountSummary(r).derived,false);
});
test('contradictory totals and missing totals are not inferred from the analyzed sample',()=>{for(const total of [null,0,1,NaN,Infinity,2.5]){const r=structuredClone(fixtureReport);r.holderCount=total;assert.equal(holderCountSummary(r).total,null);}});

test('top-holder presentation never reduces the analyzed holder inventory',()=>{
 const r=structuredClone(fixtureReport);r.chain='robinhood';r.market=null;r.identities=[];r.holderCount=239;
 r.holders=Array.from({length:239},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),share:100/239,contract:false,locked:false,tag:''}));
 r.investigation.wallets=r.holders.map(h=>({address:h.address,share:h.share,categories:['unclassified'],evidenceIds:[]}));r.investigation.evidence=[];
 const before=JSON.stringify(r),counts=holderCountSummary(r);
 assert.equal(counts.total,239);assert.equal(counts.analyzed,239);assert.equal(counts.displayed,50);assert.equal(counts.infrastructure,0);assert.equal(counts.traced,239);
 assert.equal(JSON.stringify(r),before);
});

test('all-account status requires a complete matching inventory and every recorded balance',()=>{
 const r=structuredClone(fixtureReport);r.chain='robinhood';r.market=null;r.identities=[];delete r.fixture;
 r.holderCount=r.holders.length;
 r.holderEnumeration={kind:'pons-creation-ledger',recordedAccounts:r.holders.length,verifiedAccounts:r.holders.length,complete:true};
 assert.equal(holderCountSummary(r).allRecordedChecked,true);
 r.holderEnumeration.complete=false;assert.equal(holderCountSummary(r).allRecordedChecked,false);
 r.holderEnumeration.complete=true;r.holderEnumeration.verifiedAccounts--;assert.equal(holderCountSummary(r).allRecordedChecked,false);
 r.holderEnumeration.verifiedAccounts++;r.holders.pop();assert.equal(holderCountSummary(r).allRecordedChecked,false);
});
