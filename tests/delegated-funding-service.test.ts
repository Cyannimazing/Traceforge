import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import type {Report} from '../src/lib/analysis';
import type {WalletActivitySnapshot} from '../src/lib/wallet-activity';

const at='2026-11-04T09:00:00Z',hash='0x'+'a'.repeat(64),ref='0x10:'+hash,a=(n:number)=>'0x'+n.toString(16).padStart(40,'0'),token=a(1),funder=a(9),owners=[a(2),a(3),a(4)];
function activity(kind:'eoa'|'delegated-eoa'='delegated-eoa'):WalletActivitySnapshot{
 return {source:'EVM RPC wallet activity',observedAt:at,blockTimestamp:at,finality:'finalized',blockRef:ref,truncated:false,wallets:owners.map(address=>({address,count:20,exact:true,fresh:null,basis:'evm-account-nonce',reason:'Canonical account nonce',accountKind:kind,codeProof:{code:kind==='eoa'?'0x':'0xef0100'+'1'.repeat(40),blockRef:ref}}))};
}
function service(snapshot:WalletActivitySnapshot,independentContract=false){
 const publicReport:Report={chain:'robinhood',token,name:'Synthetic token',symbol:'TEST',fetchedAt:at,market:null,holders:owners.map(address=>({address,share:20,contract:true,locked:null,tag:''})),holderCount:3,checks:[],sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:'Provider-reported contract flags'}]};
 return createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>structuredClone(publicReport),makeClient:()=>({configured:false,request:async()=>null}),historicalEvidence:async()=>({trades:[],transfers:owners.map((to,i)=>({id:'native:'+i,from:funder,to,amount:1,amountRaw:'1000000000000000000',decimals:18,native:true,token:'native',timestamp:at,transaction:'0x'+String(i+1).repeat(64),source:'Canonical native transaction, successful receipt and matching block header'})),identities:[],labels:independentContract?[{address:owners[0],category:'contract' as const,source:'Independent contract verification',timestamp:at,label:'Independent contract identity'}]:[],sources:[],reasons:[],truncated:true}),enrichSnapshot:async()=>({walletActivity:structuredClone(snapshot)})});
}
test('canonical delegated and empty-code EOAs retain native shared-funder inference and the three-holder strict cap',async()=>{
 for(const kind of ['delegated-eoa','eoa'] as const){const out=await service(activity(kind)).scan('robinhood',token);
  assert.equal(out.investigation.evidence.filter(e=>e.kind==='transfer').length,3);
  assert(out.investigation.findings.some(f=>f.id==='funder:'+funder&&f.wallets.length===3),kind);
  assert(out.trustRating?.soft?.some(reason=>reason.includes('three current holders')),kind);assert.equal(out.trustRating?.ceiling,59);
  for(const owner of owners){const wallet=out.investigation.wallets.find(w=>w.address===owner)!;assert(!wallet.categories.includes('contract'));assert(wallet.categories.includes('shared-funder'));const flag=out.investigation.evidence.find(e=>e.id==='label:'+owner+':contract')!;assert.equal(flag.attribution,'provider-reported');assert.equal(flag.source,'GoPlus Security');assert(wallet.evidenceIds.includes(flag.id));assert(out.investigation.evidence.some(e=>wallet.evidenceIds.includes(e.id)&&e.source==='EVM RPC wallet activity'&&e.description.includes(kind==='eoa'?'empty-code EOA':'delegated EOA')));}
 }
});
test('missing stale malformed wrong-block and reorged account proof cannot clear provider contract exclusions',async()=>{
 for(const mode of ['missing','malformed','wrong-block','wrong-kind','wrong-source','stale','future-block','unfinalized','reorg'] as const){const snapshot=activity();
  for(const w of snapshot.wallets){if(mode==='missing')delete w.codeProof;if(mode==='malformed')w.codeProof!.code='0xef0100'+'1'.repeat(39);if(mode==='wrong-block')w.codeProof!.blockRef='0x11:'+hash;if(mode==='wrong-kind')w.accountKind='contract';}
  if(mode==='wrong-source')snapshot.source='GoPlus Security';if(mode==='stale')snapshot.observedAt='2026-11-04T08:00:00Z';if(mode==='future-block')snapshot.blockTimestamp='2026-11-04T09:03:00Z';if(mode==='unfinalized')delete snapshot.finality;if(mode==='reorg')snapshot.failure='anchor-changed';
  const out=await service(snapshot).scan('robinhood',token);assert.equal(out.investigation.evidence.filter(e=>e.kind==='transfer').length,3,mode);assert(!out.investigation.findings.some(f=>f.id==='funder:'+funder),mode);assert(out.investigation.wallets.filter(w=>owners.includes(w.address)).every(w=>w.categories.includes('contract')),mode);
 }
});
test('a holder refresh cannot reintroduce the provider-only contract category from its saved baseline',async()=>{
 const snapshot=activity();for(const w of snapshot.wallets)delete w.codeProof;const load=service(snapshot),first=await load.scan('robinhood',token);assert(first.investigation.wallets.filter(w=>owners.includes(w.address)).every(w=>w.categories.includes('contract')));
 Object.assign(snapshot,activity());const next=await load.scan('robinhood',token,{mode:'holders'});assert(next.investigation.wallets.filter(w=>owners.includes(w.address)).every(w=>!w.categories.includes('contract')));assert(next.investigation.evidence.some(e=>e.id==='label:'+owners[0]+':contract'&&e.attribution==='provider-reported'));
});
test('an independent contract identity is retained when it conflicts with an otherwise valid EOA observation',async()=>{
 const out=await service(activity(),true).scan('robinhood',token),wallet=out.investigation.wallets.find(w=>w.address===owners[0])!;assert(wallet.categories.includes('contract'));assert.equal(out.investigation.evidence.find(e=>e.id==='label:'+owners[0]+':contract')?.source,'Independent contract verification');assert(out.investigation.evidence.some(e=>e.source==='GoPlus Security'&&e.attribution==='provider-reported'&&e.to===owners[0]));assert(!out.trustRating?.soft?.some(reason=>reason.includes('three current holders')));
});
