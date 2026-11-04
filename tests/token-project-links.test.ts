import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenProjectLinks} from '../src/lib/token-project-links';

const token='0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7';
const report=(info:unknown,chain='robinhood')=>({chain,token,market:{chainId:chain,baseToken:{address:token.toUpperCase().replace('0X','0x')},url:'https://dexscreener.com/robinhood/pool',info}});

test('matching ZKBLAST metadata supplies its actual website, X and logo',()=>{
 const result=tokenProjectLinks(report({imageUrl:'https://cdn.dexscreener.com/cms/images/wL1kSzG1gsN6daLL?width=800&height=800&quality=95&format=auto',websites:[{url:'https://zkblast.tech/',label:'Website'}],socials:[{url:'https://x.com/zkblast9',type:'twitter'}]}));
 assert.match(result.logoUrl!,/^https:\/\/cdn\.dexscreener\.com\//);
 assert.deepEqual(result.links.map(x=>[x.kind,x.url]),[['website','https://zkblast.tech/'],['x','https://x.com/zkblast9'],['dex','https://dexscreener.com/robinhood/pool']]);
 assert(result.links.every(x=>x.source.includes('DEX Screener')));
});

test('wrong chain or token cannot attach another project identity',()=>{
 const input=report({imageUrl:'https://example.com/logo.png',websites:[{url:'https://example.com'}]});
 assert.deepEqual(tokenProjectLinks({...input,chain:'base'}),{links:[]});
 assert.deepEqual(tokenProjectLinks({...input,token:'0x'+'1'.repeat(40)}),{links:[]});
 assert.deepEqual(tokenProjectLinks({...input,fixture:true}),{links:[]});
 assert.deepEqual(tokenProjectLinks({chain:'base',token:'',market:{chainId:'base',baseToken:{address:''},info:{websites:[{url:'https://example.com'}]}}}),{links:[]});
});

test('Solana token matching remains case sensitive',()=>{
 const mint='So11111111111111111111111111111111111111112';
 const input={chain:'solana',token:mint,market:{chainId:'solana',baseToken:{address:mint},info:{socials:[{type:'telegram',url:'https://t.me/example'}]}}};
 assert.equal(tokenProjectLinks(input).links[0]?.kind,'telegram');
 assert.deepEqual(tokenProjectLinks({...input,token:mint.toLowerCase()}),{links:[]});
});

test('unsafe URL forms and authentication are discarded from every surface',()=>{
 for(const url of ['javascript:alert(1)','data:image/svg+xml,hi','//example.com','https://user:pass@example.com','https://example.com\\@evil.com','https://exa\nmple.com','ftp://example.com','relative/path']){
  const input=report({imageUrl:url,websites:[{url}],socials:[{type:'twitter',url}]});input.market.url=url;
  assert.deepEqual(tokenProjectLinks(input),{links:[]},url);
 }
});

test('duplicates across website and social feeds are collapsed and known hosts receive correct labels',()=>{
 const result=tokenProjectLinks(report({websites:[{url:'https://x.com/project',label:'X'},{url:'https://example.com'}],socials:[{type:'twitter',url:'https://twitter.com/project'},{type:'telegram',url:'https://t.me/project'},{type:'discord',url:'https://discord.gg/project'},{type:'twitter',url:'https://unrelated.example/link'}]}));
 assert.equal(result.links.filter(x=>x.kind==='x').length,1);
 assert(result.links.some(x=>x.label==='Telegram'));assert(result.links.some(x=>x.label==='Discord'));
 assert.notEqual(result.links.find(x=>x.url.includes('unrelated'))?.kind,'x');
});

test('untrusted labels are bounded and missing metadata never invents social accounts',()=>{
 const result=tokenProjectLinks(report({websites:[{label:'<Site>\u202e'+ 'a'.repeat(100),url:'https://example.com'}]}));
 assert(result.links[0].label.length<=32);assert(!/[<>\u202e]/.test(result.links[0].label));
 assert.deepEqual(tokenProjectLinks({chain:'base',token,market:null}),{links:[]});
 const noInfo=report(undefined,'base');assert.deepEqual(tokenProjectLinks(noInfo).links.map(x=>x.kind),['dex']);
});

test('metadata volume and malformed containers cannot grow the header unbounded',()=>{
 const result=tokenProjectLinks(report({websites:Array.from({length:500},(_,i)=>({url:`https://example.com/${i}`})),socials:'not-an-array'}));
 assert(result.links.length<=9);assert.doesNotThrow(()=>tokenProjectLinks(report('invalid')));
});

test('DEX Screener branding only links to the exact provider domain',()=>{
 for(const url of ['https://unrelated.example/pool','https://x.com/project','https://dexscreener.com.evil.example/pool','https://other.dexscreener.com/pool']){
  const input=report(undefined);input.market.url=url;
  assert.deepEqual(tokenProjectLinks(input),{links:[]},url);
 }
 for(const url of ['https://dexscreener.com/base/pool','https://www.dexscreener.com/base/pool']){
  const input=report(undefined);input.market.url=url;
  assert.deepEqual(tokenProjectLinks(input).links.map(link=>[link.kind,link.label,link.url]),[['dex','DEX Screener',url]]);
 }
});
