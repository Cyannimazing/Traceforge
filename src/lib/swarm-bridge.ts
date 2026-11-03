import type { Check } from './analysis';
import type { Evidence, Finding, InvestigatedWallet, InvestigationReport, TimelineEvent, WalletCategory } from './investigation-types';
import type { SwarmReport } from './swarm';

/** Translate presentation fields without turning provider claims into our
 * canonical transaction evidence or complete launch history. */
export function bridgeSwarmReport(provider: SwarmReport): InvestigationReport {
  const timestamp = provider.providerTimestamp || provider.fetchedAt;
  const evidence: Evidence[] = [], findings: Finding[] = [], timeline:TimelineEvent[]=[],wallets = new Map<string, InvestigatedWallet>();
  const evidenceFor = (id: string, description: string, kind: Evidence['kind'] = 'label',details:Partial<Pick<Evidence,'timestamp'|'transaction'|'from'|'to'>>={}): string => {
    evidence.push({ id, kind, timestamp, ...details,source: 'Swarm provider report', attribution: 'provider-reported', description: `${description} This is a provider report, not independently verified transaction evidence.${provider.providerTimestamp||details.timestamp ? '' : ' The provider scan time was not supplied; this timestamp records retrieval.'}` }); return id;
  };
  const ensureWallet = (address: string) => {
    let wallet = wallets.get(address); if (!wallet) { wallet = { address, share: null, categories: [], categorySources: {}, evidenceIds: [] }; wallets.set(address, wallet); } return wallet;
  };
  const role = (wallet: InvestigatedWallet, category: WalletCategory) => {
    if (!wallet.categories.includes(category)) wallet.categories.push(category);
    wallet.categorySources![category] = 'swarm';
  };
  for (const holder of provider.holders) {
    const wallet = ensureWallet(holder.address); wallet.share = holder.shareSupply === null ? null : holder.shareSupply * 100;
    if (holder.label) wallet.label = holder.label;
    wallet.evidenceIds.push(evidenceFor(`swarm:holder:${holder.address}`, `Provider snapshot for ${holder.address}: ${wallet.share === null ? 'total-supply share unavailable' : `${wallet.share}% of total supply`}. Float share is a separate measure.`, 'holding'));
    // A generic developer flag does not identify the contract deployer. Only
    // the explicit creator field below establishes a provider creator claim.
    for (const [flag, category] of [[holder.signals.sniper, 'sniper'], [holder.signals.fresh,'fresh'],[holder.signals.insider,'insider'],[holder.signals.fromDev, 'deployer-linked'], [holder.signals.contract, 'contract']] as [boolean | null, WalletCategory][]) {
      if (flag === true) { role(wallet, category); wallet.evidenceIds.push(evidenceFor(`swarm:role:${category}:${holder.address}`, `Provider classifies this address as ${category}. Its classification rules and complete supporting history were not independently verified.`)); }
    }
    const entry=holder.signals;
    if(entry.entryTransaction){
      const kind=entry.kind?.toLowerCase(),trade=kind==='buy'||kind==='sell',transfer=kind==='transfer'||kind==='mint';
      const id=`swarm:entry:${holder.address}:${entry.entryTransaction}`;
      wallet.evidenceIds.push(evidenceFor(id,`Provider reports an entry ${kind||'of unspecified type'} for this wallet.${kind==='mint'?' A mint entry is not a purchase or proof of token deployment.':''}${kind==='sell'&&entry.entryFrom?` The provider also returned entry_from ${entry.entryFrom}; its counterparty meaning is not established.`:''}${entry.entryAt?' The timestamp is the provider-reported entry time.':' No entry time was supplied; this timestamp is the report capture time, not transaction time.'} No token amount was supplied.`,trade?'trade':transfer?'transfer':'label',{transaction:entry.entryTransaction,...(entry.entryAt?{timestamp:entry.entryAt}:{}),...(kind==='sell'?{from:holder.address}:{...(entry.entryFrom?{from:entry.entryFrom}:{}),to:holder.address})}));
      if(entry.entryAt&&(trade||transfer))timeline.push({id,timestamp:entry.entryAt,kind:trade?kind as 'buy'|'sell':'transfer',wallet:holder.address,evidenceId:id});
      if(entry.entryAt&&kind==='buy')wallet.firstBuyAt=entry.entryAt;
    }
  }
  for(const infra of provider.infrastructure||[]){
    const wallet=ensureWallet(infra.address);if(wallet.share===null&&infra.shareSupply!==null)wallet.share=infra.shareSupply*100;
    if(!wallet.label)wallet.label=infra.label;if(infra.category)role(wallet,infra.category);
    wallet.evidenceIds.push(evidenceFor(`swarm:infrastructure:${infra.address}`,`Provider identifies this address as ${infra.label}; ${infra.shareSupply===null?'supply share unavailable':`${infra.shareSupply*100}% of total supply`}. Infrastructure labels are provider-reported.`,'holding'));
  }
  if(provider.launchAt)evidenceFor('swarm:reported-launch','Provider-reported launch timestamp. This does not establish the first verified trading event or a complete launch window.','label',{timestamp:provider.launchAt});
  for (const [address, category] of [[provider.creator, 'creator'], [provider.currentOwner, 'authority']] as [string | null, 'creator' | 'authority'][]) {
    if (!address) continue; const wallet = ensureWallet(address); role(wallet, category);
    wallet.evidenceIds.push(evidenceFor(`swarm:identity:${category}:${address}`, `Provider reports ${address} as ${category === 'creator' ? 'creator' : 'current owner'}.`, 'authority'));
  }
  const relationships = provider.relationships.map((link, index) => {
    const id = `swarm:link:${index}`;
    const evidenceId = evidenceFor(id, `Provider reports a ${link.kind || 'relationship'} link from ${link.from} to ${link.to}; provider confidence label: ${link.providerLevel || 'not supplied'}.${link.via ? ` Provider reference: ${link.via}.` : ''} This evidence timestamp records the provider scan, not the transaction time; no link transaction time was supplied.`, 'label',link.transaction?{transaction:link.transaction}:{});
    for (const address of [link.from, link.to]) ensureWallet(address).evidenceIds.push(evidenceId);
    return { id, from: link.from, to: link.to, kind: 'provider-reported' as const, attribution: 'provider-reported' as const, evidenceIds: [evidenceId], description: `Provider-reported ${link.kind || 'relationship'} link. Common ownership and transaction history have not been independently established.` };
  });
  for (const group of provider.groups.filter(group => group.wallets.length > 1)) {
    const id = `swarm:group:${group.id}`, evidenceId = evidenceFor(id, `Provider groups ${group.wallets.length} addresses together with its own ${group.providerLevel || 'unspecified'} confidence label. This does not establish common beneficial ownership.`);
    for (const address of group.wallets) ensureWallet(address).evidenceIds.push(evidenceId);
    findings.push({ id, title: `Provider groups ${group.wallets.length} wallets`, description: 'These addresses were grouped by the upstream analysis. The grouping is not an independent ownership finding.', level: 'info', certainty: 'inferred', attribution: 'provider-reported', wallets: group.wallets, evidenceIds: [evidenceId] });
  }
  const checks: Check[] = provider.security.map((check, index) => {
    const status: Check['status'] = check.level === 'danger' ? 'critical' : check.level === 'warn' ? 'warning' : check.level === 'ok' ? 'clear' : 'unknown';
    const key = `swarm_${check.id || index}`, evidenceId = evidenceFor(`security:${key}`, `Provider contract check: ${check.title || 'Unnamed check'}. ${check.detail || 'No supporting detail supplied.'}`);
    if (status === 'critical' || status === 'warning') findings.push({ id: `security:${key}`, title: check.title || 'Provider contract warning', description: check.detail || 'Provider supplied no supporting detail.', level: status === 'critical' ? 'critical' : 'warning', certainty: 'inferred', attribution: 'provider-reported', wallets: [], evidenceIds: [evidenceId] });
    return { key, title: check.title || 'Provider contract check', description: check.detail || 'Supporting detail not supplied.', status, value: `Provider reports ${check.level || 'unknown'}`, source: 'Swarm provider report', fetchedAt: timestamp };
  });
  const band = provider.band?.toUpperCase(), critical = band === 'DANGER' || checks.some(c => c.status === 'critical'), warning = band === 'RISKY' || checks.some(c => c.status === 'warning');
  const verdictId = evidenceFor('swarm:verdict', `Provider verdict: ${provider.band || 'not supplied'}${provider.score === null ? '' : `; score ${provider.score}/100`}. ${provider.reason || 'No reason supplied.'}`);
  if (critical || warning) findings.unshift({ id: 'swarm:verdict', title: critical ? 'Provider reports danger' : 'Provider reports caution', description: provider.reason || 'Inspect the provider checks and their scope.', level: critical ? 'critical' : 'warning', certainty: 'inferred', attribution: 'provider-reported', wallets: [], evidenceIds: [verdictId] });
  for (const wallet of wallets.values()) if (!wallet.categories.length) wallet.categories.push('unclassified');
  return {
    chain: provider.chain, token: provider.token, name: provider.header.name || 'Unknown token', symbol: provider.header.symbol || '', fetchedAt: provider.fetchedAt,
    market: null, holderCount: provider.header.holdersCount, totalSupply: null,
    holders: [...wallets.values()].flatMap(wallet => wallet.share === null ? [] : [{ address: wallet.address, share: wallet.share, contract: wallet.categories.includes('contract')?true:null, locked: null, tag: wallet.label || '' }]), checks, providerAnalysis: provider,
    sources: [{ name: 'Swarm provider report', status: 'available', fetchedAt: provider.fetchedAt, detail: `Provider-reported aggregate analysis. Original scan: ${provider.providerTimestamp || 'unknown'}. No independent launch or ownership verification.` }, { name: 'Swarm provider holders', status: 'available', fetchedAt: timestamp, detail: `${provider.holders.length} reported holder records; total-supply shares used where available. The upstream sample is not a complete holder census.` }],
    investigation: { wallets: [...wallets.values()], relationships, evidence, findings, timeline: timeline.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.id.localeCompare(b.id)), assessment: { status: critical ? 'critical' : warning ? 'caution' : 'insufficient', title: critical ? 'Danger' : 'Caution', summary: critical ? 'The provider reports a serious warning.' : warning ? 'Provider-reported findings require review.' : 'A provider all-clear does not establish independently verified safety.' }, coverage: { status: 'partial', launchVerified: false, holderLimit: provider.holders.length+(provider.infrastructure?.length||0), buyerLimit: 0, fundingHops: 0, truncated: provider.truncated, reasons: [...provider.limitations, 'Role labels and entry references are provider-reported classifications and observations. No canonical launch timing or complete transaction ledger was imported.'], source: 'Swarm provider report', fetchedAt: timestamp } },
  };
}
