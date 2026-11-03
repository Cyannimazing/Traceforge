import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureReport } from '../src/lib/investigation-fixture';
import { getDisplayAssessment } from '../src/lib/verdict-summary';
import {buildVerdictOutput} from '../src/lib/verdict-output';
import {normalizeSwarmReport} from '../src/lib/swarm';
import {bridgeSwarmReport} from '../src/lib/swarm-bridge';
import {trustRating} from '../src/lib/trust-rating';
import type {InvestigationReport} from '../src/lib/investigation-types';

function report() {
  const value=structuredClone(fixtureReport);
  value.checks=[]; value.investigation.findings=[]; value.investigation.relationships=[];
  value.investigation.assessment={status:'insufficient',title:'Incomplete',summary:'History missing'};
  return value;
}

test('unqualified historical funding findings do not become current stop rules',()=>{
 const value=report();value.investigation.findings=[{id:'funder:a',level:'warning',certainty:'inferred',title:'Shared funding observed',description:'',wallets:['a','b'],evidenceIds:['tx1','tx2']}];
 const result=getDisplayAssessment(value);assert.equal(result.status,'caution');assert.match(result.summary,/not fully evaluated/);
});
test('an unattributed critical flag cannot masquerade as a current verified hard stop',()=>{
 const value=report();value.checks=[{key:'trap',title:'Transfer restriction',status:'critical',description:'Unattributed',value:'1'}];assert.equal(getDisplayAssessment(value).status,'caution');
});
test('unverified warning and critical labels retain caution rather than fabricate verified danger',()=>{
 const value=report();value.investigation.findings=[{id:'c',title:'Flag',description:'Missing evidence',level:'critical',certainty:'observed',wallets:[],evidenceIds:[]}];assert.equal(getDisplayAssessment(value).status,'caution');
});
test('complete coverage alone cannot make an incomplete set of factor measurements clean',()=>{
 const value=report();for(const status of ['complete','partial'] as const){value.investigation.coverage.status=status;assert.equal(getDisplayAssessment(value).status,'caution');assert.match(getDisplayAssessment(value).summary,/not fully evaluated/);}
});

test('unrelated independent evidence cannot upgrade provider-only risk attribution',()=>{
 const token='0x'+'1'.repeat(40);
 for(const [band,level] of [['DANGER','critical'],['RISKY','warning']] as const){
  const provider=normalizeSwarmReport({chain:'ethereum',token,header:{name:'Example'},holders:[],band,security:{checks:[]}},'ethereum',token,'2026-11-02T00:00:00Z');
  const value=bridgeSwarmReport(provider);assert.match(getDisplayAssessment(value).summary,/SwarmEngine reports/);
  value.investigation.evidence.push({id:'canonical-unrelated',kind:'trade',transaction:'0x'+'2'.repeat(64),timestamp:'2026-11-01T00:00:00Z',source:'Verified pool window',description:'Independent normal buy'});
  assert.match(getDisplayAssessment(value).summary,/SwarmEngine reports/,'The source of the actual risk finding must remain explicit');
  value.investigation.findings.push({id:'independent-risk',title:'Independent risk',description:'Independent finding',level,certainty:'observed',wallets:[],evidenceIds:['canonical-unrelated']});
  assert.doesNotMatch(getDisplayAssessment(value).summary,/SwarmEngine reports/,'A mixed risk assessment is not attributed solely to SwarmEngine');
 }
});

test('the reported Solana CLEAN 91 case preserves provider verdict without upgrading coverage',()=>{
 const token='6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump';
 const provider=normalizeSwarmReport({chain:'solana',token,header:{name:'Reported token'},holders:[],score:91,band:'CLEAN',reason:'biggest hand holds 4.6% of float',scanned_at:1793566184,security:{checks:[{id:'mint_authority',level:'ok',title:'Mint authority revoked'},{id:'freeze_authority',level:'ok',title:'Freeze authority revoked'},{id:'program',level:'info',title:'Token-2022 program'},{id:'metadata',level:'ok',title:'Metadata is immutable'}]}},'solana',token,'2026-11-02T00:00:00Z');
 const value=bridgeSwarmReport(provider),result=getDisplayAssessment(value);
 assert.equal(result.status,'clear');assert.equal(result.title,'No red flags reported');
 assert.match(result.summary,/SwarmEngine reports CLEAN/);assert.match(result.summary,/not been independently verified/);assert.match(result.summary,/coverage remains limited/);
 assert.equal(value.investigation.coverage.status,'partial');assert.equal(value.investigation.coverage.launchVerified,false);
 assert.equal(value.investigation.assessment.status,'insufficient');assert.equal(value.providerAnalysis?.score,91);
 assert.equal(value.providerAnalysis?.providerTimestamp,new Date(1793566184*1000).toISOString());
});

