import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconstructObservedJudge,type ObservedJudgeInput} from './helpers/swarm-judge-reconstruction';
const data=JSON.parse(readFileSync(new URL('./fixtures/swarm-judge-observations.json',import.meta.url),'utf8')) as {rows:{path:string;split:string;input:ObservedJudgeInput;observed:{decision:string;p:{avoid:number;caution:number;ok:number};confidence:number;bar:number;escalate:boolean;evidence:unknown}}[]};
test('inferred judge curves reproduce every retained supported public output, including existing holdout labels',()=>{
 let matched=0,holdouts=0;
 for(const row of data.rows){
  const actual=reconstructObservedJudge(row.input);if(row.input.score===null){assert.equal(actual,null);continue;}
  assert(actual,row.path);const {raw,total,...rounded}=actual;
  assert.deepEqual(rounded,row.observed,row.path);matched++;if(row.split.includes('holdout'))holdouts++;
 }
 assert(matched>=53);assert(holdouts>=11);
});
test('Grok normalization uses unrounded masses before rounding output percentages',()=>{
 const result=reconstructObservedJudge({score:87,band:'CLEAN',security:0,memoryHits:0,dumpImpact:.2543})!;
 assert.deepEqual(result.p,{avoid:.003,caution:.196,ok:.801});assert.equal(result.decision,'OK');assert.equal(result.escalate,true);
 const older=reconstructObservedJudge({score:91,band:'CLEAN',security:0,memoryHits:0,dumpImpact:.2256})!;
 assert.equal(older.p.ok,.843);assert.notEqual(Math.round(.944/(.002+.944+.173)*1000)/1000,older.p.ok);
});
test('unobserved dangerous-security code and missing score remain unsupported instead of invented',()=>{
 assert.equal(reconstructObservedJudge({score:80,band:'DANGER',security:2,memoryHits:0,dumpImpact:0}),null);
 assert.equal(reconstructObservedJudge({score:null,band:'TOO_EARLY',security:0,memoryHits:0,dumpImpact:null}),null);
});
test('inferred OK mass cannot reach the public OK escalation threshold for scores up to 100',()=>{
 for(let score=0;score<=100;score++){
  const result=reconstructObservedJudge({score,band:'CLEAN',security:0,memoryHits:0,dumpImpact:0})!;
  if(result.decision==='OK')assert(result.raw.ok<result.bar);
 }
});
