import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeAbiParameters,encodeEventTopics,parseAbiItem} from 'viem';
import {createFactoryRegistry,type RegistryReader} from '../src/lib/factory-registry';
import {SUPPORTED_POOL_FACTORIES} from '../src/lib/pool-launch';
const token=('0x'+'2'.repeat(40)) as `0x${string}`,other=('0x'+'3'.repeat(40)) as `0x${string}`,pool=('0x'+'4'.repeat(40)) as `0x${string}`,hash=(n:number)=>'0x'+n.toString(16).padStart(64,'0');
const event=parseAbiItem('event PairCreated(address indexed token0,address indexed token1,address pair,uint256 count)');
function log(position=1){return {address:SUPPORTED_POOL_FACTORIES.ethereum.v2,blockNumber:11000000,blockHash:hash(11000000),transactionHash:hash(1),logIndex:0,topics:encodeEventTopics({abi:[event],eventName:'PairCreated',args:{token0:position===1?token:other,token1:position===2?token:other}}),data:encodeAbiParameters([{type:'address'},{type:'uint256'}],[pool,1n])};}
function reader(overrides:Partial<RegistryReader>={}):RegistryReader{return {head:async()=>({number:14000000,hash:hash(14000000)}),blockHash:async(_c,n)=>hash(n),logs:async(_c,r)=>({logs:[],through:r.to,source:'test registry'}),...overrides};}
test('registry scans both token positions at each configured factory independently of market listings',async()=>{
 const queries:{address:string;topics:(string|null)[]}[]=[];
 const result=await createFactoryRegistry(reader({logs:async(_c,r)=>{queries.push(r);return {logs:r.address===SUPPORTED_POOL_FACTORIES.ethereum.v2&&r.topics[1]===null?[log(2)]:[],through:r.to,source:'test'};}}))('ethereum',token);
 assert.equal(queries.length,4);assert.equal(result.status,'complete');assert.equal(result.checkpoint.pools.length,1);assert.equal(result.checkpoint.pools[0].creationTransactionHint,hash(1));assert.match(result.detail,/Other factories/);
});
test('partial covered cursor resumes without rescanning accepted ranges',async()=>{
 const seen:number[]=[];const scan=createFactoryRegistry(reader({logs:async(_c,r)=>{seen.push(r.from);return {logs:[],through:Math.min(r.to,r.from+100),source:'test'};}}));
 const first=await scan('ethereum',token,{maxRanges:1}),second=await scan('ethereum',token,{maxRanges:1,checkpoint:JSON.parse(JSON.stringify(first.checkpoint))});
 assert.equal(first.status,'partial');assert.equal(second.status,'partial');assert.equal(seen[1],seen[0]+101);assert.equal(second.checkpoint.completedRanges,2);
});
test('failed or unbound results do not advance registry cursors',async()=>{
 for(const logs of [async()=>{throw Error('No access');},async()=>({logs:[],through:0,source:'bad'}),async()=>({logs:[{...log(),address:other}],through:14000000,source:'bad'})]){
  const result=await createFactoryRegistry(reader({logs}))('ethereum',token);assert.equal(result.status,'unavailable');assert.equal(result.checkpoint.completedRanges,0);assert.equal(result.checkpoint.pools.length,0);
 }
});
test('anchor mismatch discards stale candidates and restarts registry verification',async()=>{
 const initial=await createFactoryRegistry(reader({logs:async(_c,r)=>({logs:r.address===SUPPORTED_POOL_FACTORIES.ethereum.v2&&r.topics[1]!==null?[log()]:[],through:r.to,source:'test'})}))('ethereum',token,{maxRanges:1});
 assert.equal(initial.checkpoint.pools.length,1);
 const restarted=await createFactoryRegistry(reader({blockHash:async()=>hash(99)}))('ethereum',token,{checkpoint:initial.checkpoint,maxRanges:1});assert.equal(restarted.checkpoint.pools.length,0);assert.equal(restarted.checkpoint.completedRanges,1);
});
test('registry range limits subdivide safely and token binding rejects wrong checkpoints',async()=>{
 let calls=0;const result=await createFactoryRegistry(reader({logs:async(_c,r)=>{calls++;if(calls===1)throw Object.assign(Error('range'),{rangeTooLarge:true});return {logs:[],through:r.to,source:'test'};}}))('ethereum',token,{maxRanges:2});
 assert.equal(result.checkpoint.completedRanges,1);assert.equal(result.status,'partial');assert.equal(result.checkpoint.pending.length,4);
 await assert.rejects(()=>createFactoryRegistry(reader())('ethereum',other,{checkpoint:result.checkpoint}),/scope/);
});
test('corrupt stored coverage cannot erase unfinished ranges or manufacture candidates',async()=>{
 const result=await createFactoryRegistry(reader())('ethereum',token,{maxRanges:1});
 for(const mutate of [(c:any)=>c.pending=[],(c:any)=>c.anchor.number=-1,(c:any)=>c.pools=[{pool:token}],(c:any)=>c.covered.push(c.covered[0])]){const cp=structuredClone(result.checkpoint);mutate(cp);await assert.rejects(()=>createFactoryRegistry(reader())('ethereum',token,{checkpoint:cp}),/checkpoint/);}
});


