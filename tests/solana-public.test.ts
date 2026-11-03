import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSolanaPublic, SOLANA_TOKEN_PROGRAM, SOLANA_TOKEN_2022_PROGRAM} from '../src/lib/solana-public';

const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const authority='BJE5MMbqXjVwjAF7oxwPYXnTXDyspzZyt4vwenNw5ruG';
const owner='7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar';
const accountA='FYjHNoFtSQ5uijKrZFyYAxvEr87hsKXkXcxkcmkBAf4r';
const accountB='BnsywxTcaYeNUtzrPxQUvzAWxfzZe3ZLUJ4wMMuLESnu';
const at='2026-11-01T10:00:00.000Z';
const mintAccount=(changes:Record<string,unknown>={},program=SOLANA_TOKEN_PROGRAM)=>({owner:program,executable:false,data:{program:program===SOLANA_TOKEN_PROGRAM?'spl-token':'spl-token-2022',parsed:{type:'mint',info:{decimals:6,supply:'100000000',isInitialized:true,mintAuthority:authority,freezeAuthority:null,...changes}}}});
const tokenAccount=(amount:string,changes:Record<string,unknown>={},program=SOLANA_TOKEN_PROGRAM)=>({owner:program,executable:false,data:{parsed:{type:'account',info:{mint,owner,state:'initialized',tokenAmount:{amount,decimals:6,uiAmount:99999,uiAmountString:'99999'},...changes}}}});
type Request={id:number;method:string;params:unknown[]};
function fixture(overrides:Partial<Record<string,(request:Request)=>unknown>>={}) {
 const requests:Request[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body)) as Request;requests.push(request);
  if(overrides[request.method])return Response.json(overrides[request.method]!(request));
  const values:Record<string,unknown>={
   getTokenSupply:{context:{slot:100},value:{amount:'99000000',decimals:6,uiAmount:99,uiAmountString:'99'}},
   getAccountInfo:{context:{slot:101},value:mintAccount()},
   getTokenLargestAccounts:{context:{slot:102},value:[{address:accountA,amount:'2000000',decimals:6},{address:accountB,amount:'3000000',decimals:6}]},
   getMultipleAccounts:{context:{slot:103},value:[mintAccount(),tokenAccount('2000000'),tokenAccount('3000000')]},
  };
  return Response.json({jsonrpc:'2.0',id:request.id,result:values[request.method]});
 };
 return {requests,fetcher};
}

test('Solana snapshot aggregates distinct token accounts by owner using same-slot mint supply',async()=>{
 const f=fixture(),load=createSolanaPublic({fetcher:f.fetcher,now:()=>Date.parse(at)});
 const result=await load(mint);
 assert.equal(result.holders?.length,1);assert.equal(result.holders?.[0].address,owner);
 assert.equal(result.holders?.[0].balance,5);assert.equal(result.holders?.[0].share,5);
 assert.equal(result.totalSupply,100);assert.equal(result.holderCount,null);
 assert.equal(result.tokenAccounts.length,2);assert.equal(result.tokenAccounts[0].amountRaw,'2000000');
 assert.equal(result.snapshot.ownersSlot,103);assert.equal(result.snapshot.supplySlot,103);assert.equal(result.snapshot.largestAccountsSlot,102);
 assert.equal(result.authorities.mint.address,authority);assert.equal(result.authorities.freeze.address,null);
 assert.equal(result.identities[0].role,'authority');assert.equal(result.identities[0].authorityKind,'mint');
 assert(!result.identities.some(i=>i.role==='creator'));
 assert.equal(result.checks.find(c=>c.key==='solana_mint_authority')?.status,'warning');
 assert.equal(result.checks.find(c=>c.key==='solana_freeze_authority')?.status,'clear');
 assert.equal(f.requests.length,4);
 const joined=f.requests.find(r=>r.method==='getMultipleAccounts')!;
 assert.deepEqual(joined.params[0],[mint,accountA,accountB]);
 assert.equal((joined.params[1] as {minContextSlot:number}).minContextSlot,102);
 assert(result.reasons.some(r=>r.includes('20 token accounts')));
});

