import test from 'node:test';import assert from 'node:assert/strict';
import {observedDecision} from '../src/lib/observed-decision';
import {realHolderDecision} from '../src/lib/real-holder-decision';
import {trustRating} from '../src/lib/trust-rating';
import {assessmentReadiness} from '../src/lib/assessment-readiness';
import type {InvestigationReport} from '../src/lib/investigation-types';

const at='2026-11-09T01:00:00Z',a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash='0x'+'b'.repeat(64);
const token=a(1),exchange=a(2),alice=a(4),bob=a(5),carol=a(6);
function report(chain:'ethereum'|'base'|'bsc'='ethereum'):InvestigationReport{
 const holders=[{address:exchange,share:30},{address:alice,share:12},{address:bob,share:6},{address:carol,share:2}].map(h=>({...h,contract:null,locked:null,tag:h.address===exchange?'exchange':''}));
 const sources=['DEX Screener','GoPlus Security','EVM RPC holder balances','EVM RPC wallet activity'].map(name=>({name,status:'available' as const,fetchedAt:at,detail:'Bound current evidence'}));
 const r:InvestigationReport={chain,token,name:'Large token',symbol:'BIG',fetchedAt:at,totalSupply:1000,holderCount:3000000,holders,sources,
  market:{chainId:chain,pairAddress:hash,baseToken:{address:token},quoteToken:{symbol:'USDC'},priceUsd:'1',liquidity:{usd:100000}},
  checks:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable','is_proxy','is_open_source','hidden_owner','selfdestruct'].map(key=>({key,title:key,description:'Current provider control',status:'clear',value:'No',source:'GoPlus Security',fetchedAt:at})),
  identities:[],
  investigation:{wallets:holders.map(h=>({address:h.address,share:h.share,categories:[h.address===exchange?'exchange':'unclassified'],evidenceIds:[`holding:evm:${h.address}`]})),evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'caution',title:'',summary:''},
   coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,fetchedAt:at,source:'Bounded observations',reasons:[]}},
  walletActivity:{source:'EVM RPC wallet activity',observedAt:at,finality:'finalized',blockRef:'0x10:'+hash,blockTimestamp:at,truncated:false,wallets:[alice,bob,carol].map((address,i)=>({address,count:i===0?3:40,exact:true,fresh:null,basis:'evm-account-nonce' as const,reason:'Current account nonce',accountKind:'eoa' as const}))},
  holderEnumeration:{kind:'real-holder-prefix',recordedAccounts:4,verifiedAccounts:4,complete:false,candidates:400,windowCandidates:300,ranked:{rawLimit:50,addresses:[exchange,alice,bob,carol],verified:true}}};
 for(const h of holders)r.investigation.evidence.push({id:`holding:evm:${h.address}`,kind:'holding',to:h.address,token,amountRaw:String(h.share*10),decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned finalized balance'});
 const label=`label:${exchange}:exchange`;r.investigation.evidence.push({id:label,kind:'label',source:'GoPlus Security holder tag',timestamp:at,description:'Exchange custody'});r.investigation.wallets[0].evidenceIds.push(label);
 return r;
}
const capped=(r:InvestigationReport)=>{r.investigation.coverage.transferWindow={limit:150000,read:150000,total:9200000,status:'capped',anchorBlock:100,newestBlock:100,oldestBlock:50,updatedAt:at,detail:'Token too large for a full crawl.'};return r;};

test('large EVM tokens receive a real-holder score instead of "Not verified"',()=>{
 for(const chain of ['ethereum','base','bsc'] as const){
  const r=report(chain),strict=trustRating(r),observed=observedDecision(r,strict);
  assert.ok(observed,`${chain} should be scored`);assert.ok(Number.isFinite(observed!.score));
  assert.equal(observed!.factors.find(f=>f.id==='dev')?.basis,'observed-none');
  assert.match(observed!.factors.find(f=>f.id==='dev')!.detail,/Creator not established/);
  // The exchange is infrastructure, not a real holder.
  assert.equal(observed!.scope.topHolders?.infrastructureCount,1);
  assert.equal(observed!.factors.find(f=>f.id==='fresh')?.value,1/3);
 }
});

test('capped transfer window adds the large-token note and the Bounded history label',()=>{
 const r=capped(report()),strict=trustRating(r),observed=realHolderDecision(r,strict)!;
 assert.ok(observed.scope.notes!.some(n=>/most recent 150,000 transfers/.test(n)&&/too large to crawl/.test(n)));
 assert.equal(assessmentReadiness(r,strict,observed.score,'CAUTION').label,'Bounded history');
});

test('provider-only or stale holder rows never produce a real-holder score',()=>{
 const missingProof=report();missingProof.investigation.evidence=missingProof.investigation.evidence.filter(e=>e.id!==`holding:evm:${alice}`);
 assert.equal(realHolderDecision(missingProof,trustRating(missingProof)),null);
 const noRanking=report();noRanking.holderEnumeration=undefined;assert.equal(realHolderDecision(noRanking,trustRating(noRanking)),null);
 const mismatch=report();mismatch.holderEnumeration={...mismatch.holderEnumeration!,ranked:{rawLimit:50,addresses:[alice,exchange,bob,carol],verified:true}} as InvestigationReport['holderEnumeration'];
 assert.equal(realHolderDecision(mismatch,trustRating(mismatch)),null);
 const stale=report();stale.sources=stale.sources.map(s=>s.name==='EVM RPC holder balances'?{...s,fetchedAt:'2026-11-08T01:00:00Z'}:s);
 assert.equal(realHolderDecision(stale,trustRating(stale)),null);
});

test('the model never scores Solana or provider-analysis reports',()=>{
 const r=report();assert.equal(realHolderDecision({...r,chain:'solana'},trustRating(r)),null);
});
