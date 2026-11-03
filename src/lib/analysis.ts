export const CHAINS = {
  ethereum: { name: "Ethereum", id: "1", explorer: "https://etherscan.io" },
  base: { name: "Base", id: "8453", explorer: "https://basescan.org" },
  bsc: { name: "BNB Chain", id: "56", explorer: "https://bscscan.com" },
  solana: { name: "Solana", id: null, explorer: "https://solscan.io" },
} as const;
export type Chain = keyof typeof CHAINS;
export type Check = {
  source?: string;
  fetchedAt?: string;
  key: string;
  title: string;
  description: string;
  status: "clear" | "warning" | "critical" | "unknown";
  value: string;
};
export type Holder = {
  address: string;
  share: number;
  contract: boolean | null;
  locked: boolean | null;
  tag: string;
};
export type Pair = {
  chainId: string;
  pairAddress?: string;
  baseToken: { address: string; name?: string; symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  marketCap?: number;
  fdv?: number;
  pairCreatedAt?: number;
  dexId?: string;
  url?: string;
  txns?: { h24?: { buys: number; sells: number } };
};
export type Report = {
  chain: Chain;
  token: string;
  name: string;
  symbol: string;
  fetchedAt: string;
  market: Pair | null;
  holders: Holder[];
  holderCount: number | null;
  totalSupply?: number | null;
  checks: Check[];
  identities?: { timestampBasis?:'local-observation'|'provider-event'; address: string; role: 'creator' | 'authority'; source: string; timestamp: string; transaction?: string; authorityKind?: 'mint' | 'freeze'; label?: string; slot?: number }[];
  sources: {
    name: string;
    status: "available" | "unavailable" | "unsupported";
    detail: string;
    fetchedAt?: string;
  }[];
};
export function validateToken(chain: string, token: string): string | null {
  if (!Object.hasOwn(CHAINS, chain)) return "Choose a supported chain.";
  if (chain === "solana")
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(token)
      ? null
      : "Enter a valid Solana token address.";
  return /^0x[a-fA-F0-9]{40}$/.test(token)
    ? null
    : "Enter a 42-character EVM token contract address.";
}
const rules: [string, string, string, boolean, boolean][] = [
  [
    "is_honeypot",
    "Sell restriction",
    "Provider detection of a token that can be bought but cannot be sold.",
    true,
    true,
  ],
  [
    "owner_change_balance",
    "Balance control",
    "Whether the owner can change another holder’s balance.",
    true,
    true,
  ],
  [
    "is_open_source",
    "Verified source",
    "Whether the provider reports publicly verified contract source.",
    false,
    false,
  ],
  [
    "is_mintable",
    "Supply expansion",
    "Whether additional token supply can be minted.",
    true,
    false,
  ],
  [
    "transfer_pausable",
    "Transfer pause",
    "Whether contract authority can pause token transfers.",
    true,
    false,
  ],
  [
    "is_proxy",
    "Upgradeable contract",
    "A proxy may allow the implementation to change.",
    true,
    false,
  ],
  [
    "hidden_owner",
    "Hidden ownership",
    "Whether the provider reports hidden ownership controls.",
    true,
    false,
  ],
  [
    "selfdestruct",
    "Self-destruct capability",
    "Whether the provider detects a self-destruct function.",
    true,
    true,
  ],
];
export function analyzeSecurity(data: Record<string, unknown> | null): Check[] {
  return rules.map(([key, title, description, riskWhenTrue, critical]) => {
    const raw = data?.[key];
    const known = raw === "0" || raw === "1";
    const risk = known && (raw === "1") === riskWhenTrue;
    return {
      key,
      title,
      description,
      status: !known
        ? "unknown"
        : risk
          ? critical
            ? "critical"
            : "warning"
          : "clear",
      value: !known ? "Not reported" : raw === "1" ? "Yes" : "No",
    };
  });
}
export function normalizeHolders(input: unknown): Holder[] {
  if (!Array.isArray(input)) return [];
  const flag = (v: unknown) =>
    v === 0 || v === "0" ? false : v === 1 || v === "1" ? true : null;
  return input
    .filter(
      (x) =>
        x &&
        typeof x.address === "string" &&
        /^0x[a-fA-F0-9]{40}$/.test(x.address) &&
        (typeof x.percent === "number" ||
          (typeof x.percent === "string" && x.percent.trim() !== "")) &&
        Number.isFinite(Number(x.percent)) &&
        Number(x.percent) >= 0 &&
        Number(x.percent) <= 1,
    )
    .map((x) => ({
      address: x.address,
      share: Number(x.percent) * 100,
      contract: flag(x.is_contract),
      locked: flag(x.is_locked),
      tag: typeof x.tag === "string" ? x.tag : "",
    }))
    .sort((a, b) => b.share - a.share);
}
export function selectPair(
  pairs: Pair[],
  chain: string,
  token: string,
): Pair | null {
  const same = (a: string, b: string) =>
    chain === "solana" ? a === b : a.toLowerCase() === b.toLowerCase();
  return (
    pairs
      .filter(
        (p) =>
          p?.chainId === chain &&
          typeof p.baseToken?.address === "string" &&
          same(p.baseToken.address, token),
      )
      .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] ||
    null
  );
}
export function short(address: string) {
  return address.length > 16
    ? address.slice(0, 6) + "…" + address.slice(-4)
    : address;
}
export function sameToken(chain: Chain, a: string, b: string) {
  return chain === "solana" ? a === b : a.toLowerCase() === b.toLowerCase();
}
export function parseCount(value: unknown): number | null {
  return (typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")) &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0
    ? Number(value)
    : null;
}
/** Both operands must be provider-normalized token units, never raw base units. */
export function supplyShare(balance: unknown, totalSupply: unknown): number | null {
  const amount=parseCount(balance),supply=parseCount(totalSupply);
  if(amount===null||supply===null||supply<=0||amount>supply)return null;
  const share=amount/supply*100;
  return Number.isFinite(share)?share:null;
}
export function formatMoney(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "-";
  if (v !== 0 && Math.abs(v) < 0.000001) return "$" + v.toExponential(2);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: Math.abs(v) >= 1e6 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(v) < 1 ? 6 : 2,
  }).format(v);
}
