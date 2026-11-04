import mei from './fixtures/four-meme-meimei.json';
import test from 'node:test';import assert from 'node:assert/strict';
import {createBscHolderFallback} from '../src/lib/bsc-holder-fallback';
import type {Report} from '../src/lib/analysis';
const token='0x'+'1'.repeat(40),creator='0x'+'2'.repeat(40),other='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const word=(n:bigint)=>'0x'+n.toString(16).padStart(64,'0'),topic=(a:string)=>'0x'+a.slice(2).padStart(64,'0');
const report={chain:'bsc',token,holders:[],identities:[{address:creator,role:'creator'}]} as unknown as Report;
const log={address:token,removed:false,topics:[transfer,topic(creator),topic(other)],data:word(1n),transactionHash:hash,blockNumber:'0xff'};
function mock(options:{logs?:unknown;failBalance?:boolean;reorg?:boolean;chain?:string;timestamp?:string;otherBalance?:bigint}={}){const calls:any[]=[];let heads=0;const fetcher:typeof fetch=async(_,init)=>{const raw=JSON.parse(String(init?.body)),requests=Array.isArray(raw)?raw:[raw];const responses=requests.map((r:any)=>{calls.push(r);let result:unknown;if(r.method==='eth_chainId')result=options.chain||'0x38';else if(r.method==='eth_getBlockByNumber')result={number:'0x100',timestamp:options.timestamp||'0x6553f100',hash:options.reorg&&++heads>1?'0x'+'b'.repeat(64):hash};else if(r.method==='eth_getLogs')result=options.logs??[log,log];else if(r.params[0].data==='0x18160ddd')result=word(1000n*10n**18n);else if(r.params[0].data==='0x313ce567')result=word(18n);else if(r.params[0].data.endsWith(other.slice(2))&&options.failBalance)return {id:r.id,error:{code:-1}};else result=word((r.params[0].data.endsWith(creator.slice(2))?880n:(options.otherBalance??120n))*10n**18n);return {jsonrpc:'2.0',id:r.id,result};});return Response.json(Array.isArray(raw)?responses:responses[0]);};return {fetcher,calls,now:()=>1700000000000};}
test('recovers nonzero sampled BSC holders and preserves exact balances with one finalized anchor',async()=>{
 const m=mock(),r=await createBscHolderFallback(m)(report);assert.equal(r.holders?.length,2);assert.equal(r.holders?.[0].share,88);assert.equal(r.snapshot?.balances[0].amountRaw,'880000000000000000000');assert.equal(r.holderCount,null);assert.equal(r.truncated,true);assert.equal(r.trades.length,0);assert.equal(r.transfers.length,0);assert.equal(r.totalSupply,1000);assert.equal(m.calls.filter(c=>c.method==='eth_call'&&c.params[0].data.startsWith('0x70a08231')).length,2);assert.ok(m.calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x100'));
});
test('missing logs still verify known creator; failed balances do not become zero',async()=>{
 const failedLogs=await createBscHolderFallback(mock({logs:{error:'not available'}}))(report);assert.equal(failedLogs.holders?.length,1);assert.match(failedLogs.reasons.join(' '),/logs were unavailable/);
 const r=await createBscHolderFallback(mock({failBalance:true}))(report);assert.equal(r.holders?.length,1);assert.match(r.reasons.join(' '),/1 reads unavailable/);assert.equal(r.holderCount,null);
});
test('removed, wrong token and malformed candidate logs are ignored',async()=>{
 const logs=[{...log,removed:true},{...log,address:other},{...log,topics:[transfer,'bad',topic(other)]},{...log,blockNumber:'0x101'}];const r=await createBscHolderFallback(mock({logs}))(report);assert.equal(r.holders?.length,1);
 assert.match(r.reasons.join(' '),/4 invalid or removed rows/);
});
test('known dead holder is labeled but ordinary addresses are not excluded',async()=>{
 const dead='0x000000000000000000000000000000000000dead';const r=await createBscHolderFallback(mock({logs:[{...log,topics:[transfer,topic(creator),topic(dead)]}]}))(report);
 assert.equal(r.holders?.length,2);assert.deepEqual(r.labels.map(l=>[l.address,l.category]),[[dead,'burn']]);assert.equal(r.holders?.find(h=>h.address===creator)?.share,88);
});
test('inconsistent aggregate supply and stale or future finalized heads are rejected',async()=>{
 for(const options of [{otherBalance:121n},{otherBalance:1001n},{timestamp:'0x'+(1700000000-901).toString(16)},{timestamp:'0x'+(1700000000+121).toString(16)}]){
  const r=await createBscHolderFallback(mock(options))(report);assert.equal(r.holders?.length,0);assert.equal(r.snapshot,undefined);assert.equal(r.totalSupply,undefined);assert.equal(r.sources[0].status,'unavailable');
 }
});
test('wrong chain, changed finalized anchor and abort never leak unverified balances',async()=>{
 for(const options of [{chain:'0x1'},{reorg:true}]){const r=await createBscHolderFallback(mock(options))(report);assert.equal(r.holders?.length,0);assert.equal(r.snapshot,undefined);assert.equal(r.sources[0].status,'unavailable');}
 const signal=AbortSignal.abort();await assert.rejects(createBscHolderFallback(mock())(report,{signal}),{name:'AbortError'});
});


test('Four.Meme custody requires canonical helper membership plus current contract code; balances remain independently measured',async()=>{
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',helper='0xf251f83e40a78868fcfa3fa4599dad6494e46034';
 for(const valid of [true,false]){
  let emptyBatches=0;const base=mock(),fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body)),rows=Array.isArray(raw)?raw:[raw];if(!rows.length)emptyBatches++;if(rows.some((r:any)=>r.method==='eth_getCode'||r.params?.[0]?.to?.toLowerCase()===helper)){const out=rows.map((r:any)=>({id:r.id,jsonrpc:'2.0',result:r.method==='eth_getCode'?'0x6001':'0x'+[word(2n),topic(valid?manager:creator),word(0n),...Array(8).fill(word(0n)),word(0n)].map(w=>w.slice(2)).join('')}));return Response.json(Array.isArray(raw)?out:out[0]);}const response=await base.fetcher(url,init);const data=await response.json();const values=Array.isArray(data)?data:[data];for(let i=0;i<rows.length;i++){const d=rows[i].params?.[0]?.data;if(d?.startsWith('0x70a08231')&&(d.endsWith(manager.slice(2))||d.endsWith(creator.slice(2))))values[i].result=word((d.endsWith(manager.slice(2))?760n:120n)*10n**18n);}return Response.json(Array.isArray(data)?values:values[0]);};
  const r=await createBscHolderFallback({...base,fetcher})({...report,identities:[],holders:[{address:manager,share:100,contract:true,locked:null,tag:''}]});assert.equal(r.labels.some(l=>l.address===manager&&l.category==='pool'),valid);assert(r.holders?.some(h=>h.address===other));assert(r.holders?.some(h=>h.address===manager));assert.equal(r.holderCount,null);assert.equal(emptyBatches,0);
 }
});

