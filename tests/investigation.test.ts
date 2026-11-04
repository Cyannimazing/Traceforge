import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeInvestigation, type InvestigationInput } from '../src/lib/investigation';
import type { PoolTimingProof } from '../src/lib/investigation-types';
import type {EvidenceClock} from '../src/lib/evidence-clock';

const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString();
const trade = (wallet: string, seconds: number, side: 'buy' | 'sell' = 'buy', id = `${wallet}-${seconds}`) => ({ id, wallet, timestamp: at(seconds), side, amount: 10, transaction: `tx-${id}`, source: 'test' });
const transfer = (from: string, to: string, id: string) => ({ id, from, to, timestamp: at(-60), amount: 1, token: 'native', native: true, transaction: `tx-${id}`, source: 'test' });
const base = (): InvestigationInput => ({ chain: 'ethereum', token: 'token', holders: [], trades: [], transfers: [], identities: [], labels: [], launchVerified: true, earliestTradeAt: at(0), complete: true, reasons: [], fetchedAt: at(600), holderLimit: 100, buyerLimit: 100, fundingHops: 1, truncated: false });
test('verified current-holder scope is independent of the historical buyer and query caps',()=>{
 const holders=Array.from({length:239},(_,i)=>({address:`holder${i}`,share:100/239,balance:1}));
 const input={...base(),holders,trades:Array.from({length:120},(_,i)=>trade(`historical${i}`,100+i))};
 assert.equal(analyzeInvestigation(input).wallets.filter(w=>w.share!==null).length,100);
 const out=analyzeInvestigation({...input,currentHolderLimit:239});assert.equal(out.wallets.filter(w=>w.share!==null).length,239);assert.equal(out.wallets.find(w=>w.address==='holder238')?.balance,1);assert.equal(out.coverage.holderLimit,100);assert.equal(out.coverage.buyerLimit,100);assert.equal(out.wallets.filter(w=>w.categories.includes('early-buyer')).length,100);assert.equal(out.wallets.find(w=>w.address==='historical119')?.share,null);
});
test('current inventory bounds remain finite and disclose clipping without widening history',()=>{
 const holders=Array.from({length:10001},(_,i)=>({address:`holder${i}`,share:.001,balance:1}));const out=analyzeInvestigation({...base(),holders,currentHolderLimit:10001});assert.equal(out.wallets.length,10000);assert.equal(out.coverage.holderLimit,100);assert.equal(out.coverage.truncated,true);assert.match(out.coverage.reasons.join(' '),/current-holder inventory exceeds/);
 for(const currentHolderLimit of [Infinity,NaN,-1])assert.equal(analyzeInvestigation({...base(),holders:holders.slice(0,239),currentHolderLimit}).wallets.length,100);
});
const proof=():PoolTimingProof=>({verified:true,scope:'selected-pool',pool:'pool',chain:'ethereum',firstSwapAt:at(100),firstSwapTransaction:'tx-start',firstSwapLogIndex:1,windowEndAt:at(160),creation:{transaction:'tx-creation',blockNumber:1,blockHash:'block1'},through:{blockNumber:100,blockHash:'block100',timestamp:at(161)},factory:'factory',token0:'token',token1:'other',eligibleTradeIds:['start','a-160','late-161'],verifiedAt:at(600)});

