import test from 'node:test';
import assert from 'node:assert/strict';
import {scanToken} from '../src/lib/providers';
test('an empty indexed holder dataset cannot report zero when the creator has a positive balance',async()=>{
 const previous=globalThis.fetch,token='0x1111111111111111111111111111111111111235';
 globalThis.fetch=async(input)=>String(input).includes('goplus')?Response.json({code:1,result:{[token]:{holder_count:'0',creator_balance:'880506244.8',total_supply:'1000000000'}}}):Response.json([]);
 try{const result=await scanToken('bsc',token);assert.equal(result.holderCount,null);assert.match(result.sources.find(s=>s.name==='GoPlus Security')!.detail,/inconsistent|contradict/i);}finally{globalThis.fetch=previous;}
});
test('fresh EVM controls carry the exact provider source and retrieval timestamp, including cached responses',async()=>{
 const previous=globalThis.fetch,token='0x1111111111111111111111111111111111111234';
 globalThis.fetch=async(input)=>String(input).includes('goplus')?Response.json({code:1,result:{[token]:{is_honeypot:'0',owner_change_balance:'0',is_mintable:'0',transfer_pausable:'0'}}}):Response.json([]);
 try{const first=await scanToken('ethereum',token),second=await scanToken('ethereum',token);const source=first.sources.find(s=>s.name==='GoPlus Security')!;
 assert.equal(source.status,'available');for(const c of first.checks){assert.equal(c.source,source.name);assert.equal(c.fetchedAt,source.fetchedAt);}assert.equal(second.checks[0].fetchedAt,first.checks[0].fetchedAt);
 }finally{globalThis.fetch=previous;}
});
