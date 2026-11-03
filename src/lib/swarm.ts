import { CHAINS, validateToken, type Chain } from './analysis';

const ORIGIN = 'https://swarmengine.tech';
const MAX_BYTES = 3 * 1024 * 1024, CACHE_MS = 10 * 60_000;
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max = 500): string | null => typeof value === 'string' ? value.slice(0, max) : null;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const integer = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const fraction = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const bool = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const rawInteger = (value: unknown): string | null => typeof value === 'string' && /^\d{1,100}$/.test(value) ? value : integer(value) !== null ? String(value) : null;
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const timestamp = (value: unknown): string | null => { const n = number(value); if (n === null || n < 0 || n > 8_640_000_000_000) return null; return new Date(n * 1000).toISOString(); };
const address = (chain: Chain, value: unknown): string | null => typeof value === 'string' && !validateToken(chain, value) ? chain === 'solana' ? value : value.toLowerCase() : null;
const identityAddress = (chain: Chain, value: unknown): string | null => { const normalized=address(chain,value);return normalized&&(chain==='solana'||!/^0x0{40}$/.test(normalized))?normalized:null; };
/** Format validation only, not receipt or chain verification. */
export function swarmTransaction(chain:Chain,value:unknown):string|null{
  if(typeof value!=='string')return null;
  if(chain!=='solana')return /^0x[\da-fA-F]{64}$/.test(value)?value.toLowerCase():null;
  if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(value))return null;
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;
  for(const character of value)n=n*58n+BigInt(alphabet.indexOf(character));
  const zeros=value.match(/^1*/)?.[0].length||0,bytes=n===0n?0:Math.ceil(n.toString(2).length/8);
  return zeros+bytes===64?value:null;
}
const id = (value: unknown): string | null => typeof value === 'string' ? value.slice(0, 128) : integer(value) !== null ? String(value) : null;

export type SwarmHolder = {
  address: string; label: string | null; balanceRaw: string | null; shareFloat: number | null; shareSupply: number | null; clusterId: string | null;
  signals: { dev: boolean | null; fresh: boolean | null; sniper: boolean | null; insider: boolean | null; fromDev: boolean | null; contract: boolean | null; unread: boolean | null; kind: string | null; entryAt: string | null; entryTransaction: string | null; entryFrom: string | null; funder: string | null; transactionCount: number | null };
};
export type SwarmReport = {
  provider: 'swarm'; attribution: 'provider-reported'; chain: Chain; token: string; sourceUrl: string; fetchedAt: string; providerTimestamp: string | null;
  score: number | null; band: string | null; reason: string | null;
  header: { name: string | null; symbol: string | null; decimals: number | null; supplyRaw: string | null; holdersCount: number | null; priceUsd: number | null; marketCap: number | null; liquidityUsd: number | null; volume24h: number | null };
  creator: string | null; currentOwner: string | null;
  holders: SwarmHolder[];
  relationships: { from: string; to: string; kind: string | null; providerLevel: string | null; via: string | null; transaction?:string|null }[];
  groups: { id: string; wallets: string[]; shareFloat: number | null; providerLevel: string | null }[];
  security: { id: string | null; level: string | null; title: string | null; detail: string | null }[];
  gates: string[]; unreadWallets: string[]; truncated: boolean; limitations: string[];
  launchAt?:string|null;
  infrastructure?:{address:string;label:string;category:'burn'|'pool'|'exchange'|'bridge'|'contract'|null;shareSupply:number|null}[];
  metrics?:Record<string,number>;
  scoreParts?:Record<string,number>;
  history?:SwarmHistory;
};
export type SwarmHistory={kind:'supply-share-snapshots';denominator:'total-supply';wallets:string[];frames:{timestamp:string;block:number|null;shares:Record<string,number|null>}[];truncated:boolean;issues:string[]};
export type SwarmResult = { status: 'available' | 'pending' | 'rate-limited' | 'unavailable' | 'invalid'; report?: SwarmReport; cached: boolean; message?: string; retryAfterMs?: number; job?: string };

