import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {agentEvidenceContext} from '../src/lib/agent-evidence-context';

const at='2026-11-02T07:00:00.000Z';
function report(chain:InvestigationReport['chain']='solana'):InvestigationReport{
 const source=chain==='solana'?'Solana RPC authorities':'GoPlus Security';
 const keys=chain==='solana'?['solana_mint_authority','solana_freeze_authority']:['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'];
 return {chain,token:'token',name:'Token',symbol:'T',fetchedAt:at,market:null,holderCount:null,holders:[{address:'holder',share:5,contract:false,locked:false,tag:''}],checks:keys.map(key=>({key,title:key,description:'Verified',status:'clear',value:'Clear',source,fetchedAt:at})),sources:[{name:source,status:'available',fetchedAt:at,detail:''},{name:chain==='solana'?'Solana RPC Holders':'Blockscout Holders',status:'available',fetchedAt:at,detail:''}],investigation:{wallets:[{address:'holder',share:5,categories:[],evidenceIds:[]}],relationships:[],evidence:[],timeline:[],findings:[],assessment:{status:'clear',title:'',summary:''},coverage:{status:'partial',launchVerified:false,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true,reasons:[],source:'Independent',fetchedAt:at}}};
}

test('missing launch, historical warnings and packet size do not inherit weighted rating gates',()=>{
 const r=report();r.investigation.findings=[{id:'old',title:'Shared source',description:'Historical',level:'warning',certainty:'inferred',wallets:['old-a','old-b'],evidenceIds:[]}];
 const context=agentEvidenceContext(r);
 assert.deepEqual(context.guard,{critical:false,missingCore:false,warning:false,reasons:[]});
 assert.equal(context.findingScopes.old.currentHolderCount,0);
 assert.equal(context.findingScopes.old.scope,'outside-current-snapshot');
 assert.match(context.findingScopes.old.note,/unknown.*not zero/i);
});

test('required controls and holder snapshots need matching fresh available sources on every chain',()=>{
 for(const chain of ['ethereum','base','bsc','solana'] as const){
  assert.equal(agentEvidenceContext(report(chain)).guard.missingCore,false);
  for(const mutate of [(r:InvestigationReport)=>{r.checks[0].source='Unrelated';},(r:InvestigationReport)=>{r.checks[0].status='unknown';},(r:InvestigationReport)=>{r.checks.shift();},(r:InvestigationReport)=>{r.sources[0].status='unavailable';},(r:InvestigationReport)=>{r.sources.forEach(s=>{s.fetchedAt='2026-11-01T00:00:00Z';});}]){
   const r=report(chain);mutate(r);assert.equal(agentEvidenceContext(r).guard.missingCore,true,chain);
  }
 }
});

test('only source-qualified current controls set warning and critical guards',()=>{
 const r=report();r.checks[0].status='warning';assert.equal(agentEvidenceContext(r).guard.warning,true);
 r.checks[0].status='critical';assert.equal(agentEvidenceContext(r).guard.critical,true);
 r.checks[0].source=undefined;assert.equal(agentEvidenceContext(r).guard.critical,false);assert.equal(agentEvidenceContext(r).guard.missingCore,true);
 r.checks[0].source='Solana RPC authorities';r.checks[0].fetchedAt='2026-11-01T00:00:00Z';assert.equal(agentEvidenceContext(r).guard.critical,false);
});

test('critical behavior needs independent observed evidence, not imported or unsupported assertions',()=>{
 const r=report();r.investigation.evidence=[{id:'tx',kind:'trade',transaction:'sig',timestamp:at,source:'Configured RPC',description:'Observed'}];
 r.investigation.findings=[{id:'critical',title:'Hazard',description:'Observed hazard',level:'critical',certainty:'observed',wallets:['holder'],evidenceIds:['tx']}];
 assert.equal(agentEvidenceContext(r).guard.critical,true);
 r.investigation.findings[0].attribution='provider-reported';assert.equal(agentEvidenceContext(r).guard.critical,false);
 delete r.investigation.findings[0].attribution;r.investigation.evidence[0].attribution='provider-reported';assert.equal(agentEvidenceContext(r).guard.critical,false);
});

