import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport,WalletCategory} from '../src/lib/investigation-types';
import type {WalletActivitySnapshot} from '../src/lib/wallet-activity';
import {buildScoringInputs} from '../src/lib/scoring-inputs';
import {trustRating} from '../src/lib/trust-rating';
import {mergeReportRefresh} from '../src/lib/report-refresh';
import type {EvmPoolReserveSnapshot} from '../src/lib/evm-pool-reserves';
const at='2026-11-03T06:00:00Z',launch='2026-11-01T06:00:00Z';
function report():InvestigationReport&{walletActivity?:WalletActivitySnapshot}{return {chain:'solana',token:'mint',name:'',symbol:'',fetchedAt:at,market:null,holderCount:null,totalSupply:100,checks:[],sources:[{name:'Solana RPC Holders',status:'available',fetchedAt:at,detail:''}],holders:[],investigation:{wallets:[],evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'clear',title:'',summary:''},coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,source:'RPC',fetchedAt:at,reasons:[]}}};}
function holder(r:ReturnType<typeof report>,address:string,share:number,categories:WalletCategory[]=[]){r.holders.push({address,share,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share,balance:share,categories,evidenceIds:[]});}
function transfer(r:ReturnType<typeof report>,id:string,from:string,to:string,token='SOL',timestamp=at){r.investigation.evidence.push({id,kind:'transfer',transaction:id,from,to,token,amount:1,timestamp,source:'RPC',description:'Observed transfer'});r.investigation.relationships.push({id,from,to,kind:token==='SOL'?'funding':'transfer',evidenceIds:[id],description:''});}
function factor(r:ReturnType<typeof report>,id:string){return buildScoringInputs(r).find(f=>f.id===id)!;}

test('RPC holder snapshot provenance supports concentration inputs on Base and Ethereum',()=>{
 for(const chain of ['base','ethereum'] as const){const r=report();r.chain=chain;r.token='0x'+'1'.repeat(40);r.sources=[{name:'EVM RPC holder balances',status:'available',fetchedAt:at,detail:'Pinned same-block balances'}];holder(r,'a',40);holder(r,'b',60);assert.equal(factor(r,'concentration').value,1);r.sources[0].status='unavailable';assert.equal(factor(r,'concentration').value,null);}
});

function evmScenario(){
 const r=report(),token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),owner='0x'+'3'.repeat(40),quote='0x'+'4'.repeat(40),factory='0xca143ce32fe78f1f7019d7d551a6402fc5350c73';
 r.chain='bsc';r.token=token;r.totalSupply=1000;r.sources=[{name:'BSC RPC finalized holder balances',status:'available',fetchedAt:at,detail:''},{name:'DEX Screener',status:'available',fetchedAt:at,detail:''},{name:'EVM RPC finalized V2 reserves',status:'available',fetchedAt:at,detail:''}];
 r.market={chainId:'bsc',pairAddress:pool,baseToken:{address:token}};holder(r,owner,88);holder(r,pool,1,['pool']);
 const snapshot:EvmPoolReserveSnapshot={chain:'bsc',protocol:'pancakeswap-v2',token,pool,factory,base:{address:token,reserveRaw:'10',balanceRaw:'10',decimals:0},quote:{address:quote,reserveRaw:'100',balanceRaw:'100',decimals:0},totalSupplyRaw:'1000',holders:[{address:owner,status:'observed',balanceRaw:'880'}],holdersTruncated:false,blockNumber:10,blockHash:'0x'+'a'.repeat(64),blockTimestamp:at,blockRef:'bsc:10:0x'+'a'.repeat(64),observedAt:at,finality:'finalized',source:'EVM RPC finalized V2 reserves',evidenceId:'evm:pool:10',constantProductEligible:true,feeBps:null,limitations:[]};
 r.evmPoolReserves={status:'verified',snapshot,reasons:[]};r.investigation.evidence.push({id:snapshot.evidenceId,kind:'label',timestamp:at,source:snapshot.source,description:'Finalized reserves and exact holder balances'});return r;
}
test('verified EVM reserves and same-block holder balance trigger sell-impact AVOID despite unknown history',()=>{
 const r=evmScenario(),f=factor(r,'swarm');assert(f.lower>.99);assert.equal(f.lower,f.upper);assert.equal(trustRating(r).decision,'AVOID');assert.equal(trustRating(r).score,null);assert.match(f.detail,/scenario|hypothetical/i);
});
test('EVM impact rejects stale, mismatched, conflicting and unsupported reserve evidence',()=>{
 for(const invalid of ['stale','pool','token','balance','source','reserve','factory','supply','chain','failed-holder','stale-block','future-block','reserve-supply']){
  const r=evmScenario(),s=r.evmPoolReserves!.snapshot!;
  if(invalid==='stale')s.observedAt='2026-11-02T00:00:00Z';
  if(invalid==='pool')s.pool='0x'+'5'.repeat(40);
  if(invalid==='token')s.base.address='0x'+'5'.repeat(40);
  if(invalid==='balance')s.holders[0].balanceRaw='700';
  if(invalid==='source')r.sources=r.sources.filter(source=>source.name!==s.source);
  if(invalid==='reserve')s.base.balanceRaw='20';
  if(invalid==='factory')s.factory='0x'+'5'.repeat(40);
  if(invalid==='supply')s.totalSupplyRaw='2000';
  if(invalid==='chain')s.chain='ethereum';
  if(invalid==='failed-holder')s.holders[0].status='unknown';
  if(invalid==='stale-block')s.blockTimestamp='2026-11-02T00:00:00Z';
  if(invalid==='future-block')s.blockTimestamp='2026-11-03T06:03:00Z';
  if(invalid==='reserve-supply'){s.base.balanceRaw='200';s.base.reserveRaw='200';}
  assert.equal(factor(r,'swarm').value,null,invalid);assert.notEqual(trustRating(r).decision,'AVOID',invalid);
 }
});

