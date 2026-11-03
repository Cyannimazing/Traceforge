import test from 'node:test';
import assert from 'node:assert/strict';
import {holderMapFloatBasis, mapDisplayShare,resolveShareBasis,shareBasisLabel,sharePercentText} from '../src/lib/holder-map-basis';

test('float subtracts documented infrastructure, not the displayed holder sum', () => {
  const basis = holderMapFloatBasis([{address:'pool',share:97.9795163296}], ['pool']);
  assert.ok(Math.abs(basis.denominator! - 2.0204836704) < 1e-12);
  assert.ok(Math.abs(mapDisplayShare(1.1363973555,'float',basis)! - 56.24382776) < 1e-7);
  assert.ok(Math.abs(mapDisplayShare(.8840863149,'float',basis)! - 43.75617224) < 1e-7);
  assert.equal(mapDisplayShare(1.1363973555,'total',basis),1.1363973555);
  assert.ok(mapDisplayShare(.1,'float',basis)! < 5); // A one-wallet display is not normalized to 100%.
});
test('unknown, absent, negative and invalid infrastructure balances withhold float', () => {
  for(const share of [null,NaN,Infinity,-1,101]) assert.equal(holderMapFloatBasis([{address:'pool',share}],['pool']).denominator,null);
  const absent=holderMapFloatBasis([],['pool']);
  assert.equal(absent.denominator,null);assert.match(absent.reason!,/no snapshot balance/);
  assert.equal(mapDisplayShare(2,'float',absent),null);
  assert.equal(mapDisplayShare(2,'total',absent),2);
});
test('zero infrastructure is valid; zero or overflowing denominator is not', () => {
  assert.equal(holderMapFloatBasis([{address:'pool',share:0}],['pool']).denominator,100);
  assert.equal(holderMapFloatBasis([],[]).denominator,100);
  for(const shares of [[100],[60,50]]) assert.equal(holderMapFloatBasis(shares.map((share,index)=>({address:String(index),share})),[]).denominator,null);
  assert.equal(mapDisplayShare(0,'float',holderMapFloatBasis([],[])),0);
  assert.equal(mapDisplayShare(null,'total',holderMapFloatBasis([],[])),null);
});
test('deduplication is chain-aware and never double-subtracts one address', () => {
  assert.equal(holderMapFloatBasis([{address:'POOL',share:20},{address:'pool',share:20}],['Pool']).denominator,80);
  assert.equal(holderMapFloatBasis([{address:'POOL',share:20}],['pool'],true).denominator,null);
});
test('contradictory partial snapshots disable float without normalizing or clamping', () => {
  const basis=holderMapFloatBasis([{address:'pool',share:98}],['pool'],false,[{address:'holder',share:3}]);
  assert.equal(basis.denominator,null);assert.match(basis.reason!,/snapshot is inconsistent/);
  assert.equal(mapDisplayShare(3,'total',basis),3);
  assert.equal(mapDisplayShare(3,'float',{denominator:2,excluded:98,reason:null}),null);
  const aggregate=holderMapFloatBasis([{address:'pool',share:90}],['pool'],false,[{address:'a',share:6},{address:'b',share:5}]);
  assert.equal(aggregate.denominator,null);
  assert.equal(holderMapFloatBasis([],[],false,[{address:'a',share:60},{address:'b',share:50}]).denominator,null);
  assert.equal(mapDisplayShare(101,'total',basis),null);
  assert.equal(holderMapFloatBasis([{address:'pool',share:98}],['pool'],false,[{address:'holder',share:1}]).denominator,2);
});
test('one preferred basis resolves identically for holders and map, with total-only infrastructure',()=>{
 const float=holderMapFloatBasis([{address:'pool',share:98}],['pool'],false,[{address:'a',share:1}]);
 assert.equal(resolveShareBasis('float',float),'float');assert.equal(resolveShareBasis('total',float),'total');
 assert.equal(resolveShareBasis('float',float,true),'total');
 assert.equal(mapDisplayShare(98,resolveShareBasis('float',float,true),float),98);
 assert.equal(sharePercentText(mapDisplayShare(1,resolveShareBasis('float',float),float)),'50%');
 assert.equal(shareBasisLabel('float'),'Snapshot float');assert.equal(shareBasisLabel('total'),'Total supply');
 assert.equal(resolveShareBasis('float',holderMapFloatBasis([],['missing'])),'total');
 assert.equal(sharePercentText(.00001),'<0.01%');assert.equal(sharePercentText(null),'Unavailable');
});
test('a measured remaining holder resolves to 100 despite subtraction roundoff',()=>{
 const holderShare=.0208738214192387;
 const basis=holderMapFloatBasis([{address:'manager',share:99.97912617858076}],['manager'],false,[{address:'holder',share:holderShare}]);
 assert.notEqual(basis.denominator,null);
 assert.equal(mapDisplayShare(holderShare,'float',basis),100);
 assert.equal(sharePercentText(mapDisplayShare(holderShare,'float',basis)),'100%');
 // Only arithmetic boundary overshoot is tolerated; no row normalization.
 assert.equal(mapDisplayShare(1.00000000001,'float',{denominator:1,excluded:99,reason:null}),100);
 assert.equal(mapDisplayShare(1.000000001,'float',{denominator:1,excluded:99,reason:null}),null);
 assert.equal(mapDisplayShare(3,'float',{denominator:2,excluded:98,reason:null}),null);
 assert.equal(mapDisplayShare(1e-12,'float',{denominator:100,excluded:0,reason:null}),1e-12);
 assert.equal(mapDisplayShare(100.000000001,'total',basis),null);
});
