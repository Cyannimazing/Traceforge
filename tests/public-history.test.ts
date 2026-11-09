import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicHistory, parsePoolTrades, parseExplorerHolders, parseExplorerTransfers, HOLDER_PHASE_MS, HOLDER_FIRST_PAGE_TIMEOUT_MS } from '../src/lib/public-history';
import type { Report } from '../src/lib/analysis';

const token='0x1111111111111111111111111111111111111111';
const buyer='0x2222222222222222222222222222222222222222';
const funder='0x3333333333333333333333333333333333333333';
const at='2026-01-01T00:00:00Z';
const trade={id:'event-1',attributes:{tx_hash:'hash',tx_from_address:buyer,block_timestamp:at,kind:'buy',from_token_address:token,to_token_address:funder,from_token_amount:'7',to_token_amount:'2'}};
const report:Report={chain:'ethereum',token,name:'Test',symbol:'T',fetchedAt:at,market:{chainId:'ethereum',pairAddress:funder,baseToken:{address:token}},holders:[],holderCount:null,checks:[],sources:[]};

test('funding-only Robinhood phase uses final supplied wallet addresses without metadata or holder requests',async()=>{
 const urls:string[]=[],explicit='0x4444444444444444444444444444444444444444';
 const read=createPublicHistory({fetcher:async input=>{const url=String(input);urls.push(url);return Response.json({items:url.includes('/internal-transactions')?[]:[{hash:'fund',status:'ok',timestamp:at,block_number:10,value:'1000000000000000001',from:{hash:funder},to:{hash:explicit}}],next_page_params:null});}});
 const result=await read('robinhood',token,{report:{...report,chain:'robinhood',holders:[{address:buyer,share:1,contract:false,locked:null,tag:''}]},mode:'deep',limit:100,fundingOnly:true,walletAddresses:[explicit.toUpperCase().replace('0X','0x'),explicit,'invalid']});
 assert.equal(urls.length,2);assert(urls.every(url=>url.includes(`/addresses/${explicit}/`)));assert.equal(result.holders,undefined);assert.equal(result.trades.length,0);assert.equal(result.transfers[0].amountRaw,'1000000000000000001');assert.equal(result.transfers[0].decimals,18);assert.match(result.transfers[0].source,/not independently receipt-verified/);
});

test('empty explorer holder page falls back to nonempty report holder snapshot for funding',async()=>{
 const urls:string[]=[];const read=createPublicHistory({fetcher:async input=>{const url=String(input);urls.push(url);if(url.includes('/holders'))return Response.json({items:[],next_page_params:null});if(url.includes('/transactions')||url.includes('/internal-transactions'))return Response.json({items:[],next_page_params:null});return Response.json({type:'ERC-20',is_contract:true});}});
 await read('robinhood',token,{report:{...report,chain:'robinhood',market:null,holders:[{address:buyer,share:1,contract:false,locked:null,tag:''}]},mode:'deep',limit:100});
 assert(urls.some(url=>url.includes(`/addresses/${buyer}/transactions`)));
});

test('access denial stops funding fanout and remains explicit across the later funding phase',async()=>{
 let requests=0;const read=createPublicHistory({fetcher:async()=>{requests++;return new Response('blocked',{status:403});}});
 const holders=Array.from({length:10},(_,i)=>({address:'0x'+(i+10).toString(16).padStart(40,'0'),share:1,contract:false,locked:null,tag:''}));
 const options={report:{...report,chain:'robinhood' as const,holders},mode:'deep' as const,limit:100,fundingOnly:true};
 const result=await read('robinhood',token,options);assert.equal(requests,2);assert.equal(result.transfers.length,0);assert(result.sources.every(source=>source.status==='unavailable'));assert.match(result.reasons.join(' '),/403|access denied/);
 await read('robinhood',token,options);assert.equal(requests,2);
});

test('funding-only holder refresh and explicit infrastructure never request wallet history',async()=>{
 let requests=0;const read=createPublicHistory({fetcher:async()=>{requests++;throw Error('Unexpected request');}});
 await read('robinhood',token,{report,mode:'holders',limit:100,fundingOnly:true});
 await read('robinhood',token,{report:{...report,holders:[{address:buyer,share:1,contract:false,locked:null,tag:'pool'}]},walletAddresses:[buyer],mode:'deep',limit:100,fundingOnly:true});
 assert.equal(requests,0);
});

