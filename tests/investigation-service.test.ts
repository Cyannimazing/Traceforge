import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInvestigationService } from '../src/lib/investigation-service';
import type { Report } from '../src/lib/analysis';
import {holderScope} from '../src/lib/holder-scope';
import { parseScanRequest } from '../src/lib/scan-request';
import type { SolanaPublicResult } from '../src/lib/solana-public';
import type { PoolLaunchResult } from '../src/lib/pool-launch';
import type {EvidenceClock} from '../src/lib/evidence-clock';
import type {EvmPoolReserveSnapshot} from '../src/lib/evm-pool-reserves';
const report: Report = { chain:'ethereum',token:'0xabc',name:'Test',symbol:'TEST',fetchedAt:'2026-01-01T00:00:00Z',market:null,holders:[{address:'wallet',share:1,contract:false,locked:false,tag:''}],holderCount:1,checks:[],sources:[] };

test('API decision output calculates uncertainty allocation and recomputes a qualified critical override',async()=>{
 let critical=false;
 const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),publicScan:async()=>({...report,sources:[{name:'GoPlus Security',status:'available',detail:'Current checks',fetchedAt:report.fetchedAt}],checks:critical?[{key:'is_honeypot',title:'Sell restriction',status:'critical',value:'Yes',description:'Verified provider restriction',source:'GoPlus Security',fetchedAt:report.fetchedAt}]:[]}),makeClient:()=>({configured:false,request:async()=>null})});
 const initial=await service.scan('ethereum',report.token);assert.equal(initial.decisionOutput?.basis,'uncertainty-allocation');assert.equal(initial.decisionOutput?.p.ok,0);assert(initial.decisionOutput!.p.caution>.9);assert.equal(initial.trustRating?.score,null);
 critical=true;const blocked=await service.scan('ethereum',report.token,{fresh:true});assert.equal(blocked.decisionOutput?.basis,'rule');assert.equal(blocked.decisionOutput?.decision,'AVOID');assert.deepEqual(blocked.decisionOutput?.p,{avoid:1,caution:0,ok:0});
});

test('BSC empty indexed holders use finalized RPC balances and do not retain a contradictory zero count',async()=>{
 const address='0x'+'a'.repeat(40),token='0x'+'b'.repeat(40),at=report.fetchedAt;
 const publicReport={...report,chain:'bsc' as const,token,holders:[],holderCount:0};let seenHolders=0;
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>publicReport,makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>({holders:[{address,share:88,balance:88}],holderCount:null,totalSupply:100,trades:[],transfers:[],identities:[],labels:[],reasons:['Bounded candidates'],truncated:true,sources:[{name:'BSC RPC finalized holder balances',status:'available',detail:'Verified finalized balances',fetchedAt:at}],snapshot:{block:10,blockHash:'0x'+'c'.repeat(64),blockTimestamp:at,decimals:0,totalSupplyRaw:'100',balances:[{address,amountRaw:'88'}]}}),enrichSnapshot:async(r)=>{seenHolders=r.holders.length;return {};}});
 const result=await service.scan('bsc',token);
 assert.equal(result.holders.length,1);assert.equal(result.holderCount,null);assert.equal(seenHolders,1);
 const wallet=result.investigation.wallets.find(w=>w.address===address)!;assert.equal(wallet.share,88);
 assert(wallet.evidenceIds.some(id=>result.investigation.evidence.some(e=>e.id===id&&e.kind==='holding'&&e.amountRaw==='88'&&e.source==='BSC RPC finalized holder balances')));
 assert.equal(result.riskMetrics?.metrics.find(m=>m.id==='largest-holder-supply')?.value,88);
});

test('a final EVM reserve proof reaches scoring and stops a high-impact token despite partial launch history',async()=>{
 const token='0x'+'1'.repeat(40),pool='0x'+'2'.repeat(40),owner='0x'+'3'.repeat(40),quote='0x'+'4'.repeat(40),at=report.fetchedAt;
 const snapshot:EvmPoolReserveSnapshot={chain:'bsc',protocol:'pancakeswap-v2',token,pool,factory:'0xca143ce32fe78f1f7019d7d551a6402fc5350c73',base:{address:token,reserveRaw:'10',balanceRaw:'10',decimals:0},quote:{address:quote,reserveRaw:'100',balanceRaw:'100',decimals:0},totalSupplyRaw:'1000',holders:[{address:owner,status:'observed',balanceRaw:'880'}],holdersTruncated:false,blockNumber:10,blockHash:'0x'+'a'.repeat(64),blockTimestamp:at,blockRef:'bsc:10',observedAt:at,finality:'finalized',source:'EVM RPC finalized V2 reserves',evidenceId:'evm:pool:10',constantProductEligible:true,feeBps:null,limitations:[]};let checked:string[]=[];
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>({...report,chain:'bsc',token,totalSupply:1000,holders:[{address:owner,share:88,contract:false,locked:null,tag:''},{address:pool,share:1,contract:true,locked:null,tag:'pool'}],market:{chainId:'bsc',pairAddress:pool,baseToken:{address:token}},sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:''},{name:'DEX Screener',status:'available',fetchedAt:at,detail:''}]}),makeClient:()=>({configured:false,request:async()=>null}),evmPoolReserves:async(chain,p,t,options)=>{assert.deepEqual([chain,p,t],['bsc',pool,token]);checked=options.holders||[];return {status:'verified',snapshot,reasons:[]};}});
 const result=await service.scan('bsc',token);assert(checked.includes(owner));assert.equal(result.evmPoolReserves?.status,'verified');assert(result.investigation.evidence.some(e=>e.id===snapshot.evidenceId&&e.source===snapshot.source));assert.equal(result.trustRating?.decision,'AVOID');assert.equal(result.investigation.assessment.status,'critical');assert.equal(result.investigation.coverage.launchVerified,false);
});

