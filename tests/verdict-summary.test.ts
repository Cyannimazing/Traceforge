import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureReport } from '../src/lib/investigation-fixture';
import { getDisplayAssessment } from '../src/lib/verdict-summary';
import {normalizeSwarmReport} from '../src/lib/swarm';
import {bridgeSwarmReport} from '../src/lib/swarm-bridge';

function report() {
  const value=structuredClone(fixtureReport);
  value.checks=[]; value.investigation.findings=[];
  value.investigation.assessment={status:'insufficient',title:'Incomplete',summary:'History missing'};
  return value;
}

test('shared-funding-only caution explains its cause without implying contract failure',()=>{
 const value=report();
 value.investigation.findings=[{id:'funder:a',level:'warning',certainty:'inferred',title:'Shared funding observed',description:'',wallets:['a','b'],evidenceIds:['tx1','tx2']}];
 const result=getDisplayAssessment(value);
 assert.equal(result.status,'caution');assert.match(result.summary,/Shared funding/);assert.match(result.summary,/does not establish common ownership/);
 value.checks=[{key:'pause',title:'Pause',status:'warning',description:'',value:'1'}];
 assert.doesNotMatch(getDisplayAssessment(value).summary,/Shared funding links/);
});
test('critical provider flag stays critical despite unavailable history',()=>{
  const value=report(); value.checks=[{key:'trap',title:'Transfer restriction',status:'critical',description:'Reported restriction',value:'1'}];
  assert.equal(getDisplayAssessment(value).status,'critical');
  assert.equal(getDisplayAssessment(value).title,'Danger');
});
test('warning evidence outranks incomplete history but not a critical finding',()=>{
  const value=report();value.investigation.findings=[{id:'w',title:'Review',description:'Observed signal',level:'warning',certainty:'observed',wallets:[],evidenceIds:[]}];
  assert.equal(getDisplayAssessment(value).status,'caution');
  value.investigation.findings.push({...value.investigation.findings[0],id:'c',level:'critical'});
  assert.equal(getDisplayAssessment(value).status,'critical');
});
test('an empty incomplete report never becomes a clear verdict',()=>{
  assert.equal(getDisplayAssessment(report()).status,'insufficient');
  assert.equal(getDisplayAssessment(report()).title,'Caution');
  assert.match(getDisplayAssessment(report()).summary,/Not enough completed checks/);
});
test('complete coverage alone cannot make an empty report clear',()=>{
  const value=report();value.investigation.coverage.status='complete';value.investigation.assessment.status='clear';
  assert.equal(getDisplayAssessment(value).status,'insufficient');
  assert.equal(getDisplayAssessment(value).title,'Caution');
  value.investigation.coverage.status='partial';
  assert.equal(getDisplayAssessment(value).status,'insufficient');
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
 const value=report();value.chain='solana';value.checks=[{key:'solana_mint_authority',title:'Mint',status:'clear',value:'Revoked',description:''}];assert.equal(getDisplayAssessment(value).status,'insufficient');
});
