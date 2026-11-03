import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {computeRiskMetrics,type ConstantProductScenario} from '../src/lib/risk-metrics';
const at='2026-11-02T00:00:00Z';
function report(){const r=structuredClone(fixtureReport);r.providerAnalysis=undefined;r.chain='ethereum';r.totalSupply=100;r.fetchedAt=at;r.investigation.coverage.fetchedAt=at;delete r.investigation.coverage.clock;r.investigation.wallets=[];r.investigation.relationships=[];r.investigation.evidence=[];r.sources=[{name:'Blockscout Holders',status:'available',fetchedAt:at,detail:'snapshot'}];r.holders=[];return r;}
function holder(r:ReturnType<typeof report>,address:string,share:number,categories:string[]=[]){r.holders.push({address,share,contract:false,locked:null,tag:''});r.investigation.wallets.push({address,share,categories:categories as never[],evidenceIds:[],balance:share});}
function label(r:ReturnType<typeof report>,address:string,category:string){const id=`label:${address}:${category}`;r.investigation.evidence.push({id,kind:'label',timestamp:at,source:'RPC verification',description:category});r.investigation.wallets.find(w=>w.address===address)!.evidenceIds.push(id);}
function metric(r:ReturnType<typeof report>,id:string,options={}){return computeRiskMetrics(r,options).metrics.find(m=>m.id===id)!;}
test('uses supply and explicitly adjusted float denominators, never excludes generic contracts',()=>{const r=report();holder(r,'pool',40,['pool']);label(r,'pool','pool');holder(r,'a',15,['contract']);holder(r,'b',5);assert.equal(metric(r,'largest-holder-supply').value,15);assert.equal(metric(r,'largest-holder-adjusted-float').value,25);assert.equal(metric(r,'top10-holder-supply').value,20);assert.match(metric(r,'largest-holder-adjusted-float').basis,/observed infrastructure/);assert.deepEqual(metric(r,'largest-holder-supply').range,{lower:15,upper:55});});
test('creator missing from holder sample is unknown, never zero; observed identity needs source evidence',()=>{const r=report();holder(r,'a',5);r.investigation.wallets.push({address:'creator',share:null,categories:['creator'],evidenceIds:[]});assert.equal(metric(r,'creator-supply').value,null);holder(r,'creator2',3,['creator']);r.investigation.evidence.push({id:'identity:creator:creator2',kind:'authority',timestamp:at,source:'RPC',transaction:'tx',description:'Creator'});r.investigation.wallets.at(-1)!.evidenceIds.push('identity:creator:creator2');assert.equal(metric(r,'creator-supply').value,3);});
test('rejects conflicting holder duplicates and impossible supply sums',()=>{const r=report();holder(r,'a',55);holder(r,'b',50);assert.equal(metric(r,'largest-holder-supply').status,'unknown');const s=report();holder(s,'a',10);holder(s,'a',12);assert.equal(metric(s,'largest-holder-supply').status,'unknown');});
test('documented links require concrete matching independent transfer records, not timing or provider labels',()=>{const r=report();holder(r,'a',12);holder(r,'b',8);r.investigation.relationships=[{id:'link',from:'a',to:'b',kind:'transfer',evidenceIds:['move'],description:'transfer'}];assert.equal(metric(r,'linked-holder-supply').value,null);r.investigation.evidence.push({id:'move',kind:'transfer',from:'a',to:'b',transaction:'tx',source:'RPC',timestamp:at,amount:1,token:'native',description:'Observed'});assert.equal(metric(r,'linked-holder-supply').value,20);r.investigation.evidence[0].attribution='provider-reported';assert.equal(metric(r,'linked-holder-supply').value,null);});
test('USD liquidity never supplies reserves; actual constant product scenario has reproducible terminal impact',()=>{const r=report();r.market={chainId:'ethereum',baseToken:{address:r.token},liquidity:{usd:100000000}};assert.equal(metric(r,'sell-impact').value,null);const poolScenario:ConstantProductScenario={kind:'constant-product',pool:'pool',token:r.token,tokenReserveRaw:'1000',quoteReserveRaw:'1000',sellAmountRaw:'100',feeBps:0,source:'RPC getReserves',timestamp:at,blockRef:'123:hash',evidenceIds:['reserves-proof'],sellEvidenceIds:['holding-proof']};const m=metric(r,'sell-impact',{poolScenario});assert.equal(m.status,'modeled');assert.ok(Math.abs(m.value!-17.3553719)<0.00001);assert.match(m.limitations.join(' '),/not a forecast/);assert.equal(metric(r,'sell-impact',{poolScenario:{...poolScenario,kind:'concentrated-liquidity'}}).value,null);});
test('provider report never supplies independent metrics or an invented composite rating',()=>{const r=report();holder(r,'a',10);r.providerAnalysis={} as never;const result=computeRiskMetrics(r);assert.ok(result.metrics.every(m=>m.value===null));assert.ok(!('score' in result));});
test('shared funder needs two matching receipts and excludes a labeled exchange even outside holder sample',()=>{
 const r=report();holder(r,'a',10);holder(r,'b',5);r.investigation.relationships=[{id:'shared',from:'a',to:'b',kind:'shared-funder',description:'Shared receipts',evidenceIds:['one','two']},{id:'fa',from:'funder',to:'a',kind:'funding',evidenceIds:['one'],description:'Native funding'},{id:'fb',from:'funder',to:'b',kind:'funding',evidenceIds:['two'],description:'Native funding'}];
 r.investigation.evidence.push({id:'one',kind:'transfer',from:'funder',to:'a',transaction:'tx1',timestamp:at,source:'RPC',amount:1,token:'native',description:'Receipt'});assert.equal(metric(r,'linked-holder-supply').value,null);
 r.investigation.evidence.push({id:'two',kind:'transfer',from:'funder',to:'b',transaction:'tx2',timestamp:at,source:'RPC',amount:2,token:'native',description:'Receipt'});assert.equal(metric(r,'linked-holder-supply').value,15);
 r.investigation.wallets.push({address:'funder',share:null,categories:['exchange'],evidenceIds:[]});label(r,'funder','exchange');assert.equal(metric(r,'linked-holder-supply').value,null);
});

