import {validateToken, type Check, type Report} from './analysis';
import type {IdentityRecord, InvestigationInput} from './investigation';

// RPC account program ownership is distinct from parsed token-account ownership.
export const SOLANA_TOKEN_PROGRAM='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const SOLANA_TOKEN_2022_PROGRAM='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
// Canonical public cluster URL: https://solana.com/docs/references/clusters
const DEFAULT_RPC='https://api.mainnet-beta.solana.com';
const U64_MAX=18446744073709551615n;
type Row=Record<string,unknown>;
const obj=(v:unknown):Row=>v&&typeof v==='object'&&!Array.isArray(v)?v as Row:{};
const address=(v:unknown)=>typeof v==='string'&&!validateToken('solana',v)?v:undefined;
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:undefined;
const decimals=(v:unknown)=>integer(v)!==undefined&&(v as number)<=255?v as number:undefined;
const raw=(v:unknown)=>{
 if(typeof v!=='string'||!/^\d{1,20}$/.test(v))return undefined;
 const n=BigInt(v);return n<=U64_MAX?n:undefined;
};
const units=(v:bigint,scale:number)=>Number(v)/10**scale;
const tokenProgram=(v:unknown)=>v===SOLANA_TOKEN_PROGRAM||v===SOLANA_TOKEN_2022_PROGRAM?v:undefined;

export type SolanaAuthority={address?:string|null;slot?:number;timestamp?:string};
export type SolanaIdentity=IdentityRecord&{authorityKind:'mint'|'freeze';label:string;slot:number};
export type SolanaTokenAccount={address:string;owner:string;mint:string;amountRaw:string;decimals:number;slot:number;timestamp:string;state:'initialized'|'frozen';extensions:string[]};
export type SolanaPublicResult={
 holders?:InvestigationInput['holders'];holderCount:null;totalSupply?:number;
 identities:SolanaIdentity[];checks:Check[];sources:Report['sources'];reasons:string[];truncated:true;
 authorities:{mint:SolanaAuthority;freeze:SolanaAuthority};tokenAccounts:SolanaTokenAccount[];extensions:string[];
 snapshot:{commitment:'finalized';mintSlot?:number;supplySlot?:number;largestAccountsSlot?:number;ownersSlot?:number;tokenProgram?:string;selectionSource?:'rpc-largest-accounts'|'goplus-token-accounts';selectionTimestamp?:string;selectedTokenAccounts:number;unresolvedTokenAccounts:number;fetchedAt:string};
};
type RpcSnapshot={value:unknown;slot:number;timestamp:string};
type MintState={program:string;mintAuthority?:string|null;freezeAuthority?:string|null;amount?:bigint;decimals?:number;extensions:string[];extensionState:unknown;slot:number;timestamp:string};
const extensionNames=(info:Row)=>Array.isArray(info.extensions)?info.extensions.flatMap(e=>typeof obj(e).extension==='string'?[obj(e).extension as string]:[]):[];
const authority=(info:Row,key:string):string|null|undefined=>info[key]===null?null:address(info[key]);
function mintState(value:unknown,slot:number,timestamp:string):MintState|undefined{
 const account=obj(value),program=tokenProgram(account.owner),parsed=obj(obj(account.data).parsed),info=obj(parsed.info);
 if(!program||account.executable!==false||parsed.type!=='mint'||info.isInitialized!==true)return undefined;
 return {program,mintAuthority:authority(info,'mintAuthority'),freezeAuthority:authority(info,'freezeAuthority'),amount:raw(info.supply),decimals:decimals(info.decimals),extensions:extensionNames(info),extensionState:info.extensions,slot,timestamp};
}

/** Parsed schema: Agave account-decoder-client-types/src/token.rs (UiExtension).
 * Only these decoded capabilities are classified. Unsupported extensions remain
 * unknown; metadata authorities must never become mint/freeze/creator identities.
 */
