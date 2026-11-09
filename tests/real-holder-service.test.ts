import test from 'node:test';import assert from 'node:assert/strict';
import {createInvestigationService} from '../src/lib/investigation-service';
import type {Report} from '../src/lib/analysis';
import type {TransferWindowResult} from '../src/lib/transfer-window';

const at='2026-11-09T01:00:00Z',now=Date.parse(at),token='0x'+'1'.repeat(40),whale='0x'+'2'.repeat(40),exchange='0x'+'3'.repeat(40),recent='0x'+'9'.repeat(40);
const base:Report={chain:'ethereum',token,name:'Wrapped',symbol:'BIG',fetchedAt:at,market:null,holders:[{address:exchange,share:20,contract:true,locked:null,tag:'exchange'},{address:whale,share:5,contract:false,locked:null,tag:''}],holderCount:3000000,checks:[],sources:[{name:'GoPlus Security',status:'available',fetchedAt:at,detail:'Provider holders'}]};
const capped:TransferWindowResult={summary:{limit:150000,read:150000,total:9000000,status:'capped',anchorBlock:100,newestBlock:100,oldestBlock:40,updatedAt:at,detail:'Token too large for a full crawl.'},candidates:[recent]};

test('large EVM tokens verify real holders even when the provider returned holders, using window candidates',async()=>{
 let options:{candidateAddresses?:string[];windowCandidates?:string[]}|undefined,providerTagKept=false;
 const service=createInvestigationService({now:()=>now,publicScan:async()=>structuredClone(base),makeClient:()=>({configured:false,request:async()=>null}),
  transferWindow:async()=>capped,
  evmHolders:async(_r,o)=>{options=o;return {trades:[],transfers:[],identities:[],labels:[],sources:[],reasons:[],truncated:true,holders:[{address:exchange,balance:200,share:20},{address:whale,balance:50,share:5},{address:recent,balance:10,share:1}],totalSupply:1000,snapshot:{chain:'ethereum',finality:'finalized',blockNumber:100,blockHash:'0x'+'a'.repeat(64),blockTimestamp:at,observedAt:at,decimals:0,totalSupplyRaw:'1000',balances:[{address:exchange,status:'observed',amountRaw:'200'},{address:whale,status:'observed',amountRaw:'50'},{address:recent,status:'observed',amountRaw:'10'}],candidateCount:3,holderEnumeration:{kind:'real-holder-prefix',recordedAccounts:3,verifiedAccounts:3,complete:false,candidates:3,windowCandidates:1,unread:0,ranked:{rawLimit:3,addresses:[exchange,whale,recent],verified:true},accountKinds:{[exchange]:'contract',[whale]:'eoa',[recent]:'eoa'}}}};}});
 const r=await service.scan('ethereum',token,{mode:'deep'});
 assert.ok(options,'the RPC real-holder check ran although provider holders existed');
 assert.deepEqual(options!.windowCandidates,[recent]);
 assert.equal(r.investigation.coverage.transferWindow?.status,'capped');
 assert.equal(r.holderEnumeration?.kind,'real-holder-prefix');
 providerTagKept=r.holders.some(h=>h.address===exchange&&h.tag==='exchange');assert.ok(providerTagKept,'provider exchange tag survives the RPC replacement');
 assert.ok(r.holders.some(h=>h.address===recent),'window-nominated real holder is included');
});
