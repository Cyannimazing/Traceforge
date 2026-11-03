import { analyzeInvestigation, type InvestigationInput } from './investigation';
import type { InvestigationReport } from './investigation-types';

// Client-safe, synthetic example only. This module is never imported by live API routes.
const address = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const at = (seconds: number) => new Date(Date.UTC(2026, 0, 1, 12) + seconds * 1000).toISOString();
const source = 'Synthetic example - not blockchain data';
const input: InvestigationInput = {
  chain: 'ethereum', token: address(9999), fetchedAt: at(900), holderLimit: 100, buyerLimit: 100, fundingHops: 1,
  launchVerified: false, earliestTradeAt: at(0), complete: false, truncated: false,
  // Fabricated proof for the explicitly labeled example, never a live source.
  poolTiming:{verified:true,scope:'selected-pool',chain:'ethereum',pool:address(1),firstSwapAt:at(0),firstSwapTransaction:'sample-buy-0',firstSwapLogIndex:1,windowEndAt:at(60),creation:{transaction:'sample-pool-creation',blockNumber:1,blockHash:'synthetic-creation-block'},through:{blockNumber:20,blockHash:'synthetic-through-block',timestamp:at(61)},factory:address(14),token0:address(9999),token1:address(9998),eligibleTradeIds:['sample-buy-0','sample-buy-1','sample-buy-2'],verifiedAt:at(900)},
  reasons: ['SYNTHETIC EXAMPLE. Every address, transaction, balance and market value is fabricated to demonstrate the investigation interface. This is not a scan or a token recommendation.'],
  holders: [24, 9.2, 7.4, 5.1, 3.8, 2.6, 1.9, 1.3, 0.8, 0.5].map((share, i) => ({ address: address(i + 1), share, balance: share * 10000 })),
  identities: [{ address: address(11), role: 'creator', source, timestamp: at(-300) }, { address: address(12), role: 'authority', source, timestamp: at(-250) }],
  labels: [{ address: address(1), category: 'pool', label: 'Example liquidity pool', source, timestamp: at(-300) }, { address: address(13), category: 'exchange', label: 'Example exchange', source, timestamp: at(-300) }],
  trades: [
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((wallet, i) => ({ id: `sample-buy-${i}`, wallet: address(wallet), timestamp: at(i * 23), side: 'buy' as const, amount: (10 - i) * 1000, transaction: `sample-buy-${i}`, source })),
    { id: 'sample-sell-1', wallet: address(2), timestamp: at(601), side: 'sell', amount: 7400, transaction: 'sample-sell-1', source },
    { id: 'sample-sell-2', wallet: address(3), timestamp: at(760), side: 'sell', amount: 5900, transaction: 'sample-sell-2', source },
  ],
  transfers: [
    ...[2, 3, 4].map((to, i) => ({ id: `sample-funding-${i}`, from: address(11), to: address(to), timestamp: at(-120 + i), amount: 1.2, token: 'native', native: true, transaction: `sample-funding-${i}`, source })),
    ...[5, 6, 7].map((to, i) => ({ id: `sample-exchange-${i}`, from: address(13), to: address(to), timestamp: at(-100 + i), amount: 0.4, token: 'native', native: true, transaction: `sample-exchange-${i}`, source })),
    { id: 'sample-transfer-1', from: address(4), to: address(8), timestamp: at(250), amount: 1500, token: address(9999), native: false, transaction: 'sample-transfer-1', source },
  ],
};
export const fixtureReport: InvestigationReport = {
  fixture: true, chain: input.chain, token: input.token, name: 'Example Token', symbol: 'DEMO', fetchedAt: input.fetchedAt,
  holderCount: 2486,
  holders: input.holders.map(h => ({address:h.address,share:h.share!,contract:h.address===address(1),locked:null,tag:h.address===address(1)?'Example pool':''})),
  market: { chainId: 'ethereum', pairAddress: address(1), baseToken: {address:input.token,name:'Example Token',symbol:'DEMO'}, quoteToken:{symbol:'WETH'}, priceUsd:'0.00482', liquidity:{usd:248600}, volume:{h24:1842000}, priceChange:{h24:-12.8}, marketCap:4820000, txns:{h24:{buys:1248,sells:941}}, dexId:'sample' },
  checks: [{key:'sample',title:'Synthetic example',description:'No contract checks were performed.',status:'unknown',value:'Demonstration only'}],
  identities: input.identities,
  sources: [{name:'Synthetic fixture',status:'available',detail:source,fetchedAt:input.fetchedAt}],
  investigation: analyzeInvestigation(input),
};
fixtureReport.investigation.coverage.source = source;
