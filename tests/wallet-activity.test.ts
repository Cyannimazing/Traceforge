import test from 'node:test';
import assert from 'node:assert/strict';
import {readWalletActivity} from '../src/lib/wallet-activity';
const a='0x0000000000000000000000000000000000000001', b='0x0000000000000000000000000000000000000002';
const hash='0x'+'1'.repeat(64);
const evm=async(method:string,params:unknown[])=>method==='eth_chainId'?'0x1':method==='eth_getBlockByNumber'?{number:'0x20',hash}:method==='eth_getCode'?'0x':params[0]===a?'0xa':'0xb';
test('EVM account nonce is measured at a fixed anchor but never proves lifetime freshness',async()=>{
 const result=await readWalletActivity('ethereum',[a,b,a],evm);
 assert.equal(result.wallets.length,2); assert.equal(result.wallets[0].fresh,null);assert.equal(result.wallets[1].fresh,null);assert.equal(result.wallets[0].count,10);assert.equal(result.wallets[0].exact,true);assert.equal(result.wallets[0].basis,'evm-account-nonce');assert.equal(result.blockRef,'0x20:'+hash);
});

test('zero nonce cannot distinguish an unused wallet from a wallet with incoming history',async()=>{
 const methods:string[]=[];
 const r=await readWalletActivity('ethereum',[a],async(m,p)=>{methods.push(m);return m==='eth_getTransactionCount'?'0x0':evm(m,p);});
 assert.equal(r.wallets[0].count,0);assert.equal(r.wallets[0].exact,true);assert.equal(r.wallets[0].fresh,null);
 assert.match(r.wallets[0].reason,/incoming|internal/i);
 assert(methods.every(m=>['eth_chainId','eth_getBlockByNumber','eth_getCode','eth_getTransactionCount'].includes(m)));
});
test('wrong chain and contract nonce cannot establish a fresh EOA',async()=>{
 assert.equal((await readWalletActivity('base',[a],evm)).wallets[0].fresh,null);
 const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getCode'?'0x1234':evm(m,p));assert.equal(r.wallets[0].fresh,null);
});
test('a reorg invalidates EVM activity results',async()=>{
 let n=0;const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getBlockByNumber'?{number:'0x20',hash:++n===1?hash:'0x'+'2'.repeat(64)}:evm(m,p));assert.equal(r.wallets[0].fresh,null);
});
const sol='So11111111111111111111111111111111111111112';
const rows=(n:number)=>Array.from({length:n},(_,i)=>({signature:('1'.repeat(63)+'ABCDEFGHJKL'[i]).repeat(1),slot:100-i,err:null,confirmationStatus:'finalized'}));
test('eleven distinct signatures establish not fresh without an exhaustive crawl',async()=>{
 const calls:string[]=[];const r=await readWalletActivity('solana',[sol],async(m)=>{calls.push(m);return rows(11);});assert.equal(r.wallets[0].fresh,false);assert.equal(r.wallets[0].count,11);assert.equal(r.wallets[0].exact,false);assert.deepEqual(calls,['getSignaturesForAddress']);
});
test('short or duplicate Solana pages do not establish lifetime freshness',async()=>{
 for(const records of [rows(10),[],Array(11).fill(rows(1)[0])]){const r=await readWalletActivity('solana',[sol],async()=>records);assert.equal(r.wallets[0].fresh,null);}
});
test('failed wallets retain unknown and cancellation propagates',async()=>{
 const r=await readWalletActivity('ethereum',[a,b],async(m,p)=>m==='eth_getTransactionCount'&&p[0]===b?Promise.reject(Error('quota')):evm(m,p));assert.equal(r.wallets[0].count,10);assert.equal(r.wallets[0].fresh,null);assert.equal(r.wallets[1].fresh,null);
 const c=new AbortController();c.abort();await assert.rejects(()=>readWalletActivity('ethereum',[a],evm,{signal:c.signal}));
});

test('invalid Solana signature strings do not establish wallet activity',async()=>{const records=rows(11);records[0].signature='0'.repeat(64);assert.equal((await readWalletActivity('solana',[sol],async()=>records)).wallets[0].fresh,null);});

test('verified contract code explains unsupported nonce scope instead of claiming RPC failed',async()=>{const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getCode'?'0x1234':evm(m,p));assert.equal(r.wallets[0].count,null);assert.match(r.wallets[0].reason,/contract account/i);assert.doesNotMatch(r.wallets[0].reason,/RPC did not verify/);});
test('exact EIP-7702 designators retain measured account nonce without treating authorization increments as transactions',async()=>{for(const count of [1,10,11,723]){const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getCode'?'0xef0100e6cae83bde06e4c305530e199d7217f42808555b':m==='eth_getTransactionCount'?'0x'+count.toString(16):evm(m,p));const wallet=r.wallets[0];assert.equal(wallet.count,count);assert.equal(wallet.exact,true);assert.equal(wallet.basis,'evm-account-nonce');assert.equal(wallet.fresh,null);assert.match(wallet.reason,/EIP-7702/);assert.match(wallet.reason,/authorization/);assert.doesNotMatch(wallet.reason,/Verified contract account/);}});
test('near-matching delegation bytecode remains a contract or unavailable, never a nonce-qualified delegated EOA',async()=>{for(const code of ['0xef0100','0xef0100'+'1'.repeat(38),'0xef0100'+'1'.repeat(42),'0xef0101'+'1'.repeat(40),'0xef0100'+'0'.repeat(40),'0xef0100'+'g'.repeat(40)]){const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getCode'?code:evm(m,p));assert.equal(r.wallets[0].count,null);assert.equal(r.wallets[0].fresh,null);assert.equal(r.wallets[0].exact,false);}});
test('empty code with a high nonce may have prior revoked delegation and cannot prove more than ten lifetime transactions',async()=>{const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getTransactionCount'?'0x2d3':evm(m,p));assert.equal(r.wallets[0].count,723);assert.equal(r.wallets[0].basis,'evm-account-nonce');assert.equal(r.wallets[0].fresh,null);assert.match(r.wallets[0].reason,/authorization/);});
