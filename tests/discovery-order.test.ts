import test from 'node:test';
import assert from 'node:assert/strict';
import {latestDiscoveryProfiles} from '../src/lib/discovery-order';
test('all networks share one newest-pair order instead of fixed chain slots',()=>{
 const rows=[{chain:'ethereum',address:'old',pairCreatedAt:'2026-11-03T08:00:00Z'},{chain:'solana',address:'new',pairCreatedAt:'2026-11-03T09:00:00Z'},{chain:'base',address:'middle',pairCreatedAt:'2026-11-03T08:30:00Z'}];
 assert.deepEqual(latestDiscoveryProfiles(rows).map(r=>r.address),['new','middle','old']);assert.equal(rows[0].address,'old');
});
test('missing or invalid timestamps sort last and ties remain stable',()=>{
 const rows=[{chain:'solana',address:'missing'},{chain:'bsc',address:'bad',pairCreatedAt:'bad'},{chain:'ethereum',address:'b',pairCreatedAt:'2026-11-03T09:00:00Z'},{chain:'ethereum',address:'a',pairCreatedAt:'2026-11-03T09:00:00Z'}];
 assert.deepEqual(latestDiscoveryProfiles(rows).map(r=>r.address),['a','b','bad','missing']);
 assert.deepEqual(latestDiscoveryProfiles([...rows].reverse()),latestDiscoveryProfiles(rows));
});
