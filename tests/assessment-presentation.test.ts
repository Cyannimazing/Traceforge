import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionLabels,decisionLabel,assessmentLabel,presentationText} from '../src/lib/assessment-presentation';

test('canonical decisions and legacy display aliases use one presentation vocabulary',()=>{
 assert.deepEqual(decisionLabels,{avoid:'High risk',caution:'Watch',ok:'Clear'});
 for(const value of ['AVOID','avoid','Avoid','Danger','critical','High risk'])assert.equal(decisionLabel(value),'High risk');
 for(const value of ['CAUTION','caution','Caution','Watch'])assert.equal(decisionLabel(value),'Watch');
 for(const value of ['OK','ok','CLEAN','clear','Clear'])assert.equal(decisionLabel(value),'Clear');
 assert.equal(decisionLabel('UNRATED'),'Not assessed');assert.equal(decisionLabel('unexpected'),'Not assessed');
});
test('saved assessment status re-labels cached independent titles without changing state or weights',()=>{
 const cached={status:'critical' as const,title:'AVOID',p:{avoid:.8,caution:.15,ok:.05}},before=JSON.stringify(cached);
 assert.equal(assessmentLabel(cached.status),'High risk');assert.equal(assessmentLabel('clear'),'Clear');assert.equal(assessmentLabel('caution'),'Watch');assert.equal(assessmentLabel('insufficient'),'Watch');
 assert.equal(JSON.stringify(cached),before);
});
test('only owned explanation labels change; provider quotes and ordinary prose retain their meaning',()=>{
 assert.equal(presentationText('60% for AVOID; OK to Caution. Score 42/100.'),'60% for High risk; Clear to Watch. Score 42/100.');
 assert.equal(presentationText('Avoid uses its minimum; OK uses its minimum.'),'High risk uses its minimum; Clear uses its minimum.');
 assert.equal(presentationText('SwarmEngine reports CLEAN. Its verdict is external.'),'SwarmEngine reports CLEAN. Its verdict is external.');
 assert.equal(presentationText('CLEAN / AVOID','provider'),'CLEAN / AVOID');
 assert.equal(presentationText('Provider reports: AVOID'),'Provider reports: AVOID');
 assert.equal(presentationText('Take caution and avoid drawing a safety conclusion.'),'Take caution and avoid drawing a safety conclusion.');
});
