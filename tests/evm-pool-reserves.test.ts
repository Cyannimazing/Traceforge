import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvmPoolReserves as createReserves,isSupportedEvmPoolFactory} from '../src/lib/evm-pool-reserves';
const fixtureNow=1700000000000;
const createEvmPoolReserves=(deps:Parameters<typeof createReserves>[0]={})=>createReserves({now:()=>fixtureNow,...deps});
const pool='0x'+'1'.repeat(40), token='0x'+'2'.repeat(40), quote='0x'+'3'.repeat(40), holder='0x'+'4'.repeat(40);
const factory='0xca143ce32fe78f1f7019d7d551a6402fc5350c73', hash='0x'+'a'.repeat(64);
const word=(n:bigint)=>n.toString(16).padStart(64,'0'), address=(a:string)=>'0x'+a.slice(2).padStart(64,'0');
const block={number:'0x64',hash,timestamp:'0x6553f100'};
type Call={method:string;params:any[];id:number};
function mock(override?:(c:Call)=>unknown){const calls:Call[]=[];let active=0,maximum=0;
 const fetcher:typeof fetch=async(_url,init)=>{const c=JSON.parse(String(init?.body)) as Call;calls.push(c);active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,1));active--;
 let result=override?.(c);
 if(result===undefined){if(c.method==='eth_chainId')result='0x38';else if(c.method==='eth_getBlockByNumber')result=block;else if(c.method==='eth_getCode')result='0x6000';else if(c.method==='eth_call'){
 const {to,data}=c.params[0];const s=data.slice(0,10);
 result=s==='0x0dfe1681'?address(token):s==='0xd21220a7'?address(quote):s==='0xc45a0155'?address(factory):s==='0x0902f1ac'?'0x'+word(100n)+word(200n)+word(123n):s==='0xe6a43905'?address(pool):s==='0x313ce567'?'0x'+word(18n):s==='0x18160ddd'?'0x'+word(1000n):s==='0x70a08231'?'0x'+word(data.endsWith(holder.slice(2))?880n:data.endsWith(pool.slice(2))?(to===token?100n:200n):1n):undefined;
 }}
 return new Response(JSON.stringify({jsonrpc:'2.0',id:c.id,result}));};return {fetcher,calls,max:()=>maximum};}
