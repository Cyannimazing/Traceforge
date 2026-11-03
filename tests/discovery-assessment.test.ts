import test from 'node:test';
import assert from 'node:assert/strict';
import {latestDiscoveryAssessment} from '../src/lib/discovery-assessment';

test('a newer server assessment replaces an older local report and vice versa',()=>{
 const older={fetchedAt:'2026-11-03T08:00:00Z',title:'Caution'},newer={fetchedAt:'2026-11-03T09:00:00Z',title:'Danger'};
 assert.equal(latestDiscoveryAssessment(older,newer),newer);
 assert.equal(latestDiscoveryAssessment(newer,older),newer);
});
test('a missing or invalid assessment preserves the last valid retrieval',()=>{
 const valid={fetchedAt:'2026-11-03T08:00:00Z'};
 assert.equal(latestDiscoveryAssessment(valid,null,undefined,{fetchedAt:'bad'}),valid);
 assert.equal(latestDiscoveryAssessment(null,undefined,{fetchedAt:'bad'}),undefined);
});
