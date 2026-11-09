import test from 'node:test';
import assert from 'node:assert/strict';
import {readWalletActivity,WalletActivityRpcError} from '../src/lib/wallet-activity';
const a='0x0000000000000000000000000000000000000001', b='0x0000000000000000000000000000000000000002';
const hash='0x'+'1'.repeat(64);
test('qualified Robinhood activity checks all 239 accounts in bounded batches and retains unknowns',async()=>{
 const addresses=Array.from({length:239},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));let batches=0,active=0,peak=0;const now=Date.parse('2026-11-04T02:00:00Z');
 const rpc=async(m:string)=>m==='eth_chainId'?'0x1237':{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)};
 const r=await readWalletActivity('robinhood',addresses,rpc,{now:()=>now,maxAddresses:239,rpcBatch:async requests=>{batches++;peak=Math.max(peak,++active);assert(requests.length<=50);await new Promise(resolve=>setTimeout(resolve,1));active--;return requests.map(q=>q.params[0]===addresses[110]?{status:'rejected' as const,reason:Error('unavailable')}:{status:'fulfilled' as const,value:q.method==='eth_getCode'?'0x':'0x1'});}});
 assert.equal(r.wallets.length,239);assert.equal(r.truncated,false);assert.equal(r.wallets.filter(w=>w.count===1).length,238);assert.equal(r.wallets[110].count,null);assert.equal(batches,10);assert(peak<=2);assert(r.wallets.every(w=>w.fresh===null));
});
const evm=async(method:string,params:unknown[])=>method==='eth_chainId'?'0x1':method==='eth_getBlockByNumber'?{number:'0x20',hash}:method==='eth_getCode'?'0x':params[0]===a?'0xa':'0xb';
test('other chains use batched reads but never expand past 100 wallets',async()=>{const addresses=Array.from({length:120},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));let batches=0;const r=await readWalletActivity('ethereum',addresses,evm,{maxAddresses:120,rpcBatch:async()=>{batches++;return [];}});assert.equal(r.wallets.length,100);assert.equal(r.truncated,true);assert.ok(batches>0);});
test('batched activity stops dispatch at deadline and rechecks the canonical anchor',async()=>{
 const addresses=Array.from({length:239},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0')),now=Date.parse('2026-11-04T02:00:00Z');let calls=0,headers=0;
 const rpc=async(m:string)=>m==='eth_chainId'?'0x1237':{number:'0x20',hash:++headers>2?'0x'+'2'.repeat(64):hash,timestamp:'0x'+Math.floor(now/1000).toString(16)};
 const r=await readWalletActivity('robinhood',addresses,rpc,{now:()=>now,maxAddresses:239,rpcBatch:async requests=>{if(++calls>1)throw new WalletActivityRpcError('deadline');return requests.map(q=>({status:'fulfilled',value:q.method==='eth_getCode'?'0x':'0x1'}));}});
 assert(calls<=3);assert.equal(headers,3);assert(r.wallets.every(w=>w.count===null));assert.match(r.wallets[0].reason,/anchor changed/i);
});
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

test('canonical EVM account kind retains raw code and pinned block proof until anchor recheck',async()=>{for(const [code,kind] of [['0x','eoa'],['0xef0100'+'1'.repeat(40),'delegated-eoa'],['0x60006000','contract']] as const){const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getCode'?code:evm(m,p));assert.equal(r.wallets[0].accountKind,kind);assert.deepEqual(r.wallets[0].codeProof,{code,blockRef:'0x20:'+hash});}let blocks=0;const r=await readWalletActivity('ethereum',[a],async(m,p)=>m==='eth_getBlockByNumber'?{number:'0x20',hash:++blocks===1?hash:'0x'+'2'.repeat(64)}:m==='eth_getCode'?'0x6000':evm(m,p));assert.equal(r.wallets[0].accountKind,undefined);assert.equal(r.wallets[0].codeProof,undefined);});

test('a later bounded deadline preserves completed contract code proof when the canonical anchor still agrees',async()=>{const now=Date.parse('2026-11-04T02:00:00Z');let batches=0;const r=await readWalletActivity('robinhood',[a,b],async m=>m==='eth_chainId'?'0x1237':{number:'0x20',hash,timestamp:'0x'+Math.floor(now/1000).toString(16)},{now:()=>now,maxAddresses:2,batchSize:1,batchConcurrency:1,rpcBatch:async qs=>{if(++batches===2)throw new WalletActivityRpcError('deadline');return qs.map(q=>({status:'fulfilled' as const,value:q.method==='eth_getCode'?'0x6000':'0x1'}));}});assert.equal(r.failure,'deadline');assert.equal(r.wallets[0].accountKind,'contract');assert.deepEqual(r.wallets[0].codeProof,{code:'0x6000',blockRef:'0x20:'+hash});assert.equal(r.wallets[1].accountKind,undefined);});
