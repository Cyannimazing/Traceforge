import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryLayout} from '../src/lib/discovery-layout';

const ids=Array.from({length:16},(_,i)=>`solana:token-${i}`);
test('a single-network discovery set occupies every quadrant with bounded contact spacing',()=>{
 const points=discoveryLayout(ids);
 assert.equal(points.length,16);
 const quadrants=new Set(points.map(p=>Math.floor(p.bearing/90)));
 assert.equal(quadrants.size,4);
 for(const p of points){
  const distance=Math.hypot(p.x-240,p.y-240);
  assert(distance>=73&&distance<=180);
  for(const q of points)if(q.id!==p.id)assert(Math.hypot(p.x-q.x,p.y-q.y)>=40,`${p.id} overlaps ${q.id}`);
 }
});
test('reordering the same profiles leaves their contact coordinates unchanged',()=>{
 assert.deepEqual(discoveryLayout(ids),discoveryLayout([...ids].reverse()));
});
test('empty, duplicate and oversized input sets stay bounded',()=>{
 assert.deepEqual(discoveryLayout([]),[]);
 assert.equal(discoveryLayout(['a','a']).length,1);
 assert.equal(discoveryLayout(Array.from({length:200},(_,i)=>String(i))).length,16);
 for(const p of discoveryLayout(['only']))assert(Number.isFinite(p.bearing)&&Number.isFinite(p.x));
});
test('different token identities do not introduce collisions at the sixteen-contact limit',()=>{
 for(let seed=0;seed<100;seed++){
  const points=discoveryLayout(Array.from({length:16},(_,index)=>`base:${seed}:${index}`));
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
   assert(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>=40,`contact collision for set ${seed}`);
  }
 }
});
