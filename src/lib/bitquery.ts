// Query builder and response parsers are pure and fixture-testable. Credentials are
// provided only by the server route's composition root, never by the browser.
import type { Chain } from './analysis';
import type { InvestigationInput, LabelRecord, TradeRecord, TransferRecord } from './investigation';

const V2 = 'https://streaming.bitquery.io/graphql';
const V1 = 'https://graphql.bitquery.io';
export const SOLANA_HOLDER_ROWS = 5000;
export const TRADE_ROWS = 1000;
export const TRANSFER_ROWS = 500;
type Row = Record<string, unknown>;
const object = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): Row[] => Array.isArray(value) ? value.map(object) : [];
const str = (value: unknown) => typeof value === 'string' ? value : '';
const num = (value: unknown) => (typeof value === 'number' || typeof value === 'string') && value !== '' && Number.isFinite(Number(value)) ? Number(value) : NaN;
const normalize = (value: string, chain: Chain) => chain === 'solana' ? value : value.toLowerCase();
const q = (value: unknown) => JSON.stringify(value);
const network = { ethereum: 'eth', base: 'base', bsc: 'bsc', solana: 'solana' };
export type QueryKind = 'holders' | 'early' | 'recent' | 'transfers' | 'labels' | 'launch';

export function buildQuery(kind: QueryKind, chain: Chain, token: string, limit: number, wallets: string[] = []): string {
  const cap = Math.min(200, Math.max(1, Math.floor(limit)));
  const solana = chain === 'solana';
  const root = solana ? 'Solana(dataset: combined)' : `EVM(network: ${network[chain]}, dataset: combined)`;
  if (kind === 'launch') {
    if(solana)throw new Error('Solana creation within archive coverage must be independently verified first.');
    const first = `rows: DEXTradeByTokens(limit: {count: 1}, orderBy: {ascending: Block_Time}, where: {TransactionStatus: {Success: true}, Trade: {Currency: {SmartContract: {is: ${q(token)}}}}}) { Block { Time } Transaction { Hash From } Log { Index } Trade { Amount Side { Type } } }`;
    return `query { archive: EVM(network: ${network[chain]}, dataset: archive) { ${first} } combined: EVM(network: ${network[chain]}, dataset: combined) { ${first} } }`;
  }
  if (kind === 'holders') {
    if (solana) return `query { solana(network: solana) {
      inflow: transfers(currency: {is: ${q(token)}}, success: {is: true}, options: {limit: ${SOLANA_HOLDER_ROWS}, asc: "receiver.address"}) { receiver { address } amount(calculate: sum) }
      outflow: transfers(currency: {is: ${q(token)}}, success: {is: true}, options: {limit: ${SOLANA_HOLDER_ROWS}, asc: "sender.address"}) { sender { address } amount(calculate: sum) }
    } }`;
    return `query { ${root} { rows: Holders(where: {Currency: {SmartContract: {is: ${q(token)}}}}, orderBy: {descending: Balance_Amount}, limit: {count: ${cap + 1}}) { Holder { Address } Balance { Amount(selectWhere: {gt: "0"}) LastChangeTime } } } }`;
  }
  if (kind === 'labels') {
    if (!wallets.length || wallets.length > 100) throw new Error('Label queries require 1 to 100 addresses.');
    return `query { Metadata { Labels(where: {Address: {in: ${q(wallets.map(w => normalize(w, chain)))}}, Chain: {is: ${q(chain)}}}, limit: {count: 500}, limitBy: {by: [Address, Label_Type], count: 1}, orderBy: {descending: RecordedAt}) { Address Label { Type Value } RecordedAt } } }`;
  }
  if (kind === 'transfers') {
    if (!wallets.length || wallets.length > 100) throw new Error('Transfer queries require 1 to 100 addresses.');
    // Incoming native transfers establish one funding hop. Token transfers stay
    // within the selected wallet set; arbitrary recursive expansion is forbidden.
    const addresses = q(wallets.map(w => normalize(w, chain)));
    const conditions = solana
      ? `{Transfer: {Receiver: {Address: {in: ${addresses}}}, Currency: {Native: true}}}, {Transfer: {Receiver: {Owner: {in: ${addresses}}}, Currency: {MintAddress: {is: ${q(token)}}}}}`
      : `{Transfer: {Receiver: {in: ${addresses}}, Currency: {Native: true}}}, {Transfer: {Receiver: {in: ${addresses}}, Currency: {SmartContract: {is: ${q(token)}}}}}`;
    const fields = solana ? 'Index Sender { Address Owner } Receiver { Address Owner } Currency { MintAddress Native }' : 'Sender Receiver Currency { SmartContract Native }';
    // Solana transfer history in this endpoint is realtime only. Never assert full history.
    const transferRoot = solana ? 'Solana(dataset: realtime)' : root;
    return `query { ${transferRoot} { rows: Transfers(limit: {count: ${TRANSFER_ROWS}}, orderBy: {ascending: Block_Time}, where: {${solana ? 'Transaction: {Result: {Success: true}}' : 'TransactionStatus: {Success: true}'} any: [${conditions}]}) { Block { Time } Transaction { ${solana ? 'Signature' : 'Hash'} } ${solana ? '' : 'Log { Index }'} Transfer { Amount ${fields} } } } }`;
  }
  const direction = kind === 'early' ? 'ascending' : 'descending';
  const currency = solana ? 'MintAddress' : 'SmartContract';
  const signer = solana ? 'Signature Signer' : 'Hash From';
  const success = solana ? 'Transaction: {Result: {Success: true}}' : 'TransactionStatus: {Success: true}';
  // Side.Type describes the counter leg. A sale of that leg is a buy of Trade.Currency.
  const buyerFilter = kind === 'early' ? 'Side: {Type: {is: sell}}' : '';
  // Keep early buys unbounded in time, but bounded in rows. A successful query
  // proves the earliest indexed sample, not full token launch coverage.
  return `query { ${root} { rows: DEXTradeByTokens(limit: {count: ${TRADE_ROWS}}, orderBy: {${direction}: Block_Time}, where: {${success} Trade: {Currency: {${currency}: {is: ${q(token)}}} ${buyerFilter}}}) { Block { Time } Transaction { ${signer} } ${solana ? 'Instruction { Index InternalSeqNumber }' : 'Log { Index }'} Trade { ${solana ? 'Index' : ''} Amount Side { Type } } } } }`;
}

