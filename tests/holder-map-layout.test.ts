import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutHolderMap} from '../src/lib/holder-map-layout';

function validate(shares:(number|null)[]){
 const input=shares.map(share=>({share})),before=JSON.stringify(input),nodes=layoutHolderMap(input);
 assert.equal(nodes.length,shares.length);assert.equal(JSON.stringify(input),before);assert.deepEqual(nodes,layoutHolderMap(input));
 for(let i=0;i<nodes.length;i++){const a=nodes[i];assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.radius));assert.ok(a.radius>=7);assert.ok(a.x-a.radius>=32-.001&&a.x+a.radius<=668+.001);assert.ok(a.y-a.radius>=32-.001&&a.y+a.radius<=368+.001);
  for(const b of nodes.slice(i+1)){const distance=Math.hypot(a.x-b.x,a.y-b.y);assert.ok(distance>=a.radius+b.radius+14-.001,`overlap at ${i}: ${distance} < ${a.radius+b.radius+14}`);assert.ok(distance-Math.hypot(10,8)>a.radius+b.radius,'worst-case decorative drift still separates bubbles');}
 }
 const scaled=nodes.flatMap((node,i)=>shares[i]!==null&&shares[i]!>0&&node.radius>7.001?[node.radius**2/shares[i]!]:[]);for(const ratio of scaled)assert.ok(Math.abs(ratio-scaled[0])<.000001,'one area scale for non-minimum bubbles');
 return nodes;
}
test('100 equal holders fit without overlap and retain equal areas',()=>{const nodes=validate(Array(100).fill(1));assert.ok(nodes[0].radius<20);assert.ok(nodes.every(node=>node.radius===nodes[0].radius));});
test('one dominant holder plus99 tiny holders preserves proportions and every marker',()=>{const nodes=validate([99,...Array(99).fill(.0001)]);assert.ok(nodes[0].radius>nodes[1].radius*5);});
test('19 similarly sized holders fit while keeping proportional areas',()=>{validate(Array.from({length:19},(_,i)=>3+i*.1));});
test('zero and unknown shares use explicit minimum markers without fabricated area',()=>{const nodes=validate(Array.from({length:100},(_,i)=>i%2?null:0));assert.ok(nodes.every(node=>node.radius===7));assert.deepEqual(layoutHolderMap([]),[]);});
test('mixed distributions remain bounded and disjoint deterministically',()=>{for(const count of [1,2,8,37,100])validate(Array.from({length:count},(_,i)=>i%13===0?null:100/((i+1)**1.5)));});