test('snapshot enrichment reaches report without substituting contract security flags',async()=>{
 const activity={source:'EVM RPC wallet activity',observedAt:report.fetchedAt,wallets:[],truncated:false};
 const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),enrichSnapshot:async()=>({walletActivity:activity})});
 const events:import('../src/lib/investigation-types').ScanEvent[]=[];const result=await service.scan('ethereum',report.token,{onEvent:e=>events.push(e)});assert(events.some(e=>e.type==='stage'&&e.stage==='wallet-activity'&&e.status==='running'));assert(events.some(e=>e.type==='stage'&&e.stage==='wallet-activity'&&e.status==='unavailable'));assert.deepEqual(result.walletActivity,activity);assert.deepEqual(result.checks,report.checks);
});

test('public data starts while clock verification is still pending',async()=>{
 let publicStarted=false,release!:()=>void;
 const service=createInvestigationService({resolveClock:()=>new Promise(resolve=>{release=()=>resolve(undefined as unknown as EvidenceClock);}),publicScan:async()=>{publicStarted=true;return report;},makeClient:()=>({configured:false,request:async()=>null})});
 const pending=service.scan('ethereum','0xabc');
 const concurrent=publicStarted;release();await pending;assert.equal(concurrent,true);
});
test('deep report reuse expires at ten minutes and preserves capture time',async()=>{
 let now=Date.parse(report.fetchedAt),calls=0;
 const service=createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return report;},makeClient:()=>({configured:false,request:async()=>null})});
 const first=await service.scan('ethereum','0xabc');now+=599999;
 assert.equal((await service.scan('ethereum','0xabc')).fetchedAt,first.fetchedAt);assert.equal(calls,1);
 now++;await service.scan('ethereum','0xabc');assert.equal(calls,2);
});

test('cold empty BSC holder failure retries after thirty seconds despite available market and security',async()=>{
 let now=Date.parse(report.fetchedAt),calls=0;const token='0x'+'b'.repeat(40);
 const service=createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return {...report,chain:'bsc',token,holders:[],market:{chainId:'bsc',baseToken:{address:token}},sources:[{name:'DEX Screener',status:'available',detail:'Market response'},{name:'GoPlus Security',status:'available',detail:'No holders returned'}]};},makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>({holders:[],trades:[],transfers:[],identities:[],labels:[],reasons:['Timeout'],truncated:true,sources:[{name:'BSC RPC finalized holder balances',status:'unavailable',detail:'Timeout'}]})});
 await service.scan('bsc',token);now+=29_000;await service.scan('bsc',token);assert.equal(calls,1);
 now+=2_000;await service.scan('bsc',token);assert.equal(calls,2);
});

test('verified empty BSC holder snapshot keeps the ten-minute reuse window',async()=>{
 let now=Date.parse(report.fetchedAt),calls=0;const token='0x'+'c'.repeat(40);
 const service=createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return {...report,chain:'bsc',token,holders:[],sources:[{name:'GoPlus Security',status:'available',detail:'Contract response'}]};},makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>({holders:[],trades:[],transfers:[],identities:[],labels:[],reasons:[],truncated:false,sources:[{name:'BSC RPC finalized holder balances',status:'available',detail:'Verified empty snapshot',fetchedAt:new Date(now).toISOString()}],snapshot:{block:10,blockHash:'0x'+'a'.repeat(64),blockTimestamp:new Date(now).toISOString(),decimals:0,totalSupplyRaw:'0',balances:[]}})});
 await service.scan('bsc',token);now+=599_999;await service.scan('bsc',token);assert.equal(calls,1);
 now++;await service.scan('bsc',token);assert.equal(calls,2);
});

test('legacy persisted empty failure cannot restore a ten-minute cache window after restart',async()=>{
 let now=Date.parse(report.fetchedAt),calls=0;const saved:{entry:Parameters<import('../src/lib/report-cache').PersistentReportCache['set']>[3]|null}={entry:null},token='0x'+'d'.repeat(40);
 const dependencies={now:()=>now,publicScan:async():Promise<Report>=>{calls++;return {...report,chain:'bsc',token,holders:[],sources:[{name:'DEX Screener',status:'available',detail:'Market response'},{name:'BSC RPC finalized holder balances',status:'unavailable',detail:'Timeout'}]};},makeClient:()=>({configured:false,request:async()=>null}),persistentCache:{get:()=>saved.entry,set:(_chain:unknown,_token:unknown,_limit:unknown,value:NonNullable<typeof saved.entry>)=>{saved.entry=structuredClone(value);}}};
 await createInvestigationService(dependencies).scan('bsc',token);assert(saved.entry);saved.entry.expires=now+600_000;now+=31_000;
 await createInvestigationService(dependencies).scan('bsc',token);assert.equal(calls,2);
});

