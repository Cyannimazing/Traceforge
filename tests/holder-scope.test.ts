import test from 'node:test';
import assert from 'node:assert/strict';
import {holderScope} from '../src/lib/holder-scope';
import {holderMapFloatBasis,mapDisplayShare,sharePercentText} from '../src/lib/holder-map-basis';
import type {Chain,Holder,Pair} from '../src/lib/analysis';
import type {Evidence,InvestigatedWallet,WalletCategory} from '../src/lib/investigation-types';
const a='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',b='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const holder=(address:string,contract:boolean|null=null):Holder=>({address,share:3,contract,locked:null,tag:''});
function report(chain:Chain='ethereum',holders:Holder[]=[holder(a),holder(b)],pair?:string){
 return {chain,holders,fetchedAt:'2026-11-02T01:00:00Z',sources:[{name:'DEX Screener',status:'available' as const,fetchedAt:'2026-11-02T01:00:00Z',detail:''}],market:pair?{chainId:chain,pairAddress:pair,baseToken:{address:'token'}} as Pair:null,investigation:{wallets:[] as InvestigatedWallet[],evidence:[] as Evidence[]}};
}
function label(r:ReturnType<typeof report>,address:string,category:WalletCategory){
 const id=`label:${address}:${category}`;r.investigation.wallets.push({address,share:3,categories:[category],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'label',timestamp:'2026-11-02T01:00:00Z',source:'Verified account label',description:category});
}
test('market pool is separate from default current holders on every supported chain',()=>{
 for(const chain of ['ethereum','base','bsc','solana'] as const){
  const pair=chain==='solana'?'A'.repeat(32):a,other=chain==='solana'?'B'.repeat(32):b;
  const r=report(chain,[holder(pair),holder(other)],pair),scope=holderScope(r);
  assert.deepEqual(scope.holders,[r.holders[1]]);assert.deepEqual(scope.infrastructure,[r.holders[0]]);assert.equal(scope.allSnapshot.length,2);
  assert.equal(scope.infrastructure[0].share,3);
 }
});
test('EVM pair and holder matching deduplicates casing while Solana remains case sensitive',()=>{
 const upper='0x'+a.slice(2).toUpperCase();
 const evm=holderScope(report('ethereum',[holder(a),holder(upper),holder(b)],upper));assert.equal(evm.infrastructure.length,1);assert.equal(evm.allSnapshot.length,2);
 const solana=holderScope(report('solana',[holder('A'.repeat(32)),holder('a'.repeat(32))],'A'.repeat(32)));assert.equal(solana.infrastructure.length,1);assert.equal(solana.holders[0].address,'a'.repeat(32));assert.equal(solana.allSnapshot.length,2);
});
test('evidenced pools exchanges bridges and burns are separated while contracts remain holders',()=>{
 for(const category of ['pool','exchange','bridge','burn'] as const){const r=report();label(r,a,category);assert.deepEqual(holderScope(r).holders.map(h=>h.address),[b]);}
 const contract=report('base',[holder(a,true),holder(b)]);label(contract,a,'contract');assert.equal(holderScope(contract).holders.length,2);assert.equal(holderScope(contract).infrastructure.length,0);
});
test('role-only labels and unrelated/missing label evidence cannot silently hide a holder',()=>{
 const r=report();label(r,a,'exchange');r.investigation.evidence[0].source='';assert.equal(holderScope(r).holders.length,2);
 r.investigation.evidence[0].source='Provider';r.investigation.evidence[0].id='label:someone-else:exchange';r.investigation.wallets[0].evidenceIds=[r.investigation.evidence[0].id];assert.equal(holderScope(r).holders.length,2);
 r.investigation.evidence=[];assert.equal(holderScope(r).holders.length,2);
});
test('graph-only traders and funders never enter either snapshot partition',()=>{
 const r=report();label(r,'graph-only','pool');r.investigation.wallets.push({address:'funder-only',share:null,categories:['unclassified'],evidenceIds:[]});
 const scope=holderScope(r);assert.equal(scope.holders.length,2);assert.equal(scope.infrastructure.length,0);assert.equal(scope.allSnapshot.length,2);
});
test('canonical pool timing evidence identifies a snapshot pool without a market pair',()=>{
 const r=report();r.investigation.wallets.push({address:a,share:3,categories:['pool'],evidenceIds:[`pool-timing:${a}:creation`]});r.investigation.evidence.push({id:`pool-timing:${a}:creation`,kind:'label',timestamp:'2026-11-02T01:00:00Z',source:'Pool timing verifier',description:'Verified creation'});assert.equal(holderScope(r).infrastructure.length,1);
});

