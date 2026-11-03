import {createInvestigationService} from '../src/lib/investigation-service';
import {buildScoringInputs} from '../src/lib/scoring-inputs';
import {analyzeInvestigation} from '../src/lib/investigation';
import test from 'node:test';import assert from 'node:assert/strict';
import mei from './fixtures/four-meme-meimei.json';import giga from './fixtures/four-meme-gigacall.json';
import {readFourMemeHistory,FOUR_MEME_MANAGER} from '../src/lib/four-meme-history';
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function setup(data=mei,options:{gap?:boolean;failedReceipt?:boolean;reorg?:boolean}={}){
 const receipts=structuredClone(data.receipts),blocks=structuredClone(data.blocks),last=blocks.at(-1)!,height=parseInt(last.number,16)+512,time=parseInt(last.timestamp,16)+240,hash='0x'+'f'.repeat(64),anchor={number:height,hash,timestamp:time};
 const block=(n:string)=>blocks.find(b=>b.number.toLowerCase()===n.toLowerCase())||{number:n,hash,timestamp:'0x'+(parseInt(last.timestamp,16)+120).toString(16)};
 const batch=async(calls:{method:string;params:unknown[]}[]):Promise<unknown[]>=>calls.map(({method,params})=>{
 if(method==='eth_getTransactionReceipt')return options.failedReceipt?undefined:receipts.find(r=>r.transactionHash===params[0]);
 if(method==='eth_getBlockByNumber')return block(params[0] as string);
 if(method==='eth_getCode')return blocks.some(b=>b.number===params[1])?'0x6001':'0x';
 if(method==='eth_getLogs'){if(options.gap)return undefined;const f=params[0] as {fromBlock:string;toBlock:string};return receipts.flatMap(r=>r.logs).filter(l=>l.address.toLowerCase()===FOUR_MEME_MANAGER&&parseInt(l.blockNumber,16)>=parseInt(f.fromBlock,16)&&parseInt(l.blockNumber,16)<=parseInt(f.toBlock,16));}return undefined;});
 const candidateLogs=receipts.flatMap(r=>r.logs).filter(l=>l.address.toLowerCase()===data.token&&l.topics[0]===transfer);
 return {token:data.token,decimals:18,anchor,candidateLogs,batch,observedAt:new Date((time+60)*1000).toISOString()};
}
test('canonical manager receipts resolve direct and exact routed buyers with distinct curve timing',async()=>{const r=await readFourMemeHistory(setup());assert.equal(r.trades.length,2);assert.deepEqual(r.trades.map(t=>t.wallet).sort(),['0x662055e3e1d5171c922653f632ec08450607d86d','0x964a7f99bb4276138e7e0cbc068fcb411ca72757']);assert.equal(r.identities[0]?.address,'0x09beb6c47a7893a37f073be837a0303f173a4bba');assert.equal(r.proof?.scope,'selected-launchpad');assert.equal(r.proof?.eligibleTradeIds.length,2);assert.equal(r.proof?.firstPurchaseAt,'2026-11-03T13:41:48.000Z');});
test('timing starts at earliest verified purchase, not creation139seconds earlier',async()=>{const r=await readFourMemeHistory(setup(giga));assert.equal(r.proof?.firstPurchaseAt,'2026-11-03T13:21:11.000Z');assert.equal(r.proof?.eligibleTradeIds.length,2);});
test('missing contiguous range retains canonical observed buys but withholds timing classification',async()=>{const r=await readFourMemeHistory(setup(mei,{gap:true}));assert.equal(r.trades.length,2);assert.equal(r.identities.length,1);assert.equal(r.proof,undefined);assert.match(r.reasons.join(' '),/window|coverage/i);});
test('missing receipts and unproven routing never create buyer roles',async()=>{const r=await readFourMemeHistory(setup(mei,{failedReceipt:true}));assert.equal(r.trades.length,0);assert.equal(r.proof,undefined);const changed=structuredClone(mei);const routed=changed.receipts.find(r=>r.from==='0x964a7f99bb4276138e7e0cbc068fcb411ca72757')!;routed.logs=routed.logs.filter(l=>!(l.topics[0]===transfer&&l.topics[2]?.endsWith(routed.from.slice(2))));const x=await readFourMemeHistory(setup(changed));assert(!x.trades.some(t=>t.wallet===routed.from));assert.equal(x.proof,undefined);});

