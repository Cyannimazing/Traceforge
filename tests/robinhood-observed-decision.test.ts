import test from 'node:test';import assert from 'node:assert/strict';
import {buildVerdictOutput} from '../src/lib/verdict-output';
import {observedDecision} from '../src/lib/observed-decision';
import {trustRating} from '../src/lib/trust-rating';
import {factorPoints} from '../src/lib/reconstructed-score';import {buildScoringInputs} from '../src/lib/scoring-inputs';
import type {InvestigationReport} from '../src/lib/investigation-types';
const at='2026-11-04T01:00:00Z',a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),hash='0x'+'a'.repeat(64),token=a(1),manager=a(2),locker=a(3),alice=a(4),bob=a(5),carol=a(6),creator=a(7);
function reconcileFixture(r:InvestigationReport){
 const reserve=r.holders.find(h=>h.address===manager)!;reserve.share=100-r.holders.filter(h=>h.address!==manager).reduce((sum,h)=>sum+h.share,0);
 r.investigation.wallets.find(w=>w.address===manager)!.share=reserve.share;r.investigation.evidence.find(e=>e.id===`holding:evm:${manager}`)!.amountRaw=String(Math.round(reserve.share*10));
 r.holderCount=r.holders.length;r.holderEnumeration={kind:'pons-creation-ledger',recordedAccounts:r.holders.length,verifiedAccounts:r.holders.length,complete:true};return r;
}
function report():InvestigationReport{
 const holders=[{address:manager,share:20},{address:locker,share:10},{address:alice,share:10},{address:bob,share:5},{address:carol,share:2}].map(h=>({...h,contract:null,locked:null,tag:''}));
 const sources=['DEX Screener','GoPlus Security','EVM RPC holder balances','EVM RPC wallet activity','Pons factory launch record','GeckoTerminal trades'].map(name=>({name,status:'available' as const,fetchedAt:at,detail:'Bound current evidence'}));
 const r:InvestigationReport={chain:'robinhood',token,name:'Synthetic protocol token',symbol:'TEST',fetchedAt:at,totalSupply:1000,holderCount:null,holders,sources,market:{chainId:'robinhood',pairAddress:hash,baseToken:{address:token},quoteToken:{symbol:'ETH'},priceUsd:'1',liquidity:{usd:1000}},checks:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable','is_proxy','is_open_source','hidden_owner','selfdestruct'].map(key=>({key,title:key,description:'Current provider control',status:'clear',value:'No',source:'GoPlus Security',fetchedAt:at})),identities:[{address:creator,role:'creator',source:'Pons factory launch record',timestamp:at,label:'Launch initiator',timestampBasis:'local-observation'}],investigation:{wallets:holders.map(h=>({address:h.address,share:h.share,categories:[h.address===manager||h.address===locker?'pool':'unclassified'],evidenceIds:[`holding:evm:${h.address}`]})),evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'caution',title:'',summary:''},coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,fetchedAt:at,source:'Bounded observations',reasons:['Incomplete launch history']}},walletActivity:{source:'EVM RPC wallet activity',observedAt:at,finality:'finalized',blockRef:'0x10:'+hash,blockTimestamp:at,truncated:false,wallets:[alice,bob,carol].map((address,i)=>({address,count:i===0?1:i*10+10,exact:true,fresh:i===0?null:false,basis:'evm-outgoing-count',reason:'Outgoing nonce only'}))}};
 for(const h of holders)r.investigation.evidence.push({id:`holding:evm:${h.address}`,kind:'holding',to:h.address,token,amountRaw:String(h.share*10),decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned safe balance'});
 for(const address of [manager,locker]){const id=`label:${address}:pool`;r.investigation.evidence.push({id,kind:'label',source:'Verified deployment + code',timestamp:at,description:'Shared protocol custody'});r.investigation.wallets.find(w=>w.address===address)!.evidenceIds.push(id);}
 r.investigation.wallets.push({address:creator,share:null,categories:['creator'],evidenceIds:[`identity:creator:${creator}`,`holding:evm:${creator}`]});r.investigation.evidence.push({id:`identity:creator:${creator}`,kind:'authority',source:'Pons factory launch record',timestamp:at,description:'Token-bound launch initiator state'},{id:`holding:evm:${creator}`,kind:'holding',to:creator,token,amountRaw:'0',decimals:0,source:'EVM RPC holder balances',timestamp:at,description:'Pinned safe zero balance'}, {id:'trade:gecko:sample',kind:'trade',token,amount:5,source:'GeckoTerminal public pool trades (transaction sender; economic owner unverified)',transaction:hash,timestamp:at,description:'Observed buy'});r.investigation.timeline.push({id:'sample',wallet:alice,kind:'buy',timestamp:at,amount:5,evidenceId:'trade:gecko:sample'});return reconcileFixture(r);
}
function rankedPartial():InvestigationReport{
 const r=report();for(let i=100;i<195;i++){const address=a(i),id=`holding:evm:${address}`;r.holders.push({address,share:.1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:.1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'1',decimals:0,source:'EVM RPC holder balances',timestamp:at,description:'Independent current balance'});r.walletActivity!.wallets.push({address,count:20,exact:true,fresh:null,basis:'evm-account-nonce',reason:'Current account nonce'});}reconcileFixture(r);
 const ranked=[...r.holders].sort((x,y)=>y.share-x.share||x.address.localeCompare(y.address)).slice(0,50).map(h=>h.address);r.holders=r.holders.slice(0,60);const retained=new Set(r.holders.map(h=>h.address));r.investigation.evidence=r.investigation.evidence.filter(e=>e.kind!=='holding'||e.to===creator||retained.has(e.to||''));r.investigation.wallets=r.investigation.wallets.filter(w=>w.address===creator||retained.has(w.address));r.walletActivity!.wallets=r.walletActivity!.wallets.filter(w=>retained.has(w.address));r.holderEnumeration={kind:'pons-creation-ledger',recordedAccounts:100,verifiedAccounts:60,complete:false,ranked:{rawLimit:50,addresses:ranked,verified:true}};return r;
}
function priorMemory(r:InvestigationReport){
 const prior=a(900),block={number:'0x1',hash:'0x'+'b'.repeat(64),timestamp:'2026-11-03T01:00:00Z'};
 const event=(from:string,to:string,id:number)=>({kind:'erc20' as const,token:prior,from,to,amountRaw:'100',transaction:'0x'+id.toString(16).padStart(64,'0'),block,logIndex:0,initiator:from});
 const connection=(from:string,to:string,id:number)=>({event:event(from,to,id),participants:[from,to].map((address,i)=>({address,activity:event(address,a(99),id+10+i),holding:{block,balanceRaw:'100',totalSupplyRaw:'1000000',decimals:0},code:'0x'})),senderFanout:{recipients:1,complete:true}});
 r.crossTokenMemory={version:1,chain:r.chain,token:r.token,observedAt:at,status:'partial',records:[{chain:r.chain,chainId:'4663',token:prior,anchor:{...block,number:'0x2'},verifiedAt:at,source:'configured-rpc',connections:[connection(alice,bob,100)]}],scope:{selectedWallets:3,queriedWallets:3,candidateTokens:1,verifiedTransactions:3,truncated:true},reasons:['Bounded search']};
 return {connection,prior,block};
}
test('independent prior pair caps observed scoring without creating a current relationship or fixed confidence',()=>{
 const r=report(),baseline=observedDecision(r);assert(baseline);priorMemory(r);const rating=trustRating(r),out=observedDecision(r,rating);assert(out);
 assert.equal(rating.ceiling,59);assert(rating.soft?.some(reason=>reason.includes('prior token')));assert.equal(out.score,Math.min(59,baseline.score));assert.deepEqual(rating.judgeInputs?.memoryHitsRange,{lower:1,upper:2});
 assert(out.judge.mass&&baseline.judge.mass);assert.equal(r.investigation.relationships.length,0);assert(out.scope.notes.some(note=>/1.*prior-token/.test(note)));assert(!out.scope.notes.some(note=>note.includes('No cross-token group search')));
 const first=out.judge.p;r.crossTokenMemory!.records=[];const removed=observedDecision(r);assert(removed);assert.notDeepEqual(first,removed.judge.p);assert.deepEqual(trustRating(r).soft,[]);
});
test('two disjoint historical components saturate memory mass while preserving factor arithmetic',()=>{
 const r=rankedPartial(),{connection}=priorMemory(r);r.crossTokenMemory!.records[0].connections.push(connection(carol,a(100),500));
 const rating=trustRating(r),out=observedDecision(r,rating);assert(out);assert.deepEqual(rating.judgeInputs?.memoryHitsRange,{lower:2,upper:2});assert.equal(out.judge.total,1.62);
 const unchanged=structuredClone(r);delete unchanged.crossTokenMemory;assert.deepEqual(out.factors,observedDecision(unchanged)!.factors);assert.equal(out.score,59);assert.equal(out.judge.p?.caution,0.538);assert.equal(out.judge.p?.avoid,0.415);assert.equal(out.judge.p?.ok,0.047);
});
test('verified complete raw top prefix permits a conditional point while lower ranked balances remain unread',()=>{
 const r=rankedPartial(),before=JSON.stringify(r),out=observedDecision(r);assert(out);assert.equal(r.holderCount,100);assert.equal(r.holders.length,60);assert.equal(r.holderEnumeration!.complete,false);assert.equal(out.scope.topHolders?.rawCount,50);assert.equal(out.scope.topHolders?.selectedCount,48);assert.equal(out.scope.activityProxy?.readable,15);assert.equal(r.investigation.coverage.launchVerified,false);assert.equal(JSON.stringify(r),before);assert(out.scope.notes.some(n=>n.includes('60 of 100')&&n.includes('not a fully checked')));
 const hard=rankedPartial();hard.checks[0].status='critical';assert.equal(observedDecision(hard)?.scoreBand,'AVOID');
});
test('partial top-prefix qualification rejects short, reordered, duplicate, unverified and mismatched ranking evidence',()=>{
 const cases:{name:string;mutate:(r:InvestigationReport)=>void}[]=[
  {name:'missing ranked marker',mutate:r=>{delete r.holderEnumeration!.ranked;}},
  {name:'unverified marker',mutate:r=>{r.holderEnumeration!.ranked!.verified=false as never;}},
  {name:'wrong raw limit',mutate:r=>{r.holderEnumeration!.ranked!.rawLimit=49 as never;}},
  {name:'short prefix',mutate:r=>{r.holderEnumeration!.ranked!.addresses.pop();}},
  {name:'case-variant duplicate address',mutate:r=>{r.holderEnumeration!.ranked!.addresses[49]=r.holderEnumeration!.ranked!.addresses[48].toUpperCase();}},
  {name:'wrong rank order',mutate:r=>{r.holderEnumeration!.ranked!.addresses.reverse();}},
  {name:'address not independently verified',mutate:r=>{r.holderEnumeration!.ranked!.addresses[49]=a(900);}},
  {name:'missing top balance proof',mutate:r=>{r.investigation.evidence=r.investigation.evidence.filter(e=>e.id!==`holding:evm:${alice}`);}},
  {name:'verified count mismatch',mutate:r=>{r.holderEnumeration!.verifiedAccounts=59;}},
  {name:'recorded count mismatch',mutate:r=>{r.holderCount=101;}},
  {name:'false complete inventory',mutate:r=>{r.holderEnumeration!.complete=true;}},
  {name:'short fallback with many recorded holders',mutate:r=>{r.holders=r.holders.slice(0,7);r.holderEnumeration!.verifiedAccounts=7;r.holderEnumeration!.ranked!.addresses=r.holders.map(h=>h.address);}},
 ];for(const {name,mutate}of cases){const r=rankedPartial();mutate(r);assert.equal(observedDecision(r),null,name);}
});
test('rank provenance permits genuinely small reconciled inventories but rejects short fallback and inconsistent current inventory',()=>{
 const small=report();assert.equal(small.holders.length,5);assert(observedDecision(small));
 const cases:{name:string;mutate:(r:InvestigationReport)=>void}[]=[
  {name:'missing inventory attestation',mutate:r=>{delete r.holderEnumeration;}},
  {name:'partial inventory',mutate:r=>{r.holderEnumeration!.complete=false;}},
  {name:'larger recorded inventory',mutate:r=>{r.holderEnumeration!.recordedAccounts=242;r.holderCount=242;}},
  {name:'deleted positive row',mutate:r=>{r.holders=r.holders.filter(h=>h.address!==carol);}},
  {name:'duplicate positive row',mutate:r=>{r.holders.push({...r.holders[0]});}},
  {name:'count mismatch',mutate:r=>{r.holderCount=100;}},
  {name:'malformed inventory count',mutate:r=>{r.holderEnumeration!.verifiedAccounts=NaN;}},
  {name:'invalid address row',mutate:r=>{r.holders[4].address='not-an-address';}},
  {name:'unreconciled supply despite asserted complete',mutate:r=>{const h=r.holders.find(h=>h.address===carol)!;h.share=1;r.investigation.evidence.find(e=>e.id===`holding:evm:${carol}`)!.amountRaw='10';}},
 ];
 for(const {name,mutate}of cases){const r=report();mutate(r);assert.equal(observedDecision(r),null,name);}
});
test('withheld partial-ranking point never suppresses source-qualified hard rules',()=>{
 const r=report();r.holderEnumeration!.complete=false;r.checks[0].status='critical';const strict=trustRating(r),observed=observedDecision(r,strict);assert.equal(observed,null);assert.equal(buildVerdictOutput({rating:strict,observed}).decision,'AVOID');
});
test('zero raw balance cannot qualify as a tiny positive holder while explicit zero creator evidence remains valid',()=>{
 const r=report();for(let i=100;i<146;i++){const address=a(i),id=`holding:evm:${address}`;r.holders.push({address,share:.1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:.1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'1',decimals:0,source:'EVM RPC holder balances',timestamp:at,description:'Positive holder outside the primary activity subset'});}reconcileFixture(r);assert(observedDecision(r));assert.equal(r.investigation.evidence.find(e=>e.id===`holding:evm:${creator}`)?.amountRaw,'0');
 const address=a(98),id=`holding:evm:${address}`;r.holders.push({address,share:1e-12,contract:false,locked:null,tag:''});r.holderCount!++;r.holderEnumeration!.recordedAccounts++;r.holderEnumeration!.verifiedAccounts++;r.investigation.wallets.push({address,share:1e-12,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'0',decimals:0,source:'EVM RPC holder balances',timestamp:at,description:'Malformed positive-row claim with zero raw balance'});
 assert.equal(observedDecision(r),null);
});
test('Robinhood observed point computes six factors from current bounded evidence without rewriting strict bounds',()=>{
 const r=report(),before=JSON.stringify(r),strict=trustRating(r),out=observedDecision(r,strict);assert(out);assert.equal(strict.score,null);assert.equal(out.factors.length,6);assert(Math.abs(out.impact-(1-(500/600)**2))<1e-12);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,1/3);assert.equal(out.factors.find(f=>f.id==='fresh')!.basis,'account-nonce-proxy');assert.equal(out.score,67);assert.equal(out.score,Math.round(out.factors.reduce((sum,f)=>sum+factorPoints(f.id,f.value)!,0)));assert.match(out.factors[0].detail,/not.*V4.*quote/i);assert(out.scope.notes.some(n=>/not.*lifetime.fresh/i.test(n)));assert.equal(JSON.stringify(r),before);assert.equal(r.walletActivity!.wallets[0].fresh,null);
});
test('missing binding, stale sources, wrong units and absent returned history abstain rather than manufacture six zeros',()=>{
 const cases=[(r:InvestigationReport)=>{r.checks=[];},(r:InvestigationReport)=>{r.providerAnalysis={} as never;},(r:InvestigationReport)=>{r.market!.chainId='base';},(r:InvestigationReport)=>{r.market!.baseToken.address=a(99);},(r:InvestigationReport)=>{r.market!.liquidity!.usd=0;},(r:InvestigationReport)=>{r.market!.priceUsd='NaN';},(r:InvestigationReport)=>{r.sources.find(s=>s.name==='DEX Screener')!.fetchedAt='2026-11-01T00:00:00Z';},(r:InvestigationReport)=>{r.sources.find(s=>s.name==='Pons factory launch record')!.status='unavailable';},(r:InvestigationReport)=>{r.investigation.evidence=r.investigation.evidence.filter(e=>e.kind!=='trade');},(r:InvestigationReport)=>{r.investigation.evidence.find(e=>e.id===`holding:evm:${alice}`)!.amountRaw='1';},(r:InvestigationReport)=>{r.investigation.evidence=r.investigation.evidence.filter(e=>e.id!==`holding:evm:${creator}`);},(r:InvestigationReport)=>{r.walletActivity!.wallets.forEach(w=>w.count=null);},(r:InvestigationReport)=>{r.sources.find(s=>s.name==='EVM RPC holder balances')!.status='unavailable';}];
 for(const mutate of cases){const r=report();mutate(r);assert.equal(observedDecision(r),null);}
});
test('unread wallets are excluded from the outgoing proxy; low nonce is never a lifetime-fresh flag',()=>{const r=report();r.walletActivity!.wallets[2].count=null;r.walletActivity!.wallets[2].exact=false;const out=observedDecision(r);assert(out);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,.5);assert.equal(out.scope.readableFreshWallets,2);assert.equal(out.scope.unreadFreshWallets,1);assert.match(out.factors.find(f=>f.id==='fresh')!.detail,/outgoing/i);assert.equal(r.walletActivity!.wallets[0].fresh,null);});
test('qualified critical and soft rules override the conditional point model',()=>{const hard=report();hard.checks[0].status='critical';const h=observedDecision(hard);assert(h);assert.equal(h.scoreBand,'AVOID');assert.equal(h.judge.decision,'AVOID');assert.equal(h.judge.confidence,null);const soft=report();soft.checks.find(c=>c.key==='is_mintable')!.status='warning';const s=observedDecision(soft);assert(s);assert(s.score<=59);assert.notEqual(s.scoreBand,'OK');});
test('new recorded creator-origin exposure and market values change arithmetic instead of fitting a target score',()=>{const r=report(),baseline=observedDecision(r)!;r.investigation.evidence.push({id:'creator-transfer',kind:'transfer',from:creator,to:alice,amount:1,token,transaction:hash,source:'RPC receipt',timestamp:at,description:'Recorded token transfer'});const observed=observedDecision(r)!;assert(observed.factors.find(f=>f.id==='dev')!.value>0);assert(observed.factors.find(f=>f.id==='insiders')!.value>0);assert(observed.score<baseline.score);r.market!.liquidity!.usd=2000;assert(observedDecision(r)!.impact<observed.impact);assert.equal(r.investigation.coverage.launchVerified,false);});
test('unknown secondary security cannot become a clean model input; snapshot and identity mismatches abstain',()=>{
 const r=report();r.checks.find(c=>c.key==='is_proxy')!.status='unknown';const out=observedDecision(r);assert(out);assert.equal(out.judge.p,null);assert.equal(out.judge.confidence,null);
 for(const mode of ['snapshot','creator-kind','quote-token']){const r=report();if(mode==='snapshot')r.investigation.evidence.find(e=>e.id===`holding:evm:${alice}`)!.timestamp='2026-11-04T00:59:59Z';if(mode==='creator-kind')r.investigation.evidence.find(e=>e.id===`identity:creator:${creator}`)!.kind='label';if(mode==='quote-token')Object.assign(r.market!.quoteToken!,{address:token});assert.equal(observedDecision(r),null,mode);}
});
test('fresh proxy cap is deterministic and a conditional impact or low nonce never creates a verified hard stop',()=>{
 const r=report();r.market!.liquidity!.usd=10;for(const w of r.walletActivity!.wallets)w.count=0;const strict=trustRating(r),out=observedDecision(r,strict);assert(out);assert(out.impact>.5);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,1);assert.equal(strict.hard?.length,0);assert.equal(r.investigation.coverage.launchVerified,false);
});
test('top-holder proxy uses the first fifteen candidates regardless of provider row order',()=>{
 const r=report();for(let i=20;i<40;i++){const address=a(i),id=`holding:evm:${address}`;r.holders.push({address,share:1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'10',decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned balance'});r.walletActivity!.wallets.push({address,count:5,exact:true,fresh:null,basis:'evm-outgoing-count',reason:'Low outgoing only'});}
 reconcileFixture(r);const out=observedDecision(r)!;assert.equal(out.scope.activityProxy?.readable,15);assert.equal(out.scope.activityProxy?.lowNonce,13);assert.equal(out.scope.activityProxy?.outsideLimit,8);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,13/15);r.holders.reverse();r.walletActivity!.wallets.reverse();assert.deepEqual(observedDecision(r)?.scope.activityProxy,out.scope.activityProxy);
});
test('top assessment keeps a bounded cohort while full input inventory retains more than one hundred accounts',()=>{
 const r=report();for(let i=100;i<220;i++){const address=a(i),id=`holding:evm:${address}`;r.holders.push({address,share:.1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:.1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'1',decimals:0,timestamp:at,source:'EVM RPC holder balances',description:'Pinned balance'});r.walletActivity!.wallets.push({address,count:5,exact:true,fresh:null,basis:'evm-account-nonce',reason:'Account nonce only'});}
 reconcileFixture(r);const out=observedDecision(r)!;assert(out);assert.equal(out.scope.holderCount,48);assert.equal(out.scope.activityProxy?.readable,15);assert.equal(out.scope.activityProxy?.lowNonce,13);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,13/15);assert.equal(out.scope.activityProxy?.outsideLimit,33);assert.equal(r.holders.length,125);
});
for(const history of ['Robinhood Pons Transfer candidate history','Alchemy Robinhood token-transfer index'])test(`canonical Pons receipt identity retains arithmetic and provenance gates: ${history}`,()=>{
 // Relevant public fields from zkblast-observed-live.json; token and wallet
 // addresses remain the synthetic fixture so no production identity is seeded.
 const eventAt='2026-10-28T19:10:48Z',transaction='0x3de4087ec2a03e185b1b01a6a1a80732178bbccde02342b240df8ac2591f0614';
 const r=report(),identity=r.identities![0],proof=r.investigation.evidence.find(e=>e.id===`identity:creator:${creator}`)!;Object.assign(identity,{source:history,timestamp:eventAt,timestampBasis:'provider-event',transaction});Object.assign(proof,{source:history,timestamp:eventAt,transaction});r.sources.push({name:history,status:'available',fetchedAt:at,detail:'Canonical mint receipt + official TokenLaunched event bind token and launcher; anchor checked'});
 const out=observedDecision(r);assert(out);assert.equal(out.score,observedDecision(report())!.score);assert.equal(out.score,Math.round(out.factors.reduce((sum,f)=>sum+factorPoints(f.id,f.value)!,0)));assert.equal(identity.timestamp,eventAt);assert.equal(proof.timestamp,eventAt);
 const changed=structuredClone(r);changed.market!.liquidity!.usd=2000;const dynamic=observedDecision(changed)!;assert(dynamic.impact<out.impact);assert(dynamic.score>out.score,'a canonical history source must not supply a fixed point score');
 for(const mode of ['mismatch','malformed','source-failed','source-mismatch','missing-source','stale-retrieval','future-event','timestamp-mismatch','wrong-timestamp-basis','provider-import','missing-identity-receipt','missing-proof-receipt','missing-authority','wrong-proof-kind','index-marker-only']){
  const bad=structuredClone(r),i=bad.identities![0],e=bad.investigation.evidence.find(e=>e.id===proof.id)!;
  if(mode==='mismatch')e.transaction='0x'+'b'.repeat(64);
  if(mode==='malformed'){i.transaction='not-a-hash';e.transaction=i.transaction;}
  if(mode==='source-failed')bad.sources.find(s=>s.name===history)!.status='unavailable';
  if(mode==='source-mismatch')e.source='Unqualified mint index';
  if(mode==='missing-source')bad.sources=bad.sources.filter(s=>s.name!==history);
  if(mode==='stale-retrieval')bad.sources.find(s=>s.name===history)!.fetchedAt='2026-11-01T00:00:00Z';
  if(mode==='future-event'){i.timestamp='2026-11-05T00:00:00Z';e.timestamp=i.timestamp;}
  if(mode==='timestamp-mismatch')e.timestamp='2026-10-28T19:10:49Z';
  if(mode==='wrong-timestamp-basis')i.timestampBasis='local-observation';
  if(mode==='provider-import')e.attribution='provider-reported';
  if(mode==='missing-identity-receipt')delete i.transaction;
  if(mode==='missing-proof-receipt')delete e.transaction;
  if(mode==='missing-authority')bad.investigation.evidence=bad.investigation.evidence.filter(e=>e.id!==proof.id);
  if(mode==='wrong-proof-kind')e.kind='label';
  if(mode==='index-marker-only'){bad.holderEnumeration!.indexProvenance={kind:'alchemy-token-index',pages:2,exhausted:true,indexedEvents:10,canonicalReceiptCount:1};delete i.transaction;delete e.transaction;}
  assert.equal(observedDecision(bad),null,mode);
 }
 const hard=structuredClone(r);hard.checks[0].status='critical';const h=observedDecision(hard)!;assert.equal(h.scoreBand,'AVOID');assert.equal(h.judge.decision,'AVOID');
 const soft=structuredClone(r);soft.checks.find(c=>c.key==='is_mintable')!.status='warning';const s=observedDecision(soft)!;assert(s.score<=59);assert.notEqual(s.scoreBand,'OK');
});
test('delegated EOA account nonces participate only in the stated proxy, never as exact outgoing counts or lifetime-fresh flags',()=>{
 const r=report();Object.assign(r.walletActivity!.wallets[1],{basis:'evm-account-nonce',count:1,fresh:null,reason:'EIP-7702 authorization increments are included in the account nonce.'});const strict=trustRating(r),out=observedDecision(r,strict);assert(out);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,2/3);assert.equal(out.scope.activityProxy?.kind,'low-account-nonce');assert.equal(out.scope.activityProxy?.lowNonce,2);assert.match(out.factors.find(f=>f.id==='fresh')!.detail,/authorization increments/);assert.equal(r.walletActivity!.wallets[1].fresh,null);assert.equal(strict.score,null);assert.equal(strict.hard?.length,0);
});

