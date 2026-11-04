import test from 'node:test';
import assert from 'node:assert/strict';
import type {InvestigationReport,Evidence,Relationship} from '../src/lib/investigation-types';
import {buildCurrentHolderGraph} from '../src/lib/current-holder-graph';
import {HOLDER_DISPLAY_LIMIT} from '../src/lib/holder-count-summary';

const at='2026-11-03T06:00:00Z';
function report(chain:InvestigationReport['chain']='solana'):InvestigationReport{
 return {chain,token:'mint',name:'Token',symbol:'T',fetchedAt:at,market:null,holderCount:null,checks:[],sources:[],holders:['a','b','c'].map((address,i)=>({address,share:5-i,contract:false,locked:false,tag:''})),investigation:{wallets:['a','b','c','historical'].map(address=>({address,share:999,categories:['unclassified'],evidenceIds:[]})),relationships:[],evidence:[],timeline:[],findings:[],assessment:{status:'clear',title:'',summary:''},coverage:{status:'partial',launchVerified:false,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true,reasons:[],source:'RPC',fetchedAt:at}}};
}
function transfer(r:InvestigationReport,id:string,from:string,to:string,kind:Relationship['kind']='transfer',token='SOL'){
 const e:Evidence={id,kind:'transfer',transaction:`tx:${id}`,timestamp:at,source:'RPC',from,to,amount:1,token,description:'Observed transfer'};
 r.investigation.evidence.push(e);r.investigation.relationships.push({id,kind,from,to,evidenceIds:[id],description:'Observed transfer'});return e;
}
function shared(r:InvestigationReport){
 transfer(r,'fa','funder','a','funding');transfer(r,'fb','funder','b','funding');
 r.investigation.relationships.push({id:'shared',kind:'shared-funder',from:'a',to:'b',evidenceIds:['fa','fb'],description:'Possible shared funding'});
}

test('graph uses only current holder rows and their balances, never historical graph shares',()=>{
 const r=report(),before=JSON.stringify(r);transfer(r,'old','historical','a');const graph=buildCurrentHolderGraph(r);
 assert.deepEqual(graph.nodes.map(n=>[n.address,n.share]),[['a',5],['b',4],['c',3]]);assert.equal(graph.total,3);assert.equal(graph.shown,3);assert.equal(graph.edges.length,0);assert.equal(graph.truncated,false);assert.equal(graph.documentedGroups,0);
 assert.equal(JSON.parse(before).investigation.wallets[0].share,r.investigation.wallets[0].share);
});

test('direct edges require actual positive tx proofs matching both endpoints and are deduplicated',()=>{
 const r=report();transfer(r,'ab','a','b');r.investigation.relationships.push({...r.investigation.relationships[0],id:'duplicate',kind:'deployer-linked'});transfer(r,'self','a','a');
 const graph=buildCurrentHolderGraph(r);assert.equal(graph.edges.length,1);assert.equal(graph.documentedGroups,1);assert.match(graph.edges[0].description,/not.*ownership/i);
 r.investigation.evidence[0].to='c';assert.equal(buildCurrentHolderGraph(r).edges.length,0);
});

test('shared-funder edges require two eligible native funding receipts, not arbitrary token payouts',()=>{
 const r=report();shared(r);assert.equal(buildCurrentHolderGraph(r).edges.length,1);
 r.investigation.evidence[1].token='SPL_MINT';assert.equal(buildCurrentHolderGraph(r).edges.length,0);
 r.investigation.evidence[1].token='SOL';r.investigation.relationships[1].kind='transfer';assert.equal(buildCurrentHolderGraph(r).edges.length,0);
});

test('known infrastructure funders are excluded even when absent from the holder snapshot',()=>{
 const r=report();shared(r);r.investigation.wallets.push({address:'funder',share:null,categories:['exchange'],evidenceIds:['label:funder:exchange']});r.investigation.evidence.push({id:'label:funder:exchange',kind:'label',source:'Explorer',timestamp:at,description:'Exchange'});
 assert.equal(buildCurrentHolderGraph(r).edges.length,0);
 r.investigation.evidence.at(-1)!.attribution='provider-reported';assert.equal(buildCurrentHolderGraph(r).edges.length,1);
});

test('provider-reported, missing-source, invalid-date, future and zero-value proofs cannot create links',()=>{
 for(const mutate of [(e:Evidence)=>{e.attribution='provider-reported';},(e:Evidence)=>{e.source='';},(e:Evidence)=>{e.timestamp='invalid';},(e:Evidence)=>{e.timestamp='2026-11-03T08:00:00Z';},(e:Evidence)=>{e.amount=0;}]){
  const r=report();mutate(transfer(r,'ab','a','b'));assert.equal(buildCurrentHolderGraph(r).edges.length,0);
 }
 const r=report();transfer(r,'ab','a','b');r.investigation.relationships[0].attribution='provider-reported';assert.equal(buildCurrentHolderGraph(r).edges.length,0);
});