test('Robinhood opaque pool IDs retrieve bounded trades while explorer failures remain explicit',async()=>{
 const poolId='0x'+'a'.repeat(64),urls:string[]=[];
 const read=createPublicHistory({now:()=>Date.parse(at),fetcher:async(input)=>{const url=String(input);urls.push(url);return url.includes('geckoterminal')?Response.json({data:[{...trade,attributes:{...trade.attributes,from_token_address:funder,to_token_address:token}}]}):new Response('',{status:403});}});
 const result=await read('robinhood',token,{report:{...report,chain:'robinhood',market:{chainId:'robinhood',pairAddress:poolId,baseToken:{address:token}}},mode:'deep',limit:100,skipFunding:true});
 assert.equal(result.trades.length,1);assert.equal(result.trades[0].side,'buy');
 assert(urls.some(url=>url.includes('/networks/robinhood/pools/'+poolId+'/trades')));
 assert(result.sources.some(source=>source.name==='GeckoTerminal trades'&&source.status==='available'));
 assert(result.sources.some(source=>source.name==='Blockscout Holders'&&source.status==='unavailable'));
 assert.equal(result.holders,undefined);
});

test('pool trade direction and amount follow scanned-token leg rather than pool kind',()=>{
  const result=parsePoolTrades({data:[trade,{...trade,id:'event-2',attributes:{...trade.attributes,from_token_address:funder,to_token_address:token,to_token_amount:'4'}}]},'ethereum',token);
  assert.deepEqual(result.map(t=>[t.side,t.amount]),[['sell',7],['buy',4]]);
  assert.equal(result[0].wallet,buyer);
  assert.equal(result[0].transaction,'hash');
  assert.equal(parsePoolTrades({data:[{...trade,attributes:{...trade.attributes,from_token_address:buyer}}]},'ethereum',token).length,0);
  assert.throws(()=>parsePoolTrades({errors:[]},'ethereum',token));
});

test('explorer raw token units require matching supply and never round positive shares to zero',()=>{
  const payload={items:[{address:{hash:buyer,is_contract:false},value:'2500000'}]};
  assert.deepEqual(parseExplorerHolders(payload,{decimals:'6',total_supply:'10000000'}),[{address:buyer,balance:2.5,share:25}]);
  assert.equal(parseExplorerHolders(payload,{decimals:null,total_supply:null})[0].share,null);
  assert.equal(parseExplorerHolders(payload,{decimals:null,total_supply:null})[0].balance,undefined);
  assert.throws(()=>parseExplorerHolders({},{decimals:'6'}));
  assert.equal(parseExplorerHolders({items:[{address:{hash:buyer},value:'1'}]},{decimals:'18',total_supply:'1000000000000000000'})[0].share,1e-16);
});

test('native funding only includes successful confirmed positive incoming transfers',()=>{
  const row={hash:'fund',status:'ok',timestamp:at,block_number:10,value:'1000000000000000000',from:{hash:funder},to:{hash:buyer}};
  const result=parseExplorerTransfers({items:[row,{...row,hash:'failed',status:'error'},{...row,hash:'pending',block_number:null},{...row,hash:'out',to:{hash:funder}},{...row,hash:'zero',value:'0'}]},buyer);
  assert.equal(result.length,1);assert.equal(result[0].amount,1);assert.equal(result[0].native,true);assert.equal(result[0].from,funder);
});

