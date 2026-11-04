import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {trustRating} from '../src/lib/trust-rating';
const at='2026-11-03T06:00:00Z';
function report():InvestigationReport{return {chain:'solana',token:'mint',name:'Test token',symbol:'TEST',fetchedAt:at,market:null,holderCount:null,checks:['solana_mint_authority','solana_freeze_authority','solana_extensions'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'',source:'Solana RPC authorities',fetchedAt:at})),sources:[{name:'Solana RPC authorities',status:'available',fetchedAt:at,detail:''},{name:'Solana RPC Holders',status:'available',fetchedAt:at,detail:''}],holders:[{address:'a',share:50,contract:false,locked:null,tag:''},{address:'b',share:50,contract:false,locked:null,tag:''}],investigation:{wallets:[{address:'a',share:50,categories:[],evidenceIds:[]},{address:'b',share:50,categories:[],evidenceIds:[]}],evidence:[],relationships:[],timeline:[],findings:[],assessment:{status:'insufficient',title:'',summary:''},coverage:{status:'partial',launchVerified:false,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,source:'RPC',fetchedAt:at,reasons:[]}}};}

test('passing controls with missing history produce six-factor bounds, never a fabricated exact percentage',()=>{
 const result=trustRating(report());assert.equal(result.score,null);assert.equal(result.decision,'CAUTION');assert.equal(result.version,'six-factor-v1');assert.deepEqual(result.components.map(c=>c.id),['swarm','fresh','insiders','concentration','snipers','dev']);
 assert.deepEqual(result.range,{lower:0,upper:85});assert.match(result.basis,/not a probability/i);assert.equal(result.components.find(c=>c.id==='concentration')?.earned,0);
});
test('an unsupported inferred shared-funder warning cannot manufacture a stop rule',()=>{
 const r=report(),before=trustRating(r);r.investigation.findings=[{id:'funder:a',title:'Shared funding',description:'',level:'warning',certainty:'inferred',wallets:['outside-a','outside-b'],evidenceIds:['missing']}];const after=trustRating(r);
 assert.deepEqual(after.range,before.range);assert.deepEqual(after.soft,[]);assert.deepEqual(after.hard,[]);
});
test('documented groups beyond the first thousand ranked holders still trigger the group rule',()=>{
 const r=report();r.holders=Array.from({length:1003},(_,i)=>({address:`wallet${i.toString().padStart(4,'0')}`,share:i<1000?.09:.01,contract:false,locked:null,tag:''}));r.investigation.wallets=r.holders.map(h=>({address:h.address,share:h.share,categories:[],evidenceIds:[]}));
 for(let i=1000;i<1002;i++){const from=r.holders[i].address,to=r.holders[i+1].address,id=`tail:${i}`;r.investigation.evidence.push({id,kind:'transfer',from,to,amount:1,token:r.token,transaction:`tx${i}`,timestamp:at,source:'RPC',description:'Canonical transfer'});r.investigation.relationships.push({id,kind:'transfer',from,to,evidenceIds:[id],description:'Documented transfer'});}
 assert(trustRating(r).soft?.some(reason=>reason.includes('at least three current holders')));
});
test('a current source-qualified critical control overrides unknown factor measurements',()=>{
 const r=report();r.checks[1]={...r.checks[1],status:'critical',value:'Active'};assert.equal(trustRating(r).decision,'AVOID');assert.equal(trustRating(r).score,null);assert.deepEqual(trustRating(r).range,{lower:0,upper:85});
 for(const patch of [{source:'Unrelated provider'},{fetchedAt:'2026-11-02T00:00:00Z'}]){const unqualified=structuredClone(r);Object.assign(unqualified.checks[1],patch);assert.equal(trustRating(unqualified).score,null);assert.notEqual(trustRating(unqualified).decision,'AVOID');}
});
test('empty baseline and provider-only reports never acquire an independent exact percentage',()=>{
 const r=report();r.checks=[];r.holders=[];assert.equal(trustRating(r).score,null);assert.equal(trustRating(r).decision,'CAUTION');assert.deepEqual(trustRating(r).range,{lower:0,upper:100});
 r.providerAnalysis={} as never;assert.equal(trustRating(r).decision,'UNRATED');assert.equal(trustRating(r).score,null);
});
test('retained controls and holdings cannot produce an exact percentage after failed current verification',()=>{
 for(const reason of ['Contract check refresh is incomplete: Freeze authority. Last known results retained.','Holder snapshot is stale: All holder sources failed.']){
  const r=report();r.investigation.coverage.reasons=[reason];const result=trustRating(r);assert.equal(result.decision,'CAUTION');assert.equal(result.score,null);assert.equal(result.range?.lower,0);assert.ok(result.reasons.some(value=>/older|current|fresh/i.test(value)));
 }
});
test('unattributed or inferred critical findings cannot override the independent verdict',()=>{
 const r=report();r.investigation.findings=[{id:'critical',title:'Claimed critical',description:'',level:'critical',certainty:'inferred',wallets:[],evidenceIds:[]}];assert.notEqual(trustRating(r).decision,'AVOID');
 r.investigation.findings[0].certainty='observed';r.investigation.findings[0].evidenceIds=['authority'];r.investigation.evidence.push({id:'authority',kind:'authority',transaction:'tx',timestamp:at,source:'RPC',description:'Direct control evidence'});assert.equal(trustRating(r).decision,'AVOID');
 r.investigation.evidence[0].attribution='provider-reported';assert.notEqual(trustRating(r).decision,'AVOID');
});
test('low outgoing counts cannot confirm lifetime freshness or trigger the fresh-wallet hard stop',()=>{
 const r=report();r.chain='ethereum';r.checks=['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'].map(key=>({key,title:key,status:'clear',value:'No',description:'',source:'GoPlus Security',fetchedAt:at}));r.sources=[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:''}];r.holders=Array.from({length:5},(_,i)=>({address:`h${i}`,share:20,contract:false,locked:null,tag:''}));r.investigation.wallets=r.holders.map(h=>({address:h.address,share:h.share,categories:[],evidenceIds:[]}));
 // An older cached adapter incorrectly labeled low nonces as fresh. Even 80%
 // such labels cannot substitute for incoming/internal lifetime history.
 r.walletActivity={source:'EVM RPC wallet activity',observedAt:at,blockRef:'0x1:hash',truncated:false,wallets:r.holders.map((h,i)=>({address:h.address,count:i<4?10:11,exact:true,fresh:i<4,basis:'evm-outgoing-count',reason:''}))};
 const uncertain=trustRating(r);assert.notEqual(uncertain.decision,'AVOID');assert.equal(uncertain.score,null);assert.equal(uncertain.components.find(c=>c.id==='fresh')?.state,'unknown');assert(!uncertain.hard?.some(reason=>/fresh-wallet/i.test(reason)));
 for(const wallet of r.walletActivity.wallets){wallet.count=11;wallet.fresh=false;}
 const nonfresh=trustRating(r);assert.notEqual(nonfresh.decision,'AVOID');assert.equal(nonfresh.components.find(c=>c.id==='fresh')?.earned,20);assert.equal(nonfresh.components.find(c=>c.id==='fresh')?.state,'clear');
 delete r.walletActivity.blockRef;assert.equal(trustRating(r).components.find(c=>c.id==='fresh')?.state,'unknown');
});
