import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import fixture from './fixtures/alchemy-solana-pump-history.json';
import {createSolanaHistoryArchive,solanaArchiveConfigurationStatus} from '../src/lib/solana-history-archive';
const mint='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump';
const rpcUrl='https://solana-mainnet.g.alchemy.com/v2/test';
test('missing or incompatible historical endpoint is explicitly unsupported without leaking configuration',()=>{
 for(const value of ['', 'invalid', 'http://solana-mainnet.g.alchemy.com/v2/secret','https://api.mainnet-beta.solana.com','https://alchemy.com.attacker.example/v2/secret']){
  const state=solanaArchiveConfigurationStatus(mint,value);assert.equal(state?.status,'unsupported');assert.equal(state?.hasMore,false);assert.equal(state?.transactions,0);assert.match(state?.message||'',/incomplete/);assert.ok(!JSON.stringify(state).includes('secret'));
 }
 assert.equal(solanaArchiveConfigurationStatus(mint,rpcUrl),null);
});
function context(){const dir=mkdtempSync(join(tmpdir(),'traceforge-archive-'));return {dbPath:join(dir,'history.sqlite'),dispose:()=>rmSync(dir,{recursive:true,force:true})};}
test('resumes a durable cursor and deduplicates transactions without promoting complete launch coverage',async()=>{
 const c=context(),requests:Record<string,unknown>[]=[];
 const fetcher:typeof fetch=async(_,init)=>{const q=JSON.parse(String(init?.body)).params[1];requests.push(q);return Response.json({result:q.paginationToken?{data:fixture,paginationToken:null}:{data:[fixture[0]],paginationToken:'next'}});};
 let archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher});
 try {assert.equal(archive.status(mint),null);assert.equal((await archive.advance(mint,{pages:1})).status,'partial');archive.close();archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher});
 const status=await archive.advance(mint,{pages:1});assert.equal(status.status,'exhausted');assert.equal(status.transactions,fixture.length);assert.equal(requests[1].paginationToken,'next');assert.equal(requests[0].sortOrder,'asc');
 const evidence=archive.evidence(mint)!;assert.equal(evidence.trades.length,2);assert.equal(evidence.truncated,true);assert.ok(evidence.transfers.filter(t=>t.native).every(t=>t.fundingEligible===false));assert.match(evidence.reasons.join(' '),/not.*complete/i);
 }finally{archive.close();c.dispose();}
});
test('preserves successful pages after failure and persists rate-limit cooldown across instances',async()=>{
 const c=context();let calls=0,time=100000;
 const fetcher:typeof fetch=async()=>++calls===1?Response.json({result:{data:[fixture[0]],paginationToken:'next'}}):new Response('',{status:429,headers:{'Retry-After':'60'}});
 let archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher,now:()=>time});
 try {const result=await archive.advance(mint);assert.equal(result.status,'cooldown');assert.equal(result.transactions,1);assert.equal(archive.evidence(mint)!.trades.length,1);archive.close();archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher,now:()=>time});await archive.advance(mint);assert.equal(calls,2);time+=61000;await archive.advance(mint);assert.equal(calls,3);
 }finally{archive.close();c.dispose();}
});
test('cross-instance lease prevents duplicate concurrent requests and abort releases lease',async()=>{
 const c=context();let release:()=>void=()=>{};const gate=new Promise<void>(r=>release=r);let calls=0;
 const fetcher:typeof fetch=async()=>{calls++;await gate;return Response.json({result:{data:fixture,paginationToken:null}});};
 const a=createSolanaHistoryArchive({...c,rpcUrl,fetcher}),b=createSolanaHistoryArchive({...c,rpcUrl,fetcher});
 try {const first=a.advance(mint,{pages:1});assert.equal((await b.advance(mint)).status,'running');assert.equal(calls,1);release();await first;
 const controller=new AbortController();controller.abort();await assert.rejects(a.advance(mint,{signal:controller.signal}),{name:'AbortError'});
 }finally{a.close();b.close();c.dispose();}
});
test('repeated cursors and malformed pages preserve progress and never mark exhausted',async()=>{
 const c=context();let calls=0,time=100000;const options={...c,rpcUrl,now:()=>time,fetcher:async()=>Response.json(++calls<3?{result:{data:fixture,paginationToken:'same'}}:{result:{wrong:[]}})};let archive=createSolanaHistoryArchive(options);
 try{const progress=await archive.advance(mint);assert.equal(progress.status,'cooldown');assert.equal(progress.transactions,fixture.length);assert.equal(progress.hasMore,true);assert.match(progress.message,/cursor/i);assert.ok(progress.retryAt!>=time+60000);archive.close();archive=createSolanaHistoryArchive(options);assert.equal((await archive.advance(mint)).status,'cooldown');assert.equal(calls,2);time+=60001;assert.equal((await archive.advance(mint)).status,'partial');assert.throws(()=>archive.status('invalid'));}finally{archive.close();c.dispose();}
});