test('multiple pools use each event own first-minute window and never establish global launch',()=>{
 const later={...proof(),pool:'later-pool',firstSwapAt:at(300),windowEndAt:at(360),through:{...proof().through,timestamp:at(361)},eligibleTradeIds:['b-360','c-361']};
 const result=analyzeInvestigation({...base(),launchVerified:false,complete:false,poolTimings:[proof(),later],trades:[trade('a',160),trade('b',360),trade('c',361),trade('unlisted',330)]});
 assert.equal(result.coverage.poolTimings?.length,2);assert.equal(result.coverage.launchVerified,false);
 assert(result.wallets.find(w=>w.address==='a')?.categories.includes('sniper'));
 assert(result.wallets.find(w=>w.address==='b')?.categories.includes('sniper'));
 assert(!result.wallets.find(w=>w.address==='c')?.categories.includes('sniper'));
 assert(!result.wallets.find(w=>w.address==='unlisted')?.categories.includes('sniper'));
});
test('raw-only trades preserve timing but cannot manufacture normalized totals or accumulation',()=>{
 const result=analyzeInvestigation({...base(),launchVerified:false,complete:false,poolTiming:proof(),trades:[{...trade('a',160),amount:undefined,amountRaw:'5000000000000000000'},trade('seller',110),{...trade('seller',120,'sell'),amount:undefined,amountRaw:'9000000000000000000'}]});
 assert(result.wallets.find(w=>w.address==='a')?.categories.includes('sniper'));
 assert.equal(result.wallets.find(w=>w.address==='a')?.bought,undefined);
 assert.equal(result.wallets.find(w=>w.address==='seller')?.bought,undefined);
 assert(!result.wallets.find(w=>w.address==='seller')?.categories.includes('accumulator'));
 assert.equal(result.evidence.find(e=>e.id.startsWith('trade:a-160'))?.amountRaw,'5000000000000000000');
});
test('zero negative malformed and missing raw quantities are withheld',()=>{
 for(const amountRaw of ['0','-1','1.5','wat',undefined]){
  const result=analyzeInvestigation({...base(),trades:[{...trade('a',1),amount:undefined,amountRaw}]});
  assert.equal(result.timeline.length,0);
 }
});

test('a fast local clock preserves local observations while rejecting future provider events',()=>{
 const clock:EvidenceClock={basis:'provider-quorum',referenceAt:at(600),localCapturedAt:at(11400),offsetMs:-10800000,sources:[{name:'A',date:'',age:null,cache:null},{name:'B',date:'',age:null,cache:null}],detail:'clock comparison'};
 const result=analyzeInvestigation({...base(),fetchedAt:at(11400),clock,poolTiming:{...proof(),verifiedAt:at(11400)},trades:[trade('a',160),trade('future',11400)],identities:[{address:'owner',role:'authority',source:'RPC',timestamp:at(11400),timestampBasis:'local-observation'}],labels:[{address:'badlabel',category:'exchange',label:'Provider event in future',source:'Indexer',timestamp:at(11400)}]});
 assert.equal(result.coverage.poolTiming?.verifiedAt,at(11400));
 assert(result.wallets.find(w=>w.address==='owner')?.categories.includes('authority'));
 assert(result.wallets.find(w=>w.address==='a')?.categories.includes('sniper'));
 assert.equal(result.wallets.find(w=>w.address==='future'),undefined);assert.equal(result.wallets.find(w=>w.address==='badlabel'),undefined);
});

test('future records are withheld before totals, roles and relationships with explicit source counts',()=>{
  const result=analyzeInvestigation({...base(),holders:[{address:'a',share:12}],trades:[trade('a',721),trade('b',722,'sell')],transfers:[{...transfer('a','b','future'),timestamp:at(721)}],identities:[{address:'owner',role:'authority',source:'test',timestamp:at(721)}]});
  assert.equal(result.timeline.length,0);assert.equal(result.relationships.length,0);
  assert.equal(result.wallets.length,1);assert.equal(result.wallets[0].share,12);
  assert.equal(result.wallets[0].bought,undefined);assert.deepEqual(result.wallets[0].categories,['unclassified']);
  assert.notEqual(result.coverage.status,'complete');assert.notEqual(result.assessment.status,'clear');
  assert.match(result.coverage.reasons.join(' '),/4.*test.*timestamp/i);
});

test('clock tolerance includes exactly 120 seconds and excludes 121 seconds',()=>{
  const result=analyzeInvestigation({...base(),trades:[trade('a',720),trade('b',721)]});
  assert.equal(result.wallets.find(w=>w.address==='a')?.bought,10);
  assert.equal(result.wallets.find(w=>w.address==='b'),undefined);
});

test('invalid capture clocks and unsupported launch anchors cannot establish timing',()=>{
  for(const override of [{fetchedAt:'invalid'},{earliestTradeAt:at(721)},{earliestTradeAt:undefined}]){
    const result=analyzeInvestigation({...base(),...override,trades:[trade('a',1)]});
    assert.equal(result.coverage.launchVerified,false);assert.equal(result.coverage.earliestTradeAt,undefined);
    assert(!result.wallets.some(w=>w.categories.includes('sniper')||w.categories.includes('early-buyer')));
    assert.notEqual(result.assessment.status,'clear');
    if(override.fetchedAt)assert.equal(result.timeline.length,0);
  }
});