test('label joins follow chain-specific casing without mutating original roles or shares',()=>{
 const evm=report();label(evm,'0x'+a.slice(2).toUpperCase(),'exchange');const before=JSON.stringify(evm);
 assert.equal(holderScope(evm).infrastructure.length,1);assert.equal(JSON.stringify(evm),before);
 const solana=report('solana',[holder('AbcWallet'),holder('abcWallet')]);label(solana,'AbcWallet','exchange');
 assert.equal(holderScope(solana).holders[0].address,'abcWallet');assert.equal(holderScope(solana).infrastructure[0].address,'AbcWallet');
});

test('imported labels and unsupported market provenance do not silently exclude holders',()=>{
 const r=report();label(r,a,'pool');r.investigation.evidence[0].attribution='provider-reported';assert.equal(holderScope(r).infrastructure.length,0);
 delete r.investigation.evidence[0].attribution;r.investigation.wallets[0].categorySources={pool:'swarm'};assert.equal(holderScope(r).infrastructure.length,0);
 const pair=report('ethereum',[holder(a),holder(b)],a);pair.sources=[];assert.equal(holderScope(pair).infrastructure.length,0);
});
test('Four.Meme listing identifier cannot disable float for verified custody and two holder balances',()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b';
 const r=report('bsc',[{...holder(manager),share:99.95809933},{...holder(a),share:.02102657},{...holder(b),share:.02087410}],`${a}:4meme`);
 label(r,manager,'pool');r.investigation.evidence[0].source='BSC RPC Four.Meme custody verification';
 const scope=holderScope(r),basis=holderMapFloatBasis(scope.infrastructure,scope.currentInfrastructureAddresses,false,scope.holders);
 assert.equal(scope.holders.length,2);assert.equal(scope.infrastructure.length,1);assert.deepEqual(scope.infrastructureAddresses,[manager]);
 assert.ok(Math.abs(basis.denominator!-.04190067)<1e-10);
 assert.deepEqual(scope.holders.map(row=>sharePercentText(mapDisplayShare(row.share,'float',basis))),['50.18%','49.82%']);
});
test('non-address market identifiers are ignored while genuine missing balances still withhold float',()=>{
 for(const chain of ['ethereum','base','bsc','solana'] as const)for(const pair of ['token:4meme','not-an-address','https://example.com/pair','',`${a}:4meme`]){
  const scope=holderScope(report(chain,[holder(a)],pair));assert.deepEqual(scope.infrastructureAddresses,[]);assert.equal(scope.holders.length,1);
 }
 const scope=holderScope(report('bsc',[holder(a)],b));
 assert.deepEqual(scope.infrastructureAddresses,[b]);assert.equal(scope.infrastructure.length,0);
 assert.deepEqual(scope.currentInfrastructureAddresses,[b]);
 assert.equal(holderMapFloatBasis(scope.infrastructure,scope.currentInfrastructureAddresses,false,scope.holders).denominator,null);
});
test('snapshot float uses current measured infrastructure while retaining historical labels for graph scope',()=>{
 const current='AxfHbztLN7uxmgA4d2HxpP539FzFAHNEGXYY9T3JC8v9',historical='HmEnwE4srtCkZzsm5iuZi5LvTZjujsjWJaPeQGus9bh3',largest='CECRG1AKyo2UnemBQwXvtpmMkEgfhuDnLsaLK1HABmxb';
 const r=report('solana',[{...holder(current),share:24.16850586034756},{...holder(largest),share:3.82008746451179}],current);
 label(r,current,'pool');label(r,historical,'pool');
 r.investigation.evidence[1].timestamp='2026-10-28T06:29:08Z';r.investigation.evidence[1].source='Alchemy finalized Solana transaction history';
 const before=JSON.stringify(r),scope=holderScope(r);
 assert.deepEqual(scope.infrastructureAddresses,[current,historical]);assert.deepEqual(scope.currentInfrastructureAddresses,[current]);
 assert.deepEqual(scope.holders.map(row=>row.address),[largest]);assert.equal(scope.infrastructure.length,1);
 const basis=holderMapFloatBasis(scope.infrastructure,scope.currentInfrastructureAddresses,true,scope.holders);
 assert.ok(Math.abs(basis.denominator!-75.83149413965244)<1e-10);
 assert.ok(Math.abs(mapDisplayShare(scope.holders[0].share,'float',basis)!-5.037600152618197)<1e-10);
 assert.equal(sharePercentText(mapDisplayShare(scope.holders[0].share,'float',basis)),'5.04%');
 assert.equal(JSON.stringify(r),before);assert.ok(!scope.allSnapshot.some(row=>row.address===historical),'historical absence never becomes a zero holding');
});