test('unrelated and imported labels cannot alter supply exclusions',()=>{
 const r=report();holder(r,'pool',40,['pool']);label(r,'pool','creator');holder(r,'a',10);
 assert.equal(metric(r,'largest-holder-supply').value,40);assert.equal(metric(r,'largest-holder-adjusted-float').value,40);
 r.investigation.evidence[0].id='label:pool:pool';r.investigation.wallets[0].evidenceIds=['label:pool:pool'];r.investigation.evidence[0].attribution='provider-reported';assert.equal(metric(r,'largest-holder-supply').value,40);
});

test('attributed market pair and snapshot-only holders agree with holder table partition',()=>{
 const r=report(),pool='0x'+'1'.repeat(40);holder(r,pool,40);holder(r,'a',10);r.market={chainId:'ethereum',pairAddress:pool,baseToken:{address:r.token}};r.sources.push({name:'DEX Screener',status:'available',fetchedAt:at,detail:'Selected pool'});
 r.investigation.wallets=[];assert.equal(metric(r,'largest-holder-supply').value,10);assert.ok(Math.abs(metric(r,'largest-holder-adjusted-float').value!-100/6)<1e-9);
});

test('missing source provenance and future holder source timestamps cannot produce measured holdings',()=>{
 const r=report();holder(r,'a',10);r.sources=[];assert.equal(metric(r,'largest-holder-supply').value,null);
 r.sources=[{name:'Blockscout Holders',status:'available',fetchedAt:'2026-11-03T00:00:00Z',detail:''}];assert.equal(metric(r,'largest-holder-supply').value,null);
 r.sources[0].fetchedAt=at;r.investigation.evidence.push({id:'identity:creator:a',kind:'authority',timestamp:'2026-11-03T00:00:00Z',source:'RPC',transaction:'tx',description:'Creator'});r.investigation.wallets[0].categories=['creator'];r.investigation.wallets[0].evidenceIds=['identity:creator:a'];assert.equal(metric(r,'creator-supply').value,null);
});

test('invalid snapshot rows cannot quietly disappear and lower the concentration measurement',()=>{
 const r=report();holder(r,'a',10);r.holders.push({address:'bad',share:NaN,contract:false,locked:null,tag:''});assert.equal(metric(r,'largest-holder-supply').value,null);
 const s=report();holder(s,'0xABC',10);s.holders.push({address:'0xabc',share:40,contract:false,locked:null,tag:''});s.investigation.wallets=[];assert.equal(metric(s,'largest-holder-supply').value,null);
});

test('authority evidence does not prove a creator role and current-holder transfer links reject unknown amount',()=>{
 const r=report();holder(r,'a',10,['creator']);holder(r,'b',5);r.investigation.evidence.push({id:'identity:authority:a:mint',kind:'authority',transaction:'tx',timestamp:at,source:'RPC',description:'Mint authority'});r.investigation.wallets[0].evidenceIds=['identity:authority:a:mint'];assert.equal(metric(r,'creator-supply').value,null);
 r.investigation.evidence.push({id:'move',kind:'transfer',transaction:'move-tx',from:'a',to:'b',timestamp:at,source:'RPC',description:'Unknown amount'});r.investigation.relationships=[{id:'edge',kind:'transfer',from:'a',to:'b',evidenceIds:['move'],description:''}];assert.equal(metric(r,'linked-holder-supply').value,null);
});

test('future and sourceless pool scenarios never produce modeled impact',()=>{
 const r=report();const scenario:ConstantProductScenario={kind:'constant-product',pool:'pool',token:r.token,tokenReserveRaw:'1000',quoteReserveRaw:'1000',sellAmountRaw:'100',feeBps:0,source:' ',timestamp:at,blockRef:'block',evidenceIds:['reserve'],sellEvidenceIds:['sell']};
 assert.equal(metric(r,'sell-impact',{poolScenario:scenario}).value,null);scenario.source='RPC';scenario.timestamp='2026-11-03T00:00:00Z';assert.equal(metric(r,'sell-impact',{poolScenario:scenario}).value,null);
});