function normalizeHistory(value:unknown,chain:Chain):SwarmHistory|undefined{
  const r=object(value);if(!Object.keys(r).length)return;
  const times=list(r.t),blocks=list(r.blocks),rawShares=object(r.share),issues=new Set<string>();
  let truncated=times.length>120||Object.keys(rawShares).length>100;
  if(truncated)issues.add('Historical display is bounded to 120 frames and 100 wallet series.');
  if(!times.length)issues.add('No valid timestamp array was supplied.');
  if(blocks.length!==times.length)issues.add('Block and timestamp arrays are not aligned; missing block numbers remain unavailable.');
  const series=new Map<string,unknown[]>();
  for(const [key,raw] of Object.entries(rawShares).slice(0,100)){
    const wallet=address(chain,key);if(!wallet||series.has(wallet)||!Array.isArray(raw)){truncated=true;issues.add('Invalid or duplicate wallet series were omitted.');continue;}
    if(raw.length!==times.length)issues.add('Some wallet series are shorter or longer than the timestamp array; missing samples remain unavailable.');
    series.set(wallet,raw);
  }
  const frames:SwarmHistory['frames']=[];let last=-Infinity,lastBlock=-Infinity;
  for(let i=0;i<Math.min(times.length,120);i++){
    const time=timestamp(times[i]),seconds=number(times[i]);
    if(!time||seconds===null||seconds<=last){truncated=true;issues.add('Invalid, duplicate or out-of-order timestamps were omitted without sorting or filling gaps.');continue;}last=seconds;
    let block=integer(blocks[i]);if(block!==null&&block<lastBlock){issues.add('Out-of-order block numbers remain unavailable.');block=null;}if(block!==null)lastBlock=block;
    const shares:Record<string,number|null>={};
    for(const [wallet,values] of series){shares[wallet]=fraction(values[i]);if(shares[wallet]===null)issues.add('Missing or invalid supply-share samples remain unavailable; no balances are interpolated.');}
    frames.push({timestamp:time,block,shares});
  }
  return {kind:'supply-share-snapshots',denominator:'total-supply',wallets:[...series.keys()],frames,truncated,issues:[...issues]};
}

/** Provider assertions remain separate from independently verified evidence.
 * `share` is a FLOAT fraction, while `share_supply` is a TOTAL SUPPLY fraction.
 * Unsafe JSON integer balances are deliberately omitted, never rounded. */