test('authority kinds remain separate for one address and absent fields remain unknown',async()=>{
 const f=fixture({getAccountInfo:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:101},value:mintAccount({freezeAuthority:authority})}}),getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount({freezeAuthority:authority}),tokenAccount('2'),tokenAccount('3')]}})});
 const result=await createSolanaPublic({fetcher:f.fetcher})(mint);
 assert.equal(result.identities.length,2);assert.deepEqual(result.identities.map(i=>i.authorityKind),['mint','freeze']);
 const malformed=mintAccount();delete (malformed.data.parsed.info as Record<string,unknown>).freezeAuthority;
 const missing=fixture({getAccountInfo:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:101},value:malformed}}),getTokenLargestAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:-32005,message:'unavailable'}})});
 const unknown=await createSolanaPublic({fetcher:missing.fetcher})(mint);
 assert.equal(unknown.holders,undefined);assert.equal(unknown.authorities.freeze.address,undefined);
 assert.equal(unknown.checks.find(c=>c.key==='solana_freeze_authority')?.status,'unknown');
});

test('owner-query failure preserves mint evidence without inventing empty holdings or leaking endpoint secrets',async()=>{
 const f=fixture({getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:-32000,message:'https://rpc.invalid/?secret=sensitive'}})});
 const result=await createSolanaPublic({fetcher:f.fetcher,rpcUrl:'https://rpc.invalid/?secret=sensitive'})(mint);
 assert.equal(result.holders,undefined);assert.equal(result.totalSupply,100);assert.equal(result.identities.length,1);
 assert(result.sources.some(s=>s.name==='Solana RPC Holders'&&s.status==='unavailable'));
 assert(!JSON.stringify(result).includes('sensitive'));
});

test('null or wrong-mint token accounts remain unresolved rather than token-account addresses becoming owners',async()=>{
 const f=fixture({getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount(),null,tokenAccount('3',{mint:authority})]}})});
 const result=await createSolanaPublic({fetcher:f.fetcher})(mint);
 assert.equal(result.holders,undefined);assert.equal(result.tokenAccounts.length,0);
 assert.equal(result.snapshot.unresolvedTokenAccounts,2);
 assert(!result.identities.some(i=>i.address===accountA||i.address===accountB));
});

test('raw tiny token amounts retain positive balances and percentages without trusting rounded uiAmount',async()=>{
 const f=fixture({getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount({decimals:18,supply:'1000000000000000000'}),tokenAccount('1',{tokenAmount:{amount:'1',decimals:18,uiAmount:0,uiAmountString:'0'}}),tokenAccount('0',{tokenAmount:{amount:'0',decimals:18}})]}})});
 const result=await createSolanaPublic({fetcher:f.fetcher})(mint);
 assert.equal(result.holders?.[0].balance,1e-18);assert.equal(result.holders?.[0].share,1e-16);
});

test('Token-2022 permanent delegate is a verified transfer/burn capability, not unknown',async()=>{
 const f=fixture({getAccountInfo:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:101},value:mintAccount({extensions:[{extension:'permanentDelegate',state:{delegate:authority}}]},SOLANA_TOKEN_2022_PROGRAM)}}),getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount({extensions:[{extension:'permanentDelegate',state:{delegate:authority}}]},SOLANA_TOKEN_2022_PROGRAM),tokenAccount('2',{},SOLANA_TOKEN_2022_PROGRAM),tokenAccount('3',{},SOLANA_TOKEN_2022_PROGRAM)]}})});
 const result=await createSolanaPublic({fetcher:f.fetcher})(mint);
 assert.equal(result.snapshot.tokenProgram,SOLANA_TOKEN_2022_PROGRAM);
 assert(result.reasons.some(r=>r.includes('Token-2022')));
 assert(result.extensions.includes('permanentDelegate'));
 assert.equal(result.checks.find(c=>c.key==='solana_extension_permanentDelegate')?.status,'critical');
 assert.equal(result.checks.find(c=>c.key==='solana_extension_permanentDelegate')?.value,authority);
});