test('incomplete manager-only balances retry shortly without shortening complete custody or ordinary holder snapshots',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',token='0x'+'e'.repeat(40),gap='Recent Transfer logs were unavailable in 2 bounded ranges (10-20, 21-30). Those ranges are unknown, not empty or complete.';
 for(const [address,share,detail,retry] of [
  [manager,99.97912617858077,gap,true],
  [manager,99,'1 positive balances verified from 3 candidates; 2 reads unavailable, 0 candidates outside the 100-address bound.',true],
  [manager,99,'1 positive balances verified from 101 candidates; 0 reads unavailable, 1 candidates outside the 100-address bound.',true],
  [manager,99,'Post-history balance verification for 2 additional canonical-history addresses was unavailable or exceeded its bounded request/time budget.',true],
  [manager,100,gap,false],
  [manager,100-1e-10,gap,false],
  [manager,99,'1 positive balances verified from 3 candidates; 0 reads unavailable, 0 candidates outside the 100-address bound. Earlier inactive holders and failed ranges can be absent.',false],
  ['0x'+'1'.repeat(40),99,gap,false],
 ] as const){
  let now=Date.parse(report.fetchedAt),calls=0;
  const service=createInvestigationService({now:()=>now,publicScan:async()=>{calls++;return {...report,chain:'bsc',token,holders:[{address,share,contract:true,locked:null,tag:''}],sources:[{name:'BSC RPC finalized holder balances',status:'available',detail,fetchedAt:new Date(now).toISOString()}]};},makeClient:()=>({configured:false,request:async()=>null})});
  await service.scan('bsc',token);now+=31_000;await service.scan('bsc',token);assert.equal(calls,retry?2:1,`${address}: ${share}; ${detail}`);
 }
});

test('legacy persisted manager-only discovery failures obey the same short reuse limit',async()=>{
 let now=Date.parse(report.fetchedAt),calls=0;const token='0x'+'f'.repeat(40),saved:{entry:Parameters<import('../src/lib/report-cache').PersistentReportCache['set']>[3]|null}={entry:null};
 const deps={now:()=>now,publicScan:async():Promise<Report>=>{calls++;return {...report,chain:'bsc',token,holders:[{address:'0x5c952063c7fc8610ffdb798152d69f0b9550762b',share:99.97912617858077,contract:true,locked:null,tag:''}],sources:[{name:'BSC RPC finalized holder balances',status:'available',detail:'Recent Transfer logs were unavailable in 2 bounded ranges (10-20, 21-30).',fetchedAt:new Date(now).toISOString()}]};},makeClient:()=>({configured:false,request:async()=>null}),persistentCache:{get:()=>saved.entry,set:(_chain:unknown,_token:unknown,_limit:unknown,value:NonNullable<typeof saved.entry>)=>{saved.entry=structuredClone(value);}}};
 await createInvestigationService(deps).scan('bsc',token);assert(saved.entry);saved.entry.expires=now+600_000;now+=31_000;
 await createInvestigationService(deps).scan('bsc',token);assert.equal(calls,2);
});

test('corroborated comparison clock reaches pool and pure analysis without rewriting capture or event times',async()=>{
 const clock:EvidenceClock={basis:'provider-quorum',referenceAt:'2026-01-01T03:00:00Z',localCapturedAt:report.fetchedAt,offsetMs:10800000,sources:[{name:'A',date:'Thu, 01 Jan 2026 03:00:00 GMT',age:null,cache:null},{name:'B',date:'Thu, 01 Jan 2026 03:00:00 GMT',age:null,cache:null}],detail:'Provider comparison clock is separate from local capture.'};
 let poolClock:number|undefined;
 const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),resolveClock:async()=>clock,publicScan:async()=>({...report,market:{chainId:'ethereum',pairAddress:'0x'+'9'.repeat(40),baseToken:{address:report.token}}}),makeClient:()=>({configured:false,request:async()=>null}),poolLaunch:async(_c,_t,_p,options)=>{poolClock=options.validationTime;return {status:'unavailable',scope:'selected-pool',pool:'pool',token:report.token,trades:[],reasons:[],sources:[]};},publicHistory:async()=>({trades:[{id:'current',wallet:'trader',timestamp:'2026-01-01T02:59:00Z',side:'buy',amount:100,transaction:'current-tx',source:'Public feed'}],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false})});
 const result=await service.scan('ethereum',report.token);
 assert.equal(poolClock,Date.parse(clock.referenceAt));assert.equal(result.investigation.timeline[0].timestamp,'2026-01-01T02:59:00Z');
 assert.equal(result.investigation.coverage.fetchedAt,'2026-01-01T00:00:00.000Z');assert.equal(result.investigation.coverage.clock?.referenceAt,clock.referenceAt);
 assert.equal(result.investigation.wallets.find(w=>w.address==='trader')?.bought,100);
});

test('future public feed rows cannot reach the final report as activity or a launch anchor',async()=>{
  const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),publicHistory:async()=>({trades:[{id:'future',wallet:'trader',timestamp:'2026-01-01T03:00:00Z',side:'buy',amount:100,transaction:'future-tx',source:'GeckoTerminal'}],transfers:[],identities:[],labels:[],reasons:[],sources:[{name:'GeckoTerminal',status:'available',detail:'Response received',fetchedAt:report.fetchedAt}],truncated:false})});
  const result=await service.scan('ethereum',report.token);
  assert.equal(result.investigation.timeline.length,0);
  assert.equal(result.investigation.coverage.earliestTradeAt,undefined);
  assert.equal(result.investigation.wallets.find(w=>w.address==='trader'),undefined);
  assert.equal(result.investigation.wallets.find(w=>w.address==='wallet')?.share,1);
  assert.match(result.investigation.coverage.reasons.join(' '),/1 record\(s\) from GeckoTerminal withheld/);
  assert.notEqual(result.investigation.assessment.status,'clear');
});
test('explicit fresh scans bypass the deep cache and validate the request option',async()=>{
  let calls=0;
  const service=createInvestigationService({publicScan:async()=>{calls++;return report;},makeClient:()=>({configured:false,request:async()=>null})});
  await service.scan('ethereum','0xabc');await service.scan('ethereum','0xabc');assert.equal(calls,1);
  await service.scan('ethereum','0xabc',{fresh:true});assert.equal(calls,2);
  assert.equal(parseScanRequest(new URL('http://localhost/api/scan?token=0x0000000000000000000000000000000000000001&fresh=1')).options.fresh,true);
});

