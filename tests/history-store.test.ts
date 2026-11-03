import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {HistoryStore,historyJobId} from '../src/lib/history-store';
function fixture(t:{after:(fn:()=>void)=>void}){const dir=mkdtempSync(join(tmpdir(),'traceforge-history-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return join(dir,'nested','history.sqlite');}
test('discovery metadata updates completed jobs without replacing evidence and rejects running or stale writes',t=>{
 const store=new HistoryStore(fixture(t)),created=store.create({chain:'base',token:'x',pools:['p']}),lease=store.acquire(created.id)!;
 assert.throws(()=>store.updateDiscovery(created.id,lease.job.revision,{status:'partial'}),/running/i);
 const done=store.savePool(created.id,lease.token,lease.job.revision,{pool:'p',status:'complete',checkpoint:{cursor:7},result:{proof:true}},{status:'complete',result:{other:'retained'},progress:{nextPool:'p'}});
 const updated=store.updateDiscovery(done.id,done.revision,{registry:{status:'complete'}});
 assert.equal(updated.status,'complete');assert.deepEqual(updated.pools,done.pools);assert.deepEqual(updated.progress,done.progress);
 assert.deepEqual(updated.result,{other:'retained',discovery:{registry:{status:'complete'}}});assert.equal(updated.revision,done.revision+1);
 assert.throws(()=>store.updateDiscovery(done.id,done.revision,{}),/revision/i);
 assert.throws(()=>store.updateDiscovery(done.id,updated.revision,{bad:NaN}),/JSON/i);assert.equal(store.get(done.id)!.revision,updated.revision);store.close();
});
test('jobs and atomic pool checkpoints survive close and reopen with counts and immutable token scope',t=>{
 const path=fixture(t);let store=new HistoryStore(path);const job=store.create({chain:'ethereum',token:'0xAbC',pools:['pool1','pool2','pool1']});
 assert.equal(job.token,'0xabc');assert.equal(job.pools.length,2);const lease=store.acquire(job.id)!;
 const saved=store.savePool(job.id,lease.token,lease.job.revision,{pool:'pool1',status:'complete',checkpoint:{cursor:20},result:{trades:['observed']}},{progress:{pages:2},message:'Saved first pool'});
 assert.equal(saved.counts.complete,1);assert.equal(saved.counts.queued,1);store.release(job.id,lease.token,saved.revision);store.close();
 store=new HistoryStore(path);const loaded=store.get(job.id)!;assert.equal(loaded.status,'paused');assert.deepEqual(loaded.pools[0].checkpoint,{cursor:20});assert.deepEqual(loaded.progress,{pages:2});assert.equal(loaded.message,'Saved first pool');store.close();
});
test('leases exclude competing connections and stale or expired saves cannot alter pool/job data',t=>{
 let now=1000;const path=fixture(t),a=new HistoryStore(path,{now:()=>now}),b=new HistoryStore(path,{now:()=>now});
 const job=a.create({chain:'base',token:'0x1',pools:['p']});const lease=a.acquire(job.id,1000)!;assert.equal(b.acquire(job.id),null);
 const updated=a.savePool(job.id,lease.token,lease.job.revision,{pool:'p',status:'running',checkpoint:{cursor:1}});
 assert.throws(()=>b.savePool(job.id,lease.token,lease.job.revision,{pool:'p',status:'complete'}),/revision/i);
 assert.throws(()=>b.saveJob(job.id,'wrong',updated.revision,{message:'bad'}),/lease/i);
 now=2001;assert.throws(()=>a.saveJob(job.id,lease.token,updated.revision,{message:'late'}),/lease/i);
 assert.equal(b.recoverExpired(),1);assert.equal(b.get(job.id)?.status,'paused');assert.deepEqual(b.get(job.id)?.pools[0].checkpoint,{cursor:1});
 b.resume(job.id);const next=b.acquire(job.id)!;assert.notEqual(next.token,lease.token);assert.throws(()=>a.release(job.id,lease.token,next.job.revision),/lease/i);a.close();b.close();
});
test('pause fences a running worker and resume keeps checkpoints; restart recovers only expired running jobs',t=>{
 let now=0;const path=fixture(t),store=new HistoryStore(path,{now:()=>now});let job=store.create({chain:'solana',token:'CaseSensitive',pools:['P']});let lease=store.acquire(job.id,1000)!;
 job=store.pause(job.id,lease.job.revision);assert.equal(job.status,'paused');assert.throws(()=>store.saveJob(job.id,lease.token,lease.job.revision,{}),/revision|lease/i);
 store.resume(job.id,job.revision);lease=store.acquire(job.id,1000)!;store.close();const concurrent=new HistoryStore(path,{now:()=>now});assert.equal(concurrent.get(job.id)?.status,'running');concurrent.close();now=1001;
 const restarted=new HistoryStore(path,{now:()=>now});assert.equal(restarted.get(job.id)?.status,'paused');assert.match(restarted.get(job.id)!.message,/interrupted|expired/i);restarted.close();
});
test('scope IDs distinguish chains and Solana case and bound deduplicated pools',t=>{
 assert.equal(historyJobId('ethereum','0xAbC'),historyJobId('ethereum','0xabc'));assert.notEqual(historyJobId('base','0xabc'),historyJobId('ethereum','0xabc'));assert.notEqual(historyJobId('solana','Abc'),historyJobId('solana','abc'));
 const store=new HistoryStore(fixture(t));const job=store.create({chain:'base',token:'x',pools:['A','a']});assert.equal(job.pools.length,1);assert.throws(()=>store.create({chain:'base',token:'y',pools:Array.from({length:21},(_,i)=>String(i))}),/20/);
 const expanded=store.addPools(job.id,job.revision,Array.from({length:25},(_,i)=>String(i)),true);assert.equal(expanded.pools.length,26);assert.equal(expanded.poolLimit,100);assert.throws(()=>store.addPools(job.id,job.revision,['stale']),/revision/);store.close();
});
test('malformed persisted JSON fails closed instead of treating work as empty or complete',t=>{
 const path=fixture(t),store=new HistoryStore(path);const job=store.create({chain:'base',token:'x',pools:['p']});store.close();const db=new DatabaseSync(path);db.prepare('UPDATE history_pools SET checkpoint_json=? WHERE job_id=?').run('{broken',job.id);db.close();
 const reopened=new HistoryStore(path);assert.throws(()=>reopened.get(job.id),/corrupt/i);assert.throws(()=>reopened.acquire(job.id),/corrupt/i);reopened.close();
});
test('failed checkpoint serialization is atomic and credentials are rejected',t=>{
 const store=new HistoryStore(fixture(t)),job=store.create({chain:'base',token:'x',pools:['p']}),lease=store.acquire(job.id)!;
 assert.throws(()=>store.savePool(job.id,lease.token,lease.job.revision,{pool:'p',status:'complete',checkpoint:{cursor:1}},{progress:{bad:NaN}}),/JSON/i);
 assert.equal(store.get(job.id)?.pools[0].status,'queued');assert.equal(store.get(job.id)?.revision,lease.job.revision);
 assert.throws(()=>store.saveJob(job.id,lease.token,lease.job.revision,{result:{apiKey:'not-a-real-secret'}}),/credential/i);store.close();
});
test('retention only prunes complete jobs and refuses to evict paused or queued work',t=>{
 const store=new HistoryStore(fixture(t),{maxJobs:2});const a=store.create({chain:'base',token:'a',pools:['p']});store.create({chain:'base',token:'b',pools:['p']});assert.throws(()=>store.create({chain:'base',token:'c',pools:['p']}),/capacity/i);
 const lease=store.acquire(a.id)!;const complete=store.savePool(a.id,lease.token,lease.job.revision,{pool:'p',status:'complete'},{status:'complete'});assert.equal(complete.status,'complete');store.create({chain:'base',token:'c',pools:['p']});assert.equal(store.get(a.id),null);assert.equal(store.list().length,2);store.close();
});

test('out-of-scope pool and premature completion roll back without advancing accepted checkpoints',t=>{
 const store=new HistoryStore(fixture(t)),job=store.create({chain:'solana',token:'Mint',pools:['Pool']}),lease=store.acquire(job.id)!;
 assert.throws(()=>store.savePool(job.id,lease.token,lease.job.revision,{pool:'pool',status:'complete',checkpoint:{cursor:9}}),/outside.*scope/);
 assert.throws(()=>store.savePool(job.id,lease.token,lease.job.revision,{pool:'Pool',status:'running',checkpoint:{cursor:9}},{status:'complete'}),/unfinished/);
 const kept=store.get(job.id)!;assert.equal(kept.revision,lease.job.revision);assert.equal(kept.pools[0].checkpoint,null);assert.equal(kept.pools[0].status,'queued');store.close();
});

test('lease renewal extends ownership with a new revision and cannot revive expired ownership',t=>{
 let now=100;const store=new HistoryStore(fixture(t),{now:()=>now}),job=store.create({chain:'base',token:'x',pools:['p']}),lease=store.acquire(job.id,1000)!;
 now=900;const renewed=store.renew(job.id,lease.token,lease.job.revision,2000);assert.equal(renewed.leaseExpiresAt,2900);
 assert.throws(()=>store.saveJob(job.id,lease.token,lease.job.revision,{}),/revision/);
 now=2900;assert.throws(()=>store.renew(job.id,lease.token,renewed.revision,1000),/lease/);store.close();
});

test('get and list use one read snapshot while another connection adds scope',t=>{
 const path=fixture(t),a=new HistoryStore(path),b=new HistoryStore(path),job=a.create({chain:'base',token:'x',pools:['p']}),lease=a.acquire(job.id)!;
 const finished=a.savePool(job.id,lease.token,lease.job.revision,{pool:'p',status:'complete'},{status:'complete'});
 const db=(a as unknown as {db:DatabaseSync}).db,prepare=db.prepare.bind(db);let triggered=false;
 db.prepare=((sql:string)=>{const statement=prepare(sql);if(sql==='SELECT * FROM history_jobs WHERE id=?'){const get=statement.get.bind(statement);statement.get=((...args:Parameters<typeof get>)=>{const result=get(...args);if(!triggered){triggered=true;b.addPools(job.id,finished.revision,['new-pool']);}return result;}) as typeof statement.get;}return statement;}) as typeof db.prepare;
 const snapshot=a.get(job.id)!;assert.equal(snapshot.status,'complete');assert.equal(snapshot.pools.length,1);assert.equal(snapshot.counts.queued,0);
 assert.equal(a.get(job.id)?.pools.length,2);assert.equal(a.list()[0].status,'queued');a.close();b.close();
});

test('expired restart resumes the accepted checkpoint and rejects the pre-restart worker',t=>{
 let now=1000;const path=fixture(t);let store=new HistoryStore(path,{now:()=>now});const job=store.create({chain:'base',token:'Token',pools:['pool']}),oldLease=store.acquire(job.id,1000)!;
 const accepted=store.savePool(job.id,oldLease.token,oldLease.job.revision,{pool:'pool',status:'running',checkpoint:{token:'token',nextBlock:400,pending:['receipt-1']},result:{events:[{id:'canonical-log-1'}]}});store.close();now=3000;
 store=new HistoryStore(path,{now:()=>now});const interrupted=store.get(job.id)!;assert.equal(interrupted.status,'paused');store.resume(job.id,interrupted.revision);const resumed=store.acquire(job.id)!;
 assert.deepEqual(resumed.job.pools[0].checkpoint,{token:'token',nextBlock:400,pending:['receipt-1']});assert.equal(resumed.job.pools[0].status,'running');
 assert.throws(()=>store.saveJob(job.id,oldLease.token,accepted.revision,{status:'complete'}),/revision|lease/);
 const complete=store.savePool(job.id,resumed.token,resumed.job.revision,{pool:'pool',status:'complete',checkpoint:{token:'token',nextBlock:401,pending:[]},result:{events:[{id:'canonical-log-1'},{id:'canonical-log-2'}]}},{status:'complete'});
 assert.equal(complete.counts.complete,1);assert.equal(complete.status,'complete');store.close();
});


test('rechecking completed discovery requires an explicit option and preserves checkpoint evidence',t=>{
 const store=new HistoryStore(fixture(t));try{
  const job=store.create({chain:'ethereum',token:'token',pools:['registry']}),lease=store.acquire(job.id)!;
  const done=store.savePool(job.id,lease.token,lease.job.revision,{pool:'registry',status:'complete',checkpoint:{anchor:10},result:{retained:true}},{status:'complete'});
  assert.equal(store.resume(job.id,done.revision).revision,done.revision);assert.equal(store.acquire(job.id),null);
  const queued=store.resume(job.id,done.revision,{recheckComplete:true});assert.equal(queued.status,'queued');assert.deepEqual(queued.pools,done.pools);
  assert.throws(()=>store.resume(job.id,done.revision,{recheckComplete:true}),/revision/);assert(store.acquire(job.id));
 }finally{store.close();}
});
