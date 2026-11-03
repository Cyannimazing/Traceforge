import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport,WalletCategory} from '../src/lib/investigation-types';
import type {WalletActivitySnapshot} from '../src/lib/wallet-activity';
import {buildScoringInputs} from '../src/lib/scoring-inputs';
const at='2026-11-03T06:00:00Z',launch='2026-11-01T06:00:00Z';
function report():InvestigationReport&{walletActivity?:WalletActivitySnapshot}{return {chain:'solana',token:'mint',name:'',symbol:'',fetchedAt:at,market:null,holderCount:null,totalSupply:100,checks:[],sources:[{name:'Solana RPC Holders',status:'available',fetchedAt:at,detail:''}],holders:[],investigation:{wallets:[],evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'clear',title:'',summary:''},coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,source:'RPC',fetchedAt:at,reasons:[]}}};}
function holder(r:ReturnType<typeof report>,address:string,share:number,categories:WalletCategory[]=[]){r.holders.push({address,share,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share,balance:share,categories,evidenceIds:[]});}
function transfer(r:ReturnType<typeof report>,id:string,from:string,to:string,token='SOL',timestamp=at){r.investigation.evidence.push({id,kind:'transfer',transaction:id,from,to,token,amount:1,timestamp,source:'RPC',description:'Observed transfer'});r.investigation.relationships.push({id,from,to,kind:token==='SOL'?'funding':'transfer',evidenceIds:[id],description:''});}
function factor(r:ReturnType<typeof report>,id:string){return buildScoringInputs(r).find(f=>f.id===id)!;}

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
 const f=factor(r,'concentration');assert.ok(Math.abs(f.value!-55/60)<1e-12);assert.equal(f.lower,f.upper);
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