test('verifies factory membership and all balances at one finalized anchor without transaction writes',async()=>{
 const m=mock(),r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid/private',fetcher:m.fetcher})('bsc',pool,token,{holders:[holder]});
 assert.equal(r.status,'verified');const s=r.snapshot!;assert.equal(s.factory,factory);assert.equal(s.base.reserveRaw,'100');assert.equal(s.base.balanceRaw,'100');assert.equal(s.quote.reserveRaw,'200');assert.equal(s.totalSupplyRaw,'1000');assert.equal(s.holders[0].balanceRaw,'880');assert.equal(s.blockHash,hash);assert.equal(s.constantProductEligible,true);assert.equal(s.feeBps,null);
 assert.ok(m.calls.every(c=>!c.method.startsWith('eth_send')));assert.ok(m.calls.filter(c=>['eth_call','eth_getCode'].includes(c.method)).every(c=>c.params[1]==='0x64'));assert.ok(m.max()<=3);assert.ok(!JSON.stringify(r).includes('/private'));
});
test('scanned token1 orientation swaps reserves and decimals correctly',async()=>{const m=mock(),r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,quote);assert.equal(r.snapshot?.base.reserveRaw,'200');assert.equal(r.snapshot?.quote.address,token);});
test('rejects wrong chain, untrusted factory, forged getPair, empty code and unrelated token',async()=>{
 for(const change of [(c:Call)=>c.method==='eth_chainId'?'0x1':undefined,(c:Call)=>c.params[0]?.data==='0xc45a0155'?address(holder):undefined,(c:Call)=>c.params[0]?.data?.startsWith('0xe6a43905')?address(holder):undefined,(c:Call)=>c.method==='eth_getCode'?'0x':undefined]){const m=mock(change);const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token);assert.equal(r.status,'unknown');assert.equal(r.snapshot,undefined);}
 const m=mock();assert.equal((await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,holder)).status,'unknown');
});
test('rejects malformed reserves and reorg rather than merging inconsistent snapshots',async()=>{
 let blocks=0;for(const change of [(c:Call)=>c.params[0]?.data==='0x0902f1ac'?'0x'+word(1n<<112n)+word(200n)+word(123n):undefined,(c:Call)=>c.method==='eth_getBlockByNumber'&&++blocks>1?{...block,hash:'0x'+'b'.repeat(64)}:undefined]){const m=mock(change);assert.equal((await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token)).status,'unknown');}
});
test('reserve-balance disagreement stays observed but ineligible for nominal impact',async()=>{const m=mock(c=>c.params[0]?.data?.startsWith('0x70a08231')?'0x'+word(99n):undefined);const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token);assert.equal(r.status,'verified');assert.equal(r.snapshot?.constantProductEligible,false);assert.ok(r.snapshot?.limitations.some(x=>x.includes('balance')));});
test('failed holder balance is unknown, dedup and cap bound work, never coerce failed reads to zero',async()=>{const m=mock(c=>c.params[0]?.data?.endsWith(holder.slice(2))?'0x':undefined);const holders=[holder,holder,...Array.from({length:25},(_,i)=>'0x'+(i+10).toString(16).padStart(40,'0'))];const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token,{holders});assert.equal(r.snapshot?.holders.length,20);assert.equal(r.snapshot?.holdersTruncated,true);assert.deepEqual(r.snapshot?.holders[0],{address:holder,status:'unknown'});assert.ok(m.calls.length<=38);});
test('invalid input makes no calls and aborted work rejects promptly',async()=>{const m=mock(),run=createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher});assert.equal((await run('bsc','bad',token)).status,'unknown');assert.equal(m.calls.length,0);const ctrl=new AbortController();ctrl.abort();await assert.rejects(run('bsc',pool,token,{signal:ctrl.signal}),/abort/i);});
test('deadline remains bounded even when an injected transport ignores cancellation',async()=>{const start=Date.now();const fetcher:typeof fetch=()=>new Promise(()=>{});const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher,timeoutMs:50})('bsc',pool,token);assert.equal(r.status,'unknown');assert.match(r.reasons[0],/deadline/);assert.ok(Date.now()-start<1000);});
test('zero reserves are observed without impact eligibility and impossible holder balance remains unknown',async()=>{
 const m=mock(c=>c.params[0]?.data==='0x0902f1ac'?'0x'+word(0n)+word(0n)+word(123n):c.params[0]?.data?.endsWith(holder.slice(2))?'0x'+word(1001n):undefined);
 const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token,{holders:[holder]});assert.equal(r.status,'verified');assert.equal(r.snapshot?.constantProductEligible,false);assert.equal(r.snapshot?.holders[0].status,'unknown');assert.equal(r.snapshot?.holders[0].balanceRaw,undefined);
});
test('Ethereum and Base reuse their official Uniswap factory registries',async()=>{for(const [chain,chainId,officialFactory] of [['ethereum','0x1','0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f'],['base','0x2105','0x8909dc15e40173ff4699343b6eb8132c65e18ec6']] as const){const m=mock(c=>c.method==='eth_chainId'?chainId:c.params[0]?.data==='0xc45a0155'?address(officialFactory):undefined);const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})(chain,pool,token);assert.equal(r.status,'verified');assert.equal(r.snapshot?.protocol,'uniswap-v2');assert.equal(r.snapshot?.factory,officialFactory);}});
test('exported factory check is chain-scoped and rejects unsupported persisted factories',()=>{assert.equal(isSupportedEvmPoolFactory('bsc',factory.toUpperCase()),true);assert.equal(isSupportedEvmPoolFactory('ethereum',factory),false);assert.equal(isSupportedEvmPoolFactory('base',holder),false);});
test('unique holder balances plus pool cannot exceed independently read total supply',async()=>{const other='0x'+'5'.repeat(40);const m=mock(c=>c.params[0]?.data?.endsWith(other.slice(2))?'0x'+word(200n):undefined);const r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher})('bsc',pool,token,{holders:[holder,holder,other]});assert.equal(r.status,'unknown');assert.equal(r.snapshot,undefined);assert.match(r.reasons[0],/supply/);});
test('finalized timestamp must be at most fifteen minutes old or two minutes ahead of retrieval',async()=>{
 for(const offset of [900001,-120001]){const m=mock(),r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher,now:()=>fixtureNow+offset})('bsc',pool,token);assert.equal(r.status,'unknown');assert.equal(r.snapshot,undefined);assert.match(r.reasons[0],/timestamp/);assert.equal(m.calls.length,2);}
 for(const offset of [900000,-120000]){const m=mock(),r=await createEvmPoolReserves({rpcUrl:'https://rpc.invalid',fetcher:m.fetcher,now:()=>fixtureNow+offset})('bsc',pool,token);assert.equal(r.status,'verified');}
});