test('an older concurrent scan cannot overwrite a newer cached investigation',async()=>{
  let finishOld!:(value:Report)=>void,calls=0;
  const service=createInvestigationService({publicScan:async()=>++calls===1?new Promise<Report>(resolve=>{finishOld=resolve;}):({...report,name:'New scan'}),makeClient:()=>({configured:false,request:async()=>null})});
  const old=service.scan('ethereum','0xabc',{fresh:true});
  await service.scan('ethereum','0xabc',{fresh:true});finishOld({...report,name:'Old scan'});await old;
  assert.equal((await service.scan('ethereum','0xabc')).name,'New scan');
});
test('a complete provider outage never replaces the last successful deep report',async()=>{
  let available=true;
  const service=createInvestigationService({publicScan:async()=>({...report,sources:[{name:'GoPlus Security',status:available?'available':'unavailable',detail:available?'Current snapshot':'Unavailable'}]}),makeClient:()=>({configured:false,request:async()=>null})});
  await service.scan('ethereum','0xabc');available=false;
  await assert.rejects(()=>service.scan('ethereum','0xabc',{fresh:true}),/previous report/);
  assert.equal((await service.scan('ethereum','0xabc')).sources[0].status,'available');
});
test('a fresh deep scan preserves failed holder snapshots while replacing prior activity',async()=>{
  let fail=false;
  const service=createInvestigationService({publicScan:async()=>({...report,holders:fail?[]:report.holders,sources:[{name:'GoPlus Security',status:fail?'unavailable':'available',detail:'security snapshot'},{name:'DEX Screener',status:'available',detail:'market snapshot'}]}),makeClient:()=>({configured:false,request:async()=>null})});
  await service.scan('ethereum','0xabc');fail=true;
  const next=await service.scan('ethereum','0xabc',{fresh:true});
  assert.equal(next.holders[0].share,1);assert.equal(next.investigation.wallets[0].share,1);
  assert(next.investigation.coverage.reasons.some(r=>r.startsWith('Holder snapshot is stale:')));
});
test('Solana direct authorities and owner snapshots retain distinct roles and source attribution',async()=>{
  const solana:SolanaPublicResult={holders:[{address:'OwnerCase',share:10,balance:5}],holderCount:null,totalSupply:50,truncated:true,identities:['mint','freeze'].map(kind=>({address:'AuthorityCase',role:'authority',authorityKind:kind as 'mint'|'freeze',label:kind+' authority',slot:12,timestamp:report.fetchedAt,source:'Solana RPC'})),checks:[{key:'solana_mint_authority',title:'Mint authority',status:'warning',value:'AuthorityCase',description:'Can mint'}],sources:[{name:'Solana RPC Holders',status:'available',detail:'Top account sample',fetchedAt:report.fetchedAt},{name:'Solana RPC authorities',status:'available',detail:'Mint state',fetchedAt:report.fetchedAt}],reasons:['Sample only'],authorities:{mint:{address:'AuthorityCase',slot:12},freeze:{address:'AuthorityCase',slot:12}},tokenAccounts:[],extensions:[],snapshot:{commitment:'finalized',ownersSlot:12,selectedTokenAccounts:2,unresolvedTokenAccounts:0,fetchedAt:report.fetchedAt}};
  const service=createInvestigationService({publicScan:async()=>({...report,chain:'solana',holders:[]}),makeClient:()=>({configured:false,request:async()=>null}),solanaPublic:async()=>solana});
  solana.snapshot.supplySlot=12;
  solana.tokenAccounts=[{address:'AccountA',owner:'OwnerCase',mint:'MintCase',amountRaw:'2000000',decimals:6,slot:12,timestamp:report.fetchedAt,state:'initialized',extensions:[]},{address:'AccountB',owner:'OwnerCase',mint:'MintCase',amountRaw:'3000000',decimals:6,slot:12,timestamp:report.fetchedAt,state:'initialized',extensions:[]}];
  const result=await service.scan('solana','MintCase');
  assert.equal(result.investigation.wallets.find(w=>w.address==='OwnerCase')?.share,10);
  assert.equal(result.investigation.evidence.filter(e=>e.id.startsWith('identity:authority:AuthorityCase:')).length,2);
  assert.equal(result.investigation.evidence.find(e=>e.id==='security:solana_mint_authority')?.source,'Solana RPC authorities');
  assert.equal(result.holderCount,null);assert.equal(result.solana?.snapshot.ownersSlot,12);
  const holding=result.investigation.evidence.find(e=>e.id==='holding:solana:OwnerCase');
  assert.equal(holding?.kind,'holding');assert.equal(holding?.timestamp,report.fetchedAt);assert.equal(holding?.transaction,undefined);
  assert.equal(holding?.source,'Solana RPC Holders');assert.match(holding!.description,/finalized slot 12/);
  assert.match(holding!.description,/AccountA.*2000000.*6.*AccountB.*3000000/);
  assert.match(holding!.description,/50 token units.*same finalized bank/);
  assert(result.investigation.wallets.find(w=>w.address==='OwnerCase')?.evidenceIds.includes(holding!.id));
});
test('verified pool transactions replace incompatible feed rows without inflating buys or claiming global launch',async()=>{
  const at=report.fetchedAt,pool='0x'+'9'.repeat(40),window:PoolLaunchResult={status:'verified',scope:'selected-pool',pool,token:report.token,protocol:'v2',trades:[{id:'canonical-log',wallet:'buyer',timestamp:at,side:'buy',amount:5,transaction:'same-tx',source:'Pool receipt'}],proof:{verified:true,scope:'selected-pool',pool,chain:'ethereum',firstSwapAt:at,firstSwapTransaction:'same-tx',firstSwapLogIndex:1,windowEndAt:'2026-01-01T00:01:00Z',creation:{transaction:'creation',blockNumber:1,blockHash:'creation-block'},through:{blockNumber:10,blockHash:'through-block',timestamp:'2026-01-01T00:01:01Z'},factory:'factory',token0:report.token,token1:'other',eligibleTradeIds:['canonical-log'],verifiedAt:at},reasons:[],sources:[{name:'Selected pool first minute',status:'available',detail:'Verified first pool minute',fetchedAt:at}]};
  const service=createInvestigationService({publicScan:async()=>({...report,market:{chainId:'ethereum',pairAddress:pool,baseToken:{address:report.token}}}),makeClient:()=>({configured:false,request:async()=>null}),poolLaunch:async()=>window,publicHistory:async()=>({trades:[{id:'gecko-aggregate',wallet:'buyer',timestamp:at,side:'buy',amount:10,transaction:'same-tx',source:'GeckoTerminal'}],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false})});
  const result=await service.scan('ethereum',report.token);
  assert.equal(result.investigation.wallets.find(w=>w.address==='buyer')?.bought,5);
  assert(result.investigation.wallets.find(w=>w.address==='buyer')?.categories.includes('sniper'));
  assert.equal(result.investigation.coverage.launchVerified,false);assert.equal(result.investigation.coverage.poolTiming?.pool,pool);
  assert.equal(result.investigation.timeline.filter(t=>t.kind==='buy').length,1);
});
test('no credentials returns truthful public fallback', async () => {
  const service = createInvestigationService({publicScan:async()=>report, makeClient:()=>({configured:false,request:async()=>{throw Error('must not query');}})});
  const result = await service.scan('ethereum','0xabc');
  assert.equal(result.investigation.assessment.status,'caution');
  assert(result.investigation.coverage.reasons.some(r=>r.includes('not configured')));
  assert.equal(result.investigation.wallets[0].share,1);
});