test('a high numeric provider score without an explicit CLEAN band never becomes clean',()=>{
 const token='0x'+'1'.repeat(40);
 for(const band of [undefined,'UNKNOWN','']){
  const provider=normalizeSwarmReport({chain:'ethereum',token,header:{name:'Example'},holders:[],score:91,band,security:{checks:[]}},'ethereum',token,'2026-11-02T00:00:00Z');
  assert.equal(getDisplayAssessment(bridgeSwarmReport(provider)).status,'insufficient');
 }
});

test('explicit provider CLEAN remains subordinate to independent warning or critical evidence',()=>{
 const token='0x'+'1'.repeat(40);
 const provider=normalizeSwarmReport({chain:'ethereum',token,header:{name:'Example'},holders:[],score:91,band:' clean ',security:{checks:[]}},'ethereum',token,'2026-11-02T00:00:00Z');
 for(const level of ['warning','critical'] as const){
  const value=bridgeSwarmReport(provider);assert.equal(getDisplayAssessment(value).title,'No red flags reported');
  value.investigation.findings.push({id:'independent-risk',title:'Observed warning',description:'Source-backed finding',level,certainty:'observed',wallets:[],evidenceIds:[]});
  const result=getDisplayAssessment(value);assert.equal(result.status,level==='critical'?'critical':'caution');assert.doesNotMatch(result.summary,/reports CLEAN/);
 }
});

test('a provider CLEAN band cannot suppress its own contradictory security flag',()=>{
 const token='0x'+'1'.repeat(40);
 for(const [level,status] of [['warn','caution'],['danger','critical']] as const){
  const provider=normalizeSwarmReport({chain:'ethereum',token,header:{name:'Example'},holders:[],score:91,band:'CLEAN',security:{checks:[{id:'restriction',level,title:'Restriction'}]}},'ethereum',token,'2026-11-02T00:00:00Z');
  assert.equal(getDisplayAssessment(bridgeSwarmReport(provider)).status,status);
 }
});

test('passing controls alone do not establish distribution or wallet activity',()=>{
 const value=report();value.chain='solana';value.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'Finalized snapshot'}));value.sources=[{name:'Solana RPC authorities',status:'available',detail:'Finalized state',fetchedAt:value.fetchedAt}];value.investigation.wallets=[{address:'owner',share:1,categories:[],evidenceIds:[]}];value.investigation.coverage.status='partial';
 value.holders=Array.from({length:10},(_,i)=>({address:`holder${i}`,share:1,contract:false,locked:false,tag:''}));
 value.investigation.evidence=[{id:'tx',kind:'transfer',timestamp:value.fetchedAt,transaction:'tx',source:'Alchemy',description:''}];
 assert.equal(getDisplayAssessment(value).status,'caution');assert.match(getDisplayAssessment(value).summary,/not fully evaluated/);assert.equal(value.investigation.coverage.status,'partial');
 value.checks.push({key:'unsupported',title:'Unparsed extension',status:'unknown',value:'Unknown',description:''});assert.equal(getDisplayAssessment(value).status,'caution');
});

test('a passing subset and no holder snapshot cannot claim no flags',()=>{
 const value=report();value.chain='solana';value.checks=[{key:'solana_mint_authority',title:'Mint',status:'clear',value:'Revoked',description:''}];assert.equal(getDisplayAssessment(value).status,'caution');
});

