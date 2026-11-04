import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {holderCountSummary} from '../src/lib/holder-count-summary';
test('recorded total, checked holders and traced addresses remain separate quantities',()=>{const r=structuredClone(fixtureReport);r.holderCount=239;r.sources.push({name:'Robinhood Pons Transfer candidate history',status:'available',fetchedAt:r.fetchedAt,detail:'Transfer-ledger count: 239 recorded holder accounts at this safe anchor.'});const counts=holderCountSummary(r);assert.equal(counts.total,239);assert.equal(counts.derived,true);assert.ok(counts.analyzed<counts.total!);assert.equal(counts.traced,r.investigation.wallets.length);assert.equal(counts.analyzed+counts.infrastructure,r.holders.length);});
test('contradictory totals and missing totals are not inferred from the analyzed sample',()=>{for(const total of [null,0,1,NaN,Infinity,2.5]){const r=structuredClone(fixtureReport);r.holderCount=total;assert.equal(holderCountSummary(r).total,null);}});
