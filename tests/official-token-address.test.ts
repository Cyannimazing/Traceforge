import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import OfficialTokenAddress,{copyOfficialTokenAddress} from '../src/components/official-token-address';
import OfficialTokenLink from '../src/components/official-token-link';
import SiteFooter from '../src/components/site-footer';
import {officialToken,OFFICIAL_TOKEN} from '../src/lib/official-token';

test('the configured official token is Trace Engine ($TRACE) on Robinhood Chain',()=>{
 assert.deepEqual(OFFICIAL_TOKEN,{address:'0x252e757b2b89b856c8232cc1bcdb45355bfb46cc',chain:'robinhood',network:'Robinhood Chain',name:'Trace Engine',symbol:'TRACE',explorer:'https://robinhoodchain.blockscout.com/token/0x252e757b2b89b856c8232cc1bcdb45355bfb46cc'});
});

const mint='3FkBmeVAdijXSV5a6exfmPzXGpMhakp9GGFnWrjnpump';
const token=officialToken({address:mint})!;

test('official token is built from env values with Solana and $TE defaults',()=>{
 assert.deepEqual(token,{address:mint,chain:'solana',network:'Solana',name:'Trace Engine',symbol:'TE',explorer:`https://solscan.io/token/${mint}`});
 const evm=officialToken({address:'0xF712DAF52EE4097E369488B6EB4FA3BC299BA62D',chain:'robinhood',symbol:'$TE',name:'TraceEngine'})!;
 assert.equal(evm.address,'0xf712daf52ee4097e369488b6eb4fa3bc299ba62d');assert.equal(evm.symbol,'TE');assert.equal(evm.explorer,'https://robinhoodchain.blockscout.com/token/0xf712daf52ee4097e369488b6eb4fa3bc299ba62d');
});

test('no or invalid env address means no official token',()=>{
 for(const env of [{},{address:''},{address:'   '},{address:'not-an-address'},{address:mint,chain:'ethereum'},{address:mint,chain:'dogechain'}])assert.equal(officialToken(env),null);
});

test('without a configured token nothing is rendered',()=>{
 assert.equal(renderToStaticMarkup(React.createElement(OfficialTokenAddress,{token:null})),'');
 assert.equal(renderToStaticMarkup(React.createElement(OfficialTokenLink,{token:null})),'');
});

test('home token strip renders the complete selectable mint and accessible copy control',()=>{
 const html=renderToStaticMarkup(React.createElement(OfficialTokenAddress,{token}));
 assert(html.includes(`<code>${token.address}</code>`));assert(html.includes(`href="${token.explorer}"`));
 assert.match(html,/<button[^>]+type="button"[^>]+aria-label="Copy full Solana token address"/);assert.match(html,/role="status" aria-live="polite"/);assert(!html.includes('Address copied.'));
});

test('shared footer retains official and legal destinations without token promotion',()=>{
 const html=renderToStaticMarkup(React.createElement(SiteFooter));
 assert(!html.includes(token.address));assert(!html.includes('solscan.io/token/'));
 for(const destination of ['https://portfolio-cyannimazing.vercel.app/','/privacy','/terms'])assert(html.includes(`href="${destination}"`));
 assert(!html.includes('Official X'));assert(!html.includes('x.com/traceengine17'));
});
test('copy succeeds only after clipboard completion and preserves the exact full mint',async()=>{
 let copied='';let finish!:()=>void;const task=copyOfficialTokenAddress({writeText:async value=>{copied=value;await new Promise<void>(resolve=>{finish=resolve;});}},token);let settled=false;void task.then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);assert.equal(copied,token.address);finish();assert.equal(await task,true);
 assert.equal(await copyOfficialTokenAddress(undefined,token),false);assert.equal(await copyOfficialTokenAddress({writeText:async()=>{throw Error('Permission denied');}},token),false);
 assert.equal(await copyOfficialTokenAddress({writeText:async()=>{}},null),false);
});