test('no-key public history becomes real investigation evidence without launch claims',async()=>{
  const service=createInvestigationService({publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),publicHistory:async()=>({
    holders:[{address:'buyer',balance:5,share:25}],holderCount:12,totalSupply:20,
    trades:[{id:'public-buy',wallet:'buyer',timestamp:report.fetchedAt,side:'buy',amount:5,transaction:'buy-tx',source:'GeckoTerminal'}],
    transfers:[{id:'public-funding',from:'creator',to:'buyer',timestamp:report.fetchedAt,amount:1,token:'native',native:true,transaction:'fund-tx',source:'Blockscout'}],
    identities:[{address:'creator',role:'creator',source:'Blockscout',timestamp:report.fetchedAt,transaction:'create-tx'}],labels:[],reasons:['Bounded public evidence'],sources:[{name:'Blockscout Holders',status:'available',detail:'snapshot',fetchedAt:report.fetchedAt}],truncated:true,
  })});
  const result=await service.scan('ethereum','0xabc');
  assert.equal(result.investigation.wallets.find(w=>w.address==='buyer')?.bought,5);
  assert.equal(result.investigation.wallets.find(w=>w.address==='buyer')?.share,25);
  assert(result.investigation.relationships.some(r=>r.kind==='deployer-linked'));
  assert.equal(result.investigation.coverage.launchVerified,false);
  assert.equal(result.investigation.coverage.earliestTradeAt,report.fetchedAt);
  assert.equal(result.holderCount,12);
});
test('market and holder refresh never execute early/funding deep queries; deep results are cached', async () => {
  let queries:string[]=[];
  const service=createInvestigationService({publicScan:async()=>report,makeClient:()=>({configured:true,request:async(query:string)=>{queries.push(query);return {data:{EVM:{rows:[]},Metadata:{Labels:[]}}};}})});
  await service.scan('ethereum','0xabc',{mode:'market'}); assert.equal(queries.length,0);
  await service.scan('ethereum','0xabc',{mode:'holders'}); assert.equal(queries.length,1); assert(queries[0].includes('Holders'));
  await service.scan('ethereum','0xabc'); const count=queries.length;
  await service.scan('ethereum','0xabc'); assert.equal(queries.length,count);
});
test('a rejected holder provider preserves public holders and marks partial failure', async () => {
  const service=createInvestigationService({publicScan:async()=>report,makeClient:()=>({configured:true,request:async()=>{throw Error('Unavailable');}})});
  const result=await service.scan('ethereum','0xabc');
  assert.equal(result.investigation.wallets[0].address,'wallet');
  assert.notEqual(result.investigation.coverage.status,'complete');
  assert(result.investigation.coverage.reasons.some(r=>r.includes('Holders')));
});
test('pre-canceled requests do no work', async () => {
  let calls=0;const controller=new AbortController();controller.abort();
  const service=createInvestigationService({publicScan:async()=>{calls++;return report;},makeClient:()=>({configured:false,request:async()=>null})});
  await assert.rejects(()=>service.scan('ethereum','0xabc',{signal:controller.signal}));assert.equal(calls,0);
});
test('security snapshots replace old flags, never duplicate evidence, and warnings produce caution',async()=>{
  let status:'critical'|'warning'|'clear'='critical';
  const service=createInvestigationService({publicScan:async()=>({...report,sources:[{name:'GoPlus Security',status:'available',detail:'Current checks',fetchedAt:report.fetchedAt}],checks:[{key:'mint',title:'Supply',description:'Supply control',value:'Yes',status,source:'GoPlus Security',fetchedAt:report.fetchedAt}]}),now:()=>Date.parse(report.fetchedAt),makeClient:()=>({configured:false,request:async()=>null})});
  const first=await service.scan('ethereum','0xabc');assert.equal(first.investigation.assessment.status,'critical');
  const repeat=await service.scan('ethereum','0xabc',{mode:'holders'});assert.equal(repeat.investigation.evidence.filter(e=>e.id==='security:mint').length,1);
  status='warning';const warn=await service.scan('ethereum','0xabc',{mode:'holders'});assert.equal(warn.investigation.assessment.status,'caution');
  status='clear';const clear=await service.scan('ethereum','0xabc',{mode:'holders'});assert.equal(clear.investigation.assessment.status,'caution');assert(!clear.investigation.findings.some(f=>f.id==='security:mint'));
});
test('matching indexed samples preserve the earliest observation without proving launch coverage',async()=>{
  const row={Block:{Time:'2026-01-01T00:00:00Z'},Transaction:{Hash:'hash',From:'buyer'},Log:{Index:0},Trade:{Amount:12,Side:{Type:'sell'}}};
  const service=createInvestigationService({publicScan:async()=>report,makeClient:()=>({configured:true,request:async(query:string)=>{
    if(query.includes('archive: EVM'))return {data:{archive:{rows:[row]},combined:{rows:[row]}}};
    if(query.includes('DEXTradeByTokens'))return {data:{EVM:{rows:[row]}}};
    if(query.includes('Metadata'))return {data:{Metadata:{Labels:[]}}};
    return {data:{EVM:{rows:[]}}};
  }})});
  const result=await service.scan('ethereum','0xabc');
  assert.equal(result.investigation.coverage.launchVerified,false);
  assert.equal(result.investigation.coverage.earliestTradeAt,'2026-01-01T00:00:00Z');
  assert(!result.investigation.wallets.some(w=>w.categories.includes('sniper')||w.categories.includes('early-buyer')));
  assert.equal(result.investigation.wallets.find(w=>w.address==='buyer')?.bought,12);
});

