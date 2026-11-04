import {decodeAbiParameters,encodeAbiParameters,parseAbiParameters} from 'viem';
import type {Chain} from './analysis';
import type {PublicHistoryResult} from './public-history';

// Official registry and ABI: https://docs.ponsfamily.com/v2#contracts
// Verified factory: https://sourcify.dev/server/v2/contract/4663/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?fields=abi,sources
export const PONS_FACTORY='0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e';
export const PONS_DEPLOYER='0x3711cea4feade896c913c68f01eda97cb06d1a42';
const source='Pons factory launch record';
const zero='0x'+'0'.repeat(40);
const address=(v:unknown):v is `0x${string}`=>typeof v==='string'&&/^0x[0-9a-f]{40}$/i.test(v)&&v.toLowerCase()!==zero;
const uint=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]{1,64}$/i.test(v)?BigInt(v):null;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^0x[0-9a-f]{64}$/i.test(v);
const bytecode=(v:unknown)=>typeof v==='string'&&v.length>2&&v.length<=200002&&/^0x(?:[0-9a-f]{2})+$/i.test(v);
const launchAbi=parseAbiParameters('address,address,address,address,address,uint256,uint24,int24,uint16,bool,uint8,uint256,uint256,uint256,bool');
const infoAbi=parseAbiParameters('address,string,string,(string,string,string,string,string)');
type Header={number:string;hash:string;timestamp:string};
export type PonsLaunchSnapshot={basis:'safe';blockNumber:string;blockHash:string;blockTimestamp:string;factory:string;curve:string;launcher:string;creatorFeeRecipient:string;phase:number;deployerContract:string};
export type PonsLaunchRecordResult=PublicHistoryResult&{snapshot?:PonsLaunchSnapshot};
export type PonsLaunchOptions={signal?:AbortSignal;validationTime?:number};

/** Reads observed state, not creation transactions or launch history. The factory
 * stores originalDeployer independently of the mutable creator fee recipient.
 * No tx.origin, beneficial-owner claim, or favorable risk verdict is inferred.
 */
