import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MemoryFindings from '../src/components/memory-findings';
const token='0x'+'a'.repeat(40),wallets=['0x'+'1'.repeat(40),'0x'+'2'.repeat(40)];
const hit={id:'memory:example',chain:'ethereum' as const,token,wallets,events:[],connections:[],verifiedAt:'2026-11-04T10:00:00Z'};
test('memory result names full prior contract and evidence action without implying current ownership',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryFindings,{hits:[hit],scope:{queriedWallets:47,selectedWallets:47},onInspect:()=>{}}));assert.match(html,/Prior token connections/);assert(html.includes(token));assert.match(html,/2 current wallets/);assert.match(html,/Inspect prior-token evidence/);assert.match(html,/common ownership/);assert.doesNotMatch(html,/6 hits|100%|verified owner/);
});
test('an empty bounded result never certifies clean historical behavior',()=>{
 const html=renderToStaticMarkup(React.createElement(MemoryFindings,{hits:[],scope:{queriedWallets:10,selectedWallets:47},onInspect:()=>{}}));assert.match(html,/10 of 47/);assert.match(html,/No qualifying prior connection found in this search/);assert.doesNotMatch(html,/no prior history|no historical risk|Clean/i);
});
