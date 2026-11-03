import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrades, parseTransfers, parseHolders, parseLabels, parseIndexedStart, createBitqueryClient, buildQuery } from '../src/lib/bitquery';
import { analyzeInvestigation } from '../src/lib/investigation';

test('multiple Solana trades inside one instruction retain separate identities without double-counting repeated rows',()=>{
  const row={Block:{Time:'2026-01-01T00:00:00Z'},Transaction:{Signature:'sig',Signer:'wallet'},Instruction:{Index:2,InternalSeqNumber:1},Trade:{Index:0,Amount:12,Side:{Type:'sell'}}};
  const second={...row,Trade:{...row.Trade,Index:1,Amount:7}};
  const trades=parseTrades({data:{Solana:{rows:[row,second,row]}}},'solana');
  const result=analyzeInvestigation({chain:'solana',token:'mint',holders:[],trades,transfers:[],identities:[],labels:[],launchVerified:false,complete:false,reasons:[],fetchedAt:row.Block.Time,holderLimit:100,buyerLimit:100,fundingHops:1,truncated:false});
  assert.equal(result.wallets[0].bought,19);
  assert.equal(result.timeline.length,2);
});

test('EVM parser preserves transaction and log identity and ignores malformed records', () => {
  const row = { Block: { Time: '2026-01-01T00:00:00Z' }, Transaction: { Hash: '0xabc', From: '0xABC' }, Log: { Index: 4 }, Trade: { Amount: '12', Side: { Type: 'buy' } } };
  const parsed = parseTrades({ data: { EVM: { rows: [row, { ...row, Transaction: {} }] } } }, 'ethereum');
  assert.equal(parsed.length, 1); assert.equal(parsed[0].wallet, '0xabc'); assert.equal(parsed[0].transaction, '0xabc'); assert.equal(parsed[0].amount, 12);
  assert.equal(parsed[0].side,'sell');
});
test('counter-leg sell is token buy on both chains; earliest buyer filter uses sell',()=>{
  for(const chain of ['ethereum','solana'] as const){
    const row={Block:{Time:'2026-01-01T00:00:00Z'},Transaction:{Hash:'hash',From:'wallet',Signature:'sig',Signer:'wallet'},Trade:{Amount:'12',Side:{Type:'sell'}}};
    const result=parseTrades({data:{[chain==='solana'?'Solana':'EVM']:{rows:[row]}}},chain);
    assert.equal(result[0].side,'buy');assert(buildQuery('early',chain,'token',100).includes('Type: {is: sell}'));
  }
});
test('indexed start requires matching archived and combined earliest transaction',()=>{
  const row={Block:{Time:'2026-01-01T00:00:00Z'},Transaction:{Hash:'hash',From:'wallet'},Log:{Index:1},Trade:{Amount:12,Side:{Type:'sell'}}};
  assert(parseIndexedStart({data:{archive:{rows:[row]},combined:{rows:[row]}}},'ethereum'));
  assert.equal(parseIndexedStart({data:{archive:{rows:[row]},combined:{rows:[{...row,Transaction:{Hash:'different',From:'wallet'}}]}}},'ethereum'),undefined);
  assert.equal(parseIndexedStart({data:{}},'solana'),undefined);
});
test('Solana transfer parser prefers owner to SPL token-account address', () => {
  const result = parseTransfers({ data: { Solana: { rows: [{ Transaction: { Signature: 'sig' }, Block: { Time: '2026-01-01T00:00:00Z' }, Transfer: { Index: 1, Amount: '2', Currency: { Native: false, MintAddress: 'mint' }, Sender: { Address: 'ata1', Owner: 'owner1' }, Receiver: { Address: 'ata2', Owner: 'owner2' } } }] } } }, 'solana');
  assert.equal(result[0].from, 'owner1'); assert.equal(result[0].to, 'owner2');
});
test('Solana holder ranking requires both complete inflow and outflow lists', () => {
  assert.throws(() => parseHolders({ data: { solana: { inflow: [{receiver:{address:'a'},amount:10}] } } }, 'solana', 100));
  const result = parseHolders({ data: { solana: { inflow: [{receiver:{address:'a'},amount:10},{receiver:{address:'b'},amount:20}], outflow:[{sender:{address:'b'},amount:19}] } } }, 'solana', 100);
  assert.equal(result[0].address, 'a'); assert.equal(result[0].share, null);
});
test('label types map exactly and do not infer exchange labels from names', () => {
  const result = parseLabels({data:{Metadata:{Labels:[{Address:'a',Label:{Type:'cex-hot-wallet',Value:'Exchange A'},RecordedAt:'2026-01-01T00:00:00Z'},{Address:'b',Label:{Type:'unknown',Value:'Exchange maybe'},RecordedAt:'2026-01-01T00:00:00Z'}]}}});
  assert.equal(result.length, 1); assert.equal(result[0].category, 'exchange');
});
test('GraphQL errors and absent credentials never become successful empty histories', async () => {
  let calls=0;
  const client = createBitqueryClient({ token: 'test', fetcher: async () => { calls++; return new Response(JSON.stringify({errors:[{message:'denied'}]})); } });
  await assert.rejects(() => client.request('query { x }'), /query failed/);
  assert.equal(calls,1);
  await assert.rejects(() => createBitqueryClient({ token: '' }).request('query { x }'), /not configured/);
});
test('queries bound result counts and normalize supported networks', () => {
  const query = buildQuery('holders', 'base', '0xabc', 200);
  assert(query.includes('network: base')); assert(query.includes('count: 201'));
  assert.throws(() => buildQuery('transfers','ethereum','0xabc',100,[]));
});
test('token transfer query includes incoming cross-batch transfers',()=>{
  for(const chain of ['ethereum','solana'] as const){
    const query=buildQuery('transfers',chain,'token',100,['receiver-in-batch']);
    assert(query.includes('receiver-in-batch'));
    assert(!query.includes('Sender: {'));
  }
});