test('rejected wide log windows narrow within a bounded budget and discover real recipients',async()=>{
 const base=mock();let attempts=0;const fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body));if(raw.method==='eth_getLogs'&&++attempts<3)return Response.json({id:raw.id,error:{code:-32005}});return base.fetcher(url,init);};const r=await createBscHolderFallback({...base,fetcher})(report);assert.equal(attempts,5);assert.equal(r.holders?.length,2);assert.match(r.reasons.join(' '),/narrow|reduced/i);assert.equal(r.truncated,true);
});


test('candidate discovery splits20000blocks into at most5000-block ranges with two workers',async()=>{
 const base=mock(),ranges:{from:number;to:number}[]=[];let active=0,peak=0;
 const fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body)),rows=Array.isArray(raw)?raw:[raw];
  if(rows.some((r:any)=>r.method==='eth_getBlockByNumber')){const response=await base.fetcher(url,init),data=await response.json();for(const row of Array.isArray(data)?data:[data])if(row.result?.number)row.result.number='0x4e20';return Response.json(data);}
  if(raw.method==='eth_getLogs'){const f=parseInt(raw.params[0].fromBlock,16),t=parseInt(raw.params[0].toBlock,16);ranges.push({from:f,to:t});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return Response.json({id:raw.id,result:f<=255&&t>=255?[log]:[]});}return base.fetcher(url,init);};
 const result=await createBscHolderFallback({...base,fetcher})(report);assert.equal(result.holders?.length,2);assert.equal(ranges.length,4);assert(ranges.every(r=>r.to-r.from+1<=5000));assert(peak<=2);assert.equal(ranges.reduce((n,r)=>n+r.to-r.from+1,0),20000);
});
test('one stalled discovery request is aborted and retried without consuming the global verification deadline',async()=>{
 const base=mock();let attempts=0,aborts=0;const fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body));if(raw.method==='eth_getLogs'&&++attempts===1)return new Promise((_,reject)=>{init!.signal!.addEventListener('abort',()=>{aborts++;reject(init!.signal!.reason);},{once:true});});return base.fetcher(url,init);};
 const result=await createBscHolderFallback({...base,fetcher,timeoutMs:1000,requestTimeoutMs:15})(report);assert.equal(aborts,1);assert.equal(attempts,2);assert.equal(result.holders?.length,2);assert(result.snapshot);
});

