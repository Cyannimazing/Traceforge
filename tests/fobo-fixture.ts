import {encodeAbiParameters,keccak256,parseAbiParameters,toEventSelector,toFunctionSelector} from 'viem';
import {FOBO_FACTORY,FOBO_HOOK,FOBO_POOL_MANAGER,FOBO_TOTAL_SUPPLY} from '../src/lib/fobo-launch-record';
import {TAX_PAID,V4_SWAP} from '../src/lib/fobo-history';

// Synthetic Robinhood chain for FOBO adapter tests: 10 blocks per second.
export const TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const LAUNCHED=toEventSelector('event TokenLaunched(address indexed token,bytes32 indexed poolId,address indexed creator,address quote,int24 tickStart,uint256 devBuyTokens,string name,string ticker,string metadataURI)');
export const token='0x'+'1'.repeat(40),creator='0x'+'c'.repeat(40),router='0x'+'7'.repeat(40),zero='0x'+'0'.repeat(40);
export const LAUNCH_BLOCK=98_600_000,LAUNCH_TIME=1_793_000_000;
const keyAbi=parseAbiParameters('(address,address,uint24,int24,address)');
export const key=[zero,token,0,200,FOBO_HOOK] as const;
export const poolId=keccak256(encodeAbiParameters(keyAbi,[key as unknown as readonly [`0x${string}`,`0x${string}`,number,number,`0x${string}`]])).toLowerCase();
const hex=(n:number|bigint)=>'0x'+n.toString(16);
export const pad=(a:string)=>'0x'+a.slice(2).toLowerCase().padStart(64,'0');
export const word=(v:bigint)=>'0x'+v.toString(16).padStart(64,'0');
export const blockHash=(n:number)=>'0x'+n.toString(16).padStart(64,'b');
export const time=(n:number)=>LAUNCH_TIME+Math.floor((n-LAUNCH_BLOCK)/10);
export const header=(n:number)=>({number:hex(n),hash:blockHash(n),timestamp:hex(time(n))});
type Log={address:string;topics:string[];data:string;blockNumber:string;blockHash:string;transactionHash:string;transactionIndex:string;logIndex:string;removed:false};
export type Receipt={transactionHash:string;blockNumber:string;blockHash:string;transactionIndex:string;from:string;to:string;status:string;logs:Log[]};
const txHash=(i:number)=>'0x'+i.toString(16).padStart(64,'e');
export const launchTx=txHash(1);
function receipt(index:number,block:number,from:string,make:(log:(address:string,topics:string[],data:string)=>Log)=>void):Receipt{
 const logs:Log[]=[],r:Receipt={transactionHash:txHash(index),blockNumber:hex(block),blockHash:blockHash(block),transactionIndex:'0x1',from,to:router,status:'0x1',logs};
 make((address,topics,data)=>{const l:Log={address,topics,data,blockNumber:r.blockNumber,blockHash:r.blockHash,transactionHash:r.transactionHash,transactionIndex:r.transactionIndex,logIndex:hex(logs.length),removed:false};logs.push(l);return l;});
 return r;
}
const taxData=(buy:boolean)=>encodeAbiParameters(parseAbiParameters('bool,uint256,uint256,uint256,uint256,uint256'),[buy,10n**15n,1n,1n,1n,0n]);
const swapData=encodeAbiParameters(parseAbiParameters('int128,int128,uint160,uint128,int24,uint24'),[-1n,1n,1n,1n,0,0]);
const transfer=(log:(a:string,t:string[],d:string)=>Log,from:string,to:string,amount:bigint)=>log(token,[TRANSFER,pad(from),pad(to)],word(amount));
const launchData=encodeAbiParameters(parseAbiParameters('address,int24,uint256,string,string,string'),[zero as `0x${string}`,192660,50_000_000n*10n**18n,'Test','TEST','ipfs://test']);
export function launchReceipt(options:{mint?:bigint}={}){
 return receipt(1,LAUNCH_BLOCK,creator,log=>{
  transfer(log,zero,FOBO_FACTORY,options.mint??FOBO_TOTAL_SUPPLY);
  log(FOBO_HOOK,[TAX_PAID,poolId,pad(FOBO_FACTORY)],taxData(true));
  log(FOBO_POOL_MANAGER,[V4_SWAP,poolId,pad(FOBO_FACTORY)],swapData);
  transfer(log,FOBO_POOL_MANAGER,creator,50_000_000n*10n**18n);
  log(FOBO_FACTORY,[LAUNCHED,pad(token),poolId,pad(creator)],launchData);
 });
}
/** Buy receipts: direct, routed through the swapping router and through an extra hop. */
export function buyReceipt(index:number,block:number,buyer:string,route:'direct'|'routed'|'hops'|'undelivered'='direct',buy=true){
 return receipt(index,block,buyer,log=>{
  log(FOBO_HOOK,[TAX_PAID,poolId,pad(router)],taxData(buy));
  log(FOBO_POOL_MANAGER,[V4_SWAP,poolId,pad(router)],swapData);
  const amount=1000n*10n**18n;
  if(route==='direct')transfer(log,FOBO_POOL_MANAGER,buyer,amount);
  if(route==='routed'){transfer(log,FOBO_POOL_MANAGER,router,amount);transfer(log,router,buyer,amount);}
  if(route==='hops'){const mid='0x'+'8'.repeat(40),final='0x'+'9'.repeat(40);transfer(log,FOBO_POOL_MANAGER,router,amount);transfer(log,router,mid,amount);transfer(log,mid,final,amount-1n);}
 });
}
export const buyers={a:'0x'+'a'.repeat(40),b:'0x'+'b'.repeat(40),d:'0x'+'d'.repeat(40),e:'0x'+'e'.repeat(40)};
export function defaultReceipts(){return [launchReceipt(),buyReceipt(2,LAUNCH_BLOCK+100,buyers.a),buyReceipt(3,LAUNCH_BLOCK+300,buyers.b,'routed'),buyReceipt(4,LAUNCH_BLOCK+400,buyers.d,'hops'),buyReceipt(5,LAUNCH_BLOCK+700,buyers.e)];}
const sel={hook:toFunctionSelector('hook()'),factory:toFunctionSelector('factory()'),pools:toFunctionSelector('pools(bytes32)'),keyFor:toFunctionSelector('keyFor(address,address)')};
export type ChainOptions={receipts?:Receipt[];safe?:number;indexedFilter?:(l:Log)=>boolean;receiptOverride?:(hash:string)=>unknown;poolToken?:string;keyHooks?:string;supply?:bigint;logSafeHash?:string;extraLaunchLog?:boolean};
/** JSON-RPC responder covering the calls made by the FOBO adapter. */
export function rpc(options:ChainOptions={}){
 const receipts=options.receipts??defaultReceipts(),safe=options.safe??LAUNCH_BLOCK+20_000;
 return ({method,params}:{method:string;params:unknown[]},endpoint='state'):unknown=>{
  if(method==='eth_chainId')return '0x1237';
  if(method==='eth_getBlockByNumber'){const n=params[0]==='safe'?safe:parseInt(String(params[0]),16);const h=header(n);return endpoint==='logs'&&n===safe&&options.logSafeHash?{...h,hash:options.logSafeHash}:h;}
  if(method==='eth_getCode')return '0x6000';
  if(method==='eth_getTransactionReceipt'){const hash=String(params[0]);if(options.receiptOverride){const v=options.receiptOverride(hash);if(v!==undefined)return v;}return structuredClone(receipts.find(r=>r.transactionHash===hash)??null);}
  if(method==='eth_getLogs'){const f=params[0] as {address:string;topics:string[];fromBlock:string;toBlock:string};const from=parseInt(f.fromBlock,16),to=parseInt(f.toBlock,16);
   const rows=receipts.flatMap(r=>r.logs).filter(l=>l.address===f.address.toLowerCase()&&f.topics.every((t,i)=>l.topics[i]===t)&&parseInt(l.blockNumber,16)>=from&&parseInt(l.blockNumber,16)<=to).filter(l=>options.indexedFilter?options.indexedFilter(l):true);
   return f.address.toLowerCase()===FOBO_FACTORY&&options.extraLaunchLog&&rows.length?[...rows,{...rows[0],logIndex:'0x99'}]:structuredClone(rows);}
  if(method==='eth_call'){const {to,data}=params[0] as {to:string;data:string};
   if(to===FOBO_FACTORY&&data===sel.hook)return pad(FOBO_HOOK);
   if(to===FOBO_HOOK&&data===sel.factory)return pad(FOBO_FACTORY);
   if(to===token&&data==='0x18160ddd')return word(options.supply??FOBO_TOTAL_SUPPLY);
   if(to===token&&data==='0x313ce567')return word(18n);
   if(to===FOBO_HOOK&&data.startsWith(sel.pools))return encodeAbiParameters(parseAbiParameters('address,address,uint40,int24,int24,int24,uint64,uint64,uint128,uint128,uint8,uint128,uint256,uint256,uint256'),[(options.poolToken??token) as `0x${string}`,zero as `0x${string}`,LAUNCH_TIME,192660,0,0,0n,0n,0n,0n,0,0n,0n,0n,0n]);
   if(to===FOBO_HOOK&&data.startsWith(sel.keyFor))return encodeAbiParameters(keyAbi,[[key[0] as `0x${string}`,key[1] as `0x${string}`,key[2],key[3],(options.keyHooks??FOBO_HOOK) as `0x${string}`]]);
  }
  return null;
 };
}
export const SAFE_TIME=(safe=LAUNCH_BLOCK+20_000)=>time(safe)*1000;
