import {
  CHAINS,
  parseCount,
  analyzeSecurity,
  normalizeHolders,
  selectPair,
  type Chain,
  type Pair,
  type Report,
} from "./analysis";
type CacheEntry = { expires: number; fetchedAt: string; value: unknown };
const cache = new Map<string, CacheEntry>();
export async function publicJson(url: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const found = cache.get(url);
  if (found && found.expires > Date.now()) return found.value;
  const response = await fetch(url, {
    signal: AbortSignal.any([AbortSignal.timeout(12000), ...(signal ? [signal] : [])]),
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Provider rate limit reached. Try again shortly."
        : `Provider returned HTTP ${response.status}.`,
    );
  const value: unknown = await response.json();
  if (cache.size >= 200) cache.delete(cache.keys().next().value!);
  cache.set(url, { expires: Date.now() + 60000, fetchedAt: new Date().toISOString(), value });
  return value;
}
export async function scanToken(chain: Chain, token: string, options: {mode?: 'deep' | 'market' | 'holders'; signal?: AbortSignal} = {}): Promise<Report> {
  const chainInfo = CHAINS[chain];
  const marketUrl = `https://api.dexscreener.com/token-pairs/v1/${chain}/${encodeURIComponent(token)}`;
  const securityUrl = `https://api.gopluslabs.io/api/v1/token_security/${chainInfo.id}?contract_addresses=${encodeURIComponent(token)}`;
  const [marketResult, securityResult] = await Promise.allSettled([
    options.mode === 'holders' ? Promise.resolve(null) : publicJson(marketUrl, options.signal),
    chainInfo.id && options.mode !== 'market'
      ? publicJson(
          securityUrl, options.signal,
        )
      : Promise.resolve(null),
  ]);
  options.signal?.throwIfAborted();
  const pairs =
    marketResult.status === "fulfilled" && Array.isArray(marketResult.value)
      ? (marketResult.value as Pair[])
      : [];
  const market = selectPair(pairs, chain, token);
  const payload =
    securityResult.status === "fulfilled"
      ? (securityResult.value as {
          code?: number;
          result?: Record<string, Record<string, unknown>>;
        } | null)
      : null;
  const security =
    payload?.code === 1 ? payload.result?.[token.toLowerCase()] || null : null;
  const count = security?.holder_count;
  const reportedHolders=normalizeHolders(security?.holders);
  const indexedCount=parseCount(count);
  const inconsistentHolders=indexedCount===0&&(reportedHolders.length>0||(parseCount(security?.creator_balance)??0)>0||(parseCount(security?.owner_balance)??0)>0);
  const totalSupply=parseCount(security?.total_supply);
  const securityAt = cache.get(securityUrl)?.fetchedAt || new Date().toISOString();
  const identities: NonNullable<Report['identities']> = [];
  for (const [field, role] of [['creator_address', 'creator'], ['owner_address', 'authority']] as const) {
    const address = security?.[field];
    if (typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address) && !/^0x0{40}$/.test(address)) identities.push({ timestampBasis:'local-observation', address: address.toLowerCase(), role, source: 'GoPlus Security', timestamp: securityAt });
  }
  return {
    chain,
    token,
    name:
      market?.baseToken.name ||
      String(security?.token_name || "Unidentified token"),
    symbol:
      market?.baseToken.symbol || String(security?.token_symbol || "TOKEN"),
    fetchedAt: new Date().toISOString(),
    market,
    holders: reportedHolders,
    holderCount: inconsistentHolders?null:indexedCount,
    totalSupply:totalSupply!==null&&totalSupply>0?totalSupply:null,
    checks: analyzeSecurity(security).map(check => ({...check, source: "GoPlus Security", fetchedAt: security ? securityAt : undefined})),
    identities,
    sources: [
      {
        name: "DEX Screener",
        fetchedAt: options.mode === 'holders' ? undefined : cache.get(marketUrl)?.fetchedAt,
        status: market ? "available" : "unavailable",
        detail: market
          ? "Most liquid matching base-token pair. Market data can lag."
          : options.mode === 'holders' ? 'Market refresh was not requested.' : marketResult.status === "rejected"
            ? "Market provider did not respond. Retry shortly."
            : "No matching market pair returned.",
      },
      {
        name: "GoPlus Security",
        fetchedAt: options.mode === 'market' ? undefined : cache.get(securityUrl)?.fetchedAt,
        status: !chainInfo.id
          ? "unsupported"
          : security
            ? "available"
            : "unavailable",
        detail: !chainInfo.id
          ? "This GoPlus EVM endpoint does not cover Solana. See the direct Solana RPC sources for mint and freeze authority checks."
          : security
            ? `Provider-reported contract flags and top holders; this is not an independent audit.${inconsistentHolders?' Holder count is inconsistent with reported positive balances; zero is withheld pending independent verification.':''}`
            : options.mode === 'market' ? 'Security refresh was not requested.' : "Security data not returned. Checks remain unknown.",
      },
    ],
  };
}
