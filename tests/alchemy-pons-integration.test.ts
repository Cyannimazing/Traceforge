import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvmHolderFallback} from '../src/lib/evm-holder-fallback';
import {PONS_FACTORY,PONS_DEPLOYER} from '../src/lib/pons-launch-record';

const token='0x'+'1'.repeat(40),curve='0x'+'2'.repeat(40),launcher='0x'+'3'.repeat(40),zero='0x'+'0'.repeat(40),hash='0x'+'a'.repeat(64),tx='0x'+'b'.repeat(64),now=1700000000000;
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',launch='0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607';
const word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0'),aw=(a:string)=>'0x'+a.slice(2).padStart(64,'0');
function fixture(mode:'valid'|'rate'|'gap'|'missing-tail'|'missing-top'|'denied'='valid',count=6){
 const addresses=Array.from({length:count},(_,i)=>'0x'+(100+i).toString(16).padStart(40,'0')),requests:{url:string;method:string}[]=[];
 const block={number:'0xc8',hash,timestamp:'0x'+(now/1000-600).toString(16)},creation={...block,number:'0x64',timestamp:'0x'+(now/1000-1200).toString(16)};
 const log=(from:string,to:string,amount:bigint,index:number)=>({address:token,topics:[transfer,aw(from),aw(to)],data:word(amount),blockNumber:'0x64',blockHash:hash,transactionHash:tx,transactionIndex:'0x0',logIndex:'0x'+index.toString(16),removed:false});
 const logs=[log(zero,curve,BigInt(count*10),0),...addresses.map((a,i)=>log(curve,a,10n,i+1))],event={...logs[0],address:PONS_FACTORY,topics:[launch,aw(token),aw(curve),aw(launcher)],data:'0x'+'0'.repeat(192),logIndex:'0xffff'};
 const indexed=logs.map(l=>({category:'erc20',blockNum:l.blockNumber,hash:tx,uniqueId:tx+':log:'+parseInt(l.logIndex,16),from:'0x'+l.topics[1].slice(-40),to:'0x'+l.topics[2].slice(-40),rawContract:{address:token,value:l.data,decimal:'0x0'}}));
 const fetcher:typeof fetch=async(url,init)=>{
  assert.equal(new URL(String(url)).hostname,'robinhood-mainnet.g.alchemy.com','the configured primary must never fail over to public RPC');
  const raw=JSON.parse(String(init?.body)),calls=Array.isArray(raw)?raw:[raw];
  for(const c of calls)requests.push({url:String(url),method:c.method});
  if(calls[0].method==='alchemy_getAssetTransfers'&&mode==='rate')return new Response('',{status:429,headers:{'retry-after':'60'}});
  if(calls[0].method==='alchemy_getAssetTransfers'&&mode==='denied')return new Response('',{status:403});
  const response=calls.map((c:any)=>{let result:unknown;
   if(c.method==='eth_chainId')result='0x1237';
   else if(c.method==='eth_getBlockByNumber')result=c.params[0]==='0x64'?creation:c.params[0]==='latest'?{...block,number:'0xd0',timestamp:'0x'+(now/1000).toString(16)}:block;
   else if(c.method==='eth_getCode')result='0x6000';
   else if(c.method==='alchemy_getAssetTransfers'){
    const p=c.params[0];assert.equal(p.toBlock,block.number);assert.deepEqual(p.contractAddresses,[token]);assert.equal(p.order,'asc');assert.deepEqual(p.category,['erc20']);
    result=p.pageKey?{transfers:mode==='gap'?indexed.slice(4):indexed.slice(3)}:{transfers:indexed.slice(0,3),pageKey:'next'};
   }else if(c.method==='eth_getTransactionReceipt')result={status:'0x1',transactionHash:tx,blockNumber:'0x64',blockHash:hash,logs:[...logs,event]};
   else if(c.method==='eth_call'){const data=c.params[0].data,address='0x'+data.slice(-40);if(data.startsWith('0x70a08231')&&(mode==='missing-tail'&&address===addresses.at(-1)||mode==='missing-top'&&address===addresses[0]))return {jsonrpc:'2.0',id:c.id,error:{code:-32000}};result=data==='0x18160ddd'?word(BigInt(count*10)):data==='0x313ce567'?word(0n):word(addresses.includes(address)?10n:0n);}
   else assert.fail('Unexpected RPC method '+c.method);
   return {jsonrpc:'2.0',id:c.id,result};
  });return Response.json(Array.isArray(raw)?response:response[0]);
 };
 const ponsSnapshot={basis:'safe' as const,blockNumber:block.number,blockHash:hash,blockTimestamp:new Date(now-600000).toISOString(),factory:PONS_FACTORY,deployerContract:PONS_DEPLOYER,curve,launcher,creatorFeeRecipient:launcher,phase:2};
 const report={chain:'robinhood',token,market:null,holders:addresses.map(address=>({address,share:100/6,balance:10})),identities:[{address:launcher,role:'creator'}]} as any;
 return {fetcher,requests,ponsSnapshot,report,addresses};
}
test('configured Robinhood Alchemy exhausts its primary token index and verifies balances without public RPC',async()=>{
 const f=fixture(),r=await createEvmHolderFallback({fetcher:f.fetcher,wait:async()=>{},now:()=>now,rpcUrls:{robinhood:'https://robinhood-mainnet.g.alchemy.com/v2/local-test'}})(f.report,{ponsSnapshot:f.ponsSnapshot});
 assert.equal(r.holderCount,6);assert.equal(r.holders?.length,6);assert.equal(r.snapshot?.holderEnumeration?.complete,true);assert.equal(r.snapshot?.holderEnumeration?.ranked?.addresses.length,6);
 assert.equal(f.requests.filter(c=>c.method==='alchemy_getAssetTransfers').length,2);assert.equal(f.requests.filter(c=>c.method==='eth_getLogs').length,0);
 assert(r.sources.some(s=>s.name==='Alchemy Robinhood token-transfer index'&&s.status==='available'));
});
test('an omitted indexed transfer cannot qualify a holder inventory or ranked prefix',async()=>{
 const f=fixture('gap'),r=await createEvmHolderFallback({fetcher:f.fetcher,wait:async()=>{},now:()=>now,rpcUrls:{robinhood:'https://robinhood-mainnet.g.alchemy.com/v2/local-test'}})(f.report,{ponsSnapshot:f.ponsSnapshot});
 assert.equal(r.holderCount,null);assert.equal(r.snapshot?.holderEnumeration?.ranked,undefined);assert.notEqual(r.snapshot?.holderEnumeration?.complete,true);
});
test('Alchemy rate denial terminates the configured provider scan without public failover or balance retries',async()=>{
 const f=fixture('rate'),r=await createEvmHolderFallback({fetcher:f.fetcher,wait:async()=>{},now:()=>now,rpcUrls:{robinhood:'https://robinhood-mainnet.g.alchemy.com/v2/local-test'}})(f.report,{ponsSnapshot:f.ponsSnapshot});
 assert.equal(f.requests.at(-1)?.method,'alchemy_getAssetTransfers');assert.equal(r.snapshot,undefined);assert.match(r.reasons.join(' '),/rate limit/i);
});
test('exhausted indexed inventories over100 retain all positive holders, and partial tails cannot hide a missing top rank',async()=>{
 for(const mode of ['valid','missing-tail','missing-top'] as const){
  const f=fixture(mode,130),r=await createEvmHolderFallback({fetcher:f.fetcher,wait:async()=>{},now:()=>now,rpcUrls:{robinhood:'https://robinhood-mainnet.g.alchemy.com/v2/local-test'}})(f.report,{ponsSnapshot:f.ponsSnapshot});
  assert.equal(r.holderCount,130,mode);assert.equal(r.holders?.length,mode==='valid'?130:129,mode);assert.equal(r.snapshot?.holderEnumeration?.complete,mode==='valid',mode);
  assert.equal(r.snapshot?.holderEnumeration?.ranked?.addresses.length,mode==='missing-top'?undefined:50,mode);assert.equal(r.snapshot?.holderEnumeration?.indexProvenance?.exhausted,true,mode);
 }
});
test('configured index access denial stops all subsequent reads without public route changes',async()=>{
 const f=fixture('denied'),r=await createEvmHolderFallback({fetcher:f.fetcher,wait:async()=>{},now:()=>now,rpcUrls:{robinhood:'https://robinhood-mainnet.g.alchemy.com/v2/local-test'}})(f.report,{ponsSnapshot:f.ponsSnapshot});
 assert.equal(f.requests.at(-1)?.method,'alchemy_getAssetTransfers');assert.equal(r.snapshot,undefined);assert.equal(r.holders?.length??0,0);
});
