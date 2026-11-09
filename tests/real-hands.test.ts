import test from 'node:test';import assert from 'node:assert/strict';
import {observedDecision} from '../src/lib/observed-decision';
import {realHolderReadiness} from '../src/lib/real-holder-decision';
import {realHolderCohort} from '../src/lib/top-holder-cohort';
import {trustRating} from '../src/lib/trust-rating';
import type {InvestigationReport} from '../src/lib/investigation-types';

const at='2026-11-09T01:00:00Z',a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash='0x'+'b'.repeat(64);
const token=a(1),exchange=a(2),alice=a(4),bob=a(5),carol=a(6);
type Prefix=Extract<NonNullable<InvestigationReport['holderEnumeration']>,{kind:'real-holder-prefix'}>;

function report():InvestigationReport{
 const holders=[{address:exchange,share:30},{address:alice,share:12},{address:bob,share:6},{address:carol,share:2}].map(h=>({...h,contract:null,locked:null,tag:h.address===exchange?'exchange':''}));
 const sources=['DEX Screener','GoPlus Security','EVM RPC holder balances','EVM RPC wallet activity'].map(name=>({name,status:'available' as const,fetchedAt:at,detail:'Bound current evidence'}));
 const r:InvestigationReport={chain:'ethereum',token,name:'Large token',symbol:'BIG',fetchedAt:at,totalSupply:1000,holderCount:3000000,holders,sources,
  market:{chainId:'ethereum',pairAddress:hash,baseToken:{address:token},quoteToken:{symbol:'USDC'},priceUsd:'1',liquidity:{usd:100000}},
  checks:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable','is_proxy','is_open_source','hidden_owner','selfdestruct'].map(key=>({key,title:key,description:'Current provider control',status:'clear',value:'No',source:'GoPlus Security',fetchedAt:at})),
  identities:[],
  investigation:{wallets:holders.map(h=>({address:h.address,share:h.share,categories:[h.address===exchange?'exchange':'unclassified'],evidenceIds:[`holding:evm:${h.address}`]})),evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'caution',title:'',summary:''},
   coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,fetchedAt:at,source:'Bounded observations',reasons:[]}},
  walletActivity:{source:'EVM RPC wallet activity',observedAt:at,finality:'finalized',blockRef:'0x10:'+hash,blockTimestamp:at,truncated:false,wallets:[alice,bob,carol].map((address,i)=>({address,count:i===0?3:40,exact:true,fresh:null,basis:'evm-account-nonce' as const,reason:'Current account nonce',accountKind:'eoa' as const}))},
  holderEnumeration:{kind:'real-holder-prefix',recordedAccounts:4,verifiedAccounts:4,complete:false,candidates:150,windowCandidates:100,unread:0,ranked:{rawLimit:4,addresses:[exchange,alice,bob,carol],verified:true},accountKinds:{[exchange]:'contract',[alice]:'eoa',[bob]:'eoa',[carol]:'eoa'}}};
 for(const h of holders)r.investigation.evidence.push({id:`holding:evm:${h.address}`,kind:'holding',to:h.address,token,amountRaw:String(h.share*10),decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned finalized balance'});
 const label=`label:${exchange}:exchange`;r.investigation.evidence.push({id:label,kind:'label',source:'GoPlus Security holder tag',timestamp:at,description:'Exchange custody'});r.investigation.wallets[0].evidenceIds.push(label);
 return r;
}
/** Adds verified holders (with balance proof) and re-ranks by verified share. */
function withHolders(r:InvestigationReport,rows:{address:string;share:number;kind?:'eoa'|'contract'|'delegated-eoa'}[]){
 const e=r.holderEnumeration as Prefix;
 for(const row of rows){
  r.holders.push({address:row.address,share:row.share,contract:null,locked:null,tag:''});
  r.investigation.wallets.push({address:row.address,share:row.share,categories:['unclassified'],evidenceIds:[`holding:evm:${row.address}`]});
  r.investigation.evidence.push({id:`holding:evm:${row.address}`,kind:'holding',to:row.address,token,amountRaw:String(Math.round(row.share*10)),decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned finalized balance'});
  if(row.kind)e.accountKinds[row.address]=row.kind;
 }
 e.ranked.addresses=[...r.holders].sort((x,y)=>y.share-x.share||x.address.localeCompare(y.address)).map(h=>h.address);
 e.ranked.rawLimit=e.ranked.addresses.length;e.recordedAccounts=e.verifiedAccounts=e.ranked.addresses.length;
 return r;
}

test('real hands backfill past contracts with no fixed count',()=>{
 // 20 contracts at 2% each rank alongside the real wallets; they are skipped, not counted.
 const r=withHolders(report(),Array.from({length:20},(_,i)=>({address:a(500+i),share:2,kind:'contract' as const}))),cohort=realHolderCohort(r)!;
 assert.deepEqual(cohort.holders.map(h=>h.address).sort(),[alice,bob,carol].sort());
 assert.equal(cohort.contracts.length,20);assert.equal(cohort.infrastructure.length,1);
 assert.equal(cohort.denominator,30,'circulating = 100% - 30% exchange - 40% contracts');
 assert.ok(observedDecision(r,trustRating(r)),'still scored after backfilling past contracts');
});

test('only real wallets holding at least 0.1% of circulating supply lead',()=>{
 const tiny=a(700),unproven=a(701);
 // Circulating = 70%, so the line is 0.07% of total supply.
 const r=withHolders(report(),[{address:tiny,share:.05,kind:'eoa'},{address:unproven,share:1.5}]),cohort=realHolderCohort(r)!;
 assert.ok(!cohort.holders.some(h=>h.address===tiny),'below the line: too small to lead');
 assert.ok(!cohort.holders.some(h=>h.address===unproven),'no code proof: never counted as a real hand');
 assert.equal(cohort.holders.length,3);
});

test('large holders count more: fresh wallets are weighted by balance',()=>{
 const r=report(),observed=observedDecision(r,trustRating(r))!;
 // alice (12%) is the only low-nonce wallet among 12% + 6% + 2%.
 assert.equal(observed.factors.find(f=>f.id==='fresh')?.value,12/20);
});

test('canonical wrapped native tokens have zero sell impact; other tokens keep the pool model',()=>{
 const weth='0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',r=report();
 r.token=weth;r.market={...r.market!,baseToken:{address:weth}};
 for(const e of r.investigation.evidence)if(e.kind==='holding')e.token=weth;
 const wrapped=observedDecision(r,trustRating(r))!,plain=observedDecision(report(),trustRating(report()))!;
 const impact=(o:typeof plain)=>o.factors.find(f=>f.id==='swarm')!;
 assert.equal(impact(wrapped).value,0);assert.match(impact(wrapped).detail,/unwrap it 1:1 into ETH/);
 assert.ok(impact(plain).value>0,'an ordinary token is still judged on sell impact');
 assert.ok(wrapped.score>=plain.score);
});

test('a ranking that does not descend by verified balance is not trusted',()=>{
 const r=report();(r.holderEnumeration as Prefix).ranked.addresses=[alice,exchange,bob,carol];
 assert.equal(realHolderCohort(r),null);
});

test('a missing score always says which input was missing',()=>{
 const ok=report();assert.equal(realHolderReadiness(ok,trustRating(ok)),null);
 const noActivity=report();noActivity.walletActivity!.wallets=noActivity.walletActivity!.wallets.map(w=>({...w,count:null,exact:false}));
 assert.match(realHolderReadiness(noActivity,trustRating(noActivity))!,/Wallet activity/);
 const noMarket=report();noMarket.market=null;assert.match(realHolderReadiness(noMarket,trustRating(noMarket))!,/DEX market|current holder data/);
 const noBalances=report();noBalances.sources=noBalances.sources.map(s=>s.name==='EVM RPC holder balances'?{...s,status:'unavailable' as const}:s);
 assert.match(realHolderReadiness(noBalances,trustRating(noBalances))!,/balances could not be verified|current holder data/);
});
