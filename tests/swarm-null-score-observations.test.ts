import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Research observations only. This fixture is never a production fallback.
const corpus=JSON.parse(readFileSync(new URL('./fixtures/swarm-null-score-observations.json',import.meta.url),'utf8'));
type Row={key:string;chain:string;token:string;scannedAt:number;score:null;band:string;reason:string;source:{path:string;sha256:string};features:{security:number;memory_hits:number;liquidity_usd:number|null;age_h:number|null};observed:{model:string;decision:string;p:{avoid:number;caution:number;ok:number};confidence:number;bar:number;escalate:boolean;why:string[];receipt:string}};
const rows=corpus.rows as Row[];

test('null-score corpus preserves20 distinct public snapshots across five chains',()=>{
  assert.equal(rows.length,20);assert.equal(new Set(rows.map(row=>row.key)).size,20);
  assert.equal(new Set(rows.map(row=>row.chain)).size,5);
  for(const row of rows){assert.equal(row.key,`${row.chain}:${row.token}:${row.scannedAt}`);assert.equal(row.score,null);assert.equal(row.observed.model,'swarm-judge-1');assert.ok(row.observed.receipt);}
  assert.match(corpus.scope,/Retrospective/);assert.match(corpus.userPolicy,/not a user-requested policy/);
});

test('saved too-early outputs stay invariant despite security and memory variation',()=>{
  // These are asserted captured outputs, not coefficients for our own verdict.
  for(const row of rows){
    assert.equal(row.band,'TOO_EARLY');assert.match(row.reason,/too few holders/);
    assert.deepEqual(row.observed.p,{avoid:.34,caution:.46,ok:.20});
    assert.equal(row.observed.decision,'CAUTION');assert.equal(row.observed.confidence,.46);
    assert.equal(row.observed.bar,.6);assert.equal(row.observed.escalate,true);
  }
  assert.equal(rows.filter(row=>row.features.security===1).length,3);
  assert.equal(rows.filter(row=>row.features.memory_hits===2).length,1);
  assert.ok(rows.some(row=>(row.features.age_h??0)>70));
  assert.ok(rows.some(row=>(row.features.liquidity_usd??0)>400000));
});

test('self-contained research fixture records five source hashes',()=>{
  const sources=new Map(rows.map(row=>[row.source.path,row.source.sha256]));
  assert.equal(sources.size,5);
  for(const [path,hash] of sources){
    assert.match(path,/^validation\//);assert.ok(!path.includes('..'));assert.match(hash,/^[a-f0-9]{64}$/);
  }
  assert.equal(corpus.publicScript.sha256,'f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380');
});
