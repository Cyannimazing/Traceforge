import {decodeAbiParameters,decodeEventLog,encodeAbiParameters,keccak256,parseAbi,parseAbiParameters,toEventSelector,toFunctionSelector} from 'viem';
import type {Chain} from './analysis';
import type {PublicHistoryResult} from './public-history';
import type {CurveTimingProof} from './investigation-types';
import {readFoboHistory,FOBO_HOOK,FOBO_POOL_MANAGER} from './fobo-history';

// Contract sources and deployment table: https://github.com/fobodotfun/contracts
// Verified factory ABI: https://sourcify.dev/server/v2/contract/4663/0xd7e538e98A208fD19e46bc549FF4710C33664e18?fields=abi
export const FOBO_FACTORY='0xd7e538e98a208fd19e46bc549ff4710c33664e18';
export const FOBO_VESTING='0x51d217ecf7c0e4ebf54258444b9617d012fd7d0a';
export {FOBO_HOOK,FOBO_POOL_MANAGER};
/** First factory log (deployment ownership event) observed on Robinhood Chain 4663. */
export const FOBO_FACTORY_START_BLOCK=98531915;
export const FOBO_LAUNCH_SOURCE='FOBO factory launch record';
export const FOBO_TOTAL_SUPPLY=1_000_000_000n*10n**18n;
const ROBINHOOD_PUBLIC_RPC='https://rpc.mainnet.chain.robinhood.com/';
const WINDOW=10_000_000,MAX_WINDOWS=24;
const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const launchAbi=parseAbi(['event TokenLaunched(address indexed token,bytes32 indexed poolId,address indexed creator,address quote,int24 tickStart,uint256 devBuyTokens,string name,string ticker,string metadataURI)']);
const LAUNCHED=toEventSelector(launchAbi[0]);
const sel={hook:toFunctionSelector('hook()'),factory:toFunctionSelector('factory()'),pools:toFunctionSelector('pools(bytes32)'),keyFor:toFunctionSelector('keyFor(address,address)'),totalSupply:'0x18160ddd',decimals:'0x313ce567'};
const poolsAbi=parseAbiParameters('address,address,uint40,int24,int24,int24,uint64,uint64,uint128,uint128,uint8,uint128,uint256,uint256,uint256');
const keyAbi=parseAbiParameters('(address,address,uint24,int24,address)');
const zero='0x'+'0'.repeat(40);
const A=/^0x[0-9a-f]{40}$/i,H=/^0x[0-9a-f]{64}$/i;
const address=(v:unknown):v is `0x${string}`=>typeof v==='string'&&A.test(v)&&v.toLowerCase()!==zero;
const uint=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{1,64}$/i.test(v)?BigInt(v):null;
const hash=(v:unknown):v is string=>typeof v==='string'&&H.test(v);
const bytecode=(v:unknown)=>typeof v==='string'&&v.length>2&&v.length<=200002&&/^0x(?:[0-9a-f]{2})+$/i.test(v);
const word=(v:string)=>'0x'+'0'.repeat(24)+v.slice(2).toLowerCase();
const pad=(v:string)=>v.slice(2).toLowerCase().padStart(64,'0');
const hex=(n:bigint|number)=>'0x'+n.toString(16);
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
type Header={number:string;hash:string;timestamp:string};
export type FoboLaunchSnapshot={basis:'safe';blockNumber:string;blockHash:string;blockTimestamp:string;factory:string;hook:string;poolId:string;quote:string;creator:string;currentCreator:string|null;devBuyTokensRaw:string;decimals:number;launch:{transaction:string;blockNumber:number;blockHash:string;timestamp:string;transactionIndex:number}};
export type FoboLaunchRecordResult=PublicHistoryResult&{snapshot?:FoboLaunchSnapshot;curveTiming?:CurveTimingProof};
export type FoboLaunchOptions={signal?:AbortSignal;validationTime?:number;history?:boolean};

/** Binds a Robinhood token to the canonical FOBO factory TokenLaunched event,
 * its successful receipt and exact supply mint, and the hook's pool record at a
 * safe block. Optionally verifies the first sixty seconds of pool buys. No human
 * ownership, liquidity safety or favorable verdict is inferred. */
/** `rpcUrl` serves state, receipts and headers; `logRpcUrl` serves bounded
 * eth_getLogs ranges (some indexed providers restrict log spans). Both must
 * agree on the network and the safe block hash. */