export function normalizeSwarmReport(value: unknown, chain: Chain, tokenInput: string, fetchedAt: string): SwarmReport {
  const r = object(value), token = address(chain, tokenInput);
  if (!token || r.chain !== chain || address(chain, r.token) !== token || !Array.isArray(r.holders) || !r.header || typeof r.header !== 'object' || Array.isArray(r.header)) throw Error('Provider report did not match the requested token or supported schema.');
  const header = object(r.header), seen = new Set<string>();
  let truncated = list(r.holders).length > 500 || list(r.links).length > 2000 || list(r.clusters).length > 200 || list(object(r.security).checks).length > 100 || list(r.gates).length > 100 || list(r.unread).length > 500;
  const holders = list(r.holders).slice(0, 500).flatMap(value => {
    const row = object(value), wallet = address(chain, row.address), s = object(row.signals);
    if (!wallet || seen.has(wallet)) { truncated = true; return []; } seen.add(wallet);
    return [{ address: wallet, label: text(row.label, 120), balanceRaw: rawInteger(row.balance), shareFloat: fraction(row.share), shareSupply: fraction(row.share_supply), clusterId: id(row.cluster), signals: { dev: bool(s.dev), fresh: bool(s.fresh), sniper: bool(s.sniper), insider: bool(s.insider), fromDev: bool(s.from_dev), contract: bool(s.contract), unread: bool(s.unread), kind: text(s.kind, 40), entryAt: timestamp(s.entry_ts), entryTransaction: swarmTransaction(chain,s.entry_tx), entryFrom: address(chain, s.entry_from), funder: address(chain, s.funder), transactionCount: integer(s.tx_count) } }];
  });
  const relationships = list(r.links).slice(0, 2000).flatMap(value => {
    const row = object(value), from = address(chain, row.a), to = address(chain, row.b);
    if (!from || !to || from === to) { truncated = true; return []; }
    return [{ from, to, kind: text(row.kind, 80), providerLevel: text(row.level, 80), via: text(row.via, 160),transaction:swarmTransaction(chain,row.via) }];
  });
  const groups = list(r.clusters).slice(0, 200).flatMap(value => {
    const row = object(value), groupId = id(row.id);
    if (groupId === null) { truncated = true; return []; }
    if (list(row.wallets).length > 500) truncated = true;
    const wallets = [...new Set(list(row.wallets).slice(0, 500).flatMap(value => { const a = address(chain, value); return a ? [a] : []; }))];
    return [{ id: groupId, wallets, shareFloat: fraction(row.share), providerLevel: text(row.level, 80) }];
  });
  const score = number(r.score), decimals = integer(header.decimals);
  const infrastructure:NonNullable<SwarmReport['infrastructure']>=[],seenInfra=new Set<string>();
  if(list(r.infra).length>100)truncated=true;
  for(const value of list(r.infra).slice(0,100)){
    const row=object(value),wallet=address(chain,row.address),label=text(row.label,120);
    if(!wallet||seenInfra.has(wallet)){truncated=true;continue;}seenInfra.add(wallet);
    const categories:Record<string,NonNullable<SwarmReport['infrastructure']>[number]['category']>={'burn':'burn','dex pool':'pool','pool':'pool','exchange':'exchange','bridge':'bridge','contract':'contract'};
    const key=label?.toLowerCase()||'';
    infrastructure.push({address:wallet,label:label||'Provider infrastructure',category:Object.hasOwn(categories,key)?categories[key]:null,shareSupply:fraction(row.share_supply)});
  }
  const metrics:Record<string,number>={},scoreParts:Record<string,number>={};
  for(const key of ['hands','wallets','impact','biggest','fresh','insiders','snipers','concentration','dev']){const n=['hands','wallets'].includes(key)?integer(object(r.metrics)[key]):fraction(object(r.metrics)[key]);if(n!==null)metrics[key]=n;}
  for(const key of ['swarm','fresh','insiders','concentration','snipers','dev']){const n=number(object(r.parts)[key]);if(n!==null&&n>=0&&n<=100)scoreParts[key]=n;}
  const history=normalizeHistory(r.timeline,chain);if(history?.truncated)truncated=true;
  return {
    provider: 'swarm', attribution: 'provider-reported', chain, token, sourceUrl: `${ORIGIN}/t/${chain}/${token}`, fetchedAt, providerTimestamp: timestamp(r.scanned_at),
    score: score !== null && score >= 0 && score <= 100 ? score : null, band: text(r.band, 40), reason: text(r.reason, 1200),
    header: { name: text(header.name, 160), symbol: text(header.symbol, 40), decimals: decimals !== null && decimals <= 255 ? decimals : null, supplyRaw: rawInteger(header.supply), holdersCount: integer(header.holders_count), priceUsd: number(header.price_usd), marketCap: number(header.mcap), liquidityUsd: number(header.liquidity_usd), volume24h: number(header.vol24h) },
    creator: identityAddress(chain, r.creator), currentOwner: identityAddress(chain, r.owner), holders, relationships, groups,
    launchAt:timestamp(r.launch_ts),infrastructure,metrics,scoreParts,...(history?{history}:{}),
    security: list(object(r.security).checks).slice(0, 100).map(value => { const row = object(value); return { id: text(row.id, 80), level: text(row.level, 40), title: text(row.title, 200), detail: text(row.detail, 1000) }; }),
    gates: list(r.gates).slice(0, 100).flatMap(value => typeof value === 'string' ? [value.slice(0, 1000)] : []),
    unreadWallets: list(r.unread).slice(0, 500).flatMap(value => { const a = address(chain, value); return a ? [a] : []; }), truncated,
    limitations: ['Provider-reported analysis; TraceForge has not independently verified these classifications, links or groups.', 'Holder and group float shares differ from total-supply shares. Neither field proves common ownership.', 'Provider timestamps identify the original scan; retrieval time does not make a stored report current.', 'Reported launch time and timestamped entry references do not establish canonical launch completeness or a complete transaction ledger.', 'Historical supply-share snapshots are provider-reported samples. Changes alone do not establish buys, sells or coordinated activity.', 'Balances supplied as unsafe JSON numbers are omitted; missing values remain unknown.', ...(truncated ? ['The normalized response is bounded; some provider records were omitted.'] : [])],
  };
}

async function readBounded(response: Response): Promise<unknown> {
  const size = Number(response.headers.get('content-length'));
  if (Number.isFinite(size) && size > MAX_BYTES) { await response.body?.cancel(); throw Error('size'); }
  if (!response.body) throw Error('empty');
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > MAX_BYTES) { await reader.cancel(); throw Error('size'); } chunks.push(part.value); } } finally { reader.releaseLock(); }
  const joined = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(joined));
}

