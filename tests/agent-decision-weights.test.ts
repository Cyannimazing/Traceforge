import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {buildAgentPacket,validateAgentReview} from '../src/lib/crypto-agent';
function packet(){const r=structuredClone(fixtureReport);delete r.fixture;const p=buildAgentPacket(r);p.guard={critical:false,missingCore:false,warning:false,reasons:[]};return p;}
function answer(){return {decision:'OK',weights:{avoid:3,caution:196,ok:801},summary:'Current controls and holder evidence support OK within the checked scope.',supporting:[{text:'Current holder snapshot.',citations:['holders']}],risks:[],watch:[{text:'Launch history is not established.',citations:['scope']}]};}
test('packet compression and missing launch history alone cannot force a current-scope caution',()=>{
 const p=packet();p.scope.omittedEvidence=1000;p.scope.launchVerified=false;p.scope.status='partial';p.scope.sourceTruncated=true;
 const v=validateAgentReview(answer(),p);assert.equal(v.decision,'OK');assert.deepEqual(v.distribution,{avoid:.3,caution:19.6,ok:80.1});assert.equal(v.confidencePercent,80.1);
});
test('decision weights normalize deterministically and display totals equal 100',()=>{
 const p=packet();for(const weights of [{avoid:1,caution:1,ok:1},{avoid:1,caution:2,ok:8},{avoid:0,caution:0,ok:10}]){
 const v=validateAgentReview({...answer(),weights},p);assert.equal(Math.round(Object.values(v.distribution!).reduce((a,b)=>a+b,0)*10),1000);
 }assert.throws(()=>validateAgentReview({...answer(),decision:'OK',weights:{avoid:8,caution:1,ok:1}},p),/contradicts/);
});
test('invalid weights cannot manufacture a percentage',()=>{
 for(const weights of [{avoid:0,caution:0,ok:0},{avoid:-1,caution:1,ok:8},{avoid:0,caution:1,ok:Infinity},{avoid:0,caution:1,ok:'8'},{avoid:1,caution:2,ok:3,extra:4}])assert.throws(()=>validateAgentReview({...answer(),weights},packet()),/weight/);
});
test('critical and missing-core overrides withhold model weights instead of moving them to another verdict',()=>{
 for(const kind of ['critical','missingCore'] as const){const p=packet();p.guard[kind]=true;const v=validateAgentReview(answer(),p);assert.equal(v.decision,kind==='critical'?'AVOID':'INSUFFICIENT');assert.equal(v.distribution,null);assert.equal(v.confidencePercent,null);}
});

test('rounding cannot display another decision above the selected tied winner',()=>{const v=validateAgentReview({...answer(),weights:{avoid:1,caution:1,ok:1}},packet());assert(v.distribution!.ok>=v.distribution!.avoid);assert(v.distribution!.ok>=v.distribution!.caution);});