test('launchpad proof gives receipt-backed roles without claiming pool or token-wide launch',async()=>{const setupInput=setup(),r=await readFourMemeHistory(setupInput);const input={chain:'bsc' as const,token:mei.token,holders:r.trades.map(t=>({address:t.wallet,share:1})),trades:r.trades,transfers:[],identities:r.identities,labels:[],curveTiming:r.proof,launchVerified:false,complete:false,reasons:r.reasons,fetchedAt:setupInput.observedAt,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:true};const result=analyzeInvestigation(input);assert.equal(result.wallets.filter(w=>w.categories.includes('sniper')).length,2);assert.equal(result.coverage.launchVerified,false);assert.equal(result.coverage.poolTiming,undefined);assert.equal(result.coverage.curveTiming?.scope,'selected-launchpad');assert.match(result.findings.find(f=>f.id==='snipers')!.description,/selected launchpad/);const wrong=analyzeInvestigation({...input,curveTiming:{...r.proof!,token:'0x'+'a'.repeat(40)}});assert(!wrong.wallets.some(w=>w.categories.includes('sniper')));});
test('a provider window omitting an already verified purchase is not accepted as complete',async()=>{const x=setup(),original=x.batch;x.batch=async calls=>{const rows=await original(calls);return rows.map((v,i)=>calls[i].method==='eth_getLogs'?(v as any[]).filter(l=>l.transactionHash!==mei.receipts[1].transactionHash):v);};const r=await readFourMemeHistory(x);assert.equal(r.trades.length,2);assert.equal(r.proof,undefined);});
test('changed canonical headers invalidate trade records as well as timing proof',async()=>{const x=setup(),original=x.batch;let rechecked=false;x.batch=async calls=>{const rows=await original(calls);if(calls.length===2&&calls.every(c=>c.method==='eth_getBlockByNumber')){rechecked=true;return rows.map(v=>({...v as Record<string,unknown>,hash:'0x'+'0'.repeat(64)}));}return rows;};const r=await readFourMemeHistory(x);assert(rechecked);assert.equal(r.proof,undefined);assert.equal(r.trades.length,0);});

test('canonical curve proof survives service assembly and contributes current-holder sniper exposure',async()=>{
 const x=setup(),r=await readFourMemeHistory(x),at=x.observedAt,holderRows=r.trades.map(t=>({address:t.wallet,share:1}));
 const service=createInvestigationService({now:()=>Date.parse(at),publicScan:async()=>({chain:'bsc',token:mei.token,name:'Mei',symbol:'Mei',fetchedAt:at,market:{chainId:'bsc',pairAddress:mei.token+':4meme',baseToken:{address:mei.token}},holders:[{address:FOUR_MEME_MANAGER,share:100,contract:true,locked:null,tag:''}],holderCount:1,totalSupply:100,checks:[],sources:[]}),makeClient:()=>({configured:false,request:async()=>null}),bscHolders:async()=>({holders:[{address:FOUR_MEME_MANAGER,share:98},...holderRows],trades:r.trades,identities:r.identities,transfers:[],labels:[{address:FOUR_MEME_MANAGER,category:'pool',label:'Verified shared custody',source:'BSC RPC Four.Meme custody verification',timestamp:at}],sources:[{name:'BSC RPC finalized holder balances',status:'available',detail:'same block',fetchedAt:at},{name:'BSC RPC Four.Meme curve receipts',status:'available',detail:'verified receipt window',fetchedAt:at},{name:'BSC RPC Four.Meme custody verification',status:'available',detail:'verified',fetchedAt:at}],reasons:r.reasons,truncated:true,curveTiming:r.proof,snapshot:{block:10,blockHash:'0x'+'a'.repeat(64),blockTimestamp:at,decimals:0,totalSupplyRaw:'100',balances:[{address:FOUR_MEME_MANAGER,amountRaw:'98'},...holderRows.map(h=>({address:h.address,amountRaw:'1'}))]}})});
 const report=await service.scan('bsc',mei.token);assert.equal(report.investigation.wallets.filter(w=>w.categories.includes('sniper')).length,2);assert.equal(report.investigation.coverage.curveTiming?.scope,'selected-launchpad');assert(report.identities?.some(i=>i.role==='creator'&&i.transaction));const factor=buildScoringInputs(report).find(f=>f.id==='snipers')!;assert.equal(factor.lower,1);assert.equal(factor.upper,1);assert.equal(report.investigation.coverage.launchVerified,false);
});