test('current-holder scopes normalize EVM addresses and exclude only proved infrastructure',()=>{
 const r=report('ethereum');r.holders[0].address='0xABC';r.investigation.wallets[0].address='0xabc';
 r.holders.push({address:'0xPOOL',share:50,contract:true,locked:false,tag:'pool'});
 r.investigation.wallets.push({address:'0xpool',share:50,categories:['pool'],evidenceIds:['label:0xpool:pool']});
 r.investigation.evidence.push({id:'label:0xpool:pool',kind:'label',source:'DEX Screener',timestamp:at,description:'Pair identity'});
 r.investigation.findings=[{id:'mixed',title:'Connection',description:'',level:'warning',certainty:'inferred',wallets:['0xAbC','0xOLD','0xabc'],evidenceIds:[]}];
 const c=agentEvidenceContext(r);assert.deepEqual(c.currentHolderAddresses,['0xabc']);assert.deepEqual(c.excludedInfrastructureAddresses,['0xpool']);
 assert.equal(c.findingScopes.mixed.scope,'mixed');assert.equal(c.findingScopes.mixed.currentHolderCount,1);assert.equal(c.findingScopes.mixed.totalWalletCount,2);
 r.investigation.evidence[0].attribution='provider-reported';assert.equal(agentEvidenceContext(r).currentHolderAddresses.length,2);
});

test('unrelated labels cannot remove holder balances as infrastructure; pool timing proof can',()=>{
 const r=report();r.investigation.wallets[0].categories=['pool'];r.investigation.wallets[0].evidenceIds=['label:holder:creator'];
 r.investigation.evidence=[{id:'label:holder:creator',kind:'label',timestamp:at,source:'Explorer',description:'Creator identity'}];
 assert.deepEqual(agentEvidenceContext(r).currentHolderAddresses,['holder']);
 r.investigation.wallets[0].evidenceIds=['pool-timing:holder:swap'];r.investigation.evidence[0].id='pool-timing:holder:swap';
 assert.deepEqual(agentEvidenceContext(r).excludedInfrastructureAddresses,['holder']);
 r.investigation.evidence[0].attribution='provider-reported';assert.deepEqual(agentEvidenceContext(r).currentHolderAddresses,['holder']);
});

test('stale refresh flags and contradictory holder supply do not establish current core data',()=>{
 const r=report();r.investigation.coverage.reasons=['Holder snapshot is stale: RPC unavailable'];assert.equal(agentEvidenceContext(r).guard.missingCore,true);
 r.investigation.coverage.reasons=[];r.holders.push({...r.holders[0],share:8});assert.equal(agentEvidenceContext(r).guard.missingCore,true);
});

test('verified quote-side constraints survive allow-listing without becoming scanned-token controls',()=>{
 const r=report();r.poolReserves={status:'verified',reasons:[],snapshot:{protocol:'pumpswap',pool:'pool',program:'program',base:{mint:'token',vault:'base',amountRaw:'100',decimals:6,tokenProgram:'token2022',mintExtensions:[],vaultExtensions:[]},quote:{mint:'quote',vault:'quote-vault',amountRaw:'50',decimals:6,tokenProgram:'token2022',mintExtensions:['permanentDelegate','transferHook'],vaultExtensions:[]},slot:1,observedAt:at,commitment:'finalized',source:'Configured RPC',blockRef:'solana:finalized:1',evidenceId:'reserve',virtualQuoteReservesRaw:'0',effectiveQuoteAmountRaw:'50',protocolFeesRaw:'0',creatorFeesRaw:'0',creatorFeeBpsRaw:'100',constantProductEligible:false,feeBps:null,feeAssumption:'Unverified fees',limitations:['Quote extensions unsupported']}};
 Object.assign(r.poolReserves.snapshot!,{rpcUrl:'https://rpc.test/secret-key'});
 const c=agentEvidenceContext(r);assert.equal(c.poolReserves?.status,'verified');assert.deepEqual(c.poolReserves?.snapshot?.quote.mintExtensions,['permanentDelegate','transferHook']);assert.equal(c.poolReserves?.snapshot?.constantProductEligible,false);
 assert.equal(c.guard.critical,false);assert(!JSON.stringify(c).includes('secret-key'));
});