test('checksummed public holder addresses retain their recent trade evidence',async()=>{
  const service=createInvestigationService({publicScan:async()=>({...report,holders:[{...report.holders[0],address:'0xAbCd'}]}),makeClient:()=>({configured:true,request:async(query:string)=>{
    if(query.includes('Holders')||query.includes('archive: EVM'))throw Error('Unavailable');
    if(query.includes('descending: Block_Time'))return {data:{EVM:{rows:[{Block:{Time:'2026-01-01T00:05:00Z'},Transaction:{Hash:'sale',From:'0xabcd'},Log:{Index:0},Trade:{Amount:3,Side:{Type:'buy'}}}]}}};
    if(query.includes('Metadata'))return {data:{Metadata:{Labels:[]}}};
    return {data:{EVM:{rows:[]}}};
  }})});
  const result=await service.scan('ethereum','0xabc');
  assert.equal(result.investigation.wallets.find(w=>w.address==='0xabcd')?.sold,3);
});
test('server holder snapshots replace current authority labels and update the cached report',async()=>{
  let owner='old-owner';
  const service=createInvestigationService({publicScan:async()=>({...report,sources:[{name:'GoPlus Security',status:'available',detail:'snapshot'}],identities:[{address:owner,role:'authority',source:'GoPlus Security',timestamp:report.fetchedAt}]}),makeClient:()=>({configured:false,request:async()=>null})});
  await service.scan('ethereum','0xabc');owner='new-owner';
  const next=await service.scan('ethereum','0xabc',{mode:'holders'});
  assert(!next.investigation.wallets.find(w=>w.address==='old-owner')?.categories.includes('authority'));
  assert(next.investigation.wallets.find(w=>w.address==='new-owner')?.categories.includes('authority'));
  const cached=await service.scan('ethereum','0xabc');assert(cached.investigation.wallets.find(w=>w.address==='new-owner')?.categories.includes('authority'));
});

test('historical RPC evidence replaces overlapping feed trades, preserves units and owns the assessment',async()=>{
 const base={trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:true};
 const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),publicHistory:async()=>({...base,trades:[{id:'aggregate',wallet:'buyer',timestamp:report.fetchedAt,side:'buy',amount:99,transaction:'same',source:'Feed'}]}),historicalEvidence:async()=>({...base,trades:[{id:'decoded',wallet:'buyer',timestamp:report.fetchedAt,side:'buy',amount:5,amountRaw:'5000000',decimals:6,transaction:'same',source:'Alchemy'}],transfers:[{id:'fund',from:'funder',to:'buyer',amount:1,amountRaw:'1000000000000000000',decimals:18,native:true,token:'ETH',timestamp:report.fetchedAt,transaction:'fundtx',source:'Alchemy'}],sources:[{name:'Alchemy',status:'available',detail:'Receipt verified',fetchedAt:report.fetchedAt}]})});
 const result=await service.scan('ethereum',report.token);
 assert.equal(result.providerAnalysis,undefined);
 assert.equal(result.investigation.wallets.find(w=>w.address==='buyer')?.bought,5);
 assert.equal(result.investigation.timeline.filter(t=>t.kind==='buy').length,1);
 assert.equal(result.investigation.evidence.find(e=>e.transaction==='fundtx')?.amountRaw,'1000000000000000000');
 assert.equal(result.investigation.coverage.launchVerified,false);
 const cached=service.cachedReport('ethereum',report.token)!;cached.name='mutated';
 assert.equal(service.cachedReport('ethereum',report.token)?.name,report.name);
});

