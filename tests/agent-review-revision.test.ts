import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {agentReportIdentity,agentEvidenceIdentity} from '../src/lib/agent-report-identity';
test('pool constraints and source failures invalidate both analyst identities',()=>{
 for(const identity of [agentReportIdentity,agentEvidenceIdentity]){const r=structuredClone(fixtureReport),before=identity(r);r.poolReserves={status:'unknown',reasons:['Quote controls changed']};assert.notEqual(identity(r),before);const pool=identity(r);r.sources.push({name:'Solana RPC authorities',status:'unavailable',detail:'Refresh failed'});assert.notEqual(identity(r),pool);}
});
test('ordinary market refresh alone retains only the dated evidence identity',()=>{const r=structuredClone(fixtureReport),before=agentEvidenceIdentity(r);r.sources=r.sources.filter(s=>s.name!=='DEX Screener');r.sources.push({name:'DEX Screener',status:'available',fetchedAt:'2026-11-03T00:00:00Z',detail:'New market tick'});assert.equal(agentEvidenceIdentity(r),before);});
