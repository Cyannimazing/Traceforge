import {validateToken} from './analysis';
import type {IdentityRecord,LabelRecord,TradeRecord,TransferRecord} from './investigation';
import type {PublicHistoryOptions,PublicHistoryResult} from './public-history';

const SOURCE='Alchemy finalized Solana transaction history';
const PUMP='6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const SYSTEM='11111111111111111111111111111111';
const TOKEN_PROGRAMS=new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const arr=(v:unknown):unknown[]=>Array.isArray(v)?v:[];
const str=(v:unknown)=>typeof v==='string'?v:'';
const address=(v:unknown)=>typeof v==='string'&&!validateToken('solana',v)?v:'';
function decode58(value:string):Uint8Array {
 if(value.length>20000)throw Error('Instruction exceeds decoder bound');
 let n=0n;for(const c of value){const i=alphabet.indexOf(c);if(i<0)throw Error('Invalid base58');n=n*58n+BigInt(i);}
 const bytes:number[]=[];while(n){bytes.unshift(Number(n&255n));n>>=8n;}
 for(const c of value){if(c!=='1')break;bytes.unshift(0);}return Uint8Array.from(bytes);
}
function encode58(bytes:Uint8Array):string {
 let n=0n;for(const b of bytes)n=n*256n+BigInt(b);let out='';while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const b of bytes){if(b!==0)break;out='1'+out;}return out;
}
// Canonical Pump public IDL, not logs or net balance heuristics:
// https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json
const definitions=[
 {d:[102,6,61,18,1,218,235,234],side:'buy',mint:2,pool:3,poolAccount:4,userAccount:5,user:6},
 {d:[56,252,116,8,158,223,205,95],side:'buy',mint:2,pool:3,poolAccount:4,userAccount:5,user:6},
 {d:[51,230,133,164,1,127,131,173],side:'sell',mint:2,pool:3,poolAccount:4,userAccount:5,user:6},
 {d:[184,23,238,97,103,197,211,61],side:'buy',mint:1,pool:10,poolAccount:11,userAccount:14,user:13},
 {d:[194,171,28,70,104,77,91,47],side:'buy',mint:1,pool:10,poolAccount:11,userAccount:14,user:13},
 {d:[93,246,130,60,231,233,64,178],side:'sell',mint:1,pool:10,poolAccount:11,userAccount:14,user:13},
] as const;
const createDiscriminators=[[24,30,200,40,5,28,7,119],[214,144,76,236,95,139,49,180]];
type TokenAccount={mint:string;owner:string;decimals:number};
type TokenMove={from:string;to:string;raw:bigint;decimals:number};
export type ParsedSolanaHistory={trades:TradeRecord[];transfers:TransferRecord[];identities:IdentityRecord[];labels:LabelRecord[];acceptedTransactions:number;rejectedTransactions:number;unsupportedTransactions:number};