test('bounded display is deterministic and reports omitted current holders',()=>{
 const r=report();transfer(r,'ab','a','b');transfer(r,'bc','b','c');const g=buildCurrentHolderGraph(r,{limit:2});
 assert.equal(g.total,3);assert.equal(g.shown,2);assert.equal(g.truncated,true);assert.equal(g.edges.length,1);assert.equal(g.documentedGroups,1);assert.deepEqual(g.nodes.map(n=>n.address),['a','b']);
});

test('normalization is chain-specific and uses the same evidence-backed infrastructure partition as the table',()=>{
 for(const chain of ['ethereum','base','bsc'] as const){
  const r=report(chain);r.holders[0].address='0xAbC';r.holders[1].address='0xDEF';r.investigation.wallets[0].address='0xabc';r.investigation.wallets[1].address='0xdef';transfer(r,'ab','0xABC','0xdef','transfer','native');
  const g=buildCurrentHolderGraph(r);assert.equal(g.edges.length,1);assert.equal(g.nodes[0].address,'0xabc');
 }
 const r=report();r.investigation.wallets[0].categories=['pool'];r.investigation.wallets[0].evidenceIds=['label:a:pool'];r.investigation.evidence.push({id:'label:a:pool',kind:'label',source:'DEX Screener',timestamp:at,description:'Verified pool'});
 const g=buildCurrentHolderGraph(r);assert.equal(g.total,2);assert.equal(g.excludedInfrastructure,1);assert(!g.nodes.some(n=>n.address==='a'));
});

test('a transfer only connecting an unrelated endpoint cannot act as shared funding proof',()=>{
 const r=report();shared(r);r.investigation.evidence[1].from='another-funder';assert.equal(buildCurrentHolderGraph(r).edges.length,0);
});

test('top fifty display leaves later holder relationships available to the full investigation',()=>{
 const r=report();r.holders=Array.from({length:239},(_,i)=>({address:'wallet-'+i.toString().padStart(3,'0'),share:(239-i)/1000,contract:false,locked:false,tag:''}));
 r.investigation.wallets=r.holders.map(h=>({address:h.address,share:h.share,categories:['unclassified'],evidenceIds:[]}));
 transfer(r,'tail-link','wallet-150','wallet-200');
 const displayed=buildCurrentHolderGraph(r,{limit:HOLDER_DISPLAY_LIMIT}),all=buildCurrentHolderGraph(r,{limit:r.holders.length});
 assert.equal(displayed.shown,50);assert.equal(displayed.total,239);assert.equal(displayed.edges.length,0);
 assert.equal(all.shown,239);assert.equal(all.edges.length,1);assert.equal(all.documentedGroups,1);
 assert.equal(r.holders.length,239);assert.equal(displayed.nodes[0].share,r.holders[0].share);
});

test('top-wallet view ranks raw balances before exclusions and never backfills beyond its source window',()=>{
 const r=report('base');r.holders=Array.from({length:55},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),share:(55-i)/100,contract:false,locked:false,tag:''}));
 r.investigation.wallets=r.holders.map(h=>({address:h.address,share:h.share,categories:['unclassified'],evidenceIds:[]}));
 const pool=r.investigation.wallets[0];pool.categories=['pool'];pool.evidenceIds=[`label:${pool.address}:pool`];r.investigation.evidence=[{id:pool.evidenceIds[0],kind:'label',source:'Verified registry',timestamp:at,description:'Documented platform'}];
 const before=JSON.stringify(r),g=buildCurrentHolderGraph(r,{limit:50,cohort:'top'});
 assert.equal(g.shown,49);assert.equal(g.total,49);assert.equal(g.walletGroups,49);
 assert.equal(g.nodes[0].address,r.holders[1].address);assert.equal(g.nodes.at(-1)!.address,r.holders[49].address);
 assert(!g.nodes.some(n=>n.address===r.holders[50].address));assert.equal(JSON.stringify(r),before);
 const full=buildCurrentHolderGraph(r,{limit:10000});assert.equal(full.nodes.length,54);
 transfer(r,'cohort-link',r.holders[1].address,r.holders[2].address,'transfer','native');
 const connected=buildCurrentHolderGraph(r,{cohort:'top'});assert.equal(connected.documentedGroups,1);assert.equal(connected.walletGroups,48);
});