test('future pool proof timestamps cannot survive as coverage evidence',()=>{
  for(const poolTiming of [{...proof(),verifiedAt:at(721)},{...proof(),through:{...proof().through,timestamp:at(721)}}]){
    const result=analyzeInvestigation({...base(),launchVerified:false,poolTiming,trades:[trade('a',160)]});
    assert.equal(result.coverage.poolTiming,undefined);assert(!result.wallets.some(w=>w.categories.includes('sniper')));
  }
});
test('verified pool timing labels only its eligible events and never promotes global launch coverage',()=>{
  const result=analyzeInvestigation({...base(),launchVerified:false,complete:false,earliestTradeAt:at(-200),poolTiming:proof(),trades:[trade('start',100,'sell','start'),trade('a',160),trade('another-pool',120),trade('late',161)]});
  assert(result.wallets.find(w=>w.address==='a')?.categories.includes('sniper'));
  assert(result.wallets.find(w=>w.address==='a')?.categories.includes('early-buyer'));
  assert(!result.wallets.find(w=>w.address==='another-pool')?.categories.includes('sniper'));
  assert(!result.wallets.find(w=>w.address==='late')?.categories.includes('sniper'));
  assert.equal(result.coverage.launchVerified,false);assert.equal(result.coverage.status,'partial');
  assert.equal(result.coverage.poolTiming?.pool,'pool');
  assert(result.findings.find(f=>f.id==='snipers')?.description.includes('selected pool'));
  assert(result.evidence.some(e=>e.id==='pool-timing:pool:creation'));
});
test('invalid or incomplete pool intervals cannot classify timed buyers',()=>{
  for(const poolTiming of [{...proof(),chain:'base' as const},{...proof(),windowEndAt:at(159)},{...proof(),through:{...proof().through,timestamp:at(159)}},{...proof(),token0:'different'}]){
    const result=analyzeInvestigation({...base(),launchVerified:false,complete:false,poolTiming,trades:[trade('a',160)]});
    assert(!result.wallets.some(w=>w.categories.includes('sniper')));assert.equal(result.coverage.poolTiming,undefined);
  }
});

test('snipers require verified launch and inclusive 60 second boundary', () => {
  const input = { ...base(), trades: [trade('a', 0), trade('b', 60), trade('c', 61)] };
  const result = analyzeInvestigation(input);
  assert(result.wallets.find(w => w.address === 'b')?.categories.includes('sniper'));
  assert(!result.wallets.find(w => w.address === 'c')?.categories.includes('sniper'));
  const missing = analyzeInvestigation({ ...input, launchVerified: false, complete: false });
  assert(!missing.wallets.some(w => w.categories.includes('sniper')));
  assert(!missing.wallets.some(w => w.categories.includes('early-buyer')));
  assert.notEqual(missing.assessment.status, 'clear');
});