/** Only successful timestamped transactions; CPI scopes are bounded by stack height. */
export function parseAlchemySolanaTransactions(rows:unknown[],mint:string):ParsedSolanaHistory {
 const out:ParsedSolanaHistory={trades:[],transfers:[],identities:[],labels:[],acceptedTransactions:0,rejectedTransactions:0,unsupportedTransactions:0};
 const seen=new Set<string>();
 for(const raw of rows){
  const tx=obj(raw),meta=obj(tx.meta),transaction=obj(tx.transaction),message=obj(transaction.message);
  const signature=str(arr(transaction.signatures)[0]),seconds=tx.blockTime;
  if(seen.has(signature))continue;
  if(!signature||!Object.hasOwn(meta,'err')||meta.err!==null||typeof seconds!=='number'||!Number.isFinite(seconds)||seconds<=0||seconds>8640000000000){out.rejectedTransactions++;continue;}
  seen.add(signature);out.acceptedTransactions++;
  const timestamp=new Date(seconds*1000).toISOString();
  const keys=arr(message.accountKeys).map(k=>str(obj(k).pubkey)||str(k));
  const accounts=new Map<string,TokenAccount>();
  for(const rawBalance of [...arr(meta.preTokenBalances),...arr(meta.postTokenBalances)]){
   const balance=obj(rawBalance),amount=obj(balance.uiTokenAmount),key=keys[Number(balance.accountIndex)],decimals=amount.decimals;
   if(key&&address(balance.mint)&&address(balance.owner)&&Number.isInteger(decimals)&&Number(decimals)>=0&&Number(decimals)<=18)accounts.set(key,{mint:str(balance.mint),owner:str(balance.owner),decimals:Number(decimals)});
  }
  const top=arr(message.instructions).map(obj),inner=new Map(arr(meta.innerInstructions).map(v=>{const r=obj(v);return [Number(r.index),arr(r.instructions).map(obj)] as const;}));
  const flat=top.flatMap((i,index)=>[i,...(inner.get(index)||[])]);
  for(const i of flat){
   const parsed=obj(i.parsed),info=obj(parsed.info);
   if(TOKEN_PROGRAMS.has(str(i.programId))&&/^initializeAccount[23]?$/.test(str(parsed.type))&&address(info.account)&&address(info.owner)&&info.mint===mint){
    const decimals=[...accounts.values()].find(a=>a.mint===mint)?.decimals;
    if(decimals!==undefined)accounts.set(str(info.account),{mint,owner:str(info.owner),decimals});
   }
  }
  const move=(i:Row):TokenMove|undefined=>{
   if(!TOKEN_PROGRAMS.has(str(i.programId)))return;
   const p=obj(i.parsed),v=obj(p.info),from=str(v.source),to=str(v.destination),a=accounts.get(from),b=accounts.get(to);
   if(!a||!b||a.mint!==mint||b.mint!==mint||a.decimals!==b.decimals)return;
   const checked=obj(v.tokenAmount),rawAmount=p.type==='transferChecked'&&v.mint===mint&&checked.decimals===a.decimals?str(checked.amount):p.type==='transfer'?str(v.amount):'';
   if(!/^[1-9]\d{0,19}$/.test(rawAmount)||BigInt(rawAmount)>18446744073709551615n)return;return {from,to,raw:BigInt(rawAmount),decimals:a.decimals};
  };
  flat.forEach((i,index)=>{
   const p=obj(i.parsed),v=obj(p.info),id=`alchemy:${signature}:transfer:${index}`;
   if(i.programId===SYSTEM&&p.type==='transfer'&&address(v.source)&&address(v.destination)&&Number.isSafeInteger(v.lamports)&&Number(v.lamports)>0){out.transfers.push({id,from:str(v.source),to:str(v.destination),amount:Number(v.lamports)/1e9,native:true,fundingEligible:false,token:'SOL',timestamp,transaction:signature,source:SOURCE});}
   const m=move(i);if(m){const from=accounts.get(m.from)!.owner,to=accounts.get(m.to)!.owner;if(from!==to)out.transfers.push({id,from,to,amount:Number(m.raw)/10**m.decimals,amountRaw:m.raw.toString(),decimals:m.decimals,native:false,token:mint,timestamp,transaction:signature,source:SOURCE});}
  });
  let matched=false;
  const inspect=(instruction:Row,descendants:Row[],path:string)=>{
   if(instruction.programId!==PUMP)return;
   let data:Uint8Array;try{data=decode58(str(instruction.data));}catch{return;}
   const a=arr(instruction.accounts).map(str),matches=(d:readonly number[])=>d.every((n,i)=>data[i]===n);
   if(a[0]===mint&&createDiscriminators.some(matches)){
    let offset=8;try{const view=new DataView(data.buffer,data.byteOffset,data.byteLength);for(let n=0;n<3;n++){const length=view.getUint32(offset,true);offset+=4+length;if(offset>data.length)throw Error('Invalid string');}const creator=data.slice(offset,offset+32);if(creator.length===32){const value=encode58(creator);if(address(value)){out.identities.push({address:value,role:'creator',source:SOURCE,timestamp,timestampBasis:'provider-event',transaction:signature,label:'Creator specified in canonical Pump creation instruction',slot:Number(tx.slot)});matched=true;}}}catch{/* malformed Borsh is not creator proof */}
   }
   const definition=definitions.find(d=>matches(d.d));if(!definition||a[definition.mint]!==mint)return;
   const wallet=address(a[definition.user]),pool=address(a[definition.pool]),userAccount=a[definition.userAccount],poolAccount=a[definition.poolAccount];
   if(!wallet||!pool||accounts.get(userAccount)?.owner!==wallet||accounts.get(poolAccount)?.owner!==pool)return;
   const moves=descendants.map(move).filter((m):m is TokenMove=>!!m&& (definition.side==='buy'?m.from===poolAccount&&m.to===userAccount:m.from===userAccount&&m.to===poolAccount));
   if(!moves.length)return;const rawAmount=moves.reduce((n,m)=>n+m.raw,0n),decimals=moves[0].decimals;
   out.trades.push({id:`alchemy:${signature}:pump:${path}`,wallet,side:definition.side,amountRaw:rawAmount.toString(),decimals,amount:Number(rawAmount)/10**decimals,timestamp,transaction:signature,source:SOURCE});
   out.labels.push({address:pool,category:'pool',label:'Pump bonding curve verified from swap instruction',source:SOURCE,timestamp,timestampBasis:'provider-event'});matched=true;
  };
  top.forEach((instruction,index)=>{
   const group=inner.get(index)||[];inspect(instruction,group,`${index}`);
   group.forEach((child,j)=>{if(typeof child.stackHeight!=='number')return;const descendants:Row[]=[];for(let k=j+1;k<group.length;k++){if(typeof group[k].stackHeight!=='number'||Number(group[k].stackHeight)<=child.stackHeight)break;descendants.push(group[k]);}inspect(child,descendants,`${index}.${j}`);});
  });
  if(!matched)out.unsupportedTransactions++;
 }
 out.labels=[...new Map(out.labels.map(l=>[l.address,l])).values()];out.identities=[...new Map(out.identities.map(i=>[`${i.transaction}:${i.address}`,i])).values()];
 return out;
}