async function extensionSnapshot(extensions:unknown){
 const account=mintAccount({mintAuthority:null,freezeAuthority:null,extensions},SOLANA_TOKEN_2022_PROGRAM);
 const f=fixture({getAccountInfo:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:101},value:account}}),getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[account,tokenAccount('2',{},SOLANA_TOKEN_2022_PROGRAM),tokenAccount('3',{},SOLANA_TOKEN_2022_PROGRAM)]}})});
 return createSolanaPublic({fetcher:f.fetcher,now:()=>Date.parse(at)})(mint);
}
test('metadata-only Token-2022 does not become an unknown transfer-control finding',async()=>{
 const result=await extensionSnapshot([{extension:'metadataPointer',state:{authority:null,metadataAddress:mint}},{extension:'tokenMetadata',state:{updateAuthority:null,mint,name:'Fixture',symbol:'FIX',uri:'https://example.invalid',additionalMetadata:[]}}]);
 assert.equal(result.checks.find(c=>c.key==='solana_extensions')?.status,'clear');
 assert(!result.checks.some(c=>c.status==='unknown'||c.status==='critical'||c.status==='warning'));
 assert.equal(result.identities.length,0);
 assert(result.checks.find(c=>c.key==='solana_extensions')?.description.includes('metadata'));
});
test('unsupported and malformed extensions preserve uncertainty instead of false clearance',async()=>{
 for(const extensions of [null,{},[{extension:'unparseableExtension'}],[{extension:'futureControl',state:{}}],[{extension:'permanentDelegate',state:{delegate:'invalid'}}],[{extension:'metadataPointer',state:{}}],[{extension:'tokenMetadata',state:{updateAuthority:null}}],[{extension:'transferHook',state:{authority:null}}],[null],[{extension:'defaultAccountState',state:{accountState:'uninitialized'}}],[{extension:'metadataPointer',state:{authority:null,metadataAddress:mint}},{extension:'metadataPointer',state:{authority:null,metadataAddress:mint}}]]){
  const result=await extensionSnapshot(extensions);
  assert.equal(result.checks.find(c=>c.key==='solana_extensions')?.status,'unknown',JSON.stringify(extensions));
 }
});
test('decoded hook, frozen default and scheduled fees have distinct evidence-backed findings',async()=>{
 const result=await extensionSnapshot([
  {extension:'transferHook',state:{authority,programId:owner}},
  {extension:'defaultAccountState',state:{accountState:'frozen'}},
  {extension:'transferFeeConfig',state:{transferFeeConfigAuthority:authority,withdrawWithheldAuthority:owner,withheldAmount:0,olderTransferFee:{epoch:1,maximumFee:10,transferFeeBasisPoints:100},newerTransferFee:{epoch:2,maximumFee:20,transferFeeBasisPoints:200}}},
 ]);
 assert.equal(result.checks.find(c=>c.key==='solana_extension_transferHook')?.status,'warning');
 assert.equal(result.checks.find(c=>c.key==='solana_extension_defaultAccountState')?.status,'critical');
 assert.equal(result.checks.find(c=>c.key==='solana_extension_transferFeeConfig')?.status,'warning');
 assert.equal(result.checks.find(c=>c.key==='solana_extension_transferFeeConfigAuthority')?.value,authority);
 assert(result.checks.find(c=>c.key==='solana_extension_withdrawWithheldAuthority')?.description.includes('withheld'));
 assert(!result.identities.some(i=>i.role==='creator'));
 assert(result.checks.every(c=>c.fetchedAt===at&&c.source==='Solana RPC authorities'));
});
test('revoked extension roles and zero capped fees do not imply active transfer restrictions',async()=>{
 const result=await extensionSnapshot([
  {extension:'permanentDelegate',state:{delegate:null}},
  {extension:'transferHook',state:{authority:null,programId:null}},
  {extension:'defaultAccountState',state:{accountState:'initialized'}},
  {extension:'transferFeeConfig',state:{transferFeeConfigAuthority:null,withdrawWithheldAuthority:null,withheldAmount:0,olderTransferFee:{epoch:1,maximumFee:0,transferFeeBasisPoints:100},newerTransferFee:{epoch:2,maximumFee:0,transferFeeBasisPoints:200}}},
 ]);
 assert(result.checks.every(c=>c.status==='clear'));
});
test('metadata edits are not token-spending roles and known risks survive an unsupported extension',async()=>{
 const metadata=await extensionSnapshot([{extension:'metadataPointer',state:{authority,metadataAddress:mint}}]);
 assert.equal(metadata.checks.find(c=>c.key==='solana_extension_metadataPointer')?.value,'Metadata remains editable');
 assert(metadata.checks.every(c=>c.status==='clear'));assert.equal(metadata.identities.length,0);
 const mixed=await extensionSnapshot([{extension:'permanentDelegate',state:{delegate:authority}},{extension:'confidentialTransferMint',state:{authority}}]);
 assert.equal(mixed.checks.find(c=>c.key==='solana_extension_permanentDelegate')?.status,'critical');
 assert.equal(mixed.checks.find(c=>c.key==='solana_extensions')?.status,'unknown');
});
test('malformed fee numbers cannot be rounded into a zero-fee clearance',async()=>{
 for(const invalid of [-1,10001,NaN,'100',1.5]){
  const result=await extensionSnapshot([{extension:'transferFeeConfig',state:{transferFeeConfigAuthority:null,withdrawWithheldAuthority:null,olderTransferFee:{epoch:1,maximumFee:10,transferFeeBasisPoints:invalid},newerTransferFee:{epoch:2,maximumFee:0,transferFeeBasisPoints:0}}}]);
  assert.equal(result.checks.find(c=>c.key==='solana_extension_transferFeeConfig')?.status,'unknown');
  assert.equal(result.checks.find(c=>c.key==='solana_extensions')?.status,'unknown');
 }
});
test('the official omitted empty extension vector is handled distinctly from a malformed list',async()=>{
 const result=await extensionSnapshot(undefined);
 assert.equal(result.checks.find(c=>c.key==='solana_extensions')?.status,'clear');
 assert.equal(result.checks.find(c=>c.key==='solana_extensions')?.value,'0 recognized extensions');
});

