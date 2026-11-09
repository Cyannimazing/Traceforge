import test from 'node:test';
import assert from 'node:assert/strict';
import {createFoboLaunchRecord,FOBO_FACTORY,FOBO_HOOK,FOBO_VESTING,FOBO_LAUNCH_SOURCE} from '../src/lib/fobo-launch-record';
import {rpc,token,creator,poolId,launchTx,launchReceipt,defaultReceipts,LAUNCH_BLOCK,SAFE_TIME,type ChainOptions} from './fobo-fixture';

type Call={id:number;method:string;params:unknown[]};
const STATE='https://state.example/',LOGS='https://logs.example/';
function mock(options:ChainOptions={}){
 const calls:{endpoint:string;method:string}[]=[],respond=rpc(options);
 const fetcher:typeof fetch=async(url,init)=>{const endpoint=String(url)===LOGS?'logs':'state',batch=JSON.parse(String(init?.body)) as Call[];
  return Response.json(batch.map(c=>{calls.push({endpoint,method:c.method});return {jsonrpc:'2.0',id:c.id,result:respond(c,endpoint)};}).reverse());};
 return {fetcher,calls,read:createFoboLaunchRecord({fetcher,rpcUrl:STATE,logRpcUrl:LOGS,now:()=>SAFE_TIME()})};
}

test('binds token to the canonical TokenLaunched event, receipt mint and hook pool record',async()=>{
 const m=mock(),r=await m.read('robinhood',token,{history:false});
 assert.equal(r.snapshot?.poolId,poolId);assert.equal(r.snapshot?.creator,creator);assert.equal(r.snapshot?.currentCreator,null);assert.equal(r.snapshot?.launch.blockNumber,LAUNCH_BLOCK);
 assert.deepEqual(r.identities.map(i=>[i.address,i.role,i.transaction,i.source]),[[creator,'creator',launchTx,FOBO_LAUNCH_SOURCE]]);
 assert.equal(r.labels.find(l=>l.address===FOBO_HOOK)?.category,'pool');assert.equal(r.labels.find(l=>l.address===FOBO_VESTING)?.category,'contract');
 assert.equal(r.sources[0]?.status,'available');assert.match(r.sources[0]!.detail,/original launcher is kept separately/);
 assert.equal(r.curveTiming,undefined);assert.equal(r.trades.length,0);
 // Bounded log spans go to the log endpoint; state, receipts and headers to the state endpoint.
 assert(m.calls.filter(c=>c.method==='eth_getLogs').every(c=>c.endpoint==='logs'));
 assert(m.calls.filter(c=>['eth_call','eth_getCode','eth_getTransactionReceipt'].includes(c.method)).every(c=>c.endpoint==='state'));
});

test('non-Robinhood and malformed tokens never request RPC',async()=>{
 const m=mock();for(const [chain,address] of [['base',token],['robinhood','bad'],['robinhood','0x'+'0'.repeat(40)]] as const){const r=await m.read(chain,address);assert.equal(r.identities.length,0);}assert.equal(m.calls.length,0);
});

test('tokens without a FOBO launch event report no identity and no failure source',async()=>{
 const r=await mock({receipts:defaultReceipts().slice(1)}).read('robinhood',token,{history:false});
 assert.equal(r.identities.length,0);assert.equal(r.sources.length,0);assert.match(r.reasons.join(' '),/No canonical FOBO TokenLaunched/);
});

test('mismatched supply mint, failed receipt, pool record, pool key, duplicate events or log provider fail closed',async()=>{
 const cases:ChainOptions[]=[
  {receipts:[launchReceipt({mint:1n}),...defaultReceipts().slice(1)]},
  {receiptOverride:h=>h===launchTx?{...launchReceipt(),status:'0x0'}:undefined},
  {poolToken:'0x'+'2'.repeat(40)},
  {keyHooks:'0x'+'3'.repeat(40)},
  {supply:10n**28n},
  {extraLaunchLog:true},
  {logSafeHash:'0x'+'f'.repeat(64)},
 ];
 for(const options of cases){const r=await mock(options).read('robinhood',token,{history:false});assert.equal(r.identities.length,0,JSON.stringify(Object.keys(options)));assert.equal(r.snapshot,undefined);assert.equal(r.sources[0]?.status,'unavailable');}
});

test('history option verifies the first minute through the same bound launch',async()=>{
 const r=await mock().read('robinhood',token);
 assert.equal(r.curveTiming?.protocol,'fobo-v1');assert.equal(r.curveTiming?.manager,FOBO_HOOK);assert.equal(r.curveTiming?.creation.transaction,launchTx);assert.equal(r.trades.length,5);
 assert.notEqual(FOBO_FACTORY,r.identities[0]?.address);
});
