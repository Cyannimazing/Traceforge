import {encodeFunctionData,keccak256,stringToHex,toHex} from 'viem';
import type {Evidence} from './investigation-types';

export type EvmProbeChain='ethereum'|'base'|'bsc';
export type EvmProbeRpc=(method:string,params:unknown[],signal:AbortSignal)=>Promise<unknown>;
export type EvmControlObservation={
 key:string;status:'observed'|'unknown';outcome:'code-present'|'no-code'|'address-present'|'zero-address'|'empty-slot'|'returned-true'|'returned-false'|'empty-return'|'zero-balance'|'unavailable'|'malformed-return';
 detail:string;address?:string;holder?:string;recipient?:string;balanceRaw?:string;amountRaw?:string;evidenceId?:string;
};
export type EvmControlProbeResult={
 version:'evm-control-probes-v1';chain:EvmProbeChain;token:string;source:'EVM RPC control probes';fetchedAt:string;status:'complete'|'partial'|'unavailable';requests:number;
 anchor:null|{number:string;hash:string;timestamp:string;finality:'finalized'|'provisional'};
 observations:EvmControlObservation[];evidence:Evidence[];limitations:string[];
};
export type EvmControlProbeInput={chain:EvmProbeChain;token:string;recipient:string;holders:{address:string;balanceRaw?:string}[];blockTag?:'finalized'|'latest';signal?:AbortSignal;now?:()=>number;timeoutMs?:number};
const chainIds={ethereum:1n,base:8453n,bsc:56n};
const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const zero='0x'+'0'.repeat(40);
const uint=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-fA-F]{1,64}$/.test(value)?BigInt(value):null;
const word=(value:unknown)=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value)?value.toLowerCase():null;
const addressWord=(value:unknown)=>{const v=word(value);return v&&/^0x0{24}/.test(v)?'0x'+v.slice(-40):null;};
const abi=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{name:'account',type:'address'}],outputs:[{type:'uint256'}]},{type:'function',name:'transfer',stateMutability:'nonpayable',inputs:[{name:'recipient',type:'address'},{name:'amount',type:'uint256'}],outputs:[{type:'bool'}]}] as const;
const slots=Object.fromEntries(['implementation','admin','beacon'].map(name=>[name,toHex(BigInt(keccak256(stringToHex(`eip1967.proxy.${name}`)))-1n,{size:32})]));

/** Read-only RPC observations at one block. Never produces a safety verdict.
 * References: https://eips.ethereum.org/EIPS/eip-1967,
 * https://eips.ethereum.org/EIPS/eip-20 and ethereum.org JSON-RPC eth_call.
 */
