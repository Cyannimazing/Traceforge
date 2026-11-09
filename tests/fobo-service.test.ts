import test from 'node:test';import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import {createFoboLaunchRecord,FOBO_FACTORY,FOBO_HOOK,FOBO_VESTING,type FoboLaunchRecordResult} from '../src/lib/fobo-launch-record';
import type {Report} from '../src/lib/analysis';
import {rpc,token,creator,buyers,launchTx,SAFE_TIME} from './fobo-fixture';

const at=new Date(SAFE_TIME()).toISOString(),other='0x'+'4'.repeat(40);
const base:Report={chain:'robinhood',token,name:'Test',symbol:'TEST',fetchedAt:at,market:null,holders:[{address:other,share:10,contract:false,locked:null,tag:''}],holderCount:null,checks:[],sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:'Provider identity'}],identities:[{address:FOBO_FACTORY,role:'creator',source:'GoPlus Security',timestamp:at},{address:other,role:'creator',source:'Another source',timestamp:at}]};
const respond=rpc(),fetcher:typeof fetch=async(_url,init)=>Response.json((JSON.parse(String(init?.body)) as {id:number;method:string;params:unknown[]}[]).map(c=>({jsonrpc:'2.0',id:c.id,result:respond(c)})));
const foboLaunch=createFoboLaunchRecord({fetcher,now:()=>SAFE_TIME()});
const service=(launch:typeof foboLaunch=foboLaunch,seen?:{priority?:string[]})=>createInvestigationService({now:()=>SAFE_TIME(),publicScan:async()=>structuredClone(base),makeClient:()=>({configured:false,request:async()=>null}),foboLaunch:launch,evmHolders:async(_r,o)=>{if(seen)seen.priority=o.priorityCandidateAddresses||[];return {trades:[],transfers:[],identities:[],labels:[],sources:[],reasons:[],truncated:true};}});

test('verified FOBO launch replaces the shared factory creator, nominates platform balances and applies first-minute roles in deep scans',async()=>{
 const seen:{priority?:string[]}={},r=await service(foboLaunch,seen).scan('robinhood',token,{mode:'deep'});
 assert(!r.identities?.some(i=>i.role==='creator'&&i.address===FOBO_FACTORY));assert(r.identities?.some(i=>i.address===other));
 assert.equal(r.investigation.evidence.find(e=>e.id===`identity:creator:${creator}`)?.transaction,launchTx);
 assert(!r.investigation.wallets.find(w=>w.address===FOBO_FACTORY)?.categories.includes('creator'));
 assert(seen.priority?.includes(creator)&&seen.priority.includes(FOBO_VESTING)&&seen.priority.includes(FOBO_HOOK));
 assert.equal(r.investigation.coverage.curveTiming?.protocol,'fobo-v1');assert.equal(r.investigation.coverage.launchVerified,false);
 assert(r.investigation.wallets.find(w=>w.address===buyers.a)?.categories.includes('sniper'));
 assert(!r.investigation.wallets.find(w=>w.address===buyers.e)?.categories.includes('sniper'));
 assert(r.sources.some(s=>s.name==='FOBO factory launch record'&&s.status==='available'));
});

test('holder scans keep the bound creator without first-minute history',async()=>{
 const r=await service().scan('robinhood',token,{mode:'holders'});
 assert(r.identities?.some(i=>i.address===creator&&i.role==='creator'));assert.equal(r.investigation.coverage.curveTiming,undefined);
});

test('missing or mismatched FOBO record leaves provider identities intact',async()=>{
 for(const mode of ['missing','wrong-hook'] as const){
  const launch=async(...args:Parameters<typeof foboLaunch>):Promise<FoboLaunchRecordResult>=>{const r=await foboLaunch(...args);if(mode==='missing')delete r.snapshot;else r.snapshot!.hook=other;return r;};
  const r=await service(launch).scan('robinhood',token,{mode:'deep'});
  assert(r.identities?.some(i=>i.address===FOBO_FACTORY));assert(!r.identities?.some(i=>i.address===creator));assert.equal(r.investigation.coverage.curveTiming,undefined);
 }
});