test('a failed discovery range is explicit unknown while other ranges and balances remain usable',async()=>{
 const base=mock();let failures=0;const fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body)),rows=Array.isArray(raw)?raw:[raw];if(rows.some((r:any)=>r.method==='eth_getBlockByNumber')){const response=await base.fetcher(url,init),data=await response.json();for(const row of Array.isArray(data)?data:[data])if(row.result?.number)row.result.number='0x4e20';return Response.json(data);}if(raw.method==='eth_getLogs'){const from=parseInt(raw.params[0].fromBlock,16),to=parseInt(raw.params[0].toBlock,16);if(from===10001){failures++;return Response.json({error:'temporary upstream failure'},{status:503});}return Response.json({id:raw.id,result:from<=255&&to>=255?[log]:[]});}return base.fetcher(url,init);};const r=await createBscHolderFallback({...base,fetcher})(report);assert.equal(failures,2);assert.equal(r.holders?.length,2);assert(r.snapshot);assert.match(r.reasons.join(' '),/10001-15000/);assert.match(r.reasons.join(' '),/unknown, not empty or complete/);
});

test('explicit archive access rejection is not retried or treated as empty history',async()=>{const base=mock();let attempts=0;const fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body));if(raw.method==='eth_getLogs'){attempts++;return Response.json({id:raw.id,error:{code:-32602,message:'Archive requests require a personal token'}});}return base.fetcher(url,init);};const r=await createBscHolderFallback({...base,fetcher})(report);assert.equal(attempts,1);assert.match(r.reasons.join(' '),/unknown, not empty or complete/);assert.equal(r.holders?.length,1);assert.equal(r.holderCount,null);});


