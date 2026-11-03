import type { Report, Chain } from './analysis';
import type { SolanaPublicResult } from './solana-public';
import type { EvidenceClock } from './evidence-clock';
import type { SwarmReport } from './swarm';

export type WalletCategory = 'creator' | 'authority' | 'sniper' | 'early-buyer' | 'fresh' | 'insider' | 'deployer-linked' | 'shared-funder' | 'accumulator' | 'coordinated-seller' | 'pool' | 'exchange' | 'bridge' | 'burn' | 'contract' | 'unclassified';
export type Evidence = { attribution?: 'provider-reported'; id: string; kind: 'trade' | 'transfer' | 'authority' | 'label' | 'holding'; transaction?: string; timestamp: string; from?: string; to?: string; amount?: number; amountRaw?:string;decimals?:number; token?: string; description: string; source: string };
export type InvestigatedWallet = { categorySources?: Partial<Record<WalletCategory, 'swarm'>>; address: string; share: number | null; balance?: number; categories: WalletCategory[]; evidenceIds: string[]; firstBuyAt?: string; bought?: number; sold?: number; label?: string };
export type Relationship = { attribution?: 'provider-reported'; id: string; from: string; to: string; kind: 'funding' | 'transfer' | 'shared-funder' | 'deployer-linked' | 'provider-reported'; evidenceIds: string[]; description: string };
export type TimelineEvent = { id: string; timestamp: string; kind: 'buy' | 'sell' | 'funding' | 'transfer' | 'creation'; wallet: string; amount?: number; evidenceId: string };
export type Finding = { attribution?: 'provider-reported'; observedFrom?:string; observedTo?:string; id: string; title: string; description: string; level: 'critical' | 'warning' | 'info'; certainty: 'observed' | 'inferred' | 'unknown'; wallets: string[]; evidenceIds: string[] };
export type PoolTimingProof={verified:true;scope:'selected-pool';pool:string;chain:Chain;firstSwapAt:string;firstSwapTransaction:string;firstSwapLogIndex:number;windowEndAt:string;creation:{transaction:string;blockNumber:number;blockHash:string};through:{blockNumber:number;blockHash:string;timestamp:string};factory:string;token0:string;token1:string;eligibleTradeIds:string[];verifiedAt:string};
export type Investigation = {
  wallets: InvestigatedWallet[]; relationships: Relationship[]; evidence: Evidence[]; timeline: TimelineEvent[]; findings: Finding[];
  assessment: { status: 'critical' | 'caution' | 'insufficient' | 'clear'; title: string; summary: string };
  coverage: { status: 'complete' | 'partial' | 'unavailable'; launchVerified: boolean; poolTiming?:PoolTimingProof; poolTimings?:PoolTimingProof[]; clock?:EvidenceClock; earliestTradeAt?: string; holderLimit: number; buyerLimit: number; fundingHops: number; truncated: boolean; reasons: string[]; source: string; fetchedAt: string };
};
export type InvestigationReport = Report & { walletActivity?:import('./wallet-activity').WalletActivitySnapshot; controlProbes?:import('./evm-control-probes').EvmControlProbeResult; riskMetrics?:import('./risk-metrics').RiskMetrics; poolReserves?:import('./solana-pool-reserves').SolanaPoolReserveResult; trustRating?: import('./trust-rating').TrustRating; providerAnalysis?: SwarmReport; investigation: Investigation; fixture?: boolean; solana?: Pick<SolanaPublicResult,'snapshot'|'tokenAccounts'|'authorities'|'extensions'> };
export type ScanEvent = { type: 'stage'; stage: string; status: 'running' | 'complete' | 'unavailable'; detail: string } | { type: 'report'; report: InvestigationReport } | { type: 'error'; message: string };
