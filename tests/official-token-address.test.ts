import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import OfficialTokenAddress,{copyOfficialTokenAddress} from '../src/components/official-token-address';
import SiteFooter from '../src/components/site-footer';
import {OFFICIAL_TOKEN} from '../src/lib/official-token';

test('shared footer renders the complete selectable mint, accessible copy control and original destinations',()=>{
 const html=renderToStaticMarkup(React.createElement(SiteFooter));
 assert(html.includes(`<code>${OFFICIAL_TOKEN.address}</code>`));assert(html.includes(`href="${OFFICIAL_TOKEN.explorer}"`));
 assert.match(html,/<button[^>]+type="button"[^>]+aria-label="Copy full Solana token address"/);assert.match(html,/role="status" aria-live="polite"/);assert(!html.includes('Address copied.'));
 for(const destination of ['https://x.com/traceengine17','https://portfolio-cyannimazing.vercel.app/','/privacy','/terms'])assert(html.includes(`href="${destination}"`));
 assert(renderToStaticMarkup(React.createElement(OfficialTokenAddress)).includes(OFFICIAL_TOKEN.address));
});
test('copy succeeds only after clipboard completion and preserves the exact full mint',async()=>{
 let copied='';let finish!:()=>void;const task=copyOfficialTokenAddress({writeText:async value=>{copied=value;await new Promise<void>(resolve=>{finish=resolve;});}});let settled=false;void task.then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);assert.equal(copied,OFFICIAL_TOKEN.address);finish();assert.equal(await task,true);
 assert.equal(await copyOfficialTokenAddress(undefined),false);assert.equal(await copyOfficialTokenAddress({writeText:async()=>{throw Error('Permission denied');}}),false);
});
