import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyWalletRoles,presentWalletRole,simpleRoleNames} from '../src/lib/wallet-role-presentation';
import type {InvestigationReport,InvestigatedWallet} from '../src/lib/investigation-types';

test('one primary role preserves creator/control/early overlaps for filters and details',()=>{
 const roles=['creator','authority','sniper','fresh','accumulator'] as const;
 const result=classifyWalletRoles([...roles],[],true,true);
 assert.equal(result.label,'Creator');assert.deepEqual(result.roles,[...roles]);
 assert.ok(result.matches.includes('control'));assert.ok(result.matches.includes('early'));assert.ok(result.matches.includes('holder'));
});
test('generic contract and possible insider transfer do not become control or early buyer',()=>{
 const result=classifyWalletRoles(['contract','insider','fresh','accumulator'],[],true,true);
 assert.equal(result.label,'Holder');assert.ok(!result.matches.includes('control'));assert.ok(!result.matches.includes('early'));assert.ok(!result.matches.includes('connected'));
 const historic=classifyWalletRoles(['unclassified'],[],false,false);assert.equal(historic.label,'Traced wallet');assert.ok(!historic.matches.includes('holder'));
});
test('timing explanation distinguishes provider claims, selected first minute and other early records',()=>{
 const provider=classifyWalletRoles(['sniper'],['sniper'],true,true);assert.equal(provider.label,'Early buyer');assert.equal(provider.reported,true);assert.match(provider.description,/not independently verified/);
 const verified=classifyWalletRoles(['sniper'],[],true,true);assert.equal(verified.label,'Sniper');assert.match(verified.description,/verified first trading minute/);assert.match(verified.description,/selected pool/);
 const other=classifyWalletRoles(['early-buyer'],[],true,false);assert.equal(other.label,'Early buyer');assert.match(other.description,/does not by itself establish a first-minute/);
 assert.equal(classifyWalletRoles(['sniper'],[],true,false).label,'Early buyer');
 assert.equal(classifyWalletRoles(['early-buyer'],[],true,true).label,'Early buyer');
 assert.equal(classifyWalletRoles(['authority','sniper'],[],true,true).label,'Owner');
 const mixed=classifyWalletRoles(['sniper','early-buyer'],['sniper'],true,true);assert.equal(mixed.reported,false);assert.doesNotMatch(mixed.description,/A buy in the verified first/);assert.ok(mixed.reportedRoles.includes('sniper'));
});
test('funding and creator links group without asserting common ownership',()=>{
 for(const role of ['funder','funding-recipient','shared-funder','deployer-linked'] as const){const result=classifyWalletRoles([role],[],true,false);assert.equal(result.label,role==='deployer-linked'?'Dev-linked':'Linked wallet');assert.match(result.description,/does not establish common ownership/);assert.ok(result.matches.includes('connected'));}
 assert.equal(classifyWalletRoles(['coordinated-seller'],[],true,false).label,'Holder');
});
test('infrastructure stays distinct and source attribution remains intact',()=>{
 const result=classifyWalletRoles(['pool','authority'],['pool'],true,false);assert.equal(result.label,'Liquidity pool');assert.equal(result.reported,true);assert.ok(result.matches.includes('control'));assert.ok(!result.matches.includes('holder'));
});