/** One current holder owns the non-pool float; launch evidence is positive but incomplete. */
function adverseReport():InvestigationReport {
 const at='2026-11-03T06:00:00Z',launch='2026-11-01T06:00:00Z';
 const r:InvestigationReport={chain:'solana',token:'mint',name:'Adverse test',symbol:'TEST',fetchedAt:at,market:null,holderCount:2,totalSupply:100,
  checks:['solana_mint_authority','solana_freeze_authority','solana_extensions'].map(key=>({key,title:key,status:'clear',value:'Checked',description:'',source:'Solana RPC authorities',fetchedAt:at})),
  sources:['Solana RPC Holders','Solana RPC authorities'].map(name=>({name,status:'available',fetchedAt:at,detail:''})),
  holders:[{address:'owner',share:25,contract:false,locked:null,tag:''},{address:'pool',share:75,contract:true,locked:null,tag:''}],
  investigation:{wallets:[{address:'owner',share:25,categories:['creator','sniper'],evidenceIds:['identity:creator:owner','buy']},{address:'pool',share:75,categories:['pool'],evidenceIds:['label:pool:pool']}],
   evidence:[{id:'identity:creator:owner',kind:'authority',transaction:'creation',timestamp:launch,source:'RPC',description:'Creator'},
    {id:'label:pool:pool',kind:'label',timestamp:at,source:'RPC',description:'Pool'},
    {id:'buy',kind:'trade',transaction:'buy',token:'mint',amount:1,timestamp:'2026-11-01T06:00:30Z',source:'RPC',description:'Buy'},
    {id:'early',kind:'transfer',transaction:'early',from:'external',to:'owner',token:'mint',amount:1,timestamp:'2026-11-01T05:59:00Z',source:'RPC',description:'Prelaunch receipt'}],
   relationships:[],timeline:[{id:'buy',timestamp:'2026-11-01T06:00:30Z',kind:'buy',wallet:'owner',evidenceId:'buy'}],findings:[],assessment:{status:'insufficient',title:'Incomplete',summary:'History partial'},
   coverage:{status:'partial',launchVerified:true,earliestTradeAt:launch,truncated:true,holderLimit:100,buyerLimit:100,fundingHops:1,source:'RPC',fetchedAt:at,reasons:['Remaining history not retrieved']}},
  walletActivity:{source:'Solana RPC wallet activity',observedAt:at,truncated:false,wallets:[{address:'owner',count:11,exact:false,fresh:false,basis:'solana-address-signatures',reason:''}]},
  solana:{authorities:{mint:{},freeze:{}},extensions:[],snapshot:{commitment:'finalized',selectedTokenAccounts:1,unresolvedTokenAccounts:0,fetchedAt:at},tokenAccounts:[{address:'account',owner:'owner',mint:'mint',amountRaw:'25000',decimals:3,slot:1,timestamp:at,state:'initialized',extensions:[]}]},
  poolReserves:{status:'verified',reasons:[],snapshot:{protocol:'pumpswap',pool:'pool',program:'program',base:{mint:'mint',vault:'base',amountRaw:'75000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},quote:{mint:'quote',vault:'quote',amountRaw:'100000',decimals:3,tokenProgram:'spl',mintExtensions:[],vaultExtensions:[]},slot:1,observedAt:at,commitment:'finalized',source:'RPC reserve',blockRef:'slot1',evidenceId:'reserves',virtualQuoteReservesRaw:'0',effectiveQuoteAmountRaw:'100000',protocolFeesRaw:'0',creatorFeesRaw:'0',creatorFeeBpsRaw:'0',constantProductEligible:true,feeBps:null,feeAssumption:'Fees unverified',limitations:[]}}};
 return r;
}

test('adverse model bounds retain their calculated allocation without becoming a hard rule',()=>{
 const r=adverseReport(),rating=trustRating(r);
 assert.equal(rating.coreVerified,true);assert.deepEqual(rating.hard,[]);
 assert.equal(rating.decision,'CAUTION');assert.equal(rating.judge?.modelDecision,'AVOID');assert.equal(rating.judge?.decision,'AVOID');assert.equal(rating.judge?.confidence,null);
 const result=getDisplayAssessment(r);assert.equal(result.status,'critical');assert.equal(result.title,'Avoid');
 assert.match(result.summary,/decision weight/);const output=buildVerdictOutput({rating});assert.equal(output.basis,'uncertainty-allocation');assert(output.p.avoid<1);
});

test('unresolved model and unavailable core evidence use the shared envelope without manufacturing hard stops',()=>{
 const r=adverseReport();r.poolReserves=undefined;
 assert.equal(trustRating(r).judge?.modelDecision,null);assert.equal(getDisplayAssessment(r).status,'caution');
 const unavailable=adverseReport();unavailable.checks.forEach(c=>{c.source='Unverified';});
 const rating=trustRating(unavailable),output=buildVerdictOutput({rating});assert.equal(rating.coreVerified,false);assert.equal(output.basis,'uncertainty-allocation');assert.equal(output.p.ok,0);assert.equal(getDisplayAssessment(unavailable).status,output.decision==='AVOID'?'critical':'caution');assert.match(getDisplayAssessment(unavailable).summary,/uncertainty allocation/);
});

test('source-qualified critical controls retain their reason ahead of the statistical model',()=>{
 const r=adverseReport();r.checks[1].status='critical';r.checks[1].value='Active';
 const rating=trustRating(r),result=getDisplayAssessment(r);assert(rating.hard?.length);
 assert.equal(result.status,'critical');assert.equal(result.summary,rating.hard!.join(' '));assert.doesNotMatch(result.summary,/\d+(?:\.\d+)?%/);
});