function rows(payload: unknown, chain: Chain): Row[] {
  const data = object(object(payload).data);
  const root = object(data[chain === 'solana' ? 'Solana' : 'EVM']);
  if (!Array.isArray(root.rows)) throw new Error('Provider response was missing the requested dataset.');
  return list(root.rows);
}
export function responseRowCount(payload: unknown, chain: Chain) { return rows(payload, chain).length; }

export function parseTrades(payload: unknown, chain: Chain): TradeRecord[] {
  return rows(payload, chain).flatMap(row => {
    const tx = object(row.Transaction), trade = object(row.Trade);
    const timestamp = str(object(row.Block).Time), transaction = str(tx.Hash || tx.Signature);
    const wallet = normalize(str(tx.From || tx.Signer), chain);
    const side = str(object(trade.Side).Type).toLowerCase(), amount = num(trade.Amount);
    if (!transaction || !wallet || !Number.isFinite(Date.parse(timestamp)) || !Number.isFinite(amount) || amount <= 0 || !['buy', 'sell'].includes(side)) return [];
    const instruction = object(row.Instruction);
    // A routed Solana instruction can emit several swaps. Instruction index
    // alone collapses distinct trades when early/recent pages are deduplicated.
    const index = chain === 'solana'
      ? `${instruction.Index ?? 'unknown'}:${instruction.InternalSeqNumber ?? 'unknown'}:${trade.Index ?? `${side}:${wallet}:${amount}`}`
      : object(row.Log).Index ?? `${side}:${wallet}:${amount}`;
    return [{ id: `${transaction}:${index}`, wallet, timestamp, transaction, side: side === 'sell' ? 'buy' : 'sell', amount, source: 'Bitquery DEXTradeByTokens (combined)' }];
  });
}
export function parseIndexedStart(payload: unknown, chain: Chain): TradeRecord | undefined {
  if(chain==='solana')return undefined;
  const data=object(object(payload).data);
  const archive=parseTrades({data:{EVM:data.archive}},chain);
  const combined=parseTrades({data:{EVM:data.combined}},chain);
  if(archive.length!==1||combined.length!==1)return undefined;
  const a=archive[0],b=combined[0];
  if(a.id!==b.id||a.timestamp!==b.timestamp||a.transaction!==b.transaction)return undefined;
  return {...a,source:'Bitquery archive and combined - matching earliest indexed trade'};
}
export function parseTransfers(payload: unknown, chain: Chain): TransferRecord[] {
  return rows(payload, chain).flatMap(row => {
    const tx = object(row.Transaction), transfer = object(row.Transfer), currency = object(transfer.Currency);
    const timestamp = str(object(row.Block).Time), transaction = str(tx.Hash || tx.Signature);
    const account = (value: unknown) => typeof value === 'string' ? value : str(object(value).Owner || object(value).Address);
    const from = normalize(account(transfer.Sender), chain), to = normalize(account(transfer.Receiver), chain), amount = num(transfer.Amount);
    if (!transaction || !from || !to || !Number.isFinite(Date.parse(timestamp)) || !Number.isFinite(amount) || amount <= 0) return [];
    const native = currency.Native === true;
    const token = str(currency.SmartContract || currency.MintAddress) || (native ? 'native' : 'unknown');
    const index = transfer.Index ?? object(row.Log).Index ?? `${from}:${to}:${token}:${amount}`;
    return [{ id: `${transaction}:${index}`, from, to, timestamp, transaction, amount, native, token, source: `Bitquery Transfers (${chain === 'solana' ? 'realtime' : 'combined'})` }];
  });
}
export function parseHolders(payload: unknown, chain: Chain, limit: number): InvestigationInput['holders'] {
  if (chain !== 'solana') return rows(payload, chain).flatMap(row => {
    const address = normalize(str(object(row.Holder).Address), chain), balance = num(object(row.Balance).Amount);
    return address && Number.isFinite(balance) && balance > 0 ? [{ address, balance, share: null }] : [];
  }).slice(0, limit);
  const root = object(object(object(payload).data).solana);
  if (!Array.isArray(root.inflow) || !Array.isArray(root.outflow)) throw new Error('Solana holder inflow or outflow history is missing.');
  if (root.inflow.length >= SOLANA_HOLDER_ROWS || root.outflow.length >= SOLANA_HOLDER_ROWS) throw new Error('Solana holder history exceeds the bounded 5,000-address lists. Current ranking is unknown.');
  const balances = new Map<string, number>();
  for (const [items, field, sign] of [[root.inflow, 'receiver', 1], [root.outflow, 'sender', -1]] as const) {
    for (const row of list(items)) {
      const address = str(object(row[field]).address), amount = num(row.amount);
      if (address && Number.isFinite(amount)) balances.set(address, (balances.get(address) || 0) + amount * sign);
    }
  }
  // V1 amounts are raw units. Do not expose them as normalized token amounts or
  // fabricate a supply percentage when decimals and total supply are unknown.
  return [...balances].filter(([, balance]) => balance > 0).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([address]) => ({ address, share: null }));
}
export function parseLabels(payload: unknown): LabelRecord[] {
  const data = object(object(object(payload).data).Metadata);
  if (!Array.isArray(data.Labels)) throw new Error('Address label dataset is missing.');
  return list(data.Labels).flatMap(row => {
    const label = object(row.Label), type = str(label.Type), address = str(row.Address), timestamp = str(row.RecordedAt);
    const category: LabelRecord['category'] | undefined = ['cex-hot-wallet','cex-cold-wallet','cex-deposit-address','cex-wallet','cex-proof-of-reserves'].includes(type) ? 'exchange' : type === 'bridge' ? 'bridge' : type === 'pool' || type === 'dex-pool' ? 'pool' : type === 'burn' ? 'burn' : type === 'contract' || type === 'token' ? 'contract' : undefined;
    return category && address && Number.isFinite(Date.parse(timestamp)) ? [{ address, category, label: str(label.Value) || type, timestamp, source: 'Bitquery Metadata.Labels' }] : [];
  });
}

export type BitqueryClient = ReturnType<typeof createBitqueryClient>;
export function createBitqueryClient(options: { token: string; fetcher?: typeof fetch; signal?: AbortSignal; maxRequests?: number }) {
  let requests = 0;
  return {
    configured: Boolean(options.token),
    async request(query: string, v1 = false): Promise<unknown> {
      if (typeof window !== 'undefined') throw new Error('Blockchain adapters are server-only.');
      if (!options.token) throw new Error('Bitquery access is not configured.');
      options.signal?.throwIfAborted();
      if (++requests > (options.maxRequests || 18)) throw new Error('Bounded provider request budget reached.');
      const signal = AbortSignal.any([AbortSignal.timeout(15_000), ...(options.signal ? [options.signal] : [])]);
      const response = await (options.fetcher || fetch)(v1 ? V1 : V2, { method: 'POST', headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Bitquery request failed (HTTP ${response.status}).`);
      const payload: unknown = await response.json();
      if (list(object(payload).errors).length) throw new Error('Bitquery query failed or this dataset is unavailable to the configured account.');
      if (!object(payload).data) throw new Error('Bitquery response did not contain data.');
      return payload;
    },
  };
}
