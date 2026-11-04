import {CHAINS,validateToken,type Chain} from './analysis';
export type WalletActivity={address:string;count:number|null;exact:boolean;fresh:boolean|null;basis:'evm-outgoing-count'|'evm-account-nonce'|'solana-address-signatures';reason:string;observedAt?:string;accountKind?:'eoa'|'delegated-eoa'|'contract';codeProof?:{code:string;blockRef:string}};
export type WalletActivitySnapshot={source:string;observedAt:string;blockRef?:string;blockTimestamp?:string;finality?:'finalized';wallets:WalletActivity[];truncated:boolean;requestedAccounts?:number;selectedAccounts?:number;readableAccounts?:number;failure?:'rate-limit'|'deadline'|'unavailable'|'anchor-changed'};
/** Fixed diagnostic codes only. Never expose a provider error message or URL. */
export class WalletActivityRpcError extends Error {
 constructor(readonly code:'rate-limit'|'deadline'|'unavailable'){super(code);this.name='WalletActivityRpcError';}
}
export type WalletActivityBatch=(requests:{method:string;params:unknown[]}[],signal?:AbortSignal)=>Promise<PromiseSettledResult<unknown>[]>;
type Rpc=(method:string,params:unknown[],signal?:AbortSignal)=>Promise<unknown>;
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const hex=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v);
/** EVM nonce includes outgoing transactions and accepted EIP-7702
 * authorizations, even after delegation is revoked. It is not a lifetime
 * transaction count. https://eips.ethereum.org/EIPS/eip-7702
 * Solana short pages cannot prove complete lifetime coverage; eleven distinct
 * signatures suffice only to disprove the <=10 predicate. No archive crawl. */
