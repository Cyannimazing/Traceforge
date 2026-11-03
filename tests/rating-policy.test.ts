import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {trustRating} from '../src/lib/trust-rating';
const at='2026-11-03T06:00:00Z',launch='2026-11-01T06:00:00Z';
/** Fully specified synthetic evidence. These are policy regression inputs, not a real token recommendation. */
function report(token='mint'):InvestigationReport{
 const holders=Array.from({length:64},(_,i)=>({address:`h${i}`,share:1,contract:false,locked:null,tag:''}));holders.push({address:'pool',share:36,contract:false,locked:null,tag:''});
 const r:InvestigationReport={chain:'solana',token,name:'Test token',symbol:'TEST',fetchedAt:at,market:null,holderCount:64,totalSupply:100,holders,
 checks:['solana_mint_authority','solana_freeze_authority','solana_extensions'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'',source:'Solana RPC authorities',fetchedAt:at})),sources:[{name:'Solana RPC authorities',status:'available',fetchedAt:at,detail:''},{name:'Solana RPC Holders',status:'available',fetchedAt:at,detail:''}],
 investigation:{wallets:holders.map(h=>({address:h.address,share:h.share,categories:h.address==='pool'?['pool']:[],evidenceIds:h.address==='pool'?['label:pool:pool']:[]})),evidence:[{id:'label:pool:pool',kind:'label',timestamp:at,source:'RPC',description:'Pool identity'},{id:'identity:creator:creator',kind:'authority',transaction:'creation',timestamp:launch,source:'RPC',description:'Creator identity'}],relationships:[],timeline:[],findings:[],assessment:{status:'clear',title:'',summary:''},coverage:{status:'complete',launchVerified:true,earliestTradeAt:launch,truncated:false,holderLimit:100,buyerLimit:100,fundingHops:1,source:'Synthetic complete scope',fetchedAt:at,reasons:[]}},
 walletActivity:{source:'Solana RPC wallet activity',observedAt:at,truncated:false,wallets:holders.filter(h=>h.address!=='pool').map(h=>({address:h.address,count:11,exact:false,fresh:false,basis:'solana-address-signatures',reason:'At least eleven independent signatures'}))},
 solana:{authorities:{mint:{address:null},freeze:{address:null}},extensions:[],snapshot:{commitment:'finalized',selectedTokenAccounts:64,unresolvedTokenAccounts:0,fetchedAt:at},tokenAccounts:holders.filter(h=>h.address!=='pool').map(h=>({address:`account:${h.address}`,owner:h.address,mint:token,amountRaw:'1000',decimals:3,slot:1,timestamp:at,state:'initialized',extensions:[]}))},
 poolReserves:{status:'verified',reasons:[],snapshot:{protocol:'pumpswap',pool:'pool',program:'program',base:{mint:token,vault:'base',amountRaw:'36000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},quote:{mint:'quote',vault:'quote',amountRaw:'100000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},slot:1,observedAt:at,commitment:'finalized',source:'RPC reserve',blockRef:'slot1',evidenceId:'reserves',virtualQuoteReservesRaw:'0',effectiveQuoteAmountRaw:'100000',protocolFeesRaw:'0',creatorFeesRaw:'0',creatorFeeBpsRaw:'0',constantProductEligible:true,feeBps:null,feeAssumption:'Fees unverified',limitations:[]}}};
 r.investigation.wallets.push({address:'creator',share:null,categories:['creator'],evidenceIds:['identity:creator:creator']});return r;
}
function link(r:InvestigationReport,id:string,from:string,to:string){r.investigation.evidence.push({id,kind:'transfer',transaction:`tx:${id}`,from,to,token:r.token,amount:1,timestamp:at,source:'RPC',description:'Observed transfer'});r.investigation.relationships.push({id,from,to,kind:'transfer',evidenceIds:[id],description:''});}