test('failed and malformed RPC results cannot become revoked authority or verified holdings',async()=>{
 const load=createSolanaPublic({fetcher:async()=>Response.json({jsonrpc:'2.0',id:999,result:{context:{slot:1},value:null}})});
 const result=await load(mint);
 assert.equal(result.holders,undefined);assert.equal(result.totalSupply,undefined);
 assert(result.checks.every(c=>c.status==='unknown'));assert.equal(result.identities.length,0);
 assert(result.sources.every(s=>s.status==='unavailable'));
});

test('cancellation before or during concurrent RPCs propagates without detached rejections',async()=>{
 const pre=new AbortController();pre.abort();let calls=0;
 const load=createSolanaPublic({fetcher:async(_url,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true}));}});
 await assert.rejects(()=>load(mint,{signal:pre.signal}));assert.equal(calls,0);
 const active=new AbortController(),pending=load(mint,{signal:active.signal});active.abort();
 await assert.rejects(()=>pending);await new Promise(resolve=>setTimeout(resolve,10));
});

test('default snapshot uses the canonical official endpoint and exposes provider provenance',async()=>{
 const f=fixture(),urls:string[]=[];
 const result=await createSolanaPublic({fetcher:async(url,init)=>{urls.push(String(url));return f.fetcher(url,init);},now:()=>Date.parse(at)})(mint);
 assert.equal(urls.length,4);assert.deepEqual([...new Set(urls)],['https://api.mainnet-beta.solana.com']);
 assert(result.sources.every(source=>source.detail.includes('Solana public RPC')));
 assert(result.identities.every(identity=>identity.source.includes('Solana public RPC')));
 for(const request of f.requests)assert.equal((request.params[1] as {commitment:string}).commitment,'finalized');
 assert.equal(result.checks.find(check=>check.key==='solana_mint_authority')?.source,'Solana RPC authorities');
 assert.equal(result.checks.find(check=>check.key==='solana_mint_authority')?.fetchedAt,at);
});

test('configured endpoint stays pinned on rate limit and never rotates providers or leaks credentials',async()=>{
 const urls:string[]=[];
 const result=await createSolanaPublic({rpcUrl:'https://private-rpc.invalid/?key=keep-private',fetcher:async(url)=>{urls.push(String(url));return new Response('',{status:429,headers:{'Retry-After':'60'}});}})(mint);
 assert.equal(urls.length,3);assert.equal(new Set(urls).size,1);assert(urls.every(url=>url.includes('private-rpc.invalid')));
 assert(result.sources.every(source=>source.detail.includes('Configured Solana RPC')));
 assert(!JSON.stringify(result).includes('keep-private'));assert.equal(result.holders,undefined);
});

test('owner account batch older than selected-account or mint slots cannot produce verified holdings',async()=>{
 const f=fixture({getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:101},value:[mintAccount(),tokenAccount('2000000'),tokenAccount('3000000')]}})});
 const result=await createSolanaPublic({fetcher:f.fetcher})(mint);
 assert.equal(result.holders,undefined);assert.equal(result.tokenAccounts.length,0);assert.equal(result.snapshot.ownersSlot,undefined);
 assert.equal(result.authorities.mint.slot,101);assert(result.sources.some(source=>source.name==='Solana RPC Holders'&&source.status==='unavailable'));
});

