import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureReport} from '../src/lib/investigation-fixture';
import {trustRating} from '../src/lib/trust-rating';
function report(){const r=structuredClone(fixtureReport);r.chain='solana';r.investigation.findings=[];r.investigation.relationships=[];r.investigation.coverage.reasons=[];r.sources=[{name:'Solana RPC authorities',status:'available',fetchedAt:r.fetchedAt,detail:''},{name:'Solana RPC Holders',status:'available',fetchedAt:r.fetchedAt,detail:''}];r.checks=['solana_mint_authority','solana_freeze_authority'].map(key=>({key,title:key,status:'clear',value:'Revoked',description:'',source:'Solana RPC authorities',fetchedAt:r.fetchedAt}));return r;}
test('primary verdict has exactly the six public factor weights, never legacy contract pass points',()=>{
 const r=trustRating(report());assert.equal(r.version,'six-factor-v1');assert.deepEqual(r.components.map(c=>[c.id,c.maximum]),[['swarm',30],['fresh',20],['insiders',15],['concentration',15],['snipers',10],['dev',10]]);
});
test('unknown history is a score interval instead of a hardcoded 70 or 85',()=>{const r=report();r.investigation.coverage.launchVerified=false;r.investigation.coverage.status='partial';const rating=trustRating(r);assert.equal(rating.score,null);assert(rating.range!.lower<rating.range!.upper);});
test('current verified freeze authority triggers hard AVOID regardless of missing factors',()=>{const r=report();r.checks[1].status='critical';r.checks[1].value='Active';assert.equal(trustRating(r).decision,'AVOID');assert.equal(trustRating(r).score,null);});
test('unattributed or stale critical flags cannot masquerade as a verified current stop rule',()=>{const r=report();r.checks[1].status='critical';r.checks[1].source='Unverified provider';assert.notEqual(trustRating(r).decision,'AVOID');assert.equal(trustRating(r).score,null);});
test('historical shared funding outside the current holder snapshot does not impose a group cap',()=>{const r=report();r.investigation.findings=[{id:'funder:old',title:'Shared funding',description:'',level:'warning',certainty:'inferred',wallets:['old-a','old-b','old-c'],evidenceIds:[]}];assert.notEqual(trustRating(r).ceiling,59);});

test('metadata and configured fee warnings do not masquerade as active owner powers',()=>{
 for(const key of ['solana_extension_tokenMetadata','solana_extension_transferFeeConfig']){
  const r=report();r.checks.push({...r.checks[0],key,title:key,status:'warning'});
  assert.equal(trustRating(r).ceiling,null,key);
 }
});
test('verified current mint and fee-update authorities apply the disclosed owner-power cap',()=>{
 for(const key of ['solana_mint_authority','solana_extension_transferFeeConfigAuthority']){
  const r=report();r.checks.push({...r.checks[0],key,title:key,status:'warning',value:'Active'});
  assert.equal(trustRating(r).ceiling,59,key);
 }
});
test('active freeze authority is a hard gate even when the adapter classifies capability as warning',()=>{
 const r=report();r.checks[1].status='warning';r.checks[1].value='Active';
 const rating=trustRating(r);assert.equal(rating.decision,'AVOID');assert.equal(rating.score,null);
});
test('stale, future, unattributed and imported owner-power warnings do not impose a cap',()=>{
 for(const mutation of ['stale','future','source','provider']){
  const r=report();r.checks[0].status='warning';
  if(mutation==='stale')r.checks[0].fetchedAt=new Date(Date.parse(r.fetchedAt)-660000).toISOString();
  if(mutation==='future')r.checks[0].fetchedAt=new Date(Date.parse(r.fetchedAt)+180000).toISOString();
  if(mutation==='source')r.checks[0].source='Unverified';
  if(mutation==='provider')r.providerAnalysis={} as NonNullable<typeof r.providerAnalysis>;
  assert.equal(trustRating(r).ceiling,null,mutation);
 }
});
test('unverified-proxy requires both qualified current findings, not a proxy or unverifiable source alone',()=>{
 for(const combination of ['proxy','unverified','both','unattributed']){
  const r=report();r.chain='ethereum';r.sources=[{name:'GoPlus Security',status:'available',fetchedAt:r.fetchedAt,detail:''}];
  r.checks=['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'].map(key=>({...r.checks[0],key,title:key,source:'GoPlus Security'}));
  if(combination!=='unverified')r.checks.push({...r.checks[0],key:'is_proxy',title:'Proxy',status:'warning'});
  if(combination!=='proxy')r.checks.push({...r.checks[0],key:'is_open_source',title:'Source',status:'warning',source:combination==='unattributed'?'Unverified':'GoPlus Security'});
  assert.equal(trustRating(r).ceiling,combination==='both'?59:null,combination);
 }
});
test('unresolved extension decoding explicitly blocks a complete core-evidence verdict',()=>{
 const r=report();r.checks.push({...r.checks[0],key:'solana_extensions',title:'Extensions',status:'unknown'});
 const rating=trustRating(r);assert.equal(rating.score,null);
 assert(rating.reasons.some(reason=>reason.includes('extension')));
 assert.equal(rating.range!.lower,0);
});
test('low outgoing nonces across every EVM holder cannot manufacture the fresh-wallet hard stop',()=>{
 const r=report();r.chain='ethereum';r.sources=[{name:'GoPlus Security',status:'available',fetchedAt:r.fetchedAt,detail:''}];
 r.checks=['is_honeypot','owner_change_balance','is_mintable','transfer_pausable'].map(key=>({...r.checks[0],key,title:key,source:'GoPlus Security'}));
 r.walletActivity={source:'EVM RPC wallet activity',observedAt:r.fetchedAt,blockRef:'finalized:block',truncated:false,wallets:r.holders.map(h=>({address:h.address,count:0,exact:true,fresh:true,basis:'evm-outgoing-count',reason:''}))};
 const rating=trustRating(r);assert.notEqual(rating.decision,'AVOID');assert.equal(rating.score,null);
 assert(!rating.hard?.some(reason=>reason.includes('fresh')));
 const fresh=rating.components.find(c=>c.id==='fresh')!;assert.equal(fresh.state,'unknown');assert.equal(fresh.lower,0);assert.equal(fresh.upper,20);
});


