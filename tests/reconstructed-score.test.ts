import test from 'node:test';
import assert from 'node:assert/strict';
import observations from './fixtures/swarm-score-observations.json';
import {factorPoints,scoreFactors} from '../src/lib/reconstructed-score';
type Id='swarm'|'fresh'|'insiders'|'concentration'|'snipers'|'dev';
test('inferred curves reproduce independently held-out public component values',()=>{
 let heldout=0;
 for(const row of observations.rows){
  for(const id of ['swarm','insiders','concentration','snipers','dev'] as const){
   const value=id==='swarm'?row.metrics.impact:row.metrics[id];if(value===null)continue;
   const points=factorPoints(id,value);assert.notEqual(points,null);assert.ok(Math.abs(Number(points!.toFixed(1))-row.parts[id])<0.0001,`${row.chain}:${row.token}:${id}`);
  }
  if(row.split==='holdout')heldout++;
 }
 assert(heldout>0,'must include held-out reports');
});
test('unknown factors produce a range, never a fabricated exact score',()=>{
 const r=scoreFactors([]);assert.equal(r.score,null);assert.deepEqual(r.range,{lower:0,upper:100});assert.equal(r.components.length,6);
});
test('stop rules take precedence over favorable factor points',()=>{
 const r=scoreFactors([],{hard:['Freeze authority is active']});assert.equal(r.score,null);assert.equal(r.decision,'AVOID');assert.equal(r.range.upper,100);
 const soft=scoreFactors([],{soft:['Connected group contains three current holders']});assert.equal(soft.range.upper,59);assert.equal(soft.ceiling,59);
});
test('missing core evidence cannot produce CLEAN from numeric component matches',()=>{
 const values:Record<Id,number>={swarm:0,fresh:0,insiders:0,concentration:0,snipers:0,dev:0};
 const r=scoreFactors(Object.entries(values).map(([id,value])=>({id:id as Id,value,lower:value,upper:value,evidenceIds:[],detail:'observed'})),{missingCore:true});assert.equal(r.decision,'CAUTION');
});
test('repeated gates never multiply deductions and malformed inputs cannot raise score',()=>{
 assert.deepEqual(scoreFactors([],{soft:['x','x']}),scoreFactors([],{soft:['x']}));
 for(const value of [NaN,Infinity,-1,1.1])assert.equal(factorPoints('swarm',value),null);
});

test('hard decisions preserve measured component points instead of forcing a zero score',()=>{const r=scoreFactors((['swarm','fresh','insiders','concentration','snipers','dev'] as const).map(id=>({id,value:0,lower:0,upper:0,evidenceIds:[],detail:'Observed'})),{hard:['Freeze authority']});assert.equal(r.score,100);assert.equal(r.decision,'AVOID');});
test('fresh hard-stop threshold is not treated as a recovered component curve',()=>{assert.equal(factorPoints('fresh',.8),null);assert.equal(factorPoints('fresh',6/7),0);});

test('a measurement interval entirely inside a score plateau has known component points',()=>{
 const r=scoreFactors([{id:'snipers',value:null,lower:.8,upper:1,evidenceIds:['tx'],detail:'At least80% first minute exposure'}]);const c=r.components.find(c=>c.id==='snipers')!;assert.equal(c.earned,0);assert.equal(c.state,'flagged');assert.equal(c.lower,0);assert.equal(c.upper,0);
});
