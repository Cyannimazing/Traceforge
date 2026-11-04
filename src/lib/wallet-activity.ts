import {CHAINS,validateToken,type Chain} from './analysis';
export type WalletActivity={address:string;count:number|null;exact:boolean;fresh:boolean|null;basis:'evm-outgoing-count'|'solana-address-signatures';reason:string;observedAt?:string};
export type WalletActivitySnapshot={source:string;observedAt:string;blockRef?:string;blockTimestamp?:string;finality?:'finalized';wallets:WalletActivity[];truncated:boolean};
/** Fixed diagnostic codes only. Never expose a provider error message or URL. */
export class WalletActivityRpcError extends Error {
 constructor(readonly code:'rate-limit'|'deadline'|'unavailable'){super(code);this.name='WalletActivityRpcError';}
}
type Rpc=(method:string,params:unknown[],signal?:AbortSignal)=>Promise<unknown>;
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const hex=(v:unknown)=>typeof v==='string'&&/^0x[0-9a-f]+$/i.test(v);
/** EVM nonce counts outgoing transactions, not incoming/internal activity.
 * Solana short pages cannot prove complete lifetime coverage; eleven distinct
 * signatures suffice only to disprove the <=10 predicate. No archive crawl. */
export async function readWalletActivity(chain:Chain,addresses:string[],rpc:Rpc,options:{signal?:AbortSignal;now?:()=>number}={}):Promise<WalletActivitySnapshot>{
 options.signal?.throwIfAborted();
 const unique=[...new Set(addresses.map(a=>chain==='solana'?a:a.toLowerCase()))];
 const selected=unique.slice(0,100),basis=chain==='solana'?'solana-address-signatures':'evm-outgoing-count';
 const unknown=(address:string,reason='The RPC did not verify this wallet activity.'):WalletActivity=>({address,count:null,exact:false,fresh:null,basis,reason});
 const result:WalletActivitySnapshot={source:chain==='solana'?'Solana RPC wallet activity':'EVM RPC wallet activity',observedAt:new Date((options.now||Date.now)()).toISOString(),wallets:selected.map(a=>unknown(a)),truncated:unique.length>100};
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
  }catch{options.signal?.throwIfAborted();return result;}
 }
 let cursor=0;
 await Promise.all(Array.from({length:Math.min(2,selected.length)},async()=>{
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
     if(typeof code==='string'&&/^0x(?:[0-9a-fA-F]{2})+$/.test(code)){result.wallets[index]=unknown(address,'Verified contract account: outgoing EOA nonce does not measure its incoming transfers or internal activity. Lifetime freshness remains unknown.');continue;}
     if(code!=='0x'||!hex(nonce)||BigInt(nonce as string)>BigInt(Number.MAX_SAFE_INTEGER))continue;
     const count=Number(BigInt(nonce as string));result.wallets[index]={address,count,exact:true,fresh:count>10?false:null,basis,reason:count>10?'More than ten outgoing transactions at the fixed finalized block rules out the <=10 lifetime-transaction predicate. Incoming and internal transactions are not counted.':'The exact outgoing count is at most ten, but incoming and internal history is not covered. Lifetime freshness remains unknown.'};
    }
   }catch(error){options.signal?.throwIfAborted();if(error instanceof WalletActivityRpcError)result.wallets[index]=unknown(address,error.code==='rate-limit'?'Provider rate limit prevented verification within the bounded scan.':error.code==='deadline'?'The bounded RPC deadline expired before wallet activity could be verified.':'The provider response was unavailable; wallet activity remains unknown.');}
  }
 }));
 if(block){try{const end=obj(await call('eth_getBlockByNumber',[block,false]));if(end.hash!==hash)result.wallets=selected.map(a=>unknown(a,'The anchor changed during verification.'));}catch{options.signal?.throwIfAborted();result.wallets=selected.map(a=>unknown(a,'The anchor could not be rechecked.'));}}
 return result;
}