test('shared known exchange funder does not connect customers or coordinate sellers', () => {
  const input = { ...base(), trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')], transfers: [transfer('exchange', 'a', 'fa'), transfer('exchange', 'b', 'fb')], labels: [{ address: 'exchange', category: 'exchange' as const, label: 'Known exchange', source: 'test', timestamp: at(0) }] };
  const result = analyzeInvestigation(input);
  assert(!result.relationships.some(r => r.kind === 'shared-funder'));
  assert(!result.wallets.some(w => w.categories.includes('coordinated-seller')));
  assert(result.wallets.find(w => w.address === 'exchange')?.categories.includes('exchange'));
});

test('native transfers from the scanned EVM token cannot link its users when contract metadata is absent', () => {
  const token = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  for (const chain of ['ethereum', 'base', 'bsc'] as const) {
    const result = analyzeInvestigation({ ...base(), chain, token,
      transfers: [transfer(token.toUpperCase(), 'a', 'unwrap-a'), transfer(token, 'b', 'unwrap-b')],
      trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')],
    });
    assert.equal(result.evidence.filter(e => e.kind === 'transfer').length, 2);
    assert(!result.evidence.some(e => e.kind === 'label'));
    assert.equal(result.relationships.filter(r => r.kind === 'funding').length, 2);
    assert(!result.findings.some(f => f.id.startsWith('funder:') || f.id.startsWith('selling:')));
    assert(!result.wallets.some(w => w.categories.includes('shared-funder') || w.categories.includes('coordinated-seller')));
    assert.equal(analyzeInvestigation({ ...base(), chain, token }).wallets.length, 0);
  }
});

test('unlabeled wallet funding still supports separate funding groups and connected-selling review', () => {
  const result = analyzeInvestigation({ ...base(), token: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    transfers: [transfer('funder-one', 'a', 'fa'), transfer('funder-one', 'b', 'fb'), transfer('funder-two', 'c', 'fc'), transfer('funder-two', 'd', 'fd')],
    trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')],
  });
  const groups = result.findings.filter(f => f.id.startsWith('funder:'));
  assert.deepEqual(groups.map(f => f.id), ['funder:funder-one', 'funder:funder-two']);
  assert.equal(groups[0].title, groups[1].title);
  assert(groups[0].evidenceIds.every(id => !groups[1].evidenceIds.includes(id)));
  assert(result.findings.some(f => f.id.startsWith('selling:')));
});

test('excluding token infrastructure does not suppress a separately observed direct wallet connection', () => {
  const token = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const result = analyzeInvestigation({ ...base(), token,
    transfers: [transfer(token, 'a', 'unwrap-a'), transfer(token, 'b', 'unwrap-b'), transfer('a', 'b', 'direct')],
    trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')],
  });
  const finding = result.findings.find(f => f.id.startsWith('selling:'));
  assert(finding);
  assert(finding.evidenceIds.some(id => id.includes('direct')));
  assert(!finding.evidenceIds.some(id => id.includes('unwrap')));
});

test('EVM token infrastructure guard does not normalize distinct Solana addresses', () => {
  const result = analyzeInvestigation({ ...base(), chain: 'solana', token: 'AbC',
    transfers: [transfer('abc', 'a', 'fa'), transfer('abc', 'b', 'fb')],
    trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')],
  });
  assert(result.findings.some(f => f.id === 'funder:abc'));
  assert(result.findings.some(f => f.id.startsWith('selling:')));
});

test('two connected sellers within a rolling five minute window require distinct transaction evidence', () => {
  const input = { ...base(), transfers: [transfer('f', 'a', 'fa'), transfer('f', 'b', 'fb')], trades: [trade('a', 301, 'sell'), trade('b', 600, 'sell')] };
  const result = analyzeInvestigation(input);
  assert.equal(result.wallets.filter(w => w.categories.includes('coordinated-seller')).length, 2);
  const finding = result.findings.find(f => f.id.startsWith('selling'))!;
  assert.equal(finding.certainty, 'inferred');
  assert(finding.evidenceIds.some(id => result.evidence.find(e => e.id === id)?.kind === 'trade'));
  assert(!analyzeInvestigation({ ...input, trades: [trade('a', 301, 'sell'), trade('b', 602, 'sell')] }).wallets.some(w => w.categories.includes('coordinated-seller')));
});

test('shared funding records its receipt window and distinguishes sampled holders from unknown balances',()=>{
 const result=analyzeInvestigation({...base(),holders:[{address:'A',share:1}],transfers:[{...transfer('f','a','fa'),timestamp:at(-120)},transfer('f','b','fb')],trades:[trade('a',5),trade('b',6)]});
 const finding=result.findings.find(f=>f.id==='funder:f')!;
 assert.equal(finding.level,'warning');assert.equal(finding.observedFrom,at(-120));assert.equal(finding.observedTo,at(-60));
 assert(finding.description.includes(at(-120)));assert(finding.description.includes(at(-60)));
 assert.match(finding.description,/1 of 2 wallets appear in the current holder snapshot/);
 assert.match(finding.description,/outside that snapshot.*unknown.*not zero/);
});

test('selling support excludes unrelated old branches but preserves those observations and dates the sales',()=>{
 const input={...base(),holders:[],transfers:[{...transfer('old-funder','a','old-branch'),timestamp:at(-10000)},transfer('a','b','direct')],trades:[trade('a',100,'sell'),trade('b',120,'sell')]};
 const result=analyzeInvestigation(input),finding=result.findings.find(f=>f.id.startsWith('selling:'))!;
 assert.equal(finding.level,'warning');assert.equal(finding.observedFrom,at(100));assert.equal(finding.observedTo,at(120));
 assert.match(finding.description,/0 of 2 wallets appear in the current holder snapshot/);
 assert.match(finding.description,/outside that snapshot.*unknown.*not zero/);
 assert(finding.evidenceIds.some(id=>id.includes('direct')));assert(!finding.evidenceIds.some(id=>id.includes('old-branch')));
 assert(result.evidence.some(e=>e.id.includes('old-branch')));assert(result.relationships.some(r=>r.id.includes('old-branch')));
});

test('selling support chooses deterministic shortest temporal paths and excludes branches and later shortcuts',()=>{
 const transfers=[transfer('a','x','ax'),transfer('x','b','xb'),transfer('a','y','ay'),transfer('y','b','yb'),transfer('x','c','xc'),transfer('x','irrelevant','tail'),{...transfer('a','b','too-late'),timestamp:at(101)}].map(t=>({...t,native:false,token:'token'}));
 const input={...base(),transfers,trades:[trade('a',100,'sell'),trade('b',120,'sell'),trade('c',130,'sell')]};
 const result=analyzeInvestigation(input),finding=result.findings.find(f=>f.wallets.length===3&&f.id.startsWith('selling:'))!;
 const links=finding.evidenceIds.filter(id=>id.startsWith('transfer:')).sort();
 assert.deepEqual(links,['transfer:ax:a:x','transfer:xb:x:b','transfer:xc:x:c']);
 const reversed=analyzeInvestigation({...input,transfers:[...transfers].reverse()}).findings.find(f=>f.wallets.length===3&&f.id.startsWith('selling:'))!;
 assert.deepEqual(reversed.evidenceIds.filter(id=>id.startsWith('transfer:')).sort(),links);
 assert.equal(finding.observedFrom,at(100));assert.equal(finding.observedTo,at(130));
});

test('duplicate evidence does not inflate amounts or create coordination', () => {
  const buy = trade('a', 5);
  const result = analyzeInvestigation({ ...base(), trades: [buy, buy], transfers: [transfer('f', 'a', 'fa'), transfer('f', 'a', 'fa')] });
  assert.equal(result.wallets.find(w => w.address === 'a')?.bought, 10);
  assert.equal(result.evidence.filter(e => e.kind === 'trade').length, 1);
  assert(!result.wallets.some(w => w.categories.includes('coordinated-seller')));
});

test('creator and owner roles stay distinct; infrastructure does not become a sniper', () => {
  const result = analyzeInvestigation({ ...base(), identities: [{ address: 'creator', role: 'creator', source: 'test', timestamp: at(0) }, { address: 'owner', role: 'authority', source: 'test', timestamp: at(0) }], labels: [{ address: 'pool', category: 'pool', label: 'Verified pool', source: 'test', timestamp: at(0) }], trades: [trade('pool', 1)] });
  assert.deepEqual(result.wallets.find(w => w.address === 'owner')?.categories, ['authority']);
  assert(!result.wallets.find(w => w.address === 'creator')?.categories.includes('authority'));
  assert(!result.wallets.find(w => w.address === 'pool')?.categories.includes('sniper'));
});

test('partial and absent history cannot receive a clear verdict', () => {
  assert.equal(analyzeInvestigation({ ...base(), complete: false, launchVerified: false, reasons: ['history missing'] }).assessment.status, 'insufficient');
  assert.notEqual(analyzeInvestigation({ ...base(), truncated: true }).coverage.status, 'complete');
});

test('connections established after sales do not establish coordinated selling', () => {
  const result = analyzeInvestigation({ ...base(), transfers: [{ ...transfer('a', 'b', 'future'), timestamp: at(500) }], trades: [trade('a', 100, 'sell'), trade('b', 120, 'sell')] });
  assert(!result.wallets.some(w => w.categories.includes('coordinated-seller')));
});

test('equal-timestamp transfers cannot establish that a connection predates the first sale',()=>{
  const result=analyzeInvestigation({...base(),transfers:[{...transfer('a','b','same-time'),timestamp:at(100)}],trades:[trade('a',100,'sell'),trade('b',120,'sell')]});
  assert(!result.wallets.some(w=>w.categories.includes('coordinated-seller')));
});

test('unrelated earlier sales do not suppress a later connected selling window',()=>{
  const result=analyzeInvestigation({...base(),transfers:[{...transfer('a','b','connection'),timestamp:at(100)}],trades:[trade('c',0,'sell'),trade('a',200,'sell'),trade('b',220,'sell')]});
  assert.equal(result.wallets.filter(w=>w.categories.includes('coordinated-seller')).length,2);
});

test('unproven native proceeds remain transfers and cannot establish shared funding or coordinated selling',()=>{
 const input=base();input.transfers=[{...transfer('service','a','payout-a'),fundingEligible:false},{...transfer('service','b','payout-b'),fundingEligible:false}];
 const result=analyzeInvestigation(input);
 assert.equal(result.evidence.filter(e=>e.kind==='transfer').length,2);
 assert.equal(result.relationships.filter(e=>e.kind==='funding').length,0);
 assert.equal(result.findings.filter(f=>f.id.startsWith('funder:')).length,0);
 assert(!result.wallets.some(w=>w.categories.includes('shared-funder')));
});

test('sub-threshold Solana native receipts remain observations without funding, creator-link or selling-group inference',()=>{
 for(const amount of [0.0000001,0.00001,0.000099999]){
  const input:InvestigationInput={...base(),chain:'solana',launchVerified:false,identities:[{address:'creator',role:'creator',timestamp:at(-100),source:'test'}],transfers:[{...transfer('creator','a','tiny-a'),amount,fundingEligible:true},{...transfer('creator','b','tiny-b'),amount,fundingEligible:true}],trades:[trade('a',100,'sell'),trade('b',120,'sell')]};
  const result=analyzeInvestigation(input);
  assert.equal(result.evidence.filter(e=>e.kind==='transfer').length,2);
  assert.equal(result.relationships.length,2);
  assert.ok(result.relationships.every(r=>r.kind==='transfer'));
  assert.ok(!result.wallets.some(w=>w.categories.some(c=>['shared-funder','deployer-linked','coordinated-seller'].includes(c))));
  assert.ok(!result.findings.some(f=>f.id.startsWith('funder:')||f.id.startsWith('selling:')));
  assert.ok(result.evidence.filter(e=>e.kind==='transfer').every(e=>e.description.includes('0.0001 SOL')));
  assert.ok(result.coverage.reasons.some(r=>r.includes('per-transfer')&&r.includes('not proof of spam')));
 }
});

test('Solana funding at the exact floor and above remains eligible without treating the threshold as proof of ownership',()=>{
 for(const amount of [0.0001,0.000100001,1]){
  const result=analyzeInvestigation({...base(),chain:'solana',launchVerified:false,transfers:[{...transfer('source','a','material-a'),amount,fundingEligible:true},{...transfer('source','b','material-b'),amount,fundingEligible:true}],trades:[trade('a',0),trade('b',1),trade('a',100,'sell'),trade('b',120,'sell')]});
  assert.equal(result.findings.filter(f=>f.id.startsWith('funder:')).length,1);
  assert.equal(result.wallets.filter(w=>w.categories.includes('coordinated-seller')).length,2);
  assert.equal(result.findings.find(f=>f.id.startsWith('funder:'))?.certainty,'inferred');
 }
});

test('Solana native inference floor does not silently filter EVM funding or SPL token transfers',()=>{
 const result=analyzeInvestigation({...base(),transfers:[{...transfer('source','a','evm-a'),amount:0.0000001},{...transfer('source','b','evm-b'),amount:0.0000001}]});
 assert.equal(result.findings.filter(f=>f.id.startsWith('funder:')).length,1);
 const tokenTransfer=analyzeInvestigation({...base(),chain:'solana',identities:[{address:'creator',role:'creator',timestamp:at(-100),source:'test'}],transfers:[{...transfer('creator','a','spl'),native:false,token:'scanned-mint',amount:0.0000001}]});
 assert.ok(tokenTransfer.wallets.find(w=>w.address==='a')?.categories.includes('deployer-linked'));
});

test('connected-selling findings disclose observed amounts without equating timing with market impact',()=>{
 const result=analyzeInvestigation({...base(),transfers:[{...transfer('a','b','before-sales'),timestamp:at(10)}],trades:[{...trade('a',100,'sell'),amount:2},{...trade('b',120,'sell'),amount:3}]});
 const finding=result.findings.find(f=>f.id.startsWith('selling:'))!;
 assert.match(finding.description,/5 tokens across 2 trades/);assert.match(finding.description,/does not establish market impact/);
});
