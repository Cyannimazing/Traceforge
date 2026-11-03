import {validateToken} from './analysis';
import {SOLANA_TOKEN_PROGRAM,SOLANA_TOKEN_2022_PROGRAM} from './solana-public';

// Official schema and reserve convention, verified 2026-11-02:
// https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump_amm.json
// https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md
// https://github.com/pump-fun/pump-public-docs/blob/main/docs/VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md
export const PUMPSWAP_PROGRAM='pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const DISCRIMINATOR=[241,154,109,4,17,177,109,188];
const PROGRAMS=new Set([SOLANA_TOKEN_PROGRAM,SOLANA_TOKEN_2022_PROGRAM]);
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const str=(v:unknown)=>typeof v==='string'?v:'';
const address=(v:unknown)=>typeof v==='string'&&!validateToken('solana',v)?v:undefined;
const uint64=(v:unknown)=>typeof v==='string'&&/^\d{1,20}$/.test(v)&&BigInt(v)<=18446744073709551615n?v:undefined;
const slot=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:undefined;
function pubkey(bytes:Buffer){const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=BigInt(`0x${bytes.toString('hex')}`),result='';while(n){result=alphabet[Number(n%58n)]+result;n/=58n;}for(const byte of bytes){if(byte)break;result='1'+result;}return result;}
export type PumpSwapPool={baseMint:string;quoteMint:string;baseVault:string;quoteVault:string;virtualQuoteReservesRaw:string;protocolFeesRaw:string;creatorFeesRaw:string;creatorFeeBpsRaw:string};

/** IDL offsets include the eight-byte Anchor discriminator. Appended fields may
 * be missing in historical account versions, but partial fields are malformed. */
