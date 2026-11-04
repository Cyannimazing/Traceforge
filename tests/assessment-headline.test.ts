import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import AssessmentHeadline from '../src/components/assessment-headline';

const render=(score:number|null,decision:'OK'|'CAUTION'|'AVOID'='OK',basis:'calculated'|'uncertainty-allocation'|'rule'='calculated')=>renderToStaticMarkup(React.createElement(AssessmentHeadline,{score,decision,confidence:80.1,basis}));
test('overall score and verdict confidence remain distinct calculated numbers',()=>{const html=render(87);assert.match(html,/Overall score/);assert.match(html,/>87</);assert.match(html,/\/100/);assert.match(html,/Verdict confidence/);assert.match(html,/>80\.1</);assert.match(html,/Clear/);assert.match(html,/aria-label="Overall score: 87 out of 100"/);});
test('changing the score changes the overall rating rather than using a token-specific value',()=>{assert.match(render(44,'AVOID'),/>44</);assert.match(render(75,'CAUTION'),/>75</);assert.match(render(0,'AVOID'),/>0</);});
test('missing or invalid scores do not become a fabricated zero or a range',()=>{for(const score of [null,NaN,Infinity,-1,101]){const html=render(score,'CAUTION','uncertainty-allocation');assert.match(html,/Not scored/);assert.doesNotMatch(html,/role="meter"|NaN|Infinity|Verdict confidence/);assert.match(html,/Decision weight/);}});
test('rule allocation is distinguished from model confidence and state uses semantic tones',()=>{assert.match(render(44,'AVOID','rule'),/Rule allocation/);assert.match(render(87),/data-verdict="clear"/);assert.match(render(70,'CAUTION'),/data-verdict="watch"/);assert.match(render(44,'AVOID'),/data-verdict="high-risk"/);});
