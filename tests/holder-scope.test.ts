import test from 'node:test';
import assert from 'node:assert/strict';
import {holderScope} from '../src/lib/holder-scope';
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
  const r=report(chain,[holder(a),holder(b)],a),scope=holderScope(r);
  assert.deepEqual(scope.holders,[r.holders[1]]);assert.deepEqual(scope.infrastructure,[r.holders[0]]);assert.equal(scope.allSnapshot.length,2);
  assert.equal(scope.infrastructure[0].share,3);
 }
});
test('EVM pair and holder matching deduplicates casing while Solana remains case sensitive',()=>{
 const upper='0x'+a.slice(2).toUpperCase();
 const evm=holderScope(report('ethereum',[holder(a),holder(upper),holder(b)],upper));assert.equal(evm.infrastructure.length,1);assert.equal(evm.allSnapshot.length,2);
 const solana=holderScope(report('solana',[holder('AbcMintAccount'),holder('abcMintAccount')],'AbcMintAccount'));assert.equal(solana.infrastructure.length,1);assert.equal(solana.holders[0].address,'abcMintAccount');assert.equal(solana.allSnapshot.length,2);
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