function extensionChecks(mint:MintState):Check[]{
 const checks:Check[]=[],unsupported:string[]=[],seen=new Set<string>();
 const add=(key:string,title:string,status:Check['status'],value:string,description:string)=>checks.push({key:`solana_extension_${key}`,title,status,value,description:`${description} Finalized mint slot ${mint.slot}.`,source:'Solana RPC authorities',fetchedAt:mint.timestamp});
 // Agave omits an empty extension vector. An explicit malformed value is different.
 const entries=mint.extensionState===undefined?[]:Array.isArray(mint.extensionState)?mint.extensionState:undefined;
 if(!entries)unsupported.push('Malformed extension list');
 for(const entry of entries||[]){
  const e=obj(entry),name=typeof e.extension==='string'?e.extension:'Malformed extension',state=obj(e.state);
  if(seen.has(name)){unsupported.push(`Duplicate ${name}`);continue;}seen.add(name);
  const role=(field:string,title:string,description:string,activeStatus:Check['status']='warning')=>{
   const value=authority(state,field);
   add(field,title,value===undefined?'unknown':value===null?'clear':activeStatus,value===undefined?'Not decoded':value===null?'Revoked':value,value===undefined?`${title} was not decoded.`:value===null?`No ${title.toLowerCase()} is set.`:description);
   if(value===undefined)unsupported.push(`${name}.${field}`);
   return value;
  };
  if(name==='metadataPointer'||name==='tokenMetadata'){
   const field=name==='metadataPointer'?'authority':'updateAuthority',value=authority(state,field);
   const valid=name==='metadataPointer'?authority(state,'metadataAddress')!==undefined:!!address(state.mint)&&['name','symbol','uri'].every(k=>typeof state[k]==='string')&&Array.isArray(state.additionalMetadata)&&state.additionalMetadata.every(v=>Array.isArray(v)&&v.length===2&&v.every(s=>typeof s==='string'));
   if(value===undefined||!valid){unsupported.push(name);continue;}
   add(name,name==='metadataPointer'?'Metadata pointer':'Token metadata','clear',value===null?'Update authority revoked':'Metadata remains editable',`This extension controls metadata, not minting, freezing, or spending wallet tokens.${value?` Metadata authority: ${value}.`:''}`);
  }else if(name==='permanentDelegate'){
   const value=authority(state,'delegate');
   if(value===undefined)unsupported.push(name);
   add(name,'Permanent transfer/burn delegate',value===undefined?'unknown':value===null?'clear':'critical',value===undefined?'Not decoded':value===null?'Revoked':value,value===undefined?'The delegate field could not be decoded.':value===null?'No permanent delegate is set.':'This delegate can transfer or burn tokens from holders without their signature. This is an active capability, not evidence of misuse.');
  }else if(name==='transferHook'){
   const value=authority(state,'programId'),admin=authority(state,'authority');
   if(value===undefined||admin===undefined)unsupported.push(name);
   add(name,'Transfer hook',value||admin?'warning':value===undefined||admin===undefined?'unknown':'clear',value?`Program: ${value}`:admin?'Hook can be enabled':value===null&&admin===null?'Disabled and immutable':'Not decoded',`A configured hook adds program-defined transfer conditions.${value?' Hook program behavior is not audited here.':''}${admin?` Hook update authority: ${admin}.`:admin===null?' Hook update authority is revoked.':' Hook update authority is not decoded.'}`);
  }else if(name==='defaultAccountState'){
   const value=state.accountState,valid=value==='initialized'||value==='frozen';
   if(!valid)unsupported.push(name);
   add(name,'Default token account state',!valid?'unknown':value==='frozen'?'critical':'clear',valid?value:'Not decoded',value==='frozen'?'New token accounts start frozen and require the freeze authority to thaw them. This does not prove existing accounts are frozen.':value==='initialized'?'New token accounts do not start frozen.':'Default account state was not decoded.');
  }else if(name==='transferFeeConfig'){
   role('transferFeeConfigAuthority','Transfer fee update authority','This authority can change future transfer fees.');
   role('withdrawWithheldAuthority','Withheld fee withdrawal authority','This authority can withdraw withheld transfer fees. It cannot use this role to spend ordinary holder balances.','clear');
   const fee=(value:unknown)=>{const f=obj(value),bp=integer(f.transferFeeBasisPoints),epoch=integer(f.epoch),maximum=integer(f.maximumFee);return bp!==undefined&&bp<=10000&&epoch!==undefined&&maximum!==undefined?{bp,epoch,maximum}:undefined;};
   const older=fee(state.olderTransferFee),newer=fee(state.newerTransferFee);
   if(!older||!newer)unsupported.push(name);
   const charged=(older&&older.bp>0&&older.maximum>0)||(newer&&newer.bp>0&&newer.maximum>0);
   add(name,'Configured transfer fees',charged?'warning':!older||!newer?'unknown':'clear',older&&newer?`${older.bp/100}% / ${newer.bp/100}% (older / newer schedule)`:'Incomplete fee schedules',older&&newer?`Older schedule: epoch ${older.epoch}, cap ${older.maximum} raw units. Newer schedule: epoch ${newer.epoch}, cap ${newer.maximum} raw units. The applicable schedule depends on the transfer epoch; these are not DEX buy/sell taxes.`:'Both fee schedules must be decoded; missing values are not zero fees.');
  }else if(name==='nonTransferable'){
   add(name,'Non-transferable token','critical','Transfers disabled','This mint extension prevents token transfers.');
  }else unsupported.push(name);
 }
 const metadataOnly=seen.size>0&&[...seen].every(n=>n==='metadataPointer'||n==='tokenMetadata');
 // Summary describes decoding coverage only. Individual checks carry severity;
 // duplicating their warnings here would double count the same capability.
 checks.push({key:'solana_extensions',title:'Token-2022 extension decoding',status:unsupported.length?'unknown':'clear',value:unsupported.length?`Unresolved: ${[...new Set(unsupported)].join(', ')}`:metadataOnly?'Metadata-only extensions':`${seen.size} recognized extensions`,description:unsupported.length?'Some parsed extension state is unsupported or malformed. Known capability findings remain valid, but missing fields are not evidence of revoked controls.':metadataOnly?'Returned extensions affect metadata only. No additional transfer-control extension was reported in this finalized mint snapshot. This is not a historical or protocol-wide audit.':'Recognized parsed mint extensions were decoded at this slot. See the individual capability findings; decoding coverage is not a safety verdict.',source:'Solana RPC authorities',fetchedAt:mint.timestamp});
 return checks;
}
function parsedTokenAccount(value:unknown,accountAddress:string,mint:string,slot:number,timestamp:string,expectedProgram?:string):SolanaTokenAccount|undefined{
 const account=obj(value),program=tokenProgram(account.owner),parsed=obj(obj(account.data).parsed),info=obj(parsed.info),amountInfo=obj(info.tokenAmount);
 const owner=address(info.owner),amount=raw(amountInfo.amount),scale=decimals(amountInfo.decimals);
 if(!program||(expectedProgram&&program!==expectedProgram)||account.executable!==false||parsed.type!=='account'||info.mint!==mint||!owner||amount===undefined||scale===undefined||!['initialized','frozen'].includes(String(info.state)))return undefined;
 return {address:accountAddress,owner,mint,amountRaw:amount.toString(),decimals:scale,slot,timestamp,state:info.state as 'initialized'|'frozen',extensions:extensionNames(info)};
}