export async function runEvmControlProbes(input:EvmControlProbeInput,rpc:EvmProbeRpc):Promise<EvmControlProbeResult>{
 if(!Object.hasOwn(chainIds,input.chain))throw Error('Unsupported EVM chain.');
 if(!addressPattern.test(input.token)||input.token.toLowerCase()===zero||!addressPattern.test(input.recipient)||input.recipient.toLowerCase()===zero)throw Error('A valid nonzero token and recipient address is required.');
 if(input.blockTag!==undefined&&!['finalized','latest'].includes(input.blockTag))throw Error('Unsupported block tag.');
 input.signal?.throwIfAborted();
 const token=input.token.toLowerCase(),recipient=input.recipient.toLowerCase(),now=input.now||Date.now;
 const result:EvmControlProbeResult={version:'evm-control-probes-v1',chain:input.chain,token,source:'EVM RPC control probes',fetchedAt:new Date(now()).toISOString(),status:'unavailable',requests:0,anchor:null,observations:[],evidence:[],limitations:[
  'owner() is one conventional selector. A zero address or failed read does not prove that other privileged controls are absent.',
  'Empty ERC-1967 slots do not rule out other proxy patterns, custom storage or privileged logic.',
  'A transfer simulation tests one raw token unit, one sender and one recipient at the stated block. It does not prove pool sellability, unrestricted transfers, future behavior or token safety.',
  'Only up to three supplied holder addresses are checked. No transaction is signed or broadcast. No existing provider security finding is overridden.',
 ]};
 const timeout=AbortSignal.timeout(Math.max(50,Math.min(15_000,input.timeoutMs??8_000))),signal=input.signal?AbortSignal.any([input.signal,timeout]):timeout;
 async function call(method:string,params:unknown[]){
  signal.throwIfAborted();if(result.requests>=14)throw Error('Read budget exhausted.');result.requests++;
  return new Promise<unknown>((resolve,reject)=>{
   const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
   Promise.resolve().then(()=>{signal.throwIfAborted();return rpc(method,params,signal);}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
 }
 async function read(method:string,params:unknown[]):Promise<{ok:true;value:unknown}|{ok:false}>{
  try{return {ok:true,value:await call(method,params)};}catch{input.signal?.throwIfAborted();return {ok:false};}
 }
 const chain=await read('eth_chainId',[]);
 if(!chain.ok||uint(chain.value)!==chainIds[input.chain]){result.limitations.push('RPC chain identity could not be matched to the requested network.');return result;}
 const requestedTag=input.blockTag||'finalized',header=await read('eth_getBlockByNumber',[requestedTag,false]);
 const b=header.ok&&header.value&&typeof header.value==='object'?header.value as Record<string,unknown>:null;
 const bn=uint(b?.number),ts=uint(b?.timestamp),hash=word(b?.hash);
 if(!b||bn===null||ts===null||!hash||ts>BigInt(Math.floor(now()/1000)+120)||ts>BigInt(Math.floor(Number.MAX_SAFE_INTEGER/1000))){result.limitations.push('A valid dated block anchor was unavailable.');return result;}
 const blockNumber=toHex(bn);
 result.anchor={number:blockNumber,hash,timestamp:new Date(Number(ts)*1000).toISOString(),finality:requestedTag==='finalized'?'finalized':'provisional'};
 if(requestedTag==='latest')result.limitations.push('This recent block is provisional, not finalized. Its observations can change after a reorganization.');
 const record=(o:EvmControlObservation)=>{
  if(o.status==='observed'){
   o.evidenceId=`evm-probe:${input.chain}:${token}:${hash}:${o.key}`;
   result.evidence.push({id:o.evidenceId,kind:'authority',timestamp:result.fetchedAt,source:result.source,description:`${o.detail} Block ${blockNumber}, hash ${hash}; block time ${result.anchor!.timestamp}; ${result.anchor!.finality}. Retrieval timestamp is not a transaction timestamp.`,...(o.holder?{from:o.holder,to:recipient,amountRaw:o.amountRaw,token}:{}),});
  }
  result.observations.push(o);
 };
 async function recheckAnchor(){
  const verified=await read('eth_getBlockByNumber',[blockNumber,false]),last=verified.ok&&verified.value&&typeof verified.value==='object'?verified.value as Record<string,unknown>:null;
  if(last&&word(last.hash)===hash&&uint(last.number)===bn)return true;
  result.evidence=[];
  result.observations=result.observations.map(o=>({key:o.key,status:'unknown',outcome:'unavailable',detail:'The block anchor changed or could not be rechecked; this observation is invalidated.'}));
  result.status='unavailable';result.limitations.push('The block anchor changed or could not be rechecked. No mixed-state observation is retained.');return false;
 }
 const code=await read('eth_getCode',[token,blockNumber]);
 if(!code.ok||typeof code.value!=='string'||code.value.length>200_002||!/^0x(?:[0-9a-fA-F]{2})*$/.test(code.value)){record({key:'code',status:'unknown',outcome:'unavailable',detail:'Contract bytecode could not be read.'});return result;}
 record({key:'code',status:'observed',outcome:code.value==='0x'?'no-code':'code-present',detail:code.value==='0x'?'No bytecode returned at this block.':'Contract bytecode returned at this block.'});
 if(code.value==='0x'){result.status='partial';await recheckAnchor();return result;}
 await Promise.all([
  (async()=>{const r=await read('eth_call',[{to:token,data:'0x8da5cb5b',gas:'0x186a0'},blockNumber]),address=r.ok?addressWord(r.value):null;
   record(address?{key:'owner',status:'observed',outcome:address===zero?'zero-address':'address-present',address,detail:`owner() returned ${address}. This is not a complete privileged-control audit.`}:{key:'owner',status:'unknown',outcome:'unavailable',detail:'owner() was unavailable, reverted or did not return an ABI address. This does not establish that privileged controls are absent.'});})(),
  ...Object.entries(slots).map(async([name,slot])=>{const r=await read('eth_getStorageAt',[token,slot,blockNumber]),address=r.ok?addressWord(r.value):null;
   record(address?{key:`proxy-${name}`,status:'observed',outcome:address===zero?'empty-slot':'address-present',address,detail:`ERC-1967 ${name} slot ${address===zero?'is zero':`contains ${address}`}. Other proxy patterns are not assessed.`}:{key:`proxy-${name}`,status:'unknown',outcome:'unavailable',detail:`ERC-1967 ${name} slot could not be decoded.`});}),
 ]);
 const seen=new Set<string>();const holders=input.holders.filter(h=>{
  const a=h.address.toLowerCase();if(!addressPattern.test(h.address)||a===zero||a===recipient||a===token||seen.has(a))return false;
  seen.add(a);return h.balanceRaw===undefined||/^[1-9]\d{0,77}$/.test(h.balanceRaw);
 }).slice(0,3);
 await Promise.all(holders.map(async h=>{
  const holder=h.address.toLowerCase(),base={key:`transfer:${holder}`,holder,recipient};
  const balance=await read('eth_call',[{to:token,data:encodeFunctionData({abi,functionName:'balanceOf',args:[holder as `0x${string}`]}),gas:'0x186a0'},blockNumber]);
  const raw=balance.ok?word(balance.value):null;
  if(!raw){record({...base,status:'unknown',outcome:'unavailable',detail:'The holder balance could not be independently read at the anchor; no transfer was simulated.'});return;}
  const balanceRaw=BigInt(raw).toString();if(BigInt(raw)===0n){record({...base,balanceRaw,status:'observed',outcome:'zero-balance',detail:'The holder has zero balance at the anchor; no transfer was simulated.'});return;}
  const amountRaw='1';
  const transfer=await read('eth_call',[{from:holder,to:token,data:encodeFunctionData({abi,functionName:'transfer',args:[recipient as `0x${string}`,1n]}),gas:'0x7a120'},blockNumber]);
  if(!transfer.ok){record({...base,balanceRaw,amountRaw,status:'unknown',outcome:'unavailable',detail:'The transfer simulation reverted or was unavailable. This alone does not prove a honeypot.'});return;}
  const v=word(transfer.value),outcome=transfer.value==='0x'?'empty-return':v===toHex(1n,{size:32})?'returned-true':v===toHex(0n,{size:32})?'returned-false':'malformed-return';
  record({...base,balanceRaw,amountRaw,status:outcome==='malformed-return'?'unknown':'observed',outcome,detail:outcome==='returned-true'?'A one-raw-unit transfer simulation returned true. Pool selling was not simulated.':outcome==='returned-false'?'A one-raw-unit transfer simulation returned false. Cause and pool sellability are not established.':outcome==='empty-return'?'The simulation returned no data without an RPC error. Non-standard return behavior does not prove a successful token transfer.':'The simulation returned malformed ABI data; transfer success is unverified.'});
 }));
 if(!await recheckAnchor())return result;
 result.observations.sort((a,b)=>a.key.localeCompare(b.key));result.status=result.observations.some(o=>o.status==='unknown')?'partial':'complete';
 return result;
}