test('completed registry snapshots extend only new finalized ranges after revalidating their old anchor',async()=>{
 let head=14000000;const seen:{from:number;to:number}[]=[],anchors:number[]=[];
 const newerPool=('0x'+'5'.repeat(40)) as `0x${string}`,newerLog={...log(),blockNumber:14000050,blockHash:hash(14000050),transactionHash:hash(2),data:encodeAbiParameters([{type:'address'},{type:'uint256'}],[newerPool,2n])};
 const source=reader({head:async()=>({number:head,hash:hash(head)}),blockHash:async(_c,n)=>{anchors.push(n);return hash(n);},logs:async(_c,r)=>{seen.push({from:r.from,to:r.to});return {logs:r.address===SUPPORTED_POOL_FACTORIES.ethereum.v2&&r.topics[1]!==null?[log(),newerLog].filter(l=>l.blockNumber>=r.from&&l.blockNumber<=r.to):[],through:r.to,source:'test'};}});
 const scan=createFactoryRegistry(source),initial=await scan('ethereum',token);
 head+=100;const extended=await scan('ethereum',token,{checkpoint:initial.checkpoint});
 assert.equal(extended.checkpoint.anchor.number,head);assert.equal(extended.status,'complete');assert.deepEqual(extended.checkpoint.pools.map(p=>p.pool),[pool,newerPool]);
 assert.deepEqual(anchors,[14000000]);assert.deepEqual(seen.slice(4),Array.from({length:4},()=>({from:14000001,to:14000100})));assert.equal(extended.checkpoint.completedRanges,8);
 const unchanged=await scan('ethereum',token,{checkpoint:extended.checkpoint});assert.equal(unchanged.status,'complete');assert.equal(seen.length,8);
});

test('unfinished registry keeps its fixed anchor even when the finalized head advances',async()=>{
 let head=14000000;const scan=createFactoryRegistry(reader({head:async()=>({number:head,hash:hash(head)})}));
 const partial=await scan('ethereum',token,{maxRanges:1});head+=100;
 const continued=await scan('ethereum',token,{checkpoint:partial.checkpoint,maxRanges:1});
 assert.equal(continued.checkpoint.anchor.number,14000000);assert.equal(continued.checkpoint.completedRanges,2);assert.equal(continued.checkpoint.pending.length,2);
});


test('a completed registry resets its candidates when its anchor forks or finalized head moves backwards',async()=>{
 const initial=await createFactoryRegistry(reader({logs:async(_c,r)=>({logs:r.address===SUPPORTED_POOL_FACTORIES.ethereum.v2&&r.topics[1]!==null?[log()]:[],through:r.to,source:'test'})}))('ethereum',token);
 for(const source of [reader({blockHash:async()=>hash(99)}),reader({head:async()=>({number:13000000,hash:hash(13000000)})})]){
  const restarted=await createFactoryRegistry(source)('ethereum',token,{checkpoint:initial.checkpoint,maxRanges:1});
  assert.equal(restarted.status,'partial');assert.equal(restarted.checkpoint.pools.length,0);assert.equal(restarted.checkpoint.completedRanges,1);assert.equal(restarted.checkpoint.covered[0].from,10000834);
 }
});
