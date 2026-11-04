import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ObservedScoreBreakdown from '../src/components/observed-score-breakdown';
import type {ObservedFactor} from '../src/lib/observed-decision';
const factors:ObservedFactor[]=[{id:'swarm',value:.4115787,basis:'conditional-scenario',detail:'Balanced-pool scenario, not a verified V4 quote.'},{id:'fresh',value:4/15,basis:'account-nonce-proxy',detail:'Four of fifteen readable wallets had at most ten outgoing transactions.'},{id:'insiders',value:0,basis:'observed-none',detail:'No matches in retrieved history; unread records remain outside scope.'},{id:'concentration',value:.312,basis:'observed-holdings',detail:'Measured current-holder groups.'},{id:'snipers',value:0,basis:'observed-none',detail:'No matches in the returned scope.'},{id:'dev',value:0,basis:'observed-none',detail:'Observed creator-linked holdings.'}];
test('observed factor points are calculated from measurements and displayed for all six families',()=>{const html=renderToStaticMarkup(React.createElement(ObservedScoreBreakdown,{factors}));assert.match(html,/11\.3/);assert.match(html,/16\.4/);assert.match(html,/14\.6/);assert.match(html,/Wallet activity/);assert.match(html,/Scenario/);assert.match(html,/Read subset/);assert.doesNotMatch(html,/Not verified/);assert.equal((html.match(/<details/g)||[]).length,6);});
test('changing the observed impact changes its points without changing the other factors',()=>{const html=renderToStaticMarkup(React.createElement(ObservedScoreBreakdown,{factors:factors.map(f=>f.id==='swarm'?{...f,value:.6}:f)}));assert.match(html,/aria-label="Sell impact: 0 out of 30"/);assert.match(html,/16\.4/);});