test('GoPlus candidates recover finalized owner aggregation without trusting provider owners, balances, or ranking',async()=>{
 const f=fixture({getTokenLargestAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:429,message:'Method unavailable'}})});let getCalls=0;
 const result=await createSolanaPublic({fetcher:async(url,init)=>{
  if(String(url).startsWith('https://api.gopluslabs.io/')){getCalls++;assert.equal(init?.method,'GET');return Response.json({code:1,result:{[mint]:{holders:[{account:authority,token_account:`${accountA},${accountB},${accountA}`,balance:'9999999',percent:'0.99'}]}}});}
  return f.fetcher(url,init);
 }})(mint);
 assert.equal(f.requests.length+getCalls,5);assert.equal(getCalls,1);assert.equal(result.holders?.[0].address,owner);
 assert.equal(result.holders?.[0].balance,5);assert.equal(result.holders?.[0].share,5);
 assert.equal(result.snapshot.largestAccountsSlot,undefined);assert.equal(result.snapshot.selectionSource,'goplus-token-accounts');
 assert.equal(result.snapshot.ownersSlot,103);assert.equal(result.snapshot.supplySlot,103);
 assert(result.sources.some(source=>source.name==='GoPlus Solana account candidates'&&source.status==='available'));
 assert(result.reasons.some(reason=>reason.includes('ranking is not verified')));
 assert.equal((f.requests.find(request=>request.method==='getMultipleAccounts')?.params[1] as {minContextSlot:number}).minContextSlot,101);
});

test('candidate fallback never promotes wrong-mint or wrong-program accounts to holder wallets',async()=>{
 const f=fixture({getTokenLargestAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:429,message:'Unavailable'}}),getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount(),tokenAccount('2',{mint:authority}),tokenAccount('3',{},SOLANA_TOKEN_2022_PROGRAM)]}})});
 const result=await createSolanaPublic({fetcher:async(url,init)=>String(url).startsWith('https://api.gopluslabs.io/')?Response.json({code:1,result:{[mint]:{holders:[{token_account:`${accountA},${accountB}`,account:owner,balance:'5',percent:'0.05'}]}}}):f.fetcher(url,init)})(mint);
 assert.equal(result.holders,undefined);assert.equal(result.tokenAccounts.length,0);assert.equal(result.snapshot.unresolvedTokenAccounts,2);
 assert.equal(result.authorities.mint.address,authority);assert.equal(result.authorities.mint.slot,101);
});

test('fallback takes at most twenty unique candidates from ten rows and verifies them in one account batch',async()=>{
 const candidates=[...'123456789ABCDEFGHJKLMNPQRS'].map(character=>character.repeat(32));
 const f=fixture({getTokenLargestAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:429,message:'Unavailable'}}),getMultipleAccounts:r=>({jsonrpc:'2.0',id:r.id,result:{context:{slot:103},value:[mintAccount(),...(r.params[0] as string[]).slice(1).map(()=>tokenAccount('1'))]}})});
 let getCalls=0;
 const result=await createSolanaPublic({fetcher:async(url,init)=>{
  if(String(url).startsWith('https://api.gopluslabs.io/')){getCalls++;return Response.json({code:1,result:{[mint]:{holders:Array.from({length:15},(_,i)=>({token_account:[candidates[i+10],...candidates,candidates[i]].join(',')}))}}});}
  return f.fetcher(url,init);
 }})(mint);
 const queried=f.requests.find(request=>request.method==='getMultipleAccounts')!.params[0] as string[];
 assert.equal(queried.length,21);assert.equal(new Set(queried.slice(1)).size,20);assert.equal(result.snapshot.selectedTokenAccounts,20);
 assert.equal(result.tokenAccounts.length,20);assert.equal(f.requests.length+getCalls,5);
});

test('failed GoPlus code or missing candidate fields cannot become empty holders and mint evidence survives',async()=>{
 for(const payload of [{code:0,result:{[mint]:{holders:[{token_account:accountA}]}}},{code:1,result:{[mint]:{holders:[{account:owner,balance:'5'}]}}}]){
  const f=fixture({getTokenLargestAccounts:r=>({jsonrpc:'2.0',id:r.id,error:{code:429,message:'Unavailable'}})});let calls=0;
  const result=await createSolanaPublic({fetcher:async(url,init)=>{calls++;return String(url).startsWith('https://api.gopluslabs.io/')?Response.json(payload):f.fetcher(url,init);}})(mint);
  assert.equal(calls,4);assert.equal(result.holders,undefined);assert.equal(result.authorities.mint.address,authority);
  assert(result.sources.some(source=>source.name==='GoPlus Solana account candidates'&&source.status==='unavailable'));
 }
});
