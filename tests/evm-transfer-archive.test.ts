import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createEvmTransferArchive} from '../src/lib/evm-transfer-archive';
const token='0x'+'1'.repeat(40),from='0x'+'2'.repeat(40),to='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
const transfer=(id:string,raw='0x20000000000001')=>({uniqueId:id,hash,blockNum:'0x5',from,to,category:'erc20',rawContract:{address:token,value:raw,decimal:'0x12'},metadata:{blockTimestamp:'2026-01-01T00:00:00Z'}});
function context(){const dir=mkdtempSync(join(tmpdir(),'traceforge-evm-index-'));return {dbPath:join(dir,'history.sqlite'),rpcUrls:{ethereum:'https://eth-mainnet.g.alchemy.com/v2/test'},dispose:()=>rmSync(dir,{recursive:true,force:true})};}
function mock(page:(query:any)=>Response):typeof fetch{return async(_,init)=>{const r=JSON.parse(String(init?.body));return r.method==='eth_chainId'?Response.json({result:'0x1'}):r.method==='eth_getBlockByNumber'?Response.json({result:{number:'0x10',hash:blockHash}}):page(r.params[0]);};}
test('persists finalized anchor/page cursor and exact raw transfer amounts across restart',async()=>{
 const c=context(),queries:any[]=[];const fetcher=mock(q=>{queries.push(q);return Response.json({result:q.pageKey?{transfers:[transfer('a'),transfer('b')]}:{transfers:[transfer('a')],pageKey:'next'}});});let archive=createEvmTransferArchive({...c,fetcher});
 try{assert.equal((await archive.advance('ethereum',token,{pages:1})).status,'partial');archive.close();archive=createEvmTransferArchive({...c,fetcher});const done=await archive.advance('ethereum',token);assert.equal(done.status,'exhausted');assert.equal(done.transfers,2);assert.equal(done.transactions,1);assert.equal(done.indexComplete,true);assert.equal(queries[1].pageKey,'next');assert.equal(queries[0].toBlock,'0x10');assert.equal(queries[0].maxCount,'0x64');const e=archive.evidence('ethereum',token)!;assert.equal(e.trades.length,0);assert.equal(e.transfers[0].amountRaw,'9007199254740993');assert.match(e.transfers[0].source,/not receipt-verified/);assert.equal(e.truncated,true);}finally{archive.close();c.dispose();}
});
test('rate limit preserves earlier page and shared lease prevents duplicate concurrent batches',async()=>{
 const c=context();let calls=0,time=10000;const fetcher=mock(()=>++calls===1?Response.json({result:{transfers:[transfer('a')],pageKey:'next'}}):new Response('',{status:429,headers:{'Retry-After':'90'}}));const a=createEvmTransferArchive({...c,fetcher,now:()=>time}),b=createEvmTransferArchive({...c,fetcher,now:()=>time});
 try{assert.equal((await a.advance('ethereum',token)).status,'cooldown');assert.equal(b.status('ethereum',token)!.retryAt,100000);await b.advance('ethereum',token);assert.equal(calls,2);assert.equal(b.evidence('ethereum',token)!.transfers.length,1);time+=90001;await b.advance('ethereum',token);assert.equal(calls,3);}finally{a.close();b.close();c.dispose();}
});
test('malformed/repeated cursor does not become exhausted and no compatible BSC endpoint is invented',async()=>{
 const c=context(),archive=createEvmTransferArchive({...c,fetcher:mock(()=>Response.json({result:{transfers:[transfer('a')],pageKey:'same'}}))});
 try{const s=await archive.advance('ethereum',token);assert.equal(s.status,'cooldown');assert.equal(s.pages,1);assert.equal(s.indexComplete,false);assert.match(s.message,/cursor/i);await assert.rejects(archive.advance('bsc' as never,token),/Ethereum and Base/);}finally{archive.close();c.dispose();}
});
test('invalid records are withheld and abort preserves previously committed checkpoint',async()=>{
 const c=context(),controller=new AbortController();let calls=0;const archive=createEvmTransferArchive({...c,fetcher:mock(()=>{if(++calls===1)return Response.json({result:{transfers:[transfer('a'),{...transfer('bad'),metadata:{}}],pageKey:'saved'}});controller.abort();throw new DOMException('Cancelled','AbortError');})});
 try{await assert.rejects(archive.advance('ethereum',token,{signal:controller.signal}),{name:'AbortError'});const s=archive.status('ethereum',token)!;assert.equal(s.pages,1);assert.equal(s.transfers,1);assert.equal(s.status,'partial');assert.match(archive.evidence('ethereum',token)!.reasons.join(' '),/1.*withheld/);}finally{archive.close();c.dispose();}
});
test('SQLite fencing allows only one concurrent index worker across instances',async()=>{
 const c=context();let pages=0;const fetcher=mock(()=>{pages++;return Response.json({result:{transfers:[transfer('a')]}});});const a=createEvmTransferArchive({...c,fetcher}),b=createEvmTransferArchive({...c,fetcher});
 try{const pending=a.advance('ethereum',token);const competing=await b.advance('ethereum',token);assert.equal(competing.status,'running');await pending;assert.equal(pages,1);assert.equal(b.status('ethereum',token)!.status,'exhausted');}finally{a.close();b.close();c.dispose();}
});
test('explicit update pages only blocks after the previous anchor and retains earlier records',async()=>{
 const c=context();let head=16;const queries:any[]=[];
 const fetcher:typeof fetch=async(_,init)=>{const q=JSON.parse(String(init?.body));if(q.method==='eth_chainId')return Response.json({result:'0x1'});if(q.method==='eth_getBlockByNumber'){const number=q.params[0]==='finalized'?head:Number(BigInt(q.params[0]));return Response.json({result:{number:'0x'+number.toString(16),hash:number===16?blockHash:'0x'+'c'.repeat(64)}});}queries.push(q.params[0]);return Response.json({result:{transfers:[q.params[0].fromBlock==='0x0'?transfer('old'):{...transfer('new'),blockNum:'0x11'}]}});};
 const a=createEvmTransferArchive({...c,fetcher});
 try{await a.advance('ethereum',token);head=32;const updated=await a.advance('ethereum',token,{update:true});assert.equal(updated.finalizedBlock,32);assert.equal(updated.transfers,2);assert.equal(updated.status,'exhausted');assert.deepEqual(queries.map(q=>[q.fromBlock,q.toBlock]),[['0x0','0x10'],['0x11','0x20']]);assert.equal(a.evidence('ethereum',token)!.transfers.length,2);
 assert.equal(updated.headChecks,1);const same=await a.advance('ethereum',token,{update:true});assert.equal(queries.length,2);assert.equal(same.finalizedBlock,32);assert.equal(same.headChecks,2);assert.match(same.message,/No newer finalized/);
 }finally{a.close();c.dispose();}
});
test('failed fresh-head validation does not increment successful head checks',async()=>{
 const c=context();let fail=false;
 const fetcher=mock(()=>Response.json({result:{transfers:[transfer('a')]}}));
 const a=createEvmTransferArchive({...c,fetcher:async(url,init)=>{const q=JSON.parse(String(init?.body));if(fail&&q.method==='eth_getBlockByNumber'&&q.params[0]==='finalized')return new Response('',{status:503});return fetcher(url,init);}});
 try{await a.advance('ethereum',token);fail=true;const failed=await a.advance('ethereum',token,{update:true});assert.equal(failed.headChecks,0);assert.equal(failed.transfers,1);assert.match(failed.message,/failed/);fail=false;assert.equal((await a.advance('ethereum',token,{update:true})).headChecks,1);}finally{a.close();c.dispose();}
});
