import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {feedItem,mergeFeed,parseFeed} from '../src/lib/report-feed';

const live=()=>{const report=structuredClone(fixtureReport);report.fixture=false;return report;};
test('example investigations cannot enter the completed-report feed',()=>{
 assert.equal(feedItem(fixtureReport),null);
});
test('incomplete evidence remains caution, with original retrieval time',()=>{
 const report=live();report.investigation.findings=[];report.checks=[];report.investigation.coverage.status='partial';
 report.investigation.assessment.status='clear';
 const item=feedItem(report)!;assert.equal(item.title,'Caution');assert.equal(item.status,'insufficient');assert.equal(item.fetchedAt,report.fetchedAt);
});
test('inferred warning retains its qualification',()=>{
 const report=live();report.checks=[];report.investigation.findings=[{id:'shared',title:'Shared funding',description:'',level:'warning',certainty:'inferred',wallets:[],evidenceIds:[]}];
 assert.equal(feedItem(report)!.reason,'Possible pattern: Shared funding');
});
test('report feed deduplicates EVM addresses and rejects older replacement',()=>{
 const item=feedItem(live())!;item.fetchedAt='2026-11-02T01:00:00Z';
 const older={...item,token:item.token.toUpperCase().replace('0X','0x'),fetchedAt:'2026-11-01T01:00:00Z'};
 assert.deepEqual(mergeFeed([item],older),[item]);
 const newer={...older,fetchedAt:'2026-11-02T02:00:00Z'};
 assert.deepEqual(mergeFeed([item],newer),[newer]);
});
test('malformed browser storage cannot create report cards',()=>{
 assert.deepEqual(parseFeed('{broken'),[]);assert.deepEqual(parseFeed('[{"title":"Danger"}]'),[]);
 const item=feedItem(live())!;assert.deepEqual(parseFeed(JSON.stringify([item])),[item]);
});