test('first-minute end must be finalized',async()=>{const early=setup();early.anchor.timestamp=parseInt(mei.blocks[1].timestamp,16)+30;assert.equal((await readFourMemeHistory(early)).proof,undefined);});
test('bounded manager log splitting can complete coverage without ignoring a rejected range',async()=>{const x=setup(),original=x.batch;let failures=0;x.batch=async calls=>{if(calls.some(c=>c.method==='eth_getLogs'&&parseInt((c.params[0] as any).toBlock,16)-parseInt((c.params[0] as any).fromBlock,16)>200)){failures++;return calls.map(()=>undefined);}return original(calls);};const r=await readFourMemeHistory(x);assert(failures>0);assert.equal(r.proof?.eligibleTradeIds.length,2);});

test('newly loaded receipts cannot hide a second canonical target event omitted from the indexed window',async()=>{
 for(const sameToken of [true,false]){
  const data=structuredClone(mei),extra=structuredClone(data.receipts[2]),hash='0x'+'c'.repeat(64);extra.transactionHash=hash;for(const l of extra.logs)l.transactionHash=hash;
  const purchase=extra.logs.find(l=>l.address.toLowerCase()===FOUR_MEME_MANAGER&&l.logIndex==='0xa2')!;const omitted={...purchase,logIndex:'0x4a2'};
  if(!sameToken)omitted.data='0x'+'0'.repeat(24)+'a'.repeat(40)+omitted.data.slice(66);
  extra.logs.push(omitted);data.receipts.push(extra);const x=setup(data);x.candidateLogs=x.candidateLogs.filter(l=>l.transactionHash!==hash);const original=x.batch;
  x.batch=async calls=>(await original(calls)).map((v,i)=>calls[i].method==='eth_getLogs'?(v as any[]).filter(l=>!(l.transactionHash===hash&&l.logIndex==='0x4a2')):v);
  const r=await readFourMemeHistory(x);if(sameToken){assert.equal(r.proof,undefined);assert(r.trades.length>=2);}else assert(r.proof);
 }
});

test('archive code access is not required for canonical selected-launchpad timing',async()=>{
 const x=setup(),original=x.batch;let archiveCalls=0;x.batch=async calls=>{if(calls.some(c=>c.method==='eth_getCode')){archiveCalls++;throw new Error('HTTP 403 archive access requires personal token');}return original(calls);};
 const r=await readFourMemeHistory(x);assert.equal(r.proof?.scope,'selected-launchpad');assert.equal(r.proof?.eligibleTradeIds.length,2);assert.equal(archiveCalls,0);assert(!r.reasons.some(s=>/code transition verified/i.test(s)));
});
test('missing or forged canonical creation and mismatched mint cannot establish launchpad timing',async()=>{
 for(const mode of ['missing','forged','mint-missing','mint-mismatch','mint-after']){
  const data=structuredClone(mei),r=data.receipts[0],create=r.logs.find(l=>l.address.toLowerCase()===FOUR_MEME_MANAGER)!,mint=r.logs.find(l=>l.topics[0]===transfer&&l.topics[1]==='0x'+'0'.repeat(64))!;
  if(mode==='missing')r.logs=r.logs.filter(l=>l!==create);
  if(mode==='forged')create.address='0x'+'a'.repeat(40);
  if(mode==='mint-missing')r.logs=r.logs.filter(l=>l!==mint);
  if(mode==='mint-mismatch')mint.data='0x'+'0'.repeat(63)+'1';
  if(mode==='mint-after')mint.logIndex='0x1ff';
  const result=await readFourMemeHistory(setup(data));assert.equal(result.proof,undefined,mode);assert.equal(result.identities.length,0,mode);
 }
});
test('same-block purchases must follow the canonical creation log',async()=>{
 const data=structuredClone(mei),creation=data.receipts[0],buy=data.receipts[1];buy.blockNumber=creation.blockNumber;buy.blockHash=creation.blockHash;for(const l of buy.logs){l.blockNumber=creation.blockNumber;l.blockHash=creation.blockHash;}
 // Existing purchase index0x38 is earlier than canonical TokenCreate index0x9f.
 assert.equal((await readFourMemeHistory(setup(data))).proof,undefined);
 for(const l of buy.logs)l.logIndex='0x'+(parseInt(l.logIndex,16)+0x200).toString(16);
 assert.equal((await readFourMemeHistory(setup(data))).proof?.scope,'selected-launchpad');
});