test('historical RPC outage retains public evidence and never imports a verdict',async()=>{
 const service=createInvestigationService({publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),historicalEvidence:async()=>{throw Error('unavailable');}});
 const result=await service.scan('ethereum',report.token);
 assert.equal(result.providerAnalysis,undefined);assert.equal(result.holders[0].address,'wallet');
 assert.notEqual(result.investigation.assessment.status,'clear');
});

 test('EVM activity enrichment uses explorer holder snapshot instead of preliminary GoPlus list',async()=>{
 let received:string[]=[];
 const service=createInvestigationService({now:()=>Date.parse(report.fetchedAt),publicScan:async()=>report,makeClient:()=>({configured:false,request:async()=>null}),publicHistory:async()=>({holders:[{address:'final-holder',share:5}],trades:[],transfers:[],identities:[],labels:[],reasons:[],truncated:false,sources:[]}),enrichSnapshot:async(snapshot)=>{received=snapshot.holders.map(h=>h.address);return {};}});
 await service.scan('ethereum',report.token);assert.deepEqual(received,['final-holder']);
 });

test('Solana holder snapshot starts before public market lookup completes',async()=>{
 let started=false,release!:(r:Report)=>void;
 const service=createInvestigationService({publicScan:()=>new Promise(resolve=>{release=resolve}),solanaPublic:async()=>{started=true;return undefined as unknown as SolanaPublicResult},makeClient:()=>({configured:false,request:async()=>null})});
 const pending=service.scan('solana','token');assert.equal(started,true);release({...report,chain:'solana'});await pending;
});


test('documented BSC launchpad-only holders trigger independent balances without probing synthetic pair IDs', async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',buyer='0x'+'7'.repeat(40),token='0x'+'8'.repeat(40),at=report.fetchedAt;let calls=0,probes=0;
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>({...report,chain:'bsc',token,identities:[{address:manager,role:'authority',source:'EVM RPC control probes',timestamp:at}],holders:[{address:manager,share:100,contract:true,locked:null,tag:''}],market:{chainId:'bsc',dexId:'fourmeme',pairAddress:token+':4meme',baseToken:{address:token}}}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>{calls++;return {holders:[{address:manager,share:99},{address:buyer,share:1}],trades:[],transfers:[],identities:[],labels:[{address:manager,category:'pool',label:'Four.Meme shared launchpad custody',source:'BSC RPC Four.Meme custody verification',timestamp:at}],sources:[{name:'BSC RPC finalized holder balances',status:'available',fetchedAt:at,detail:''},{name:'BSC RPC Four.Meme custody verification',status:'available',fetchedAt:at,detail:''}],reasons:['Bounded candidate history'],truncated:true,snapshot:{block:10,blockHash:'0x'+'c'.repeat(64),blockTimestamp:at,decimals:0,totalSupplyRaw:'100',balances:[{address:manager,amountRaw:'99'},{address:buyer,amountRaw:'1'}]}};},poolLaunch:async()=>{probes++;throw Error('synthetic pool');},evmPoolReserves:async()=>{probes++;throw Error('synthetic pool');}});
 const result=await service.scan('bsc',token);assert.equal(calls,1);assert.equal(probes,0);assert.equal(result.holders.length,2);assert.deepEqual(holderScope(result).holders.map(h=>h.address),[buyer]);assert(result.investigation.wallets.find(w=>w.address===manager)?.categories.includes('authority'));assert(!result.investigation.wallets.some(w=>w.address.includes(':4meme')));assert(result.investigation.wallets.find(w=>w.address===manager)?.categories.includes('pool'));assert.match(result.investigation.coverage.reasons.join(' '),/launchpad|on-chain pool/i);
});

