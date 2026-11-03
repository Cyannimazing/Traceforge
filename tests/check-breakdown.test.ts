import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBreakdown} from '../src/lib/check-breakdown';
import type {Check} from '../src/lib/analysis';
const c=(key:string,status:Check['status']):Check=>({key,status,title:key,value:'',description:''});
test('unknown checks never count as passed and empty denominator has no percentage',()=>{
 const result=checkBreakdown([c('missing','unknown')]);assert.equal(result.completed,0);assert.equal(result.unchecked,1);assert(result.buckets.every(b=>b.percent===null));
});
test('percentages sum to 100 and keep counts with a three-way split',()=>{
 const result=checkBreakdown([c('a','clear'),c('b','warning'),c('c','critical'),c('d','unknown')]);assert.deepEqual(result.buckets.map(b=>b.count),[1,1,1]);assert.equal(result.buckets.reduce((n,b)=>n+(b.percent||0),0),100);assert.equal(result.unchecked,1);
});
test('duplicate decoder summaries do not inflate pass share and duplicate risks dominate',()=>{
 const result=checkBreakdown([c('mint','clear'),c('mint','critical'),c('solana_extensions','clear')]);assert.equal(result.completed,1);assert.equal(result.buckets[2].percent,100);
});

test('unsupported extension summary remains an unchecked control even beside recognized clear controls',()=>{
 const result=checkBreakdown([c('solana_mint_authority','clear'),c('solana_freeze_authority','clear'),c('solana_extensions','unknown')]);
 assert.equal(result.unchecked,1);assert.equal(result.completed,2);
 assert.equal(result.items.find(item=>item.key==='solana_extensions')?.status,'unknown');
});

test('warning and critical extension summaries cannot disappear behind clear duplicates',()=>{
 for(const status of ['warning','critical'] as const){
  for(const checks of [[c('solana_extensions','clear'),c('solana_extensions',status)],[c('solana_extensions',status),c('solana_extensions','clear')]]){
   const result=checkBreakdown(checks);
   assert.equal(result.items.length,1);assert.equal(result.items[0].status,status);
   assert.equal(result.buckets[status==='critical'?2:1].count,1);
  }
 }
});
