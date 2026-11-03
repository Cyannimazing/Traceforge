import type { InvestigatedWallet, Relationship } from './investigation-types';

/** Rendering is deliberately bounded. The report and its wallet table remain complete. */
export const SCENE_WALLET_LIMIT = 160;

export function selectSceneWallets(
  wallets: InvestigatedWallet[],
  relationships: Relationship[],
  selected: string | null,
  activeWallet?: string | null,
  previous?: InvestigatedWallet[],
): InvestigatedWallet[] {
  const addresses = new Set(wallets.map(wallet => wallet.address));
  const required = new Set<string>();
  if (selected && addresses.has(selected)) required.add(selected);
  if (activeWallet && addresses.has(activeWallet)) required.add(activeWallet);
  const selectedRelationship = relationships.find(relationship => relationship.id === selected);
  if (selectedRelationship) {
    if (addresses.has(selectedRelationship.from)) required.add(selectedRelationship.from);
    if (addresses.has(selectedRelationship.to)) required.add(selectedRelationship.to);
  }
  // Keep the current spatial composition when an already visible item is selected.
  // Callers only supply previous when the report/filter inputs are unchanged.
  if (previous && previous.length === Math.min(wallets.length, SCENE_WALLET_LIMIT)) {
    const rendered = new Set(previous.map(wallet => wallet.address));
    if ([...required].every(address => rendered.has(address)) && previous.every(wallet => addresses.has(wallet.address))) return previous;
  }
  const ranked = [...wallets].sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
  const chosen = new Set(required);
  for (const wallet of ranked) {
    if (chosen.size >= SCENE_WALLET_LIMIT) break;
    chosen.add(wallet.address);
  }
  return ranked.filter(wallet => chosen.has(wallet.address)).slice(0, SCENE_WALLET_LIMIT);
}