test('known address seeds are reread at the anchor when discovery fails; zero is not retained',async()=>{
 for(const balance of [120n,0n]){const m=mock({logs:{error:'unavailable'},otherBalance:balance});const r=await createBscHolderFallback(m)(report,{candidateAddresses:[other,other.toUpperCase(),'invalid']} as any);assert(m.calls.some(c=>c.method==='eth_call'&&c.params[0].data==='0x70a08231'+other.slice(2).padStart(64,'0')));assert.equal(r.holders?.find(h=>h.address===other)?.share,balance?12:undefined);assert(m.calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x100'));}
});


function coldCurveMock(options:{zero?:boolean;fail?:boolean;reorg?:boolean;old?:boolean;zeroLaunchTime?:boolean}={}){
 const manager='0x5c952063c7fc8610ffdb798152d69f0b9550762b',buyer='0x662055e3e1d5171c922653f632ec08450607d86d',sold='0x964a7f99bb4276138e7e0cbc068fcb411ca72757',height=parseInt(mei.blocks.at(-1)!.number,16)+(options.old?40000:512),anchor='0x'+height.toString(16),time=parseInt(mei.blocks.at(-1)!.timestamp,16)+(options.old?18000:240);let anchorReads=0;const calls:any[]=[];
 const fetcher:typeof fetch=async(_,init)=>{const raw=JSON.parse(String(init?.body)),requests=Array.isArray(raw)?raw:[raw],out=requests.map((r:any)=>{calls.push(r);let value:any;const p=r.params,creation=mei.receipts[0];
  if(r.method==='eth_chainId')value='0x38';
  if(r.method==='eth_getBlockByNumber'){if(p[0]==='finalized'||p[0]===anchor){anchorReads++;value={number:anchor,hash:options.reorg&&anchorReads>=3?'0x'+'e'.repeat(64):hash,timestamp:'0x'+time.toString(16)};}else value=mei.blocks.find(b=>b.number===p[0])||{number:p[0],hash,timestamp:'0x'+(options.old?Math.floor(time-(height-parseInt(p[0],16))*.45):time-120).toString(16)};}
  if(r.method==='eth_getLogs'){const f=p[0],rows=f.address===manager?mei.receipts.flatMap(r=>r.logs).filter(l=>l.address.toLowerCase()===manager&&f.topics[0].includes(l.topics[0])):[...creation.logs,...mei.receipts[2].logs].filter(l=>l.address.toLowerCase()===mei.token&&l.topics[0]===transfer);value=rows.filter(l=>parseInt(l.blockNumber,16)>=parseInt(f.fromBlock,16)&&parseInt(l.blockNumber,16)<=parseInt(f.toBlock,16));}
  if(r.method==='eth_getTransactionReceipt')value=mei.receipts.find(r=>r.transactionHash===p[0]);
  if(r.method==='eth_getCode')value='0x6001';
  if(r.method==='eth_call'){const data=p[0].data;if(data==='0x18160ddd')value=word(1000n*10n**18n);else if(data==='0x313ce567')value=word(18n);else if(data.startsWith('0x70a08231')){const address='0x'+data.slice(-40);if(options.fail&&address===buyer)return {id:r.id,error:{code:-32000}};value=word((address===manager?(options.zero?1000n:990n):address===buyer&&!options.zero?10n:0n)*10n**18n);}else{const fields=[word(2n),topic(manager),word(0n),...Array(9).fill(word(0n))];if(options.old&&!options.zeroLaunchTime)fields[6]=word(BigInt(mei.blocks[0].timestamp));value='0x'+fields.map(w=>w.slice(2)).join('');}}
  return {jsonrpc:'2.0',id:r.id,result:value};});return Response.json(Array.isArray(raw)?out:out[0]);};
 return {fetcher,now:()=>time*1000,report:{...report,token:mei.token,identities:[],holders:[{address:manager,share:99,contract:null,locked:null,tag:''}]},buyer,sold,anchor,calls};
}
test('cold scan rereads canonical buyers discovered after the initial candidate balance snapshot',async()=>{
 const m=coldCurveMock(),r=await createBscHolderFallback(m)(m.report);assert(r.curveTiming);assert.equal(r.holders?.find(h=>h.address===m.buyer)?.share,1);assert(!r.holders?.some(h=>h.address===m.sold));assert(r.snapshot?.balances.some(b=>b.address===m.buyer&&b.amountRaw==='10000000000000000000'));assert.equal(r.snapshot?.blockTimestamp,new Date(m.now()).toISOString());assert(m.calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]===m.anchor));assert.match(r.sources.find(s=>s.name==='BSC RPC finalized holder balances')!.detail,/2 positive balances verified/);
});