function reportFor(wallet:InvestigatedWallet){
 return {chain:'bsc',holders:[{address:wallet.address,share:98}],investigation:{wallets:[wallet],relationships:[],evidence:[],timeline:[],coverage:{launchVerified:false}}} as unknown as InvestigationReport;
}
test('indexed-start timing never claims a token-global launch',()=>{
 const result=classifyWalletRoles(['sniper'],[],true,true,true);
 assert.match(result.description,/provider-indexed trading start/);
 assert.match(result.description,/does not establish the token’s first-ever launch/);
 assert.doesNotMatch(result.description,/minute of the launch/);
});
test('provider relationship does not overwrite an independent category source',()=>{
 const wallet:InvestigatedWallet={address:'0xabc',share:1,categories:['deployer-linked'],evidenceIds:[]};
 const report=reportFor(wallet);
 report.investigation.relationships=[{id:'link',from:'0xdef',to:wallet.address,kind:'deployer-linked',attribution:'provider-reported',evidenceIds:[],description:'Provider link'}];
 const result=presentWalletRole(report,wallet);
 assert.equal(result.label,'Dev-linked');assert.equal(result.reported,false);assert.ok(!result.reportedRoles.includes('deployer-linked'));
 assert.deepEqual(wallet.categories,['deployer-linked']);assert.equal(report.investigation.relationships[0].attribution,'provider-reported');
});
test('canonical custody evidence produces Platform contract and keeps authority details',()=>{
 const address='0x5c952063c7fc8610ffdb798152d69f0b9550762b',id=`label:${address}:pool`;
 const wallet:InvestigatedWallet={address,share:98,categories:['pool','authority'],evidenceIds:[id]};
 const report=reportFor(wallet);
 report.investigation.evidence=[{id,kind:'label',timestamp:'2026-11-03T00:00:00Z',source:'BSC RPC Four.Meme custody verification',description:'Four.Meme shared launchpad custody'}];
 const result=presentWalletRole(report,wallet);
 assert.equal(result.label,'Platform contract');assert.equal(result.platformCustody,true);assert.equal(result.reported,false);assert.ok(result.roles.includes('authority'));assert.ok(result.matches.includes('control'));
 for(const mutate of [()=>{report.investigation.evidence[0].attribution='provider-reported';},()=>{report.investigation.evidence[0].source='SwarmEngine';},()=>{report.investigation.evidence[0].id='label:other:pool';},()=>{wallet.evidenceIds=[];}]){
  report.investigation.evidence[0]={id,kind:'label',timestamp:'2026-11-03T00:00:00Z',source:'BSC RPC Four.Meme custody verification',description:'Four.Meme shared launchpad custody'};wallet.evidenceIds=[id];mutate();assert.equal(presentWalletRole(report,wallet).label,'Liquidity pool');
 }
});
test('unverified custody text alone cannot change a contract or pool label',()=>{
 const wallet:InvestigatedWallet={address:'0xother',share:98,categories:['contract'],evidenceIds:[],label:'Four.Meme shared launchpad custody - TokenManager2'};
 assert.equal(presentWalletRole(reportFor(wallet),wallet).label,'Holder');
});
test('selected launchpad wording requires this wallet to have a matching eligible first-minute buy',()=>{
 const wallet:InvestigatedWallet={address:'0xabc',share:1,categories:['sniper','early-buyer'],evidenceIds:['trade:curve-1:0xabc:buy']};
 const report=reportFor(wallet);report.token='0xtoken';
 report.investigation.coverage.curveTiming={verified:true,scope:'selected-launchpad',protocol:'four-meme-v2',chain:'bsc',token:report.token,manager:'0xmanager',firstPurchaseAt:'2026-11-03T00:00:00Z',windowEndAt:'2026-11-03T00:01:00Z',eligibleTradeIds:['curve-1']} as NonNullable<InvestigationReport['investigation']['coverage']['curveTiming']>;
 report.investigation.evidence=[{id:wallet.evidenceIds[0],kind:'trade',timestamp:'2026-11-03T00:00:30Z',source:'BSC RPC verified curve purchase',description:'Buy'}];
 assert.equal(presentWalletRole(report,wallet).label,'Sniper');assert.match(presentWalletRole(report,wallet).description,/first trading minute of the selected launchpad/);
 report.investigation.coverage.curveTiming.eligibleTradeIds=['another-wallet-trade'];
 assert.equal(presentWalletRole(report,wallet).label,'Early buyer');assert.doesNotMatch(presentWalletRole(report,wallet).description,/first trading minute of the selected launchpad/);
 report.investigation.coverage.curveTiming.eligibleTradeIds=['curve-1'];report.investigation.evidence[0].attribution='provider-reported';
 assert.doesNotMatch(presentWalletRole(report,wallet).description,/first trading minute of the selected launchpad/);
});

test('short labels keep priority and overlapping filters without asserting developer ownership',()=>{
 const creator=classifyWalletRoles(['creator','authority','sniper','deployer-linked'],[],true,true);
 assert.equal(creator.label,'Creator');assert.ok(creator.matches.includes('control'));assert.ok(creator.matches.includes('sniper'));assert.ok(creator.matches.includes('connected'));
 assert.equal(classifyWalletRoles(['authority','sniper','deployer-linked'],[],true,true).label,'Owner');
 assert.equal(classifyWalletRoles(['sniper','deployer-linked'],[],true,true).label,'Sniper');
 const linked=classifyWalletRoles(['deployer-linked','funder'],[],true,false);assert.equal(linked.label,'Dev-linked');assert.match(linked.description,/does not establish common ownership/);
 const reported=classifyWalletRoles(['deployer-linked'],['deployer-linked'],true,false);assert.equal(reported.label,'Dev-linked');assert.equal(reported.reported,true);
 assert.equal(simpleRoleNames.control,'Owner');assert.equal(simpleRoleNames.sniper,'Sniper');assert.equal(simpleRoleNames.connected,'Linked wallets');
});
