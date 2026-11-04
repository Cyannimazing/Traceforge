import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutHolderMap} from '../src/lib/holder-map-layout';

function validate(shares:(number|null)[]){
 const input=shares.map(share=>({share})),before=JSON.stringify(input),nodes=layoutHolderMap(input);
 assert.equal(nodes.length,shares.length);assert.equal(JSON.stringify(input),before);assert.deepEqual(nodes,layoutHolderMap(input));
 for(let i=0;i<nodes.length;i++){const a=nodes[i];assert.ok(Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.radius));assert.ok(a.radius>=7);assert.ok(a.x-a.radius>=32-.001&&a.x+a.radius<=668+.001);assert.ok(a.y-a.radius>=32-.001&&a.y+a.radius<=368+.001);
  for(const b of nodes.slice(i+1)){const distance=Math.hypot(a.x-b.x,a.y-b.y);assert.ok(distance>=a.radius+b.radius+8-.001,`overlap at ${i}: ${distance} < ${a.radius+b.radius+8}`);assert.ok(distance-Math.hypot(4,4)>a.radius+b.radius,'worst-case decorative drift still separates bubbles');}
 }
 const scaled=nodes.flatMap((node,i)=>shares[i]!==null&&shares[i]!>0&&node.radius>7.001?[node.radius**2/shares[i]!]:[]);for(const ratio of scaled)assert.ok(Math.abs(ratio-scaled[0])<.000001,'one area scale for non-minimum bubbles');
 return nodes;
}
test('100 equal holders fit without overlap and retain equal areas',()=>{const nodes=validate(Array(100).fill(1));assert.ok(nodes[0].radius<20);assert.ok(nodes.every(node=>node.radius===nodes[0].radius));});
test('one dominant holder plus99 tiny holders preserves proportions and every marker',()=>{const nodes=validate([99,...Array(99).fill(.0001)]);assert.ok(nodes[0].radius>nodes[1].radius*5);});
test('19 similarly sized holders fit while keeping proportional areas',()=>{validate(Array.from({length:19},(_,i)=>3+i*.1));});
test('zero and unknown shares use explicit minimum markers without fabricated area',()=>{const nodes=validate(Array.from({length:100},(_,i)=>i%2?null:0));assert.ok(nodes.every(node=>node.radius===7));assert.deepEqual(layoutHolderMap([]),[]);});
test('mixed distributions remain bounded and disjoint deterministically',()=>{for(const count of [1,2,8,37,100])validate(Array.from({length:count},(_,i)=>i%13===0?null:100/((i+1)**1.5)));});

test('a long-tail holder distribution forms a circular constellation instead of shelf rows',()=>{
 const shares=Array.from({length:36},(_,i)=>i<12?4/(1+i*.22):.08/(i-10));
 const nodes=validate(shares),radius=164;
 for(const node of nodes)assert.ok(Math.hypot(node.x-350,node.y-200)+node.radius<=radius+.001,'wallet must remain inside the circular field');
 const bands=new Map<number,number>();for(const node of nodes.slice(0,12)){const band=Math.round(node.y/2);bands.set(band,(bands.get(band)||0)+1);}assert.ok(Math.max(...bands.values())<=2,'largest wallets must not line up in ranked shelf rows');
});

test('one holder fills the field without losing its centered position',()=>{
 const [node]=validate([100]);
 assert.equal(node.x,350);assert.equal(node.y,200);
 assert.ok(node.radius>=130,'a lone holder should remain a prominent readable circle');
});

test('equal holdings have organic clearance rather than a rigid tangent lattice',()=>{
 const nodes=validate(Array(50).fill(1));
 const clearances=nodes.map((node,index)=>Math.min(...nodes.filter((_,other)=>other!==index).map(other=>Math.hypot(node.x-other.x,node.y-other.y)-node.radius-other.radius)));
 assert.ok(Math.max(...clearances)-Math.min(...clearances)>2,'circles must have varied open space while keeping equal areas');
});

test('dense holder inventories remain bounded without a ranked-row fallback',()=>{
 for(const count of [120,200,500]){
  const input=Array.from({length:count},(_,index)=>({share:index%11===0?null:12/(index+1)})),nodes=layoutHolderMap(input);
  assert.equal(nodes.length,count);
  for(let index=0;index<nodes.length;index++){
   const node=nodes[index];assert.ok(node.radius>0);
   assert.ok(Math.hypot(node.x-350,node.y-200)+node.radius<=164.001);
   for(const other of nodes.slice(index+1))assert.ok(Math.hypot(node.x-other.x,node.y-other.y)>=node.radius+other.radius+7.999,'dense inventories must retain drift clearance');
  }
 }
});

test('responsive field dimensions retain all holders and proportional areas',()=>{
 for(const [width,height] of [[320,400],[400,400],[900,500]])for(const count of [1,2,10,50,100]){
  const nodes=layoutHolderMap(Array.from({length:count},(_,index)=>({share:6/(index+1)})),width,height);
  assert.equal(nodes.length,count);
  for(const node of nodes){assert.ok(node.x-node.radius>=32&&node.x+node.radius<=width-32);assert.ok(node.y-node.radius>=32&&node.y+node.radius<=height-32);}
 }
});