export function createPonsLaunchRecord(deps:{fetcher?:typeof fetch;rpcUrl?:string;now?:()=>number;timeoutMs?:number}={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now,url=deps.rpcUrl||'https://rpc.mainnet.chain.robinhood.com/';
 return async(chain:Chain,inputToken:string,options:PonsLaunchOptions={}):Promise<PonsLaunchRecordResult>=>{
  options.signal?.throwIfAborted();
  const result:PonsLaunchRecordResult={trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false};
  if(chain!=='robinhood'||!address(inputToken))return result;
  const token=inputToken.toLowerCase(),observed=now(),fetchedAt=new Date(observed).toISOString();
  // Service may have corroborated its clock with current provider timestamps.
  // Use that reference only for block bounds; retrieval time stays local.
  const reference=typeof options.validationTime==='number'&&Number.isFinite(options.validationTime)&&options.validationTime>0&&options.validationTime<=8.64e15?options.validationTime:observed;
  const timeout=AbortSignal.timeout(Math.max(1,Math.min(8000,deps.timeoutMs??8000))),signal=options.signal?AbortSignal.any([timeout,options.signal]):timeout;
  let id=0,batches=0;
  const fail=(detail:string)=>{result.reasons.push(detail);result.sources.push({name:source,status:'unavailable',detail,fetchedAt});return result;};
  async function batch(calls:{method:string;params:unknown[]}[]):Promise<unknown[]>{
   signal.throwIfAborted();if(++batches>3)throw Error('budget');
   const request=calls.map(c=>({jsonrpc:'2.0',id:++id,...c}));
   // Bound even an injected fetch implementation that does not honor AbortSignal.
   return await new Promise<unknown[]>((resolve,reject)=>{
    const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
    void(async()=>{signal.throwIfAborted();const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal,cache:'no-store'});
     if(!response.ok)throw Error('transport');const text=await response.text();if(text.length>200000)throw Error('response-size');const data:unknown=JSON.parse(text);
     if(!Array.isArray(data)||data.length!==request.length)throw Error('batch-shape');
     const ids=new Set<number>();for(const entry of data){if(!entry||entry.jsonrpc!=='2.0'||typeof entry.id!=='number'||ids.has(entry.id)||!request.some(q=>q.id===entry.id)||entry.error||!Object.hasOwn(entry,'result'))throw Error('batch-error');ids.add(entry.id);}
     return request.map(q=>data.find(v=>v.id===q.id).result);
    })().then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   });
  }
  try{
   const [network,rawHeader]=await batch([{method:'eth_chainId',params:[]},{method:'eth_getBlockByNumber',params:['safe',false]}]);
   if(uint(network)!==4663n)return fail('Pons launch identity was not retained: RPC network did not match Robinhood Chain 4663.');
   const h=rawHeader as Partial<Header>|null,bn=uint(h?.number),ts=uint(h?.timestamp);
   if(!h||bn===null||ts===null||!hash(h.hash)||ts>BigInt(Math.floor(reference/1000)+120)||ts<BigInt(Math.floor(reference/1000)-3600))return fail('Pons launch identity was not retained: a recent safe block anchor was unavailable.');
   const blockNumber='0x'+bn.toString(16),blockHash=h.hash.toLowerCase(),blockTimestamp=new Date(Number(ts)*1000).toISOString();
   const [factoryCode,deployerCode,deployerFactory,rawLaunch,rawInfo]=await batch([
    {method:'eth_getCode',params:[PONS_FACTORY,blockNumber]},
    {method:'eth_getCode',params:[PONS_DEPLOYER,blockNumber]},
    {method:'eth_call',params:[{to:PONS_DEPLOYER,data:'0xc45a0155'},blockNumber]},
    {method:'eth_call',params:[{to:PONS_FACTORY,data:'0x3cf28b5a'+token.slice(2).padStart(64,'0')},blockNumber]},
    {method:'eth_call',params:[{to:token,data:'0xabb1dc44'},blockNumber]},
   ]);
   if(!bytecode(factoryCode)||!bytecode(deployerCode)||deployerFactory!=='0x'+'0'.repeat(24)+PONS_FACTORY.slice(2))return fail('Pons platform contract binding could not be verified at the safe block.');
   if(typeof rawLaunch!=='string'||!/^0x[0-9a-f]{960}$/i.test(rawLaunch)||typeof rawInfo!=='string'||rawInfo.length>65538||!/^0x(?:[0-9a-f]{2})+$/i.test(rawInfo))return fail('Pons launch record or token metadata returned malformed ABI data.');
   const launch=decodeAbiParameters(launchAbi,rawLaunch as `0x${string}`),info=decodeAbiParameters(infoAbi,rawInfo as `0x${string}`);
   if(encodeAbiParameters(launchAbi,launch).toLowerCase()!==rawLaunch.toLowerCase()||encodeAbiParameters(infoAbi,info).toLowerCase()!==rawInfo.toLowerCase())return fail('Pons ABI data was not canonical.');
   const [recordToken,curve,launcher,creatorFeeRecipient,,,,,,,phase,,,,exists]=launch;
   if(!exists||recordToken.toLowerCase()!==token||!address(curve)||!address(launcher)||phase>3||info[0].toLowerCase()!==launcher.toLowerCase())return fail('No matching, corroborated Pons launch record was found for this token.');
   const [curveCode,rechecked]=await batch([{method:'eth_getCode',params:[curve.toLowerCase(),blockNumber]},{method:'eth_getBlockByNumber',params:[blockNumber,false]}]);
   const last=rechecked as Partial<Header>|null;
   if(!bytecode(curveCode)||!last||uint(last.number)!==bn||typeof last.hash!=='string'||last.hash.toLowerCase()!==blockHash||uint(last.timestamp)!==ts)return fail('Pons launch observation was discarded because the curve code or block anchor could not be reverified.');
   signal.throwIfAborted();
   result.snapshot={basis:'safe',blockNumber,blockHash,blockTimestamp,factory:PONS_FACTORY,deployerContract:PONS_DEPLOYER,curve:curve.toLowerCase(),launcher:launcher.toLowerCase(),creatorFeeRecipient:creatorFeeRecipient.toLowerCase(),phase};
   result.identities.push({address:launcher.toLowerCase(),role:'creator',source,timestamp:fetchedAt,timestampBasis:'local-observation',label:'Launch initiator'});
   result.labels.push({address:curve.toLowerCase(),category:phase===0||phase===2?'pool':'contract',label:phase===0?'Pons bonding curve':phase===2?'Pons former bonding curve':phase===1?'Pons swept bonding curve':'Pons rescued bonding curve',source,timestamp:fetchedAt,timestampBasis:'local-observation'});
   result.sources.push({name:source,status:'available',fetchedAt,detail:`Token-bound getLaunchedToken and getTokenInfo agree on the launch initiator. Platform deployer factory binding and curve bytecode verified at safe block ${blockNumber}, hash ${blockHash}, block time ${blockTimestamp}. Timestamp is retrieval time, not a launch transaction. Phase ${phase}; fee recipient is separate from the original initiator. No human ownership, launch time, liquidity lock or safety conclusion is established.`});
   return result;
  }catch{
   options.signal?.throwIfAborted();return fail(signal.aborted?'Pons launch record read exceeded its bounded deadline; no identity was retained.':'Pons launch record verification was unavailable; no unverified identity was retained.');
  }
 };
}
