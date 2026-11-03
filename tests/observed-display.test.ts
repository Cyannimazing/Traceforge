import test from 'node:test';
import assert from 'node:assert/strict';
import fixture from './fixtures/grok-observed-inputs.json';
import type {InvestigationReport} from '../src/lib/investigation-types';
import {getDisplayAssessment} from '../src/lib/verdict-summary';
import {feedItem} from '../src/lib/report-feed';
import {trustRating} from '../src/lib/trust-rating';
import {observedDecision} from '../src/lib/observed-decision';
const report=()=>structuredClone(fixture.report) as InvestigationReport;
test('report and feed use the same observed decision while retaining strict unknowns',()=>{
 const r=report(),assessment=getDisplayAssessment(r),feed=feedItem(r);
 assert.equal(assessment.title,'OK');assert.equal(assessment.status,'clear');assert.match(assessment.summary,/80\.1%/);
 assert.equal(feed?.title,'OK');assert.equal(feed?.score,87);assert.equal(feed?.status,'clear');assert.match(feed!.reason,/Observed-scope/);
 assert.equal(trustRating(r).score,null);
});
test('cached observed OK cannot survive missing current controls',()=>{
 const r=report();r.observedDecision=observedDecision(r);r.checks=[];
 assert.equal(getDisplayAssessment(r).status,'caution');assert.equal(observedDecision(r),null);assert.equal(feedItem(r)?.score,null);
});