export function parsePumpSwapPool(value:unknown):PumpSwapPool|undefined{
 const account=obj(value),data=account.data;
 if(account.owner!==PUMPSWAP_PROGRAM||account.executable!==false||!Array.isArray(data)||data[1]!=='base64'||typeof data[0]!=='string'||data[0].length>8192)return;
 const b=Buffer.from(data[0],'base64');
 if(b.length<211||!DISCRIMINATOR.every((byte,index)=>b[index]===byte))return;
 const fieldEnds=[211,243,244,245,261,269,270,271,279,287];
 if(b.length<287&&!fieldEnds.includes(b.length))return;
 if(b.length>287&&b.subarray(287).some(byte=>byte!==0))return;
 if([243,244,269,270].some(offset=>b.length>offset&&b[offset]>1))return;
 const baseMint=pubkey(b.subarray(43,75)),quoteMint=pubkey(b.subarray(75,107)),baseVault=pubkey(b.subarray(139,171)),quoteVault=pubkey(b.subarray(171,203));
 if(![baseMint,quoteMint,baseVault,quoteVault].every(v=>!!address(v))||baseMint===quoteMint||baseVault===quoteVault)return;
 const virtual=b.length>=261?b.readBigInt64LE(253)*18446744073709551616n+b.readBigUInt64LE(245):0n;
 return {baseMint,quoteMint,baseVault,quoteVault,virtualQuoteReservesRaw:virtual.toString(),creatorFeeBpsRaw:b.length>=269?b.readBigUInt64LE(261).toString():'0',protocolFeesRaw:b.length>=279?b.readBigUInt64LE(271).toString():'0',creatorFeesRaw:b.length>=287?b.readBigUInt64LE(279).toString():'0'};
}
export type SolanaReserveToken={mint:string;vault:string;amountRaw:string;decimals:number;tokenProgram:string;mintExtensions:string[];vaultExtensions:string[]};
export type SolanaPoolReserveSnapshot={protocol:'pumpswap';pool:string;program:string;base:SolanaReserveToken;quote:SolanaReserveToken;slot:number;observedAt:string;commitment:'finalized';source:string;blockRef:string;evidenceId:string;virtualQuoteReservesRaw:string;effectiveQuoteAmountRaw:string;protocolFeesRaw:string;creatorFeesRaw:string;creatorFeeBpsRaw:string;constantProductEligible:boolean;feeBps:null;feeAssumption:string;limitations:string[]};
export type SolanaPoolReserveResult={status:'verified'|'unknown';snapshot?:SolanaPoolReserveSnapshot;reasons:string[]};
type Dependencies={rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number};
const extensionNames=(info:Row)=>info.extensions===undefined?[]:Array.isArray(info.extensions)?info.extensions.map(e=>str(obj(e).extension)||'Unparsed extension'):['Unparsed extensions'];
function reserve(vaultValue:unknown,mintValue:unknown,pool:string,vault:string,mint:string):SolanaReserveToken|undefined{
 const va=obj(vaultValue),ma=obj(mintValue),vp=obj(obj(va.data).parsed),mp=obj(obj(ma.data).parsed),v=obj(vp.info),m=obj(mp.info),amount=obj(v.tokenAmount);
 const raw=uint64(amount.amount),decimals=m.decimals;
 if(!PROGRAMS.has(str(va.owner))||ma.owner!==va.owner||va.executable!==false||ma.executable!==false||vp.type!=='account'||mp.type!=='mint'||m.isInitialized!==true||v.owner!==pool||v.mint!==mint||v.state!=='initialized'||raw===undefined||typeof decimals!=='number'||!Number.isInteger(decimals)||decimals<0||decimals>255||amount.decimals!==decimals)return;
 return {mint,vault,amountRaw:raw,decimals,tokenProgram:str(va.owner),mintExtensions:extensionNames(m),vaultExtensions:extensionNames(v)};
}
export function createSolanaPoolReserves(deps:Dependencies={}){
 const fetcher=deps.fetcher||fetch,now=deps.now||Date.now;
 return async(pool:string,token:string,options:{signal?:AbortSignal}={}):Promise<SolanaPoolReserveResult>=>{
  options.signal?.throwIfAborted();
  const unknown=(reason:string):SolanaPoolReserveResult=>({status:'unknown',reasons:[reason]});
  if(!address(pool)||!address(token))return unknown('Pool or mint address is invalid.');
  const url=deps.rpcUrl||process.env.SOLANA_RPC_URL;if(!url)return unknown('A configured Solana RPC is required for reserve verification.');
  const controller=new AbortController(),abort=()=>controller.abort();options.signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,deps.timeoutMs??12000);let id=0;
  const rpc=async(method:string,params:unknown[])=>{const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});if(!response.ok)throw Error('RPC unavailable');const body=obj(await response.json());if(body.error)throw Error('RPC rejected reserve request');return obj(body.result);};
  try{
   const first=await rpc('getAccountInfo',[pool,{encoding:'base64',commitment:'finalized'}]);
   const initial=parsePumpSwapPool(first.value),initialSlot=slot(obj(first.context).slot);
   if(!initial||initialSlot===undefined)return unknown('Selected pool does not match the verified PumpSwap owner, discriminator and supported account schema.');
   if(token!==initial.baseMint&&token!==initial.quoteMint)return unknown('Selected pool does not contain the scanned mint.');
   const bank=await rpc('getMultipleAccounts',[[pool,initial.baseVault,initial.quoteVault,initial.baseMint,initial.quoteMint],{encoding:'jsonParsed',commitment:'finalized',minContextSlot:initialSlot}]);
   const values=bank.value,bankSlot=slot(obj(bank.context).slot);
   if(!Array.isArray(values)||values.length!==5||bankSlot===undefined||bankSlot<initialSlot)return unknown('A comparable finalized bank for the pool, vaults and mints was not returned.');
   const current=parsePumpSwapPool(values[0]);
   if(!current||(['baseMint','quoteMint','baseVault','quoteVault'] as const).some(k=>initial[k]!==current[k]))return unknown('Pool identity or vault references changed during reserve verification.');
   const base=reserve(values[1],values[3],pool,current.baseVault,current.baseMint),quote=reserve(values[2],values[4],pool,current.quoteVault,current.quoteMint);
   if(!base||!quote)return unknown('Vault authority, mint, token-program ownership, initialized state or decimal alignment failed verification.');
   const effectiveQuote=BigInt(quote.amountRaw)+BigInt(current.virtualQuoteReservesRaw);
   if(effectiveQuote<0n)return unknown('Signed virtual quote reserves produce an invalid negative effective reserve.');
   const limitations:string[]=[];
   for(const [name,asset] of [['Base',base],['Quote',quote]] as const){const unsupported=[...asset.mintExtensions.filter(e=>!['metadataPointer','tokenMetadata'].includes(e)),...asset.vaultExtensions.filter(e=>e!=='immutableOwner')];if(unsupported.length)limitations.push(`${name} token extensions are outside the simplified constant-product model: ${[...new Set(unsupported)].join(', ')}.`);}
   if(BigInt(base.amountRaw)===0n||effectiveQuote===0n)limitations.push('Zero reserves do not support a constant-product impact calculation.');
   const observedAt=new Date(now()).toISOString();options.signal?.throwIfAborted();
   return {status:'verified',reasons:[],snapshot:{protocol:'pumpswap',pool,program:PUMPSWAP_PROGRAM,base,quote,slot:bankSlot,observedAt,commitment:'finalized',source:'Configured Solana RPC - PumpSwap reserve accounts',blockRef:`solana:finalized:${bankSlot}`,evidenceId:`reserve:pumpswap:${pool}:${bankSlot}`,...current,effectiveQuoteAmountRaw:effectiveQuote.toString(),constantProductEligible:limitations.length===0,feeBps:null,feeAssumption:'Live dynamic trading, creator and transfer fees are not verified. No execution quote or fee rate is asserted; a fee-free constant-product scenario must be labeled as an explicit modeling assumption.',limitations}};
  }catch{options.signal?.throwIfAborted();return unknown(controller.signal.aborted?'Reserve verification exceeded its bounded deadline.':'Reserve RPC data was unavailable or malformed; no reserve amount is inferred.');}
  finally{clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
 };
}
