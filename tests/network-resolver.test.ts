import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetworkResolver,marketNetworkCandidates,NetworkResolutionError} from '../src/lib/network-resolver';
const token='0x'+'a'.repeat(40),other='0x'+'b'.repeat(40);
const pair=(chainId:string,liquidity:number|null=10,quote=false,pairAddress='0x'+'c'.repeat(40))=>({chainId,pairAddress,baseToken:{address:quote?other:token},quoteToken:{address:quote?token:other},liquidity:{usd:liquidity}});
const fail=(status:number)=>(e:unknown)=>e instanceof NetworkResolutionError&&e.status===status;
test('unsupported and inherited alias names are not supported network candidates',()=>{
 assert.deepEqual(marketNetworkCandidates({pairs:[pair('constructor'),pair('__proto__'),pair('polygon')]},token),[]);
});
test('invalid input makes no source calls; Solana format resolves without guessing EVM',async()=>{
 let calls=0;const resolve=createNetworkResolver({getMarkets:async()=>{calls++;return {pairs:[]};}});
 await assert.rejects(resolve('bad'),fail(400));assert.equal((await resolve('So11111111111111111111111111111111111111112')).chain,'solana');assert.equal(calls,0);
});
test('matches EVM quote/base markets, aliases and deduplicates pair liquidity',async()=>{
 const resolve=createNetworkResolver({getMarkets:async()=>({pairs:[pair('eth',20),pair('ethereum',20),pair('base',50,true),{...pair('bsc',999),baseToken:{address:other}},{...pair('polygon',999)}]})});
 const r=await resolve(token.toUpperCase().replace('0X','0x'));assert.equal(r.chain,'base');assert.equal(r.token,token);assert.deepEqual(r.candidates,[{chain:'base',liquidityUsd:50,pairs:1},{chain:'ethereum',liquidityUsd:20,pairs:1}]);assert.match(r.notice!,/Ethereum/);
});
test('tied or incomplete liquidity across multiple networks asks for explicit choice',async()=>{
 for(const rows of [[pair('base'),pair('bnb')],[pair('base',null),pair('ethereum',50)]])await assert.rejects(createNetworkResolver({getMarkets:async()=>({pairs:rows})})(token),fail(422));
});
test('single live matching chain resolves even when liquidity is not reported',async()=>{
 const r=await createNetworkResolver({getMarkets:async()=>({pairs:[pair('binance-smart-chain',null)]})})(token);assert.equal(r.chain,'bsc');assert.equal(r.candidates[0].liquidityUsd,null);
});
function rpc(code:Record<string,string|null>,wrongChain=false){const urls={ethereum:'https://eth.invalid/key',base:'https://base.invalid/key',bsc:'https://bsc.invalid/key'};const fetcher:typeof fetch=async(url,init)=>{const chain=Object.entries(urls).find(([,u])=>u===url)![0],r=JSON.parse(String(init?.body));if(code[chain]===null)throw Error('secret transport text');return Response.json({jsonrpc:'2.0',id:r.id,result:r.method==='eth_chainId'?(wrongChain?'0x99':{ethereum:'0x1',base:'0x2105',bsc:'0x38'}[chain]):code[chain]});};return {rpcUrls:urls,fetcher};}
test('no DEX markets falls back only to uniquely observed contract code across verified chains',async()=>{
 const r=await createNetworkResolver({getMarkets:async()=>({pairs:[]}),...rpc({ethereum:'0x',base:'0x6000',bsc:'0x'})})(token);assert.equal(r.chain,'base');assert.equal(r.method,'rpc-code');assert.match(r.notice!,/not.*token/i);assert.doesNotMatch(JSON.stringify(r),/\/key/);
});
test('empty, ambiguous and unavailable RPC results never guess a network',async()=>{
 for(const [codes,status] of [[{ethereum:'0x',base:'0x',bsc:'0x'},404],[{ethereum:'0x6000',base:'0x6000',bsc:'0x'},422],[{ethereum:null,base:'0x6000',bsc:'0x'},503]] as const)await assert.rejects(createNetworkResolver({getMarkets:async()=>({pairs:[]}),...rpc(codes)})(token),fail(status));
 await assert.rejects(createNetworkResolver({getMarkets:async()=>({pairs:[]}),...rpc({ethereum:'0x',base:'0x6000',bsc:'0x'},true)})(token),fail(503));
});
test('provider failure can recover from conclusive RPC and otherwise uses sanitized errors',async()=>{
 const r=await createNetworkResolver({getMarkets:async()=>{throw Error('apikey=secret');},...rpc({ethereum:'0x6000',base:'0x',bsc:'0x'})})(token);assert.equal(r.chain,'ethereum');
 await assert.rejects(createNetworkResolver({getMarkets:async()=>{throw Error('apikey=secret');},...rpc({ethereum:null,base:null,bsc:null})})(token),(e:unknown)=>fail(503)(e)&&!String(e).includes('secret'));
});
test('cancellation and deadlines remain bounded even with a noncooperative transport',async()=>{
 const resolve=createNetworkResolver({getMarkets:async()=>new Promise(()=>{}),timeoutMs:30});
 await assert.rejects(resolve(token,{signal:AbortSignal.abort()}));
 const start=Date.now();await assert.rejects(resolve(token),fail(503));assert(Date.now()-start<1000);
});
