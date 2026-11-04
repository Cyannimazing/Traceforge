import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import TokenAnalysisGuide from '../src/components/token-analysis-guide';
import {structuredSiteData} from '../src/lib/seo';

test('beginner token analysis answers and research links are present in initial HTML without running JavaScript',()=>{
 const html=renderToStaticMarkup(createElement(TokenAnalysisGuide));
 assert.match(html,/<section[^>]*aria-labelledby="token-analysis-guide"/);
 assert.equal([...html.matchAll(/<details\b/g)].length,6);
 for(const term of ['Solana','Ethereum','Base','BNB Chain','Robinhood Chain','Creator','Owner','Dev','Sniper','60 seconds','Clear','Watch','High risk'])assert(html.includes(term),`Missing public explanation: ${term}`);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(new Set(ids).size,ids.length);
 assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]),['/','/discover']);
 assert(!/aria-hidden="true"[^>]*>.*Token analysis/s.test(html));
});

test('application structured data names real features and does not invent FAQ search eligibility or a query endpoint',()=>{
 const data=structuredSiteData({NODE_ENV:'production'}),graph=data['@graph'] as Record<string,unknown>[];
 const application=graph.find(item=>item['@type']==='WebApplication')!;
 assert(Array.isArray(application.featureList));assert((application.featureList as unknown[]).length>=4);
 const serialized=JSON.stringify(data);assert(!/FAQPage|SearchAction|aggregateRating|reviewRating/.test(serialized));
});
