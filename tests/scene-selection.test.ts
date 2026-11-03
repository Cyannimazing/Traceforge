import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_WALLET_LIMIT, selectSceneWallets } from '../src/lib/scene-selection';
import type { InvestigatedWallet, Relationship } from '../src/lib/investigation-types';

const wallets: InvestigatedWallet[] = Array.from({ length: 2400 }, (_, i) => ({ address: `wallet-${i}`, share: i < 400 ? (400 - i) / 100 : null, categories: ['unclassified'], evidenceIds: [] }));
const links: Relationship[] = Array.from({ length: 2000 }, (_, i) => ({ id: `link-${i}`, from: `wallet-${i}`, to: `wallet-${i + 400}`, kind: 'funding', evidenceIds: [`evidence-${i}`], description: 'Observed funding' }));

test('large expanded reports render a bounded holder-prioritized sample without mutating the full report', () => {
  const result = selectSceneWallets(wallets, links, null);
  assert.equal(result.length, SCENE_WALLET_LIMIT);
  assert.equal(result[0].address, 'wallet-0');
  assert.equal(result.at(-1)?.address, 'wallet-159');
  assert.equal(wallets.length, 2400);
  assert.equal(links.length, 2000);
});

test('an omitted selected wallet and active timeline wallet are included within the same cap', () => {
  const result = selectSceneWallets(wallets, links, 'wallet-2399', 'wallet-2398');
  assert.equal(result.length, SCENE_WALLET_LIMIT);
  assert(result.some(wallet => wallet.address === 'wallet-2399'));
  assert(result.some(wallet => wallet.address === 'wallet-2398'));
  assert.equal(result[0].address, 'wallet-0');
});

test('selecting an omitted relationship retains both endpoints and its real evidence', () => {
  const result = selectSceneWallets(wallets, links, 'link-1999');
  assert.equal(result.length, SCENE_WALLET_LIMIT);
  assert(result.some(wallet => wallet.address === 'wallet-1999'));
  assert(result.some(wallet => wallet.address === 'wallet-2399'));
  assert.deepEqual(links[1999].evidenceIds, ['evidence-1999']);
});

test('selecting an already visible wallet preserves the scene array and camera composition', () => {
  const initial = selectSceneWallets(wallets, links, 'wallet-2399');
  const next = selectSceneWallets(wallets, links, 'wallet-2', null, initial);
  assert.equal(next, initial);
  assert.equal(selectSceneWallets(wallets, links, 'wallet-2399', null, next), initial);
});

test('small reports retain every node and nonexistent selections do not create data', () => {
  const small = wallets.slice(0, 13);
  const result = selectSceneWallets(small, [], 'missing', 'missing-active');
  assert.equal(result.length, small.length);
  assert.deepEqual(result, small);
});