test('six factors have bounded unknowns instead of treating absent observations as clean zeros',()=>{const r=report(),values=buildScoringInputs(r);assert.deepEqual(values.map(v=>v.id),['swarm','fresh','insiders','concentration','snipers','dev']);for(const v of values){assert.equal(v.value,null);assert.equal(v.lower,0);assert.equal(v.upper,1);}});

test('fresh prevalence counts qualified current holders and preserves unknown short-page bounds',()=>{
 const r=report();holder(r,'a',40);holder(r,'b',60);r.walletActivity={source:'Solana RPC wallet activity',observedAt:at,truncated:false,wallets:[{address:'a',count:11,exact:false,fresh:false,basis:'solana-address-signatures',reason:''},{address:'b',count:2,exact:false,fresh:null,basis:'solana-address-signatures',reason:''},{address:'historical',count:1,exact:true,fresh:true,basis:'evm-outgoing-count',reason:''}]};
 const f=factor(r,'fresh');assert.equal(f.value,null);assert.equal(f.lower,0);assert.equal(f.upper,.5);
 r.walletActivity.wallets[1]={...r.walletActivity.wallets[1],count:12,fresh:false};assert.equal(factor(r,'fresh').value,0);
});

test('EVM low outgoing counts cannot establish lifetime freshness, even with an erroneous fresh flag',()=>{
 const r=report();r.chain='ethereum';r.sources[0].name='Blockscout Holders';holder(r,'a',40);holder(r,'b',60);r.walletActivity={source:'EVM RPC wallet activity',observedAt:at,blockRef:'block:hash',truncated:false,wallets:[{address:'a',count:3,exact:true,fresh:true,basis:'evm-outgoing-count',reason:''},{address:'b',count:30,exact:true,fresh:false,basis:'evm-outgoing-count',reason:''}]};assert.equal(factor(r,'fresh').value,null);assert.equal(factor(r,'fresh').lower,0);assert.equal(factor(r,'fresh').upper,.5);assert.match(factor(r,'fresh').detail,/outgoing/i);
 r.walletActivity.wallets[0]={...r.walletActivity.wallets[0],count:11,fresh:false};assert.equal(factor(r,'fresh').value,0);
 r.walletActivity.observedAt='2026-11-04T00:00:00Z';assert.equal(factor(r,'fresh').value,null);assert.equal(factor(r,'fresh').upper,1);
 r.walletActivity.observedAt='2026-11-02T00:00:00Z';assert.equal(factor(r,'fresh').value,null);assert.equal(factor(r,'fresh').upper,1);
});

test('a complete flag without a verified timestamp anchor cannot establish zero snipers',()=>{
 const r=report();holder(r,'a',100);r.investigation.coverage.status='complete';r.investigation.coverage.launchVerified=true;r.investigation.coverage.truncated=false;
 assert.equal(factor(r,'snipers').value,null);assert.equal(factor(r,'snipers').upper,1);
});