export type AlchemySolanaHistoryResult=PublicHistoryResult & {coverage:{launchVerified:false;firstObservedTradeAt?:string;earlyTransactions:number;recentTransactions:number;fundingWallets:number;fundingHops:1;historicalCursorRemaining:boolean;decoder:'canonical-pump';complete:false}};
type Dependencies={rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number;timeoutMs?:number;fundingWalletLimit?:number};
export function createAlchemySolanaHistory(deps:Dependencies={}) {
 const cache=new Map<string,{expires:number;value:AlchemySolanaHistoryResult}>(),fetcher=deps.fetcher||fetch,now=deps.now||Date.now;
 return async function alchemySolanaHistory({report,mode,limit,signal,walletAddresses}:PublicHistoryOptions):Promise<AlchemySolanaHistoryResult>{
  const empty=():AlchemySolanaHistoryResult=>({trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:true,coverage:{launchVerified:false,earlyTransactions:0,recentTransactions:0,fundingWallets:0,fundingHops:1,historicalCursorRemaining:false,decoder:'canonical-pump',complete:false}});
  const result=empty();if(report.chain!=='solana'||mode!=='deep')return result;
  const url=deps.rpcUrl||process.env.SOLANA_RPC_URL||'';
  let supported=false;try{supported=/(^|\.)alchemy\.com$/.test(new URL(url).hostname);}catch{}
  if(!supported){result.reasons.push('Alchemy Solana historical indexing is not configured.');return result;}
  const count=Math.max(1,Math.min(100,Math.floor(limit)||100)),key=`${report.token}:${count}:${(walletAddresses||report.holders.map(h=>h.address)).slice(0,8).join(',')}`;
  signal?.throwIfAborted();const hit=cache.get(key);if(hit&&hit.expires>now())return structuredClone(hit.value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),deps.timeoutMs??40000),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
  let id=0,partialFailure=false;
  const get=async(wallet:string,sortOrder:'asc'|'desc',maximum:number)=>{
   const rows:unknown[]=[],cursors=new Set<string>();let cursor:string|undefined;
   try{do{
    const response=await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,cache:'no-store',body:JSON.stringify({jsonrpc:'2.0',id:++id,method:'getTransactionsForAddress',params:[wallet,{transactionDetails:'full',sortOrder,limit:Math.min(100,maximum-rows.length),filters:{status:'succeeded'},commitment:'finalized',encoding:'jsonParsed',maxSupportedTransactionVersion:1,...(cursor?{paginationToken:cursor}:{})}]})});
    if(!response.ok)throw Error('Historical endpoint unavailable');const payload=obj(await response.json());if(payload.error)throw Error('Historical endpoint rejected query');const page=obj(payload.result);if(!Array.isArray(page.data))throw Error('Historical dataset unavailable');rows.push(...page.data.slice(0,maximum-rows.length));cursor=str(page.paginationToken)||undefined;if(cursor&&cursors.has(cursor))throw Error('Repeated historical cursor');if(cursor)cursors.add(cursor);if(!page.data.length)break;
   }while(cursor&&rows.length<maximum);
   }catch(error){if(rows.length)return {rows,cursor,incomplete:true};throw error;}
   return {rows,cursor,incomplete:false};
  };
  try{
   const pages=await Promise.allSettled([get(report.token,'asc',count),get(report.token,'desc',count)]);
   const early=pages[0].status==='fulfilled'?pages[0].value:undefined,recent=pages[1].status==='fulfilled'?pages[1].value:undefined;
   partialFailure=pages.some(p=>p.status==='rejected'||p.value.incomplete);
   result.coverage.earlyTransactions=early?.rows.length||0;result.coverage.recentTransactions=recent?.rows.length||0;result.coverage.historicalCursorRemaining=!!early?.cursor;
   const parsed=parseAlchemySolanaTransactions([...(early?.rows||[]),...(recent?.rows||[])],report.token);
   // Rent top-ups, relayer tips and arbitrary quote-route recipients are not
   // candidate token wallets. Keep native inflows only to observed traders,
   // creator identities or finalized holder candidates, preventing tip sinks
   // from becoming invented connected-holder groups.
   const investigatedWallets=new Set([...parsed.trades.map(t=>t.wallet),...parsed.identities.map(i=>i.address),...(walletAddresses||report.holders.map(h=>h.address))]);
   Object.assign(result,{trades:parsed.trades,transfers:parsed.transfers.filter(t=>!t.native||investigatedWallets.has(t.to)),identities:parsed.identities,labels:parsed.labels});
   const earlyParsed=parseAlchemySolanaTransactions(early?.rows||[],report.token);result.coverage.firstObservedTradeAt=earlyParsed.trades.map(t=>t.timestamp).sort()[0];
   const fundingLimit=Math.max(0,Math.min(8,deps.fundingWalletLimit??6));
   const observedBuyers=new Map<string,string>();
   for(const trade of [...earlyParsed.trades].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)))if(trade.side==='buy'&&!observedBuyers.has(trade.wallet))observedBuyers.set(trade.wallet,trade.timestamp);
   const holders=(walletAddresses||report.holders.map(h=>h.address)).filter(a=>!!address(a)&&!parsed.labels.some(l=>l.address===a));
   const fundingCandidates=new Map<string,string|undefined>([...observedBuyers.entries()].slice(0,Math.max(0,fundingLimit-2)));
   for(const wallet of holders)if(!fundingCandidates.has(wallet))fundingCandidates.set(wallet,observedBuyers.get(wallet));
   for(const item of observedBuyers)if(!fundingCandidates.has(item[0]))fundingCandidates.set(...item);
   const buyers=[...fundingCandidates].slice(0,fundingLimit);
   for(let i=0;i<buyers.length;i+=3){
    if(controller.signal.aborted)break;
    await Promise.all(buyers.slice(i,i+3).map(async([wallet,firstBuy])=>{try{
     const page=await get(wallet,'asc',20),funding=parseAlchemySolanaTransactions(page.rows,report.token);if(page.incomplete)partialFailure=true;
     // Sale proceeds, swap refunds and rent movements are still observations,
     // but never proof of acquisition funding. A target-mint balance footprint
     // also excludes unsupported swaps that our decoder cannot classify yet.
     const tokenActivity=new Set([...funding.trades.map(t=>t.transaction),...funding.transfers.filter(t=>!t.native&&t.token===report.token).map(t=>t.transaction)]);
     for(const raw of page.rows){const tx=obj(raw),meta=obj(tx.meta),transaction=obj(tx.transaction);if([...arr(meta.preTokenBalances),...arr(meta.postTokenBalances)].some(b=>obj(b).mint===report.token))tokenActivity.add(str(arr(transaction.signatures)[0]));}
     result.transfers.push(...funding.transfers.filter(t=>t.native&&t.to===wallet&&t.from!==wallet).map(t=>({...t,fundingEligible:!!firstBuy&&Date.parse(t.timestamp)<Date.parse(firstBuy)&&!tokenActivity.has(t.transaction)})));
     result.coverage.fundingWallets++;
    }catch{partialFailure=true;}}));
   }
   result.transfers=[...new Map(result.transfers.map(t=>[t.id,t])).values()];
   result.reasons.push(`Alchemy decoded ${parsed.acceptedTransactions} successful timestamped transactions from bounded oldest/latest mint-address history. ${parsed.rejectedTransactions} invalid/failed records were withheld. Only canonical Pump swaps with verified token-account transfers are classified; other programs and routes remain unclassified.`);
   result.reasons.push(`Mint-address indexing and bounded pages do not prove complete token-wide launch coverage. First-minute sniper labels are withheld. Native funding checks cover the first 20 indexed transactions of up to ${fundingLimit} observed buyers/current holders, one hop. Only incoming transfers strictly before a known first observed buy and outside target-token activity are eligible funding; sale proceeds, refunds, same-second transfers and holders without a known buy remain observations only. An absent result does not establish self-funding.`);
   if(partialFailure||controller.signal.aborted)result.reasons.push('One or more historical or funding requests failed or exceeded the scan deadline; successful evidence was retained.');
   result.sources.push({name:SOURCE,status:parsed.acceptedTransactions?'available':'unavailable',detail:`${result.trades.length} verified Pump trades, ${result.identities.length} creator records, ${result.transfers.length} observed transfers. Bounded evidence; launch history is incomplete.`,fetchedAt:new Date(now()).toISOString()});
   signal?.throwIfAborted();
   if(parsed.acceptedTransactions&&!partialFailure&&!controller.signal.aborted){
    for(const [entry,value] of cache)if(value.expires<=now())cache.delete(entry);
    if(cache.size>=64){const oldest=cache.keys().next().value;if(oldest)cache.delete(oldest);}
    cache.set(key,{expires:now()+300000,value:structuredClone(result)});
   }
   return result;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 };
}
