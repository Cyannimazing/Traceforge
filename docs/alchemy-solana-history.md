# Independent Solana historical evidence

`createAlchemySolanaHistory()` supplies the existing public-history interface. It reads the server-only `SOLANA_RPC_URL`; an Alchemy host is required for its enhanced `getTransactionsForAddress` method. Credentials are never returned in evidence or errors.

The adapter requests finalized, successful, oldest-first and latest-first full transactions, each bounded to 100. Pagination uses the actual returned cursor, supports transaction version 1, and deduplicates signatures across pages. It preserves successful results after partial failure and has a 40-second deadline, cancellation propagation and five-minute successful-result cache.

Trades require the canonical Pump program, a known instruction discriminator, the scanned mint at the IDL-defined account position, matching token-account owners, and an actual SPL transfer between the documented user and bonding-curve token accounts. Nested aggregator calls require CPI stack boundaries. Balance changes, log text, mints and ordinary token transfers alone never establish a buy. Creator records decode the explicit creator argument in Pump create/create_v2 instructions; the fee payer is not assumed to be the creator.

Funding is one hop: the earliest 20 indexed transactions of at most six observed buyers/current holders. Only incoming native transfers with concrete instructions are retained. `fundingEligible` is false by default. It becomes true only when the incoming movement strictly predates the recipient's known first observed buy and the same transaction has no decoded target-token swap/transfer or target-mint balance footprint. Sale proceeds, swap refunds, same-second movements and inflows to holders whose first buy is unknown remain observed receipts without acquisition-funding or clustering inference. Tip recipients and rent top-ups to unrelated accounts are excluded from candidate funding relationships. Provider labels and additional account verification remain necessary to distinguish exchanges and other services from personal funders.

## Coverage limits

This is bounded evidence, not complete token history. Unsupported protocols and routes remain unclassified. Mint-address indexing does not guarantee all token-account activity is indexed. This adapter therefore deliberately returns `coverage.launchVerified: false` and never independently enables sniper labels, even when the earliest observed transaction contains mint creation plus a buy. Full launch claims require a contiguous, explicitly scoped trading-window verifier and protocol/index coverage proof. The first observed trade timestamp is available separately and is not a launch guarantee.

## Verification

The checked-in regression fixture contains only public transaction data from token `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`. It is labeled test data, never a live fallback. Tests cover actual create/buy and nested CPI parsing, failed/missing-time/duplicate transactions, transfers versus buys, absent CPI/account-owner evidence, pagination, partial failure, cache and cancellation.

Live validation on November 2, 2026 (local Asia/Singapore) retrieved 200 bounded transactions and decoded 24 canonical Pump trades, one creator and 237 observed transfers, including six bounded funding queries. Initial verified buy: October 28, 2026 06:29:08 UTC; creator specified on-chain: `69z4qTgQ5DBRTJvnQzx2h8jZhNsv5UgADotEwwKUm2JS`. Counts can change with later activity.

References:

- [Alchemy getTransactionsForAddress](https://www.alchemy.com/docs/chains/solana/solana-api-endpoints/get-transactions-for-address)
- [Pump canonical public IDL](https://github.com/pump-fun/pump-public-docs/blob/main/idl/pump.json)