test('duplicate-only page with a new cursor backs off but checkpoints the cursor to eventually reach new evidence',async()=>{
 const c=context();let calls=0,time=100000;const cursors:(string|undefined)[]=[];
 const archive=createSolanaHistoryArchive({...c,rpcUrl,now:()=>time,fetcher:async(_,init)=>{const q=JSON.parse(String(init?.body)).params[1];cursors.push(q.paginationToken);calls++;return Response.json({result:calls===1?{data:[fixture[0]],paginationToken:'first'}:calls===2?{data:[fixture[0]],paginationToken:'second'}:{data:[fixture[1]],paginationToken:null}});}});
 try{const stalled=await archive.advance(mint);assert.equal(stalled.status,'cooldown');assert.equal(stalled.transactions,1);assert.equal(stalled.hasMore,true);await archive.advance(mint);assert.equal(calls,2);time+=60001;const end=await archive.advance(mint);assert.equal(end.transactions,2);assert.equal(end.status,'exhausted');assert.deepEqual(cursors,[undefined,'first','second']);}finally{archive.close();c.dispose();}
});
test('aborting a later page preserves the first checkpoint and permits resuming',async()=>{
 const c=context(),controller=new AbortController();let calls=0;
 const archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher:async(_,init)=>{if(++calls===1)return Response.json({result:{data:[fixture[0]],paginationToken:'saved'}});controller.abort();init?.signal?.throwIfAborted();throw Error('Expected abort');}});
 try{await assert.rejects(archive.advance(mint,{signal:controller.signal}),{name:'AbortError'});const s=archive.status(mint)!;assert.equal(s.status,'partial');assert.equal(s.pages,1);assert.equal(s.transactions,1);assert.equal(archive.evidence(mint)!.trades.length,1);}finally{archive.close();c.dispose();}
});
test('32-token capacity rejects new archives without deleting existing evidence',async()=>{
 const c=context(),archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher:async()=>Response.json({result:{data:[],paginationToken:null}})});
 try{const chars='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';for(let n=0;n<32;n++)await archive.advance('1'.repeat(31)+chars[n]);await assert.rejects(archive.advance(mint),/32 token/);assert.equal(archive.status('1'.repeat(32))!.status,'exhausted');}finally{archive.close();c.dispose();}
});
test('report subset returns oldest and newest evidence while retaining full archive counts',async()=>{
 const c=context(),archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher:async()=>Response.json({result:{data:[],paginationToken:null}})});
 try{await archive.advance(mint);const db=new DatabaseSync(c.dbPath);db.exec('BEGIN');const insert=db.prepare('INSERT INTO solana_archive_records VALUES(?,?,?,?)');for(let i=0;i<1005;i++){const id=`t${i}`,timestamp=new Date(1700000000000+i*1000).toISOString();insert.run(mint,'trades',id,JSON.stringify({id,timestamp,wallet:mint,side:'buy',transaction:id,source:'fixture'}));}db.exec('COMMIT');db.close();
 const result=archive.evidence(mint)!;assert.equal(result.trades.length,1000);assert.equal(archive.status(mint)!.trades,1005);assert.ok(result.trades.some(t=>t.id==='t0'));assert.ok(result.trades.some(t=>t.id==='t1004'));assert.ok(!result.trades.some(t=>t.id==='t502'));assert.match(result.reasons.join(' '),/Report subset.*1000 of 1005/);
 }finally{archive.close();c.dispose();}
});

test('crosses the old 10,000 transaction cutoff and continues to the provider end',async()=>{
 const c=context();const archive=createSolanaHistoryArchive({...c,rpcUrl,fetcher:async()=>Response.json({result:{data:fixture,paginationToken:null}})});
 try{const db=new DatabaseSync(c.dbPath);db.prepare("INSERT INTO solana_archive(token,cursor,pages,transactions,accepted) VALUES(?, 'continue',1,10000,10000)").run(mint);db.close();const progress=await archive.advance(mint,{pages:1});assert.equal(progress.status,'exhausted');assert.equal(progress.transactions,10000+fixture.length);assert.equal(progress.hasMore,false);}finally{archive.close();c.dispose();}
});