test('concentration unions documented current groups and uses the infrastructure-adjusted denominator',()=>{
 const r=report();for(let i=0;i<12;i++)holder(r,`w${i}`,5);holder(r,'pool',40,['pool']);r.investigation.wallets.at(-1)!.evidenceIds=['label:pool:pool'];r.investigation.evidence.push({id:'label:pool:pool',kind:'label',timestamp:at,source:'RPC',description:'Pool'});transfer(r,'group','w0','w1','mint');
 const f=factor(r,'concentration');assert.ok(Math.abs(f.value!-55/60)<1e-12);assert.equal(f.lower,f.upper);assert.match(f.detail,/91\.6667% of adjusted supply \(55\.0000% of total supply\)/);
});

test('partial sniper evidence is a lower bound and historical-only wallets never inflate current exposure',()=>{
 const r=report();holder(r,'a',20,['sniper']);holder(r,'b',30);r.investigation.coverage.launchVerified=true;r.investigation.coverage.earliestTradeAt=launch;
 r.investigation.wallets.push({address:'old',share:90,categories:['sniper'],evidenceIds:['old-buy']});
 for(const address of ['a','old']){const id=`buy:${address}`;r.investigation.evidence.push({id,kind:'trade',transaction:id,token:'mint',amount:1,timestamp:'2026-11-01T06:00:30Z',source:'RPC',description:'Buy'});r.investigation.timeline.push({id,timestamp:'2026-11-01T06:00:30Z',kind:'buy',wallet:address,evidenceId:id});r.investigation.wallets.find(w=>w.address===address)!.evidenceIds.push(id);}
 const f=factor(r,'snipers');assert.equal(f.value,null);assert.equal(f.lower,.2);assert.equal(f.upper,1);assert(!f.evidenceIds.includes('buy:old'));
 r.investigation.coverage.launchVerified=false;assert.equal(factor(r,'snipers').lower,0);
});

test('creator and funded-holder exposure is unioned with exact creator identity and matching receipts',()=>{
 const r=report();holder(r,'creator',10,['creator']);holder(r,'funded',20);holder(r,'other',70);r.investigation.wallets[0].evidenceIds=['identity:creator:creator'];r.investigation.evidence.push({id:'identity:creator:creator',kind:'authority',transaction:'creation',timestamp:launch,source:'RPC',description:'Creator'});transfer(r,'fund','creator','funded');transfer(r,'old','creator','historical');
 const d=factor(r,'dev');assert.equal(d.lower,.3);assert.equal(d.upper,1);assert.equal(d.value,null);assert.equal(factor(r,'insiders').lower,.2);
 r.investigation.evidence[0].attribution='provider-reported';assert.equal(factor(r,'dev').lower,0);
});

test('prelaunch scanned-token receipts overlap with creator-funded exposure without double counting',()=>{
 const r=report();holder(r,'a',30);holder(r,'b',70);r.investigation.coverage.launchVerified=true;r.investigation.coverage.earliestTradeAt=launch;transfer(r,'early','source','a','mint','2026-11-01T05:59:00Z');transfer(r,'native','source','b','SOL','2026-11-01T05:59:00Z');assert.equal(factor(r,'insiders').lower,.3);assert.match(factor(r,'insiders').detail,/not.*intent/i);
});

test('verified compatible pool uses largest documented group raw balances for an explicit zero-fee scenario',()=>{
 const r=report();holder(r,'a',10);holder(r,'b',10);holder(r,'c',5);holder(r,'pool',75,['pool']);r.investigation.wallets[3].evidenceIds=['label:pool:pool'];r.investigation.evidence.push({id:'label:pool:pool',kind:'label',timestamp:at,source:'RPC',description:'Pool'});transfer(r,'ab','a','b','mint');
 r.solana={authorities:{mint:{},freeze:{}},extensions:[],snapshot:{commitment:'finalized',selectedTokenAccounts:3,unresolvedTokenAccounts:0,fetchedAt:at},tokenAccounts:['a','b','c'].map((owner,i)=>({address:`account${i}`,owner,mint:'mint',amountRaw:i===2?'5000':'10000',decimals:3,slot:1,timestamp:at,state:'initialized',extensions:[]}))};
 r.poolReserves={status:'verified',reasons:[],snapshot:{protocol:'pumpswap',pool:'pool',program:'program',base:{mint:'mint',vault:'base',amountRaw:'100000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},quote:{mint:'quote',vault:'quote',amountRaw:'100000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},slot:1,observedAt:at,commitment:'finalized',source:'RPC reserve',blockRef:'slot1',evidenceId:'reserves',virtualQuoteReservesRaw:'0',effectiveQuoteAmountRaw:'100000',protocolFeesRaw:'0',creatorFeesRaw:'0',creatorFeeBpsRaw:'0',constantProductEligible:true,feeBps:null,feeAssumption:'Fees unverified',limitations:[]}};
 const f=factor(r,'swarm');assert.ok(Math.abs(f.value!-(1-100**2/120**2))<1e-9);assert.match(f.detail,/zero-fee/i);
 r.solana.tokenAccounts[0].amountRaw='1';assert.equal(factor(r,'swarm').value,null);r.solana.tokenAccounts[0].amountRaw='10000';
 r.poolReserves.snapshot!.quote.mintExtensions=['transferHook'];assert.equal(factor(r,'swarm').value,null);
});

