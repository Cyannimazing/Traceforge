import test from 'node:test';
import assert from 'node:assert/strict';
import {validateToken} from '../src/lib/analysis';
import {marketNetworkCandidates,createNetworkResolver} from '../src/lib/network-resolver';
import {parseDiscoveryProfiles,enrichDiscoveryProfile} from '../src/lib/discovery';
import {tokenRouteTarget} from '../src/lib/token-route';
import {buildQuery} from '../src/lib/bitquery';
const token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(64),chain='robinhood' as any;
const market={chainId:'robinhood',pairAddress:pool,baseToken:{address:token,name:'Example',symbol:'EX'},liquidity:{usd:100}};

test('Robinhood token routes accept EVM addresses but not V4 pool IDs as token addresses',()=>{
 assert.equal(validateToken('robinhood',token),null);
 assert.equal(tokenRouteTarget('robinhood',token)?.chain,'robinhood');
 assert.notEqual(validateToken('robinhood',pool),null);
});
test('Auto identifies Robinhood markets with opaque pool IDs without probing unrelated RPCs',async()=>{
 assert.deepEqual(marketNetworkCandidates({pairs:[market]},token),[{chain:'robinhood',liquidityUsd:100,pairs:1}]);
 let rpc=0;const resolve=createNetworkResolver({getMarkets:async()=>({pairs:[market]}),fetcher:async()=>{rpc++;throw Error('Unneeded RPC');}});
 const result=await resolve(token);assert.equal(result.chain,'robinhood');assert.equal(result.method,'dex-liquidity');assert.equal(rpc,0);
 assert.equal(marketNetworkCandidates({pairs:[{...market,baseToken:{address:'0x'+'3'.repeat(40)}}]},token).length,0);
});
test('Robinhood discovery keeps chain identity and provider pool IDs without making them addresses',()=>{
 const profiles=parseDiscoveryProfiles([{chainId:'robinhood',tokenAddress:token}]);assert.equal(profiles.length,1);assert.equal(profiles[0].chain,'robinhood');
 const enriched=enrichDiscoveryProfile(profiles[0],[market],'2026-11-04T00:00:00Z',Date.parse('2026-11-04T00:00:00Z'));assert.equal(enriched.pairAddress,pool);assert.equal(enriched.name,'Example');
});
test('unsupported indexed historical queries never interpolate an undefined Robinhood network',()=>{
 assert.throws(()=>buildQuery('holders',chain,token,100),/unsupported|not supported|unavailable/i);
});