export function createFoboLaunchRecord(deps:{fetcher?:typeof fetch;rpcUrl?:string;logRpcUrl?:string;now?:()=>number;timeoutMs?:number}={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,url=deps.rpcUrl||ROBINHOOD_PUBLIC_RPC,logUrl=deps.logRpcUrl||url;
 return async(chain:Chain,inputToken:string,options:FoboLaunchOptions={}):Promise<FoboLaunchRecordResult>=>{
  options.signal?.throwIfAborted();
  const result:FoboLaunchRecordResult={trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false};
  if(chain!=='robinhood'||!address(inputToken))return result;
  const token=inputToken.toLowerCase(),observed=now(),fetchedAt=new Date(observed).toISOString();
  const reference=typeof options.validationTime==='number'&&Number.isFinite(options.validationTime)&&options.validationTime>0&&options.validationTime<=8.64e15?options.validationTime:observed;
  const timeout=AbortSignal.timeout(Math.max(1,Math.min(25_000,deps.timeoutMs??25_000))),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
  let id=0;
  const fail=(detail:string)=>{result.reasons.push(detail);result.sources.push({name:FOBO_LAUNCH_SOURCE,status:'unavailable',detail,fetchedAt});return result;};
  const absent=(detail:string)=>{result.reasons.push(detail);return result;};
  async function batch(calls:{method:string;params:unknown[]}[],endpoint=url):Promise<unknown[]>{
   signal.throwIfAborted();
   const request=calls.map(c=>({jsonrpc:'2.0',id:++id,...c}));
   return await new Promise<unknown[]>((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void(async()=>{signal.throwIfAborted();const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal,cache:'no-store'});
     if(!response.ok)throw Error('transport');const text=await response.text();if(text.length>8_000_000)throw Error('response-size');const data:unknown=JSON.parse(text);
     if(!Array.isArray(data)||data.length!==request.length)throw Error('batch-shape');
     const ids=new Set<number>();for(const entry of data){if(!entry||entry.jsonrpc!=='2.0'||typeof entry.id!=='number'||ids.has(entry.id)||!request.some(q=>q.id===entry.id)||entry.error||!Object.hasOwn(entry,'result'))throw Error('batch-error');ids.add(entry.id);}
     return request.map(q=>data.find(v=>v.id===q.id).result);
    })().then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   });
  }
  try{
   const [network,rawHeader]=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:['safe',false]}]);
   if(uint(network)!==4663n)return fail('FOBO launch identity was not retained: RPC network did not match Robinhood Chain 4663.');
   const h=rawHeader as Partial<Header>|null,bn=uint(h?.number),ts=uint(h?.timestamp);
   if(!h||bn===null||ts===null||!hash(h.hash)||ts>BigInt(Math.floor(reference/1000)+120)||ts<BigInt(Math.floor(reference/1000)-3600))return fail('FOBO launch identity was not retained: a recent safe block anchor was unavailable.');
   const safe=Number(bn),blockNumber=hex(bn),blockHash=h.hash.toLowerCase(),blockTimestamp=new Date(Number(ts)*1000).toISOString();
   if(safe<FOBO_FACTORY_START_BLOCK)return absent('FOBO factory history is not within the safe block range.');
   const windows:[number,number][]=[];for(let from=FOBO_FACTORY_START_BLOCK;from<=safe;from+=WINDOW)windows.push([from,Math.min(safe,from+WINDOW-1)]);
   if(windows.length>MAX_WINDOWS)return fail('FOBO factory log windows exceeded their bound; no identity was retained.');
   const logValues=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:[blockNumber,false]},...windows.map(([from,to])=>({method:'eth_getLogs',params:[{address:FOBO_FACTORY,topics:[LAUNCHED,'0x'+pad(token)],fromBlock:hex(from),toBlock:hex(to)}]}))],logUrl);
   const logHeader=obj(logValues[1]);
   if(uint(logValues[0])!==4663n||uint(logHeader.number)!==bn||String(logHeader.hash).toLowerCase()!==blockHash)return fail('FOBO log provider did not match the safe block anchor; no identity was retained.');
   const values=[...logValues.slice(2),...await batch([
    {method:'eth_getCode',params:[FOBO_FACTORY,blockNumber]},
    {method:'eth_getCode',params:[FOBO_HOOK,blockNumber]},
    {method:'eth_call',params:[{to:FOBO_FACTORY,data:sel.hook},blockNumber]},
    {method:'eth_call',params:[{to:FOBO_HOOK,data:sel.factory},blockNumber]},
    {method:'eth_call',params:[{to:token,data:sel.totalSupply},blockNumber]},
    {method:'eth_call',params:[{to:token,data:sel.decimals},blockNumber]},
   ])];
   const logRows=values.slice(0,windows.length),[factoryCode,hookCode,factoryHook,hookFactory,supplyWord,decimalsWord]=values.slice(windows.length);
   if(logRows.some(rows=>!Array.isArray(rows)))return fail('FOBO factory log coverage was incomplete; no identity was retained.');
   const launches=(logRows as unknown[][]).flat().map(obj);
   if(!launches.length)return absent('No canonical FOBO TokenLaunched event was found for this token.');
   if(!bytecode(factoryCode)||!bytecode(hookCode)||factoryHook!==word(FOBO_HOOK)||hookFactory!==word(FOBO_FACTORY))return fail('FOBO factory and hook binding could not be verified at the safe block.');
   if(launches.length!==1)return fail('More than one FOBO launch event matched this token; no identity was retained.');
   const log=launches[0],logBlock=uint(log.blockNumber),logIndex=uint(log.logIndex),txIndex=uint(log.transactionIndex);
   if(String(log.address).toLowerCase()!==FOBO_FACTORY||log.removed!==false||!hash(log.transactionHash)||!hash(log.blockHash)||logBlock===null||logIndex===null||txIndex===null||logBlock<BigInt(FOBO_FACTORY_START_BLOCK)||logBlock>bn||!Array.isArray(log.topics)||log.topics.length!==4)return fail('The FOBO launch event was malformed.');
   const event=decodeEventLog({abi:launchAbi,data:log.data,topics:log.topics as [`0x${string}`,...`0x${string}`[]],strict:true}).args;
   const poolId=String(event.poolId).toLowerCase(),creator=event.creator.toLowerCase(),quote=event.quote.toLowerCase();
   if(event.token.toLowerCase()!==token||!address(creator)||!hash(poolId)||event.devBuyTokens>FOBO_TOTAL_SUPPLY)return fail('The FOBO launch event did not match this token.');
   const supply=uint(supplyWord),decimals=uint(decimalsWord);
   if(supply===null||supply>FOBO_TOTAL_SUPPLY||decimals!==18n)return fail('Token supply or decimals did not match the fixed FOBO launch supply.');
   const tx=String(log.transactionHash).toLowerCase(),launchBlock=hex(logBlock);
   const [rawReceipt,rawLaunchHeader,rawPool,rawKey]=await batch([
    {method:'eth_getTransactionReceipt',params:[tx]},
    {method:'eth_getBlockByNumber',params:[launchBlock,false]},
    {method:'eth_call',params:[{to:FOBO_HOOK,data:sel.pools+poolId.slice(2)},blockNumber]},
    {method:'eth_call',params:[{to:FOBO_HOOK,data:sel.keyFor+pad(quote)+pad(token)},blockNumber]},
   ]);
   const receipt=obj(rawReceipt),launchHeader=obj(rawLaunchHeader),launchTs=uint(launchHeader.timestamp);
   if(String(receipt.transactionHash).toLowerCase()!==tx||receipt.status!=='0x1'||String(receipt.blockHash).toLowerCase()!==String(log.blockHash).toLowerCase()||uint(receipt.blockNumber)!==logBlock||!Array.isArray(receipt.logs))return fail('The FOBO launch receipt was not a matching successful canonical receipt.');
   if(uint(launchHeader.number)!==logBlock||String(launchHeader.hash).toLowerCase()!==String(log.blockHash).toLowerCase()||launchTs===null)return fail('The FOBO launch block could not be matched to its canonical header.');
   const rows=(receipt.logs as unknown[]).map(obj);
   const inReceipt=rows.some(l=>String(l.address).toLowerCase()===FOBO_FACTORY&&uint(l.logIndex)===logIndex&&String(l.data).toLowerCase()===String(log.data).toLowerCase()&&Array.isArray(l.topics)&&l.topics.length===4&&l.topics.every((t:unknown,i:number)=>String(t).toLowerCase()===String(log.topics[i]).toLowerCase()));
   const mints=rows.filter(l=>String(l.address).toLowerCase()===token&&Array.isArray(l.topics)&&l.topics.length===3&&String(l.topics[0]).toLowerCase()===TRANSFER&&String(l.topics[1]).toLowerCase()==='0x'+'0'.repeat(64)&&uint(l.logIndex)!==null&&uint(l.logIndex)!<logIndex);
   if(!inReceipt||mints.length!==1||uint(mints[0].data)!==FOBO_TOTAL_SUPPLY||String(mints[0].topics[2]).toLowerCase()!==word(FOBO_FACTORY))return fail('The FOBO launch receipt did not contain the event and exact supply mint to the factory.');
   if(typeof rawPool!=='string'||!/^0x[0-9a-f]{960}$/i.test(rawPool)||typeof rawKey!=='string'||!/^0x[0-9a-f]{320}$/i.test(rawKey))return fail('FOBO hook pool records returned malformed ABI data.');
   const pool=decodeAbiParameters(poolsAbi,rawPool as `0x${string}`),[key]=decodeAbiParameters(keyAbi,rawKey as `0x${string}`);
   const keyHash=keccak256(encodeAbiParameters(keyAbi,[key])).toLowerCase();
   if(pool[0].toLowerCase()!==token||BigInt(pool[2])!==launchTs||key[4].toLowerCase()!==FOBO_HOOK||keyHash!==poolId||![key[0].toLowerCase(),key[1].toLowerCase()].includes(token)||![key[0].toLowerCase(),key[1].toLowerCase()].includes(quote))return fail('The FOBO hook pool record did not match the launch event.');
   const [recheck]=await batch([{method:'eth_getBlockByNumber',params:[blockNumber,false]}]),last=recheck as Partial<Header>|null;
   if(!last||uint(last.number)!==bn||String(last.hash).toLowerCase()!==blockHash)return fail('FOBO launch observation was discarded because the safe block anchor could not be reverified.');
   const launchTime=new Date(Number(launchTs)*1000).toISOString(),currentCreator=address(pool[1])?pool[1].toLowerCase():null;
   result.snapshot={basis:'safe',blockNumber,blockHash,blockTimestamp,factory:FOBO_FACTORY,hook:FOBO_HOOK,poolId,quote,creator,currentCreator,devBuyTokensRaw:event.devBuyTokens.toString(),decimals:18,launch:{transaction:tx,blockNumber:Number(logBlock),blockHash:String(log.blockHash).toLowerCase(),timestamp:launchTime,transactionIndex:Number(txIndex)}};
   result.identities.push({address:creator,role:'creator',source:FOBO_LAUNCH_SOURCE,timestamp:launchTime,transaction:tx,label:'FOBO TokenLaunched creator'});
   result.labels.push({address:FOBO_HOOK,category:'pool',label:'FOBO hook shared launchpad custody',source:FOBO_LAUNCH_SOURCE,timestamp:fetchedAt,timestampBasis:'local-observation'});
   result.labels.push({address:FOBO_VESTING,category:'contract',label:'FOBO shared vesting contract (token locks)',source:FOBO_LAUNCH_SOURCE,timestamp:fetchedAt,timestampBasis:'local-observation'});
   const creatorNote=currentCreator===creator?'The hook still records the same creator fee recipient.':currentCreator?`The hook now records a different creator fee recipient ${currentCreator}; the original launcher is kept separately.`:'The hook currently records no creator fee recipient; the original launcher is kept separately.';
   result.sources.push({name:FOBO_LAUNCH_SOURCE,status:'available',fetchedAt,detail:`Canonical FOBO factory TokenLaunched event in successful transaction ${tx} at block ${Number(logBlock)} (${launchTime}), with the exact 1,000,000,000 token mint to the factory in the same receipt. Hook pool ${poolId} and its pool key match at safe block ${blockNumber}, hash ${blockHash}. ${creatorNote} Dev buy ${event.devBuyTokens.toString()} raw units. No human ownership, liquidity safety or favorable verdict is established.`});
   if(options.history!==false){
    const history=await readFoboHistory({token,poolId,decimals:18,launch:{transaction:tx,blockNumber:Number(logBlock),blockHash:String(log.blockHash).toLowerCase(),transactionIndex:Number(txIndex)},anchor:{number:safe,hash:blockHash,timestamp:Number(ts)},observedAt:fetchedAt,batch:calls=>batch(calls),logBatch:calls=>batch(calls,logUrl),signal});
    result.trades=history.trades;result.reasons.push(...history.reasons);if(history.proof)result.curveTiming=history.proof;
   }
   return result;
  }catch{
   options.signal?.throwIfAborted();
   if(result.snapshot){result.reasons.push(signal.aborted?'FOBO first-minute verification exceeded its bounded deadline; no timing classification is established.':'FOBO first-minute verification was unavailable; no timing classification is established.');result.trades=[];delete result.curveTiming;return result;}
   return fail(signal.aborted?'FOBO launch record read exceeded its bounded deadline; no identity was retained.':'FOBO launch record verification was unavailable; no unverified identity was retained.');
  }
 };
}