test('unread activity among the first fifteen never backfills from a later readable holder',()=>{const r=report();for(let i=20;i<40;i++){const address=a(i),id='holding:evm:'+address;r.holders.push({address,share:1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'10',decimals:0,timestamp:at,source:'EVM RPC holder balances',description:''});r.walletActivity!.wallets.push({address,count:5,exact:true,fresh:null,basis:'evm-account-nonce',reason:''});}reconcileFixture(r);r.walletActivity!.wallets[1].count=null;r.walletActivity!.wallets[1].exact=false;const out=observedDecision(r)!;assert.equal(out.scope.activityProxy!.readable,14);assert.equal(out.scope.activityProxy!.lowNonce,13);assert.equal(out.scope.activityProxy!.outsideLimit,8);assert.equal(out.factors.find(f=>f.id==='fresh')!.value,13/14);});

test('a connected group below raw rank fifty still caps the top-holder model through the full strict analysis',()=>{const r=report();for(let i=100;i<220;i++){const address=a(i),id='holding:evm:'+address;r.holders.push({address,share:.1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:.1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'1',decimals:0,timestamp:at,source:'EVM RPC holder balances',description:''});r.walletActivity!.wallets.push({address,count:20,exact:true,fresh:null,basis:'evm-account-nonce',reason:''});}for(const [from,to] of [[a(217),a(218)],[a(218),a(219)]]){const id='outside-group:'+from;r.investigation.evidence.push({id,kind:'transfer',from,to,token,amount:1,transaction:hash,source:'Canonical transaction receipt',timestamp:at,description:''});r.investigation.relationships.push({id,kind:'transfer',from,to,evidenceIds:[id],description:''});}reconcileFixture(r);const before=JSON.stringify(r),strict=trustRating(r);assert(strict.soft!.some(s=>s.includes('three current holders')));const out=observedDecision(r,strict);assert(out);assert.equal(out.scope.holderCount,48);assert(out.score<=59);assert.equal(out.scoreBand,'CAUTION');assert.equal(r.holders.length,125);assert.equal(JSON.stringify(r),before);});