test('public fallback combines observed holders creator funding and trades with bounded requests',async()=>{
  const urls:string[]=[];
  const load=createPublicHistory({now:()=>Date.parse(at),fetcher:async(input)=>{
    const url=String(input);urls.push(url);
    if(url.includes('geckoterminal'))return Response.json({data:[trade]});
    if(url.endsWith(`/tokens/${token}`))return Response.json({decimals:'6',total_supply:'10000000',holders_count:'1',type:'ERC-20'});
    if(url.includes('/holders'))return Response.json({items:[{address:{hash:buyer,is_contract:false},value:'2500000'}],next_page_params:null});
    if(url.endsWith(`/addresses/${token}`))return Response.json({creator_address_hash:funder,creation_transaction_hash:'deploy',is_contract:true});
    if(url.includes('/transactions'))return Response.json({items:[{hash:'fund',status:'ok',block_number:10,timestamp:at,value:'1000000000000000000',from:{hash:funder,is_contract:false},to:{hash:buyer,is_contract:false}}],next_page_params:null});
    throw Error('Unexpected URL');
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(result.holders?.[0].share,25);
  assert.equal(result.identities[0].role,'creator');assert.equal(result.identities[0].transaction,'deploy');
  assert.equal(result.trades.length,1);assert.equal(result.transfers.length,1);
  assert.equal(result.sources.filter(s=>s.status==='available').length,5);
  assert(urls.length<=6);
});

test('holder refresh does not fetch trades or funding and reports failures as unavailable',async()=>{
  const urls:string[]=[];
  const load=createPublicHistory({fetcher:async(input)=>{urls.push(String(input));return new Response('down',{status:503});}});
  const result=await load('base',token,{report:{...report,chain:'base'},mode:'holders',limit:100});
  assert.equal(result.holders,undefined);assert.equal(result.trades.length,0);assert.equal(result.transfers.length,0);
  assert(!urls.some(u=>u.includes('/trades')||u.includes('/transactions')));
  assert(result.sources.every(s=>s.status==='unavailable'));
});

test('holder pagination preserves acquired balances on later failure and funding sources stay individually visible',async()=>{
  const third='0x4444444444444444444444444444444444444444';
  const load=createPublicHistory({fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('geckoterminal'))return Response.json({data:[]});
    if(url.endsWith(`/tokens/${token}`))return Response.json({decimals:'0',total_supply:'100',type:'ERC-20'});
    if(url.includes('/holders?'))return new Response('down',{status:503});
    if(url.includes('/holders'))return Response.json({items:[{address:{hash:buyer},value:'20'},{address:{hash:third},value:'10'}],next_page_params:{value:'10',address_hash:third}});
    if(url.includes('/transactions'))return url.includes(buyer)?Response.json({items:[],next_page_params:null}):new Response('down',{status:503});
    return Response.json({is_contract:true});
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(result.holders?.length,2);assert.equal(result.holders?.[0].balance,20);assert.equal(result.truncated,true);
  assert.equal(result.sources.find(s=>s.name===`Blockscout funding ${buyer}`)?.status,'available');
  assert.equal(result.sources.find(s=>s.name===`Blockscout funding ${third}`)?.status,'unavailable');
});

test('public history stops holder paging and native funding requests at bounded caps',async()=>{
  let pages=0,funding=0;
  const load=createPublicHistory({fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('geckoterminal'))return Response.json({data:[]});
    if(url.endsWith(`/tokens/${token}`))return Response.json({decimals:'0',total_supply:'1000000',type:'ERC-20'});
    if(url.includes('/holders')){const page=pages++;return Response.json({items:Array.from({length:50},(_,i)=>({address:{hash:`0x${(page*50+i+1).toString(16).padStart(40,'0')}`},value:'1'})),next_page_params:{value:'1',address_hash:`0x${((page+1)*50).toString(16).padStart(40,'0')}`}});}
    if(url.includes('/transactions')){funding++;return Response.json({items:[],next_page_params:null});}
    return Response.json({is_contract:true});
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:200});
  assert.equal(result.holders?.length,200);assert.equal(pages,4);assert.equal(funding,12);assert.equal(result.truncated,true);
});

test('cancellation is propagated instead of relabeled as missing history',async()=>{
  const controller=new AbortController();controller.abort();let calls=0;
  const load=createPublicHistory({fetcher:async()=>{calls++;return Response.json({});}});
  await assert.rejects(()=>load('ethereum',token,{report,mode:'deep',limit:100,signal:controller.signal}));assert.equal(calls,0);
});

test('cancelling concurrent pool and explorer requests settles every request without detached rejection',async()=>{
  const controller=new AbortController();
  const load=createPublicHistory({fetcher:async(_input,init)=>new Promise<Response>((_resolve,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});
  })});
  const pending=load('ethereum',token,{report,mode:'deep',limit:100,signal:controller.signal});
  controller.abort();
  await assert.rejects(()=>pending);
  await new Promise(resolve=>setTimeout(resolve,10));
});

const normalFunding = {hash:'fund',status:'ok',block_number:10,timestamp:at,value:'1000000000000000000',from:{hash:funder,is_contract:false},to:{hash:buyer,is_contract:false}};
const internalFunding = {transaction_hash:'fund',index:0,type:'call',success:true,error:null,block_number:10,timestamp:at,value:'1000000000000000000',from:{hash:funder},to:{hash:buyer}};
const baseResponse = (url:string):Response => {
  if(url.includes('geckoterminal'))return Response.json({data:[]});
  if(url.endsWith(`/tokens/${token}`))return Response.json({decimals:'0',total_supply:'100',type:'ERC-20'});
  if(url.includes('/holders'))return Response.json({items:[{address:{hash:buyer},value:'20'}],next_page_params:null});
  if(url.includes('/transactions')||url.includes('/internal-transactions'))return Response.json({items:[],next_page_params:null});
  return Response.json({is_contract:true});
};

test('retryable holder failure retries once, honors Retry-After and preserves later pages',async()=>{
  let attempts=0,clock=Date.parse(at);const waits:number[]=[];
  const load=createPublicHistory({clock:()=>clock,sleep:async(ms)=>{waits.push(ms);clock+=ms;},fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('/holders')){
      if(++attempts===1)return new Response('',{status:429,headers:{'Retry-After':'2'}});
      return Response.json({items:[{address:{hash:buyer},value:'20'}],next_page_params:null});
    }
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'holders',limit:100});
  assert.equal(attempts,2);assert(waits.includes(2000));assert.equal(result.holders?.length,1);
});