test('archive receipt access failures retain verified balances and expose a safe actionable history reason',async()=>{
 const m=coldCurveMock();let denied=0;
 const fetcher:typeof fetch=async(url,init)=>{
  const raw=JSON.parse(String(init?.body)),rows=Array.isArray(raw)?raw:[raw];
  if(!rows.some((r:any)=>r.method==='eth_getTransactionReceipt'))return m.fetcher(url,init);
  const response=await m.fetcher(url,init),data=await response.json(),values=Array.isArray(data)?data:[data];
  for(let i=0;i<rows.length;i++)if(rows[i].method==='eth_getTransactionReceipt'){denied++;values[i]={id:rows[i].id,jsonrpc:'2.0',error:{code:-32602,message:'Archive requests require a personal token. Secret endpoint https://rpc.invalid/private?token=do-not-expose'}};}
  return Response.json(Array.isArray(raw)?values:values[0]);
 };
 const r=await createBscHolderFallback({...m,fetcher})(m.report);
 assert(denied>0);assert(r.snapshot);assert(r.holders!.length>0);assert.equal(r.curveTiming,undefined);
 assert.match(r.reasons.join(' '),/authorized archive.*BSC_RPC_URL/i);
 assert.match(r.sources.find(s=>s.name==='BSC RPC Four.Meme curve receipts')!.detail,/authorized archive/i);
 assert.doesNotMatch(JSON.stringify(r),/do-not-expose|rpc\.invalid|Secret endpoint/);
});
test('post-history zero balances stay absent, failed reads stay unknown, and changed anchors invalidate holders',async()=>{
 for(const mode of ['zero','fail','reorg'] as const){const m=coldCurveMock({[mode]:true}),r=await createBscHolderFallback(m)(m.report);assert(!r.holders?.some(h=>h.address===m.buyer));if(mode==='reorg'){assert.equal(r.snapshot,undefined);assert.equal(r.holders?.length,0);}else if(mode==='fail')assert.match(r.reasons.join(' '),/unavailable|unknown/i);}
});


test('post-history request failure preserves the verified snapshot and marks additional candidates unknown',async()=>{
 const m=coldCurveMock(),base=m.fetcher,fetcher:typeof fetch=async(url,init)=>{const raw=JSON.parse(String(init?.body)),rows=Array.isArray(raw)?raw:[raw];if(rows.some((r:any)=>r.method==='eth_call'&&r.params[0].data==='0x70a08231'+m.buyer.slice(2).padStart(64,'0')))throw new DOMException('Request deadline','TimeoutError');return base(url,init);};
 const r=await createBscHolderFallback({...m,fetcher})(m.report);assert(r.snapshot);assert.equal(r.holders?.length,1);assert(!r.snapshot.balances.some(b=>b.address===m.buyer));assert.match(r.reasons.join(' '),/Post-history balance verification.*unknown/);assert(r.curveTiming);
});

test('cold old launch is discovered from helper time within bounded queries and saved for restart',async()=>{
 const m=coldCurveMock({old:true});let saved:any=null;const proofStore={get:()=>saved,set:(p:any)=>{saved=p;},delete:()=>{saved=null;}};
 const first=await createBscHolderFallback({...m,proofStore})(m.report);assert(first.curveTiming);assert(saved);assert.equal(first.holders?.find(h=>h.address===m.buyer)?.share,1);assert(!first.holders?.some(h=>h.address===m.sold));
 const discovery=m.calls.filter(c=>c.method==='eth_getLogs'&&c.params[0].address===mei.token);assert.equal(discovery.length,5);assert(discovery.every(c=>parseInt(c.params[0].toBlock,16)-parseInt(c.params[0].fromBlock,16)<5000));
 const next=coldCurveMock({old:true,zero:true}),restored=await createBscHolderFallback({...next,proofStore})(next.report);assert(restored.curveTiming);assert(!restored.holders?.some(h=>h.address===m.buyer));assert.equal(next.calls.filter(c=>c.method==='eth_getLogs'&&c.params[0].address===mei.token).length,4);assert(next.calls.some(c=>c.method==='eth_getTransactionReceipt'));
});

test('zero helper launch time can use exact launchpad market time only as a receipt-discovery hint',async()=>{
 for(const valid of [true,false]){const m=coldCurveMock({old:true,zeroLaunchTime:true}),market={chainId:'bsc',dexId:'fourmeme',pairAddress:mei.token+':4meme',baseToken:{address:valid?mei.token:other},pairCreatedAt:parseInt(mei.blocks[0].timestamp,16)*1000};const r=await createBscHolderFallback(m)({...m.report,market});assert.equal(!!r.curveTiming,valid);if(valid){assert(r.holders?.some(h=>h.address===m.buyer));assert.match(r.reasons.join(' '),/discovery hint/i);}}
});