test('fully measured six factors can yield CLEAN without substituting contract pass percentages',()=>{
 const result=trustRating(report());assert.equal(result.score,100);assert.equal(result.decision,'CLEAN');assert.deepEqual(result.components.map(c=>c.maximum),[30,20,15,15,10,10]);assert.deepEqual(result.range,{lower:100,upper:100});assert.match(result.basis,/not a probability/i);
});
test('missing activity preserves the full unresolved fresh-family interval instead of granting an exact80',()=>{
 const r=report();delete r.walletActivity;const result=trustRating(r);assert.equal(result.score,null);assert.equal(result.decision,'CAUTION');assert.equal(result.components.find(c=>c.id==='fresh')?.state,'unknown');assert.deepEqual(result.range,{lower:80,upper:100});
});
test('three connected current holders cap at59 while two do not trigger the three-wallet rule',()=>{
 const r=report();link(r,'a','h0','h1');assert.equal(trustRating(r).soft?.length,0);link(r,'b','h1','h2');const result=trustRating(r);assert.equal(result.score,59);assert.equal(result.ceiling,59);assert.equal(result.decision,'CAUTION');assert.equal(result.soft?.length,1);
});
test('historical-only relationships and inferred claims cannot create a current-holder cap',()=>{
 const r=report(),before=trustRating(r);link(r,'a','old0','old1');link(r,'b','old1','old2');r.investigation.findings=[{id:'selling:old',title:'Historical linked selling',description:'',level:'warning',certainty:'inferred',wallets:['old0','old1','old2'],evidenceIds:['a','b']}];
 const result=trustRating(r);assert.equal(result.score,before.score);assert.equal(result.soft?.length,0);
});
test('qualified critical controls force AVOID while inferred/security duplicates do not multiply penalties',()=>{
 const r=report();r.checks[1]={...r.checks[1],status:'critical',value:'Active'};assert.equal(trustRating(r).score,100);assert.equal(trustRating(r).decision,'AVOID');
 const warn=report();warn.checks.push({key:'solana_extension_transferFeeConfigAuthority',title:'Transfer fee authority',description:'',status:'warning',value:'1%',source:'Solana RPC authorities',fetchedAt:at});assert.equal(trustRating(warn).score,59);warn.checks.push({...warn.checks.at(-1)!});assert.equal(trustRating(warn).score,59);assert.equal(trustRating(warn).soft?.length,1);
});
test('stale core evidence withholds exact points even when numeric factor observations are favorable',()=>{
 for(const reason of ['Contract check refresh is incomplete: mint','Holder snapshot is stale: RPC unavailable']){const r=report();r.investigation.coverage.reasons=[reason];const result=trustRating(r);assert.equal(result.score,null);assert.equal(result.decision,'CAUTION');assert.equal(result.range?.lower,0);}
});
test('ordinary unrelated token receipts do not become creator-linked or insider exposure',()=>{
 const r=report();link(r,'ordinary','unrelated','h0');const result=trustRating(r);assert.equal(result.components.find(c=>c.id==='dev')?.earned,10);assert.equal(result.components.find(c=>c.id==='insiders')?.earned,15);assert.equal(result.score,100);
});
test('the same token changes score with measured balances; token name does not select a verdict',()=>{
 const r=report('6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump');r.name='Grokbot';assert.equal(trustRating(r).score,100);
 for(let i=0;i<64;i++){const share=i===0?8:i<=56?.875:1;r.holders[i].share=share;r.investigation.wallets[i].share=share;r.solana!.tokenAccounts[i].amountRaw=String(share*1000);}
 assert.equal(trustRating(r).score,86);assert.equal(trustRating(r).decision,'OK');r.checks[1].status='critical';assert.equal(trustRating(r).score,86);assert.equal(trustRating(r).decision,'AVOID');
 assert.equal(trustRating(report('different-mint')).score,100);
});
test('duplicate transfer receipts and reordered relationships cannot increase penalties',()=>{
 const r=report();link(r,'a','h0','h1');link(r,'b','h1','h2');const before=trustRating(r);r.investigation.evidence=[...r.investigation.evidence,...r.investigation.evidence].reverse();r.investigation.relationships=[...r.investigation.relationships,...r.investigation.relationships].reverse();const after=trustRating(r);
 assert.equal(after.score,before.score);assert.deepEqual(after.range,before.range);assert.deepEqual(after.soft,before.soft);
});
test('unsupported mint extension decoding cannot yield CLEAN from otherwise complete factor measurements',()=>{
 const r=report();r.checks.push({key:'solana_extensions',title:'Unsupported extensions',status:'unknown',value:'Unresolved extension',description:'',source:'Solana RPC authorities',fetchedAt:at});const result=trustRating(r);assert.notEqual(result.decision,'CLEAN');assert.equal(result.score,null);
});
test('independently modeled sell impact above50percent stops favorable remaining factors',()=>{
 const r=report();for(let i=0;i<64;i++){const share=i===0?20:i<=38?.5:1;r.holders[i].share=share;r.investigation.wallets[i].share=share;r.solana!.tokenAccounts[i].amountRaw=String(share*1000);}
 const result=trustRating(r);assert.equal(result.decision,'AVOID');assert.ok(result.hard?.some(reason=>reason.includes('sell impact')));assert.notEqual(result.score,0);
 r.poolReserves!.snapshot!.constantProductEligible=false;assert.equal(trustRating(r).hard?.some(reason=>reason.includes('sell impact')),false);assert.equal(trustRating(r).score,null);
});