test('long Retry-After is never shortened and nonretryable HTTP errors are not retried',async()=>{
  for(const status of [400,401,429]){
    let holders=0;const waits:number[]=[];
    const load=createPublicHistory({sleep:async(ms)=>{waits.push(ms);},fetcher:async(input)=>{
      const url=String(input);if(url.includes('/holders')){holders++;return new Response('',{status,headers:{'Retry-After':'120'}});}return baseResponse(url);
    }});
    const result=await load('ethereum',token,{report,mode:'holders',limit:100});
    assert.equal(holders,1);assert.equal(waits.length,0);assert.equal(result.holders,undefined);
  }
});

test('normal funding paginates and internal trace evidence excludes failed, delegate and duplicate root transfers',async()=>{
  const urls:string[]=[];
  const load=createPublicHistory({fetcher:async(input)=>{
    const url=String(input);urls.push(url);
    if(url.includes('/internal-transactions'))return Response.json({items:[internalFunding,{...internalFunding,index:1},{...internalFunding,index:1},{...internalFunding,index:2,success:false},{...internalFunding,index:3,type:'delegatecall'},{...internalFunding,index:4,error:'reverted'},{...internalFunding,index:5,block_number:null}],next_page_params:null});
    if(url.includes('/transactions'))return url.includes('block_number=9')?Response.json({items:[normalFunding,{...normalFunding,hash:'older',timestamp:'2025-12-01T00:00:00Z'}],next_page_params:null}):Response.json({items:[normalFunding],next_page_params:{block_number:9,index:0,items_count:50}});
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert(urls.some(url=>url.includes('/transactions?')&&url.includes('block_number=9')&&url.includes('filter=to')));
  assert.equal(result.transfers.length,3);
  assert.equal(result.transfers.filter(transfer=>transfer.id.endsWith(':internal:1')).length,1);
  assert.equal(result.transfers.filter(transfer=>transfer.id.endsWith(':internal:0')).length,0);
  assert(result.sources.some(source=>source.detail.includes('2')&&source.detail.includes('page')));
  assert(result.reasons.some(reason=>reason.includes('first-ever')));
});

test('funding partial success survives later failure and repeated cursors stop without duplicate evidence',async()=>{
  let normal=0;
  const load=createPublicHistory({sleep:async()=>{},fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('/internal-transactions'))return Response.json({items:[],next_page_params:null});
    if(url.includes('/transactions')){normal++;return Response.json({items:[normalFunding],next_page_params:{block_number:9,index:0,items_count:50}});}
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:200});
  assert.equal(normal,2);assert.equal(result.transfers.length,1);assert.equal(result.truncated,true);
});

test('cancellation during retry backoff propagates and makes no retry request',async()=>{
  const controller=new AbortController();let holders=0;
  const load=createPublicHistory({sleep:async(_ms,signal)=>{controller.abort();signal.throwIfAborted();},fetcher:async(input)=>{
    const url=String(input);if(url.includes('/holders')){holders++;return new Response('',{status:503});}return baseResponse(url);
  }});
  await assert.rejects(()=>load('ethereum',token,{report,mode:'holders',limit:100,signal:controller.signal}));
  assert.equal(holders,1);
});

test('shared deadline expires during retry wait without sending a late attempt',async()=>{
  let clock=Date.parse(at),holders=0;
  const load=createPublicHistory({clock:()=>clock,sleep:async()=>{clock+=50_001;},fetcher:async(input)=>{
    const url=String(input);if(url.includes('/holders')){holders++;return new Response('',{status:503});}return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'holders',limit:100});
  assert.equal(holders,1);assert.equal(result.holders,undefined);
  assert(result.sources.some(source=>source.detail.toLowerCase().includes('deadline')));
});

test('default and expanded funding stay within planned page and retry budgets with only two funding requests in flight',async()=>{
  for(const limit of [100,200]){
    const pageCounts=new Map<string,number>();let requests=0,fundingRequests=0,inFlight=0,maxInFlight=0;
    const load=createPublicHistory({sleep:async()=>{},fetcher:async(input)=>{
      const url=String(input);requests++;
      if(url.includes('/holders'))return Response.json({items:Array.from({length:20},(_,i)=>({address:{hash:`0x${(i+1).toString(16).padStart(40,'0')}`},value:'1'})),next_page_params:null});
      if(url.includes('/transactions')||url.includes('/internal-transactions')){
        fundingRequests++;inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
        await new Promise(resolve=>setTimeout(resolve,1));inFlight--;
        const key=new URL(url).pathname,page=(pageCounts.get(key)||0)+1;pageCounts.set(key,page);
        return Response.json({items:[],next_page_params:{block_number:100-page,index:page,items_count:50}});
      }
      return baseResponse(url);
    }});
    const result=await load('ethereum',token,{report,mode:'deep',limit});
    assert.equal(fundingRequests,limit===100?24:32);assert.equal(maxInFlight,2);
    assert(requests<=(limit===100?33:45));assert.equal(result.truncated,true);
    assert.equal(new Set([...pageCounts.keys()].map(path=>path.split('/')[4])).size,limit===100?8:12);
  }
});

test('a failed later funding page retains successful records with a truthful partial source',async()=>{
  let calls=0;
  const load=createPublicHistory({sleep:async()=>{},fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('/transactions')){
      if(++calls===1)return Response.json({items:[normalFunding],next_page_params:{block_number:9,index:0}});
      return new Response('',{status:503});
    }
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(calls,3);assert.equal(result.transfers.length,1);assert.equal(result.truncated,true);
  const source=result.sources.find(source=>source.name===`Blockscout funding ${buyer}`);
  assert.equal(source?.status,'available');assert(source?.detail.includes('HTTP 503'));assert(source?.detail.includes('1 normal'));
});

test('HTTP-date Retry-After and network retry follow the same bounded policy',async()=>{
  let clock=Date.parse(at),holders=0,metadata=0;const waits:number[]=[];
  const load=createPublicHistory({clock:()=>clock,sleep:async(ms)=>{waits.push(ms);clock+=ms;},fetcher:async(input)=>{
    const url=String(input);
    if(url.endsWith(`/tokens/${token}`)&&++metadata===1)throw new TypeError('fetch failed');
    if(url.includes('/holders')&&++holders===1)return new Response('',{status:503,headers:{'Retry-After':new Date(clock+1000).toUTCString()}});
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'holders',limit:100});
  assert.equal(holders,2);assert.equal(metadata,2);assert(waits.some(ms=>ms>=750));assert.equal(result.holders?.length,1);
});

test('malformed nonempty holder and funding cursors preserve evidence but never claim cursor completion',async()=>{
  const load=createPublicHistory({fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('/holders'))return Response.json({items:[{address:{hash:buyer},value:'20'}],next_page_params:{block_number:{invalid:1}}});
    if(url.includes('/transactions'))return Response.json({items:[normalFunding],next_page_params:{index:'x'.repeat(513)}});
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(result.holders?.length,1);assert.equal(result.transfers.length,1);assert.equal(result.truncated,true);
  for(const name of ['Blockscout Holders',`Blockscout funding ${buyer}`]){
    const source=result.sources.find(source=>source.name===name);assert(source?.detail.includes('Invalid pagination cursor'));assert(!source?.detail.includes('cursor ended'));
  }
});

test('fractional and unsafe blocks cannot become confirmed normal or internal funding evidence',async()=>{
  assert.equal(parseExplorerTransfers({items:[{...normalFunding,block_number:1.5},{...normalFunding,block_number:1e20}]},buyer).length,0);
  const load=createPublicHistory({fetcher:async(input)=>String(input).includes('/internal-transactions')?Response.json({items:[{...internalFunding,index:1,block_number:1.5},{...internalFunding,index:1e20}],next_page_params:null}):baseResponse(String(input))});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});assert.equal(result.transfers.length,0);
});

test('slow additional holder pages cannot consume the funding time reserve or discard the acquired first page',async()=>{
  const start=Date.parse(at);let clock=start,holderCalls=0,firstFundingAt:number|undefined;
  const load=createPublicHistory({clock:()=>clock,sleep:async(ms)=>{clock+=ms;},fetcher:async(input)=>{
    const url=String(input);
    if(url.includes('/holders')){
      if(++holderCalls===1){clock+=20_000;return Response.json({items:[{address:{hash:buyer},value:'20'}],next_page_params:{value:'20',address_hash:buyer}});}
      clock+=10_000;throw new TypeError('Timed-out simulated holder page');
    }
    if(url.includes('/transactions')){firstFundingAt??=clock;return Response.json({items:[normalFunding],next_page_params:null});}
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(holderCalls,2);assert(firstFundingAt!==undefined&&firstFundingAt-start<=30_000);
  assert.equal(result.holders?.length,1);assert.equal(result.transfers.length,1);
  assert(result.sources.some(source=>source.detail.includes('holder phase deadline')));
});

test('a slow explorer holder list (22 s) is kept instead of timing out and retrying',async()=>{
  const start=Date.parse(at);let clock=start,holderCalls=0;
  const load=createPublicHistory({clock:()=>clock,sleep:async(ms)=>{clock+=ms;},fetcher:async(input,init)=>{
    const url=String(input);
    if(url.includes('/holders')){holderCalls++;clock+=22_000;if((init?.signal as AbortSignal|undefined)?.aborted)throw new TypeError('aborted');return Response.json({items:[{address:{hash:buyer},value:'20'}],next_page_params:null});}
    if(url.includes('/transactions'))return Response.json({items:[normalFunding],next_page_params:null});
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report,mode:'deep',limit:100});
  assert.equal(holderCalls,1);assert.equal(result.holders?.length,1);
  assert.ok(HOLDER_FIRST_PAGE_TIMEOUT_MS>=HOLDER_PHASE_MS,'the first page is never cut off before the phase ends');
  assert.equal(result.sources.find(source=>source.name==='Blockscout Holders')?.status,'available');
});

test('funding falls back to report holders when the new explorer holder phase fails',async()=>{
  let funding=0;
  const load=createPublicHistory({sleep:async()=>{},fetcher:async(input)=>{
    const url=String(input);if(url.includes('/holders'))return new Response('',{status:503});
    if(url.includes('/transactions')){funding++;return Response.json({items:[normalFunding],next_page_params:null});}
    return baseResponse(url);
  }});
  const result=await load('ethereum',token,{report:{...report,holders:[{address:buyer,share:20,contract:false,locked:null,tag:''}]},mode:'deep',limit:100});
  assert.equal(result.holders,undefined);assert.equal(funding,1);assert.equal(result.transfers.length,1);
});

test('provider cooldown waits share the retry sleep budget instead of repeatedly consuming the scan deadline',async()=>{
  let clock=Date.parse(at);const waits:number[]=[];
  const load=createPublicHistory({clock:()=>clock,sleep:async(ms)=>{waits.push(ms);clock+=ms;},fetcher:async(input)=>String(input).includes('geckoterminal')?Response.json({data:[]}):new Response('',{status:429,headers:{'Retry-After':'2'}})});
  await load('ethereum',token,{report:{...report,holders:Array.from({length:8},(_,i)=>({address:`0x${(i+1).toString(16).padStart(40,'0')}`,share:1,contract:false,locked:null,tag:''}))},mode:'deep',limit:100});
  assert(waits.reduce((sum,value)=>sum+value,0)<=5000);
});