test('ordinary contract holders do not trigger custody fallback or become infrastructure',async()=>{
 let calls=0;const address='0x'+'5'.repeat(40),token='0x'+'6'.repeat(40);const service=createInvestigationService({publicScan:async()=>({...report,chain:'bsc',token,holders:[{address,share:100,contract:true,locked:null,tag:''}]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>{calls++;throw Error('must not call');}});const r=await service.scan('bsc',token);assert.equal(calls,0);assert(!r.investigation.wallets.find(w=>w.address===address)?.categories.includes('pool'));
});

test('mixed manager and buyer snapshots qualify custody in deep and holder modes and retain verified first-minute roles',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',buyer='0x'+'7'.repeat(40),token='0x'+'8'.repeat(40),at=report.fetchedAt,first='2025-12-31T23:58:00Z';
 for(const mode of ['deep','holders','market'] as const){
  const history:boolean[]=[];
  const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>({...report,chain:'bsc',token,holders:[{address:manager.toUpperCase().replace('0X','0x'),share:99,contract:true,locked:null,tag:''},{address:buyer,share:1,contract:false,locked:null,tag:''}],sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:'Mixed snapshot'}]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async(_r,options)=>{
   history.push(options.history===true);return {holders:[{address:manager,share:99},{address:buyer,share:1}],trades:options.history?[{id:'canonical-first-buy',wallet:buyer,timestamp:first,side:'buy',amount:1,transaction:'canonical-tx',source:'BSC RPC Four.Meme curve receipts'}]:[],transfers:[],identities:[],labels:[{address:manager,category:'pool',label:'Verified shared custody',source:'BSC RPC Four.Meme custody verification',timestamp:at}],sources:[{name:'BSC RPC finalized holder balances',status:'available',fetchedAt:at,detail:'Finalized balances'},{name:'BSC RPC Four.Meme custody verification',status:'available',fetchedAt:at,detail:'Membership verified'}],reasons:[],truncated:true,snapshot:{block:20,blockHash:'block',blockTimestamp:at,decimals:0,totalSupplyRaw:'100',balances:[{address:manager,amountRaw:'99'},{address:buyer,amountRaw:'1'}]},...(options.history?{curveTiming:{verified:true,scope:'selected-launchpad',protocol:'four-meme-v2',chain:'bsc',token,manager,firstPurchaseAt:first,firstPurchaseTransaction:'canonical-tx',windowEndAt:'2025-12-31T23:59:00Z',creation:{transaction:'creation',blockNumber:10,blockHash:'creation-block'},through:{blockNumber:20,blockHash:'block',timestamp:'2025-12-31T23:59:01Z'},eligibleTradeIds:['canonical-first-buy'],verifiedAt:at,source:'BSC RPC Four.Meme curve receipts'}}:{})};
  }});
  const result=await service.scan('bsc',token,{mode});assert.deepEqual(history,mode==='market'?[]:[mode==='deep']);
  if(mode!=='market'){assert.deepEqual(holderScope(result).holders.map(h=>h.address),[buyer]);assert(result.investigation.wallets.find(w=>w.address===manager)?.categories.includes('pool'));}
  if(mode==='deep'){assert(result.investigation.coverage.curveTiming?.verified);assert(result.investigation.wallets.find(w=>w.address===buyer)?.categories.includes('sniper'));assert(result.investigation.wallets.find(w=>w.address===buyer)?.categories.includes('early-buyer'));}
  else assert(!result.investigation.wallets.some(w=>w.categories.includes('sniper')));
 }
});

test('failed mixed-holder custody verification keeps the manager visible and never fabricates buyer timing',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',buyer='0x'+'3'.repeat(40),token='0x'+'4'.repeat(40);let calls=0;
 const service=createInvestigationService({publicScan:async()=>({...report,chain:'bsc',token,holders:[{address:manager,share:99,contract:true,locked:null,tag:''},{address:buyer,share:1,contract:false,locked:null,tag:''}]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>{calls++;return {holders:[],trades:[],transfers:[],identities:[],labels:[],sources:[{name:'BSC RPC finalized holder balances',status:'unavailable',detail:'Membership verification failed'}],reasons:['Custody unverified'],truncated:true};}});
 const result=await service.scan('bsc',token);assert.equal(calls,1);assert.equal(holderScope(result).holders.length,2);assert.equal(holderScope(result).infrastructure.length,0);assert(!result.investigation.wallets.some(w=>w.categories.includes('pool')||w.categories.includes('sniper')));assert.equal(result.investigation.coverage.curveTiming,undefined);
});

test('failed custody-only RPC refresh preserves source balances and withholds infrastructure classification',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',token='0x'+'8'.repeat(40);const service=createInvestigationService({publicScan:async()=>({...report,chain:'bsc',token,holders:[{address:manager,share:100,contract:true,locked:null,tag:''}]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>({holders:[],trades:[],transfers:[],identities:[],labels:[],sources:[{name:'BSC RPC finalized holder balances',status:'unavailable',detail:'unavailable'}],reasons:['Independent BSC holder snapshot unavailable.'],truncated:true})});const r=await service.scan('bsc',token);assert.equal(r.holders[0].share,100);assert.equal(holderScope(r).infrastructure.length,0);assert(r.investigation.coverage.truncated);assert.match(r.investigation.coverage.reasons.join(' '),/snapshot unavailable/);
});


test('BSC refresh seeds prior holder addresses for new reads without carrying old balances',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',buyer='0x'+'7'.repeat(40),token='0x'+'8'.repeat(40),at=report.fetchedAt;let calls=0;const seen:string[][]=[];
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>({...report,chain:'bsc',token,holders:[{address:manager,share:99,contract:true,locked:null,tag:''}]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async(_report,options)=>{
  seen.push((options as {candidateAddresses?:string[]}).candidateAddresses||[]);calls++;const holders=calls===1?[{address:manager,share:99},{address:buyer,share:1}]:calls===2?[{address:manager,share:99.5},{address:buyer,share:.5}]:[{address:manager,share:100}];
  return {holders,trades:[],transfers:[],identities:[],labels:[],sources:[{name:'BSC RPC finalized holder balances',status:'available',fetchedAt:at,detail:'Fresh balances'}],reasons:[],truncated:true,snapshot:{block:10+calls,blockHash:'0x'+'c'.repeat(64),blockTimestamp:at,decimals:1,totalSupplyRaw:'1000',balances:holders.map(h=>({address:h.address,amountRaw:String(h.share*10)}))}};
 }});
 await service.scan('bsc',token);const next=await service.scan('bsc',token,{fresh:true});assert(seen[1].includes(buyer));assert.equal(next.holders.find(h=>h.address===buyer)?.share,.5);
 const sold=await service.scan('bsc',token,{fresh:true});assert(seen[2].includes(buyer));assert(!sold.holders.some(h=>h.address===buyer));
});