export function createSwarmClient(deps: { fetcher?: typeof fetch; now?: () => number; timeoutSignal?: (milliseconds:number)=>AbortSignal } = {}) {
  const cache = new Map<string, { at: number; report: SwarmReport }>(); let cooldownUntil = 0;
  const now = deps.now || Date.now;
  return async (chain: Chain, tokenInput: string, options: { signal?: AbortSignal; allowScan?: boolean } = {}): Promise<SwarmResult> => {
    if (typeof window !== 'undefined') throw Error('Swarm access is server-only.');
    options.signal?.throwIfAborted();
    if (!Object.hasOwn(CHAINS, chain) || typeof tokenInput !== 'string' || validateToken(chain, tokenInput)) return { status: 'invalid', cached: false, message: 'Choose a supported chain and valid token address.' };
    const token = address(chain, tokenInput)!, key = `${chain}:${token}`, cached = cache.get(key);
    if (cached && now() - cached.at >= 0 && now() - cached.at < CACHE_MS) return { status: 'available', cached: true, report: structuredClone(cached.report) };
    if (now() < cooldownUntil) return { status: 'rate-limited', cached: false, retryAfterMs: cooldownUntil - now(), message: 'The analysis provider is cooling down after a rate limit.' };
    // The streaming route has an 80s deadline. Leave room for independent clock
    // (5s), public snapshot (12s), and public history (50s) after provider failure.
    // Both lookup and the single optional scan consume this same 10s budget.
    const signal = AbortSignal.any([(deps.timeoutSignal || AbortSignal.timeout)(10_000), ...(options.signal ? [options.signal] : [])]);
    const request = async (path: string): Promise<{ payload?: unknown; missing?: boolean; limited?: SwarmResult }> => {
      const response = await (deps.fetcher || fetch)(ORIGIN + path, { signal, redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 429) {
        const value = response.headers.get('retry-after'), numeric = value !== null && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : NaN;
        const providerNow = Date.parse(response.headers.get('date') || ''), until = value ? Date.parse(value) : NaN;
        const delay = Number.isFinite(numeric) ? numeric : Number.isFinite(until) ? Math.max(0, until - (Number.isFinite(providerNow) ? providerNow : now())) : 60_000;
        const retryAfterMs = Number.isSafeInteger(delay) ? delay : 60_000; cooldownUntil = now() + retryAfterMs; await response.body?.cancel();
        return { limited: { status: 'rate-limited', cached: false, retryAfterMs, message: 'The analysis provider is rate limited. Retry after the indicated cooldown.' } };
      }
      if (response.status === 404) { await response.body?.cancel(); return { missing: true }; }
      if (!response.ok) { await response.body?.cancel(); throw Error('unavailable'); }
      return { payload: await readBounded(response) };
    };
    try {
      let response = await request(`/api/token/${chain}/${encodeURIComponent(token)}`);
      if (response.limited) return response.limited;
      let payload = object(response.payload), raw = Object.hasOwn(payload, 'result') ? payload.result : payload.chain ? payload : undefined;
      if (raw == null) {
        if (!response.missing && (payload.error || !Object.hasOwn(payload, 'result'))) throw Error('invalid');
        if (options.allowScan === false) return { status: 'unavailable', cached: false, message: 'No stored provider analysis is available.' };
        response = await request(`/api/v1/scan?token=${encodeURIComponent(token)}&chain=${chain}&wait=5`);
        if (response.limited) return response.limited;
        payload = object(response.payload); raw = Object.hasOwn(payload, 'result') ? payload.result : payload.chain ? payload : undefined;
        if (raw == null) {
          const job = typeof payload.job === 'string' && /^[\w-]{1,128}$/.test(payload.job) ? payload.job : undefined;
          return { status: job ? 'pending' : 'unavailable', cached: false, ...(job ? { job } : {}), message: job ? 'The provider scan is still running. No completed report was returned within this request.' : 'The provider did not return a completed analysis.' };
        }
      }
      const report = normalizeSwarmReport(raw, chain, token, new Date(now()).toISOString());
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: now(), report });
      return { status: 'available', cached: false, report: structuredClone(report) };
    } catch { options.signal?.throwIfAborted(); return { status: 'unavailable', cached: false, message: 'The provider response was unavailable, timed out, exceeded the size limit or failed validation.' }; }
  };
}

export const getSwarmReport = createSwarmClient();