test('refreshed current activity uses report snapshot time while history keeps its original coverage clock',()=>{
 const r=report();holder(r,'a',100);r.fetchedAt='2026-11-03T06:30:00Z';
 r.walletActivity={source:'Solana RPC wallet activity',observedAt:r.fetchedAt,truncated:false,wallets:[{address:'a',count:11,exact:false,fresh:false,basis:'solana-address-signatures',reason:''}]};
 assert.equal(factor(r,'fresh').value,0);
 r.walletActivity.observedAt='2026-11-03T06:40:00Z';assert.equal(factor(r,'fresh').value,null);
});
test('floating-point supply dust cannot mark a measurement exact with unequal bounds',()=>{
 const r=report();holder(r,'a',99.99999999999999);
 const f=factor(r,'concentration');assert.notEqual(f.value,null);assert.equal(f.value,f.lower);assert.equal(f.value,f.upper);
});

test('five-minute holder refresh retains its new reserve proof without moving the historical evidence clock',()=>{
 const old=evmScenario(),next=structuredClone(old),updated='2026-11-03T06:05:00Z';
 old.investigation.timeline=[{id:'old-buy',timestamp:launch,kind:'buy',wallet:old.holders[0].address,evidenceId:'old-buy'}];
 next.fetchedAt=updated;next.investigation.coverage.fetchedAt=updated;next.sources.forEach(source=>{source.fetchedAt=updated;});
 const pool=next.evmPoolReserves!.snapshot!;pool.observedAt=updated;pool.blockTimestamp=updated;pool.blockNumber=11;pool.blockHash='0x'+'b'.repeat(64);pool.blockRef=`bsc:11:${pool.blockHash}`;pool.evidenceId='evm:pool:11';
 next.investigation.evidence=[{id:pool.evidenceId,kind:'label',timestamp:updated,source:pool.source,description:'Refreshed finalized reserves'}];
 const merged=mergeReportRefresh(old,next,'holders');
 assert.equal(merged.investigation.coverage.fetchedAt,at);assert.equal(merged.fetchedAt,updated);
 assert.equal(merged.evmPoolReserves!.snapshot!.blockNumber,11);
 assert(factor(merged,'swarm').lower>.99);assert.equal(trustRating(merged).decision,'AVOID');
 // Current snapshots may advance independently, but a transfer beyond the
 // historical capture must not become a newly established creator connection.
 const creator='0x'+'9'.repeat(40),identity=`identity:creator:${creator}`;
 merged.investigation.wallets.push({address:creator,share:null,categories:['creator'],evidenceIds:[identity]});
 merged.investigation.evidence.push({id:identity,kind:'authority',transaction:'creation',timestamp:launch,source:'RPC',description:'Creator'});
 transfer(merged,'future-funding',creator,merged.holders[0].address,'BNB',updated);
 merged.investigation.relationships.at(-1)!.kind='funding';
 assert.equal(factor(merged,'insiders').lower,0);
 merged.investigation.evidence.find(e=>e.id==='future-funding')!.timestamp=at;
 assert(factor(merged,'insiders').lower>.88,'the same receipt becomes usable within the historical capture');
 pool.observedAt='2026-11-03T06:08:00Z';merged.evmPoolReserves!.snapshot!.observedAt=pool.observedAt;
 assert.equal(factor(merged,'swarm').value,null,'future reserve snapshots remain rejected');
});