export async function readWalletActivity(chain:Chain,addresses:string[],rpc:Rpc,options:{signal?:AbortSignal;now?:()=>number;maxAddresses?:number;rpcBatch?:WalletActivityBatch;batchSize?:number;batchConcurrency?:number}={}):Promise<WalletActivitySnapshot>{
 options.signal?.throwIfAborted();
 const unique=[...new Set(addresses.map(a=>chain==='solana'?a:a.toLowerCase()))];
 const limit=chain==='robinhood'&&options.rpcBatch&&Number.isSafeInteger(options.maxAddresses)?Math.max(0,Math.min(10000,options.maxAddresses!)):100;
 const selected=unique.slice(0,limit),basis=chain==='solana'?'solana-address-signatures':'evm-account-nonce';
 const unknown=(address:string,reason='The RPC did not verify this wallet activity.'):WalletActivity=>({address,count:null,exact:false,fresh:null,basis,reason});
 const result:WalletActivitySnapshot={source:chain==='solana'?'Solana RPC wallet activity':'EVM RPC wallet activity',observedAt:new Date((options.now||Date.now)()).toISOString(),wallets:selected.map(a=>unknown(a)),truncated:unique.length>limit,requestedAccounts:unique.length,selectedAccounts:selected.length,readableAccounts:0};
 const call=(method:string,params:unknown[])=>rpc(method,params,options.signal);
 let block:string|undefined,hash:string|undefined;
 if(chain!=='solana'){
  try{const id=await call('eth_chainId',[]);if(!hex(id)||BigInt(id as string)!==BigInt(CHAINS[chain].id!))return result;
   const anchor=obj(await call('eth_getBlockByNumber',['finalized',false]));
   if(!hex(anchor.number)||typeof anchor.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(anchor.hash))return result;
   if(chain==='robinhood'){
    const head=obj(await call('eth_getBlockByNumber',['latest',false])),timestamp=hex(head.timestamp)?Number(BigInt(head.timestamp as string))*1000:NaN,anchorTime=hex(anchor.timestamp)?Number(BigInt(anchor.timestamp as string))*1000:NaN,age=(options.now||Date.now)()-timestamp;
    if(!hex(head.number)||typeof head.hash!=='string'||!/^0x[0-9a-f]{64}$/i.test(head.hash)||!Number.isSafeInteger(timestamp)||!Number.isSafeInteger(anchorTime)||age < -120000||age>900000||anchorTime>timestamp||BigInt(anchor.number as string)>BigInt(head.number as string))return result;
    result.blockTimestamp=new Date(anchorTime).toISOString();result.finality='finalized';
   }
   block=anchor.number as string;hash=anchor.hash;result.blockRef=block+':'+hash;
   if(hex(anchor.timestamp)){const timestamp=Number(BigInt(anchor.timestamp as string))*1000;if(Number.isSafeInteger(timestamp)){result.blockTimestamp=new Date(timestamp).toISOString();result.finality='finalized';}}
  }catch(error){options.signal?.throwIfAborted();result.failure=error instanceof WalletActivityRpcError?error.code:'unavailable';return result;}
 }
 const applyEvm=(index:number,code:unknown,nonce:unknown)=>{const address=selected[index];
     // EIP-7702 uses exactly 23 bytes. A zero target clears code rather than
     // creating a delegation indicator; other nonempty code is not an EOA.
     const delegated=typeof code==='string'&&/^0xef0100[0-9a-f]{40}$/i.test(code)&&!/^0xef01000{40}$/i.test(code);
     const codeProof=typeof code==='string'?{code,blockRef:block+':'+hash}:undefined;
     if(!delegated&&typeof code==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(code)){result.wallets[index]={...unknown(address,'Verified contract account: its nonce does not measure incoming transfers or internal activity. Lifetime freshness remains unknown.'),accountKind:'contract',codeProof};return;}
     if((code!=='0x'&&!delegated)||!hex(nonce)||BigInt(nonce as string)>BigInt(Number.MAX_SAFE_INTEGER))return;
     const count=Number(BigInt(nonce as string));result.wallets[index]={address,count,exact:true,fresh:null,basis,accountKind:delegated?'delegated-eoa':'eoa',codeProof,reason:`${delegated?'EIP-7702 delegated EOA:':'Empty-code EOA:'} exact account nonce ${count} at the fixed finalized block. Nonce includes outgoing transactions and accepted EIP-7702 authorization increments, including prior delegation that may have been revoked. Incoming, internal and sponsored execution history is not counted. Neither a low nor high nonce proves lifetime freshness.`};
 };
 let cursor=0;
 if(chain==='robinhood'&&options.rpcBatch){
  let stopped=false;
  const size=Number.isSafeInteger(options.batchSize)?Math.max(1,Math.min(25,options.batchSize!)):25,concurrency=options.batchConcurrency===1?1:2;
  await Promise.all(Array.from({length:Math.min(concurrency,Math.ceil(selected.length/size))},async()=>{
   while(!stopped){const start=cursor;cursor+=size;if(start>=selected.length)return;options.signal?.throwIfAborted();
    const indices=selected.slice(start,start+size).map((_,i)=>start+i).filter(i=>!validateToken(chain,selected[i]));
    try{const records=await options.rpcBatch!(indices.flatMap(i=>[{method:'eth_getCode',params:[selected[i],block]},{method:'eth_getTransactionCount',params:[selected[i],block]}]),options.signal);
     if(records.length!==indices.length*2)continue;
     indices.forEach((index,j)=>{const code=records[j*2],nonce=records[j*2+1];if(code.status==='fulfilled'&&nonce.status==='fulfilled')applyEvm(index,code.value,nonce.value);else if([code,nonce].some(r=>r.status==='rejected'&&r.reason instanceof WalletActivityRpcError&&['rate-limit','deadline'].includes(r.reason.code)))stopped=true;});
    }catch(error){options.signal?.throwIfAborted();if(error instanceof WalletActivityRpcError){result.failure=error.code;if(['rate-limit','deadline'].includes(error.code))stopped=true;}}
   }
  }));
  if(stopped)result.wallets=result.wallets.map(w=>w.count===null&&!w.codeProof?unknown(w.address,'The provider rate limit or bounded deadline prevented further activity reads.'):w);
 }else await Promise.all(Array.from({length:Math.min(2,selected.length)},async()=>{
  for(;;){const index=cursor++;if(index>=selected.length)return;const address=selected[index];options.signal?.throwIfAborted();if(validateToken(chain,address))continue;
   try{
    if(chain==='solana'){
     const payload=await call('getSignaturesForAddress',[address,{limit:11,commitment:'finalized'}]);
     if(!Array.isArray(payload)||payload.length>11)continue;
     const valid=payload.every(row=>{const r=obj(row);return typeof r.signature==='string'&&/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(r.signature)&&Number.isSafeInteger(r.slot)&&Number(r.slot)>=0&&r.confirmationStatus==='finalized';});
     if(!valid)continue;
     const count=new Set(payload.map(r=>obj(r).signature)).size;
     result.wallets[index]={address,count,exact:false,fresh:count>10?false:null,basis,reason:count>10?'At least 11 distinct finalized address transactions observed.':'The short provider page does not establish complete lifetime history.'};
    }else{
     const [code,nonce]=await Promise.all([call('eth_getCode',[address,block]),call('eth_getTransactionCount',[address,block])]);
     applyEvm(index,code,nonce);
    }
   }catch(error){options.signal?.throwIfAborted();if(error instanceof WalletActivityRpcError)result.wallets[index]=unknown(address,error.code==='rate-limit'?'Provider rate limit prevented verification within the bounded scan.':error.code==='deadline'?'The bounded RPC deadline expired before wallet activity could be verified.':'The provider response was unavailable; wallet activity remains unknown.');}
  }
 }));
 if(block){try{const end=obj(await call('eth_getBlockByNumber',[block,false]));if(end.hash!==hash){result.failure='anchor-changed';result.wallets=selected.map(a=>unknown(a,'The anchor changed during verification.'));}}catch(error){options.signal?.throwIfAborted();result.failure=error instanceof WalletActivityRpcError?error.code:result.failure||'unavailable';result.wallets=selected.map(a=>unknown(a,`The anchor could not be rechecked (${result.failure}); no activity proof is retained.`));}}
 result.readableAccounts=result.wallets.filter(w=>w.count!==null).length;
 return result;
}