test('a verified sniper outside raw rank fifty affects strict exposure but not the selected Robinhood point',()=>{const r=report();for(let i=100;i<160;i++){const address=a(i),id='holding:evm:'+address;r.holders.push({address,share:.1,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share:.1,categories:['unclassified'],evidenceIds:[id]});r.investigation.evidence.push({id,kind:'holding',to:address,token,amountRaw:'1',decimals:0,timestamp:at,source:'EVM RPC holder balances',description:''});r.walletActivity!.wallets.push({address,count:20,exact:true,fresh:null,basis:'evm-account-nonce',reason:''});}reconcileFixture(r);r.investigation.coverage.launchVerified=true;r.investigation.coverage.earliestTradeAt='2026-11-04T00:59:30Z';const outside=a(159),id='verified-outside-buy';r.investigation.wallets.find(w=>w.address===outside)!.categories.push('sniper');r.investigation.evidence.push({id,kind:'trade',transaction:hash,token,amount:1,timestamp:at,source:'GeckoTerminal public pool trades (transaction sender)',description:''});r.investigation.timeline.push({id,kind:'buy',wallet:outside,timestamp:at,evidenceId:id});assert(buildScoringInputs(r).find(f=>f.id==='snipers')!.lower>0);const out=observedDecision(r)!;assert(out);assert.equal(out.factors.find(f=>f.id==='snipers')!.value,0);assert.equal(r.holders.length,65);});