/** Four RPC reads maximum, plus one independent GoPlus candidate GET only when
 * the expensive largest-account method is unavailable but other RPC reads work.
 * GoPlus token_account fields are candidates only: verify their mint, owner and
 * raw amount in the same finalized bank as the mint supply before showing holders.
 * Pass an optional server-owned RPC URL here;
 * never expose that URL, its query credentials, or upstream error text in reports.
 * getMultipleAccounts includes the mint so share denominators and account balances
 * can be read from one bank. The earlier top-20 ranking may have a different slot.
 */
export function createSolanaPublic(deps:{rpcUrl?:string;fetcher?:typeof fetch;now?:()=>number}={}){
 return async(mint:string,options:{signal?:AbortSignal}={}):Promise<SolanaPublicResult>=>{
  if(typeof window!=='undefined')throw Error('Solana snapshot adapters are server-only.');
  options.signal?.throwIfAborted();
  if(validateToken('solana',mint))throw Error('Invalid Solana mint address.');
  const now=deps.now||Date.now,timestamp=()=>new Date(now()).toISOString();
  const result:SolanaPublicResult={holderCount:null,identities:[],checks:[],sources:[],reasons:[],truncated:true,authorities:{mint:{},freeze:{}},tokenAccounts:[],extensions:[],snapshot:{commitment:'finalized',selectedTokenAccounts:0,unresolvedTokenAccounts:0,fetchedAt:timestamp()}};
  const endpoint=deps.rpcUrl?.trim()||DEFAULT_RPC;
  const providerLabel=deps.rpcUrl?.trim()?'Configured Solana RPC':'Solana public RPC';
  const signal=AbortSignal.any([AbortSignal.timeout(30_000),...(options.signal?[options.signal]:[])]);
  let sequence=0;
  const rpc=async(method:string,params:unknown[]):Promise<RpcSnapshot>=>{
   options.signal?.throwIfAborted();signal.throwIfAborted();
   // The endpoint is server configuration, never a request parameter. Errors are
   // intentionally generic because custom RPC URLs often contain API credentials.
   let url:URL;try{url=new URL(endpoint);}catch{throw Error('Invalid RPC configuration.');}
   if(!['http:','https:'].includes(url.protocol))throw Error('Invalid RPC configuration.');
   const id=++sequence;
   const response=await(deps.fetcher||fetch)(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.any([signal,AbortSignal.timeout(12_000)]),cache:'no-store'});
   if(!response.ok)throw Error('RPC request unavailable.');
   const payload=obj(await response.json()),data=obj(payload.result),slot=integer(obj(data.context).slot);
   if(payload.error||payload.jsonrpc!=='2.0'||payload.id!==id||slot===undefined||!Object.hasOwn(data,'value'))throw Error('RPC response invalid or unavailable.');
   options.signal?.throwIfAborted();
   return {value:data.value,slot,timestamp:timestamp()};
  };
  const run=async<T>(name:string,detail:string,operation:()=>Promise<T>,provider=providerLabel):Promise<T|undefined>=>{
   try{const value=await operation();options.signal?.throwIfAborted();result.sources.push({name,status:'available',detail:`${provider}: ${detail}`,fetchedAt:timestamp()});return value;}
   catch{options.signal?.throwIfAborted();result.sources.push({name,status:'unavailable',detail:`${provider}: request failed, timed out or returned an unsupported/invalid response. Previous evidence must retain its original timestamp.`});result.reasons.push(`${name} unavailable. Public endpoints can be rate limited; an optional server-configured RPC can provide more reliable account reads.`);return undefined;}
  };
  const [supply,initialMint,largest]=await Promise.all([
   run('Solana RPC supply','Current mint supply from getTokenSupply at finalized commitment.',async()=>{
    const snapshot=await rpc('getTokenSupply',[mint,{commitment:'finalized'}]),value=obj(snapshot.value),amount=raw(value.amount),scale=decimals(value.decimals);
    if(amount===undefined||scale===undefined)throw Error('Invalid token supply.');
    return {...snapshot,amount,decimals:scale};
   }),
   run('Solana RPC authorities','Parsed mint account: mint and freeze authority are snapshot roles, not creator identities.',async()=>{
    const snapshot=await rpc('getAccountInfo',[mint,{encoding:'jsonParsed',commitment:'finalized'}]);
    const state=mintState(snapshot.value,snapshot.slot,snapshot.timestamp);
    if(!state)throw Error('Parsed mint state unavailable.');return state;
   }),
   run('Solana RPC largest accounts','At most 20 token accounts. This is not the top 20 distinct owners or a total holder count.',async()=>{
    const snapshot=await rpc('getTokenLargestAccounts',[mint,{commitment:'finalized'}]);
    if(!Array.isArray(snapshot.value))throw Error('Largest-account list unavailable.');
    const selected:string[]=[];
    for(const item of snapshot.value.slice(0,20)){
     const a=address(obj(item).address);
     if(!a)throw Error('Invalid largest-account address.');
     if(!selected.includes(a))selected.push(a);
    }
    return {...snapshot,addresses:selected};
   }),
  ]);
  let selection: {addresses:string[];slot?:number;timestamp:string;source:'rpc-largest-accounts'|'goplus-token-accounts'}|undefined=largest?{...largest,source:'rpc-largest-accounts'}:undefined;
  if(!selection&&(supply||initialMint)){
   selection=await run('GoPlus Solana account candidates','At most 20 distinct token-account candidates from the first 10 provider holder rows. Provider balances, percentages and owner fields are not used. Candidate ranking and slot are not verified.',async()=>{
    options.signal?.throwIfAborted();signal.throwIfAborted();
    // Documented holders[].token_account field; current API may comma-separate
    // several accounts. Never promote the undocumented account field to owner.
    // https://docs.gopluslabs.io/reference/response-detail-1
    const response=await(deps.fetcher||fetch)(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${encodeURIComponent(mint)}`,{method:'GET',headers:{Accept:'application/json'},signal:AbortSignal.any([signal,AbortSignal.timeout(8_000)]),cache:'no-store'});
    if(!response.ok)throw Error('Candidate source unavailable.');
    const payload=obj(await response.json()),token=obj(obj(payload.result)[mint]);
    if(payload.code!==1||!Array.isArray(token.holders))throw Error('Candidate response invalid.');
    const rows=token.holders.slice(0,10).map(value=>{
     const field=obj(value).token_account;
     return typeof field==='string'&&field.length<=100_000?field.split(',',20).flatMap(value=>{const candidate=address(value.trim());return candidate?[candidate]:[];}):[];
    });
    const addresses:string[]=[];
    // Round-robin keeps one prolific holder's account list from consuming the
    // entire sample before candidates from the other reported holders are read.
    for(let i=0;i<20&&addresses.length<20;i++)for(const row of rows){const candidate=row[i];if(candidate&&!addresses.includes(candidate))addresses.push(candidate);if(addresses.length===20)break;}
    if(!addresses.length)throw Error('No verifiable token-account candidates.');
    return {addresses,timestamp:timestamp(),source:'goplus-token-accounts' as const};
   },'GoPlus Solana Security API');
  }
  let currentMint=initialMint;
  if(supply){result.totalSupply=units(supply.amount,supply.decimals);result.snapshot.supplySlot=supply.slot;}
  if(selection){
   result.snapshot.largestAccountsSlot=selection.slot;result.snapshot.selectedTokenAccounts=selection.addresses.length;
   result.snapshot.selectionSource=selection.source;result.snapshot.selectionTimestamp=selection.timestamp;
   if(selection.addresses.length){
    const minSlot=Math.max(selection.slot||0,supply?.slot||0,initialMint?.slot||0);
    const joined=await run('Solana RPC Holders','Selected token accounts grouped by their parsed owner. Amounts cover only those accounts; other accounts owned by the same wallet are outside scope.',async()=>{
     const snapshot=await rpc('getMultipleAccounts',[[mint,...selection.addresses],{encoding:'jsonParsed',commitment:'finalized',minContextSlot:minSlot}]);
     if(snapshot.slot<minSlot||!Array.isArray(snapshot.value)||snapshot.value.length!==selection.addresses.length+1)throw Error('Owner account snapshot incomplete.');
     const values=snapshot.value,joinedMint=mintState(values[0],snapshot.slot,snapshot.timestamp);
     const accounts=selection.addresses.flatMap((a,i)=>{
      const parsed=parsedTokenAccount(values[i+1],a,mint,snapshot.slot,snapshot.timestamp,joinedMint?.program||initialMint?.program);
      return parsed?[parsed]:[];
     });
     result.snapshot.unresolvedTokenAccounts=selection.addresses.length-accounts.length;
     if(!accounts.length)throw Error('No selected token-account owners could be verified.');
     return {...snapshot,mint:joinedMint,accounts};
    });
    if(joined){
     result.tokenAccounts=joined.accounts;result.snapshot.ownersSlot=joined.slot;
     if(joined.mint)currentMint=joined.mint;
     const owners=new Map<string,{amount:bigint;decimals:number;consistent:boolean}>();
     for(const account of joined.accounts){
      const existing=owners.get(account.owner),amount=BigInt(account.amountRaw);
      if(existing){existing.amount+=amount;existing.consistent&&=existing.decimals===account.decimals;}
      else owners.set(account.owner,{amount,decimals:account.decimals,consistent:true});
     }
     result.holders=[...owners].map(([owner,balance]):InvestigationInput['holders'][number]=>{
      if(!balance.consistent)return {address:owner,share:null};
      const comparable=joined.mint?.amount!==undefined&&joined.mint.decimals===balance.decimals&&joined.mint.amount>0n&&balance.amount<=joined.mint.amount;
      const share=comparable?Number(balance.amount*100n)/Number(joined.mint!.amount!):null;
      return {address:owner,balance:units(balance.amount,balance.decimals),share};
     }).sort((a,b)=>(b.balance||0)-(a.balance||0));
     if(!joined.mint||joined.mint.amount===undefined||joined.mint.decimals===undefined)result.reasons.push('Owner balances were read, but a matching mint supply at the same slot was unavailable; supply shares are unknown.');
     if(result.snapshot.unresolvedTokenAccounts)result.reasons.push(`${result.snapshot.unresolvedTokenAccounts} selected token accounts were missing, unsupported or changed; only verified owners and balances are shown.`);
    }else if(!result.snapshot.unresolvedTokenAccounts)result.snapshot.unresolvedTokenAccounts=selection.addresses.length;
   }else{
    result.holders=[];
    result.sources.push({name:'Solana RPC Holders',status:'available',detail:`${providerLabel}: the finalized largest-account query returned an empty token-account sample. Total distinct holder count remains unknown.`,fetchedAt:selection.timestamp});
   }
  }
  if(currentMint){
   result.snapshot.tokenProgram=currentMint.program;result.snapshot.mintSlot=currentMint.slot;result.extensions=currentMint.extensions;
   if(currentMint.amount!==undefined&&currentMint.decimals!==undefined){result.totalSupply=units(currentMint.amount,currentMint.decimals);result.snapshot.supplySlot=currentMint.slot;}
   for(const kind of ['mint','freeze'] as const){
    const value=kind==='mint'?currentMint.mintAuthority:currentMint.freezeAuthority;
    result.authorities[kind]={address:value,slot:currentMint.slot,timestamp:currentMint.timestamp};
    if(value)result.identities.push({address:value,role:'authority',authorityKind:kind,label:kind==='mint'?'Mint authority':'Freeze authority',slot:currentMint.slot,timestamp:currentMint.timestamp,timestampBasis:'local-observation',source:`Solana RPC parsed mint via ${providerLabel} (${kind} authority; finalized slot ${currentMint.slot})`});
   }
   // Authority source freshness must match the final selected mint snapshot.
   result.sources=result.sources.filter(s=>s.name!=='Solana RPC authorities');
   result.sources.push({name:'Solana RPC authorities',status:'available',detail:`${providerLabel}: mint and freeze roles read from finalized mint slot ${currentMint.slot}. Null means that particular role is revoked; absent fields remain unknown.`,fetchedAt:currentMint.timestamp});
  }
  for(const kind of ['mint','freeze'] as const){
   const a=result.authorities[kind],name=kind==='mint'?'Mint authority':'Freeze authority';
   result.checks.push({key:`solana_${kind}_authority`,source:'Solana RPC authorities',fetchedAt:a.timestamp,title:name,status:a.address===undefined?'unknown':a.address===null?'clear':'warning',value:a.address===undefined?'Not reported':a.address===null?'Revoked':a.address,description:a.address===undefined?`${name} could not be verified from parsed mint state.`:a.address===null?`No ${kind} authority is set at finalized slot ${a.slot}. This says nothing about other token controls.`:kind==='mint'?`This address can mint additional tokens under the token program at finalized slot ${a.slot}. It is not necessarily the creator.`:`This address can freeze token accounts under the token program at finalized slot ${a.slot}. This is a capability, not evidence that accounts were frozen.`});
  }
  if(currentMint?.program===SOLANA_TOKEN_2022_PROGRAM){
   result.reasons.push('Token-2022 recognized mint extension capabilities are decoded from the finalized RPC snapshot; unsupported or malformed extensions remain explicit. Hook program behavior, historical changes and hidden balances are not audited. Displayed balances are raw base amounts divided by decimals.');
   result.checks.push(...extensionChecks(currentMint));
  }else if(currentMint?.program===SOLANA_TOKEN_PROGRAM){
   // The classic program has no Token-2022 extension surface. Only a parsed,
   // initialized mint with verified program ownership qualifies for this pass.
   result.checks.push({key:'solana_extensions',title:'Token extension controls',status:'clear',value:'Not applicable - classic SPL Token',description:`The mint is owned by the classic SPL Token program at finalized mint slot ${currentMint.slot}. Token-2022 extensions do not apply. Mint and freeze controls are checked separately.`,source:'Solana RPC authorities',fetchedAt:currentMint.timestamp});
  }
  result.reasons.push(selection?.source==='goplus-token-accounts'?'Solana account candidates came from GoPlus holder listings; ranking is not verified and the candidate list has no proven slot. At most 20 token accounts are re-read with the mint at one finalized bank, then balances are grouped by their verified parsed owner. Other accounts held by those owners remain outside this sample; these are sampled balances, not complete wallet holdings.':'Solana snapshot covers at most 20 token accounts selected at one finalized slot, then aggregates their verified balances by parsed owner at a later finalized slot. An owner may have more accounts outside this sample; these are sampled balances and shares, not complete wallet holdings or a distinct-holder census.');
  result.reasons.push('RPC snapshot slots are preserved; retrieval timestamps are not block timestamps. Current mint/freeze authority does not identify the historical creator. No launch, first-buyer, funding or historical-balance completeness is established.');
  result.snapshot.fetchedAt=timestamp();return result;
 };
}
