import test from 'node:test';
import assert from 'node:assert/strict';
import {holderMapDrift} from '../src/lib/holder-map-motion';
import {layoutHolderMap} from '../src/lib/holder-map-layout';

test('a single holder visibly floats through a continuous closed path',()=>{
 const start=holderMapDrift(0,0),quarter=holderMapDrift(Math.PI/2,0),end=holderMapDrift(2*Math.PI,0);
 assert(Math.hypot(quarter.x-start.x,quarter.y-start.y)>20);
 assert(Math.hypot(end.x-start.x,end.y-start.y)<1e-10);
});
test('all frames preserve current-holder separation and leave room for selection outlines',()=>{
 for(const shares of [[100],[50,40,10],Array(100).fill(1),[99,...Array(99).fill(.0001)]]){
  const nodes=layoutHolderMap(shares.map(share=>({share})));
  for(let frame=0;frame<=48;frame++){
   const moved=nodes.map((node,index)=>{const d=holderMapDrift(frame*Math.PI/24,index);return {...node,x:node.x+d.x,y:node.y+d.y};});
   for(let i=0;i<moved.length;i++){
    const a=moved[i];assert(a.x-a.radius>=16&&a.x+a.radius<=684&&a.y-a.radius>=16&&a.y+a.radius<=384,'selection outline stays inside the plot');
    for(const b of moved.slice(i+1))assert(Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius,'moving bubbles never overlap');
   }
  }
 }
});
test('invalid frame inputs cannot write NaN transforms to the map',()=>{
 for(const [phase,index] of [[NaN,0],[Infinity,0],[1,-1],[1,.5]])assert.deepEqual(holderMapDrift(phase,index),{x:0,y:0});
});
