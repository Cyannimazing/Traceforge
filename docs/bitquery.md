# Blockchain investigation integration

## Status

The adapter is implemented and tested with injected responses. No Bitquery credentials were available during development, so authenticated queries, plan entitlements, current schema compatibility and production data quality have **not been live-validated**. No account was purchased or upgraded. Schema errors and denied datasets become partial coverage rather than empty successful histories.

Set `BITQUERY_ACCESS_TOKEN` in a local server environment. The only environment reader is `src/lib/investigation-server.ts`, guarded by Next.js `server-only`. Do not place credentials in client code or a `NEXT_PUBLIC_` variable. Restart the server after configuring credentials.

## HTTP interface

- `GET /api/scan?chain=ethereum&token=...` returns `InvestigationReport`.
- `GET /api/scan/stream?chain=ethereum&token=...` emits SSE data messages carrying the `ScanEvent` union: stage, report or error.
- `expanded=1` raises holder and earliest sampled buyer caps from 100 to 200. Funding remains one hop.
- `mode=market` calls only DEX Screener. Merge market fields into the existing screen; its placeholder investigation is not a new deep scan.
- `mode=holders` refreshes holder snapshots without trade/funding queries. If a matching deep scan is cached, its historical investigation is retained with updated holdings and its original evidence timestamp. Merge holder fields and investigation, not market fields.

The default mode is deep and should be called only on the user's explicit scan action. Market/holder timers must specify their modes. Token and mode validation happens before provider requests. Disconnecting the SSE stream aborts downstream requests.

## Scope, cost controls and caveats

EVM networks map to `eth`, `base` and `bsc`. V2 requests use `https://streaming.bitquery.io/graphql`. Solana V1 transfer aggregates use `https://graphql.bitquery.io`.

Each deep scan has at most 18 Bitquery HTTP requests, four simultaneous deep scans per process, 15-second per-provider timeouts and an 80-second route deadline. Queries have explicit row caps: 1,000 earliest buy rows, 1,000 latest trade rows, 500 transfers per selected batch, 100 addresses per batch and 600 label addresses overall. Selected holders and sampled buyers can total 200 addresses (400 expanded). The maximum six label batches run at concurrency three; transfer batches at concurrency four. There are no retries or recursive funding walks. These are request and row bounds, not a guaranteed credit quote: provider-side query billing depends on the account and dataset.

Deep results are cached in-process for 15 minutes with a maximum of 64 entries. Public snapshots use a 60-second, 200-entry cache. Cached source timestamps are retained. Caches are not persistent across restarts or shared between server instances.

EVM holders use the documented `Holders` cube. Supply percentages are joined from a matching GoPlus address where available. For other EVM holders, decimal-adjusted `Balance.Amount` is divided by finite positive GoPlus `total_supply`; values outside 0-100% remain unknown. Supply is never inferred from price, FDV or the sum of sampled holders. These providers can have different snapshot times, and transfer-based balances may be inaccurate for rebasing tokens. Solana uses full-history V1 inflow minus outflow. Both address lists are capped at 5,000; if either cap is hit, the entire reconstruction is discarded because a partial join cannot establish a current ranking. V1 can lag about ten minutes. Raw balances and percentages are omitted without reliable decimals and total supply. Realtime Solana balance deltas are deliberately not misrepresented as current holdings.

Earliest indexed buys do not prove the true first trade. Matching archive and combined results preserve an earliest observation, but never promote live `launchVerified`. The live path withholds launch-time sniper and early-buyer classifications until independent launch coverage evidence is available. DEX Screener pool creation is not substituted for token launch. Synthetic test inputs exercise classifications with explicitly verified coverage.

When Bitquery is missing or trade queries fail, a bounded no-key public adapter now fetches recent GeckoTerminal pool swaps. Ethereum and Base also use Blockscout token metadata, 100/200 holder pages, creator metadata and incoming native transfers for up to eight selected non-contract addresses. Per-source timestamps, page caps and failures remain explicit. These public sources add observed facts, not complete launch history. See `engine-research.md` for exact scope, source documentation and live verification.

`DEXTradeByTokens.Trade.Side.Type` names the counter leg: `sell` means the scanned token was bought, and `buy` means it was sold. The adapter inverts this field and its earliest-buyer query filters the counter-side to `sell`.

Solana incoming transfer evidence uses the provider realtime window, about twelve hours. EVM combined history is queried but remains a capped sample. Recent trades are a token-wide capped window intersected with selected wallets, so busy tokens may have little per-wallet evidence. Trade wallet attribution uses transaction sender/signer; relayers, account abstraction and multi-hop routes can complicate economic ownership. Net buying means bought minus sold within returned trade rows, not a historic balance increase.

GoPlus creator and current owner are separate roles. Unavailable identities stay unknown. The adapter does not infer a creator from the first holder, signer, or market pair. Solana current mint/freeze authorities and sampled account owners are now independently read through finalized RPC. The historical creator remains unidentified without deployment history. GoPlus can supply bounded token-account candidates when public largest-account indexing is unavailable; ownership and balances are verified by RPC, not taken from GoPlus.

Address labels are evidence-backed provider types. Known exchange, pool, bridge, burn and contract nodes do not participate in common-funder or coordinated-selling inference. Unknown services may still resemble a shared funder, so findings remain inferences. Connection evidence must predate the first sale in each candidate rolling window; unrelated earlier sellers do not suppress later groups. The rolling window is inclusive at 300 seconds and requires at least two different wallets and transaction IDs. Incoming token transfers are batched by recipient, then filtered to senders in the complete selected set, so cross-batch connections are retained. Synthetic data lives in `investigation-fixture.ts`; live routes never import it.

## Documentation checked

- [EVM holders](https://docs.bitquery.io/docs/blockchain/Ethereum/token-holders/token-holder-api/)
- [EVM token trades](https://docs.bitquery.io/docs/blockchain/Ethereum/dextrades/token-trades-apis/)
- [Solana token holders and history limits](https://docs.bitquery.io/docs/blockchain/Solana/solana-token-holders/)
- [Solana trade history](https://docs.bitquery.io/docs/blockchain/Solana/solana-dextrades/)
- [Solana transfers and owner attribution](https://docs.bitquery.io/docs/blockchain/Solana/solana-transfers/)
- [Address labels and 100-address batch limit](https://docs.bitquery.io/docs/labels/address-labels-api/)
- [GoPlus response fields including total supply and distinct creator/owner](https://docs.gopluslabs.io/reference/response-details)
- [Bitquery balance fields and rebasing limitation](https://docs.bitquery.io/docs/blockchain/BSC/bsc-balance-updates/)

Check these live schema details with an entitled account before describing the Bitquery integration as production validated. Tests cover parsers and engine logic, not provider index completeness.

## Public engine recovery update

The canonical official Solana RPC is https://api.mainnet-beta.solana.com. The public fallback uses at most four RPC reads plus one GoPlus account-candidate GET. It verifies selected accounts and the mint in one finalized bank, and explicitly records whether selection came from RPC-largest accounts or an unranked GoPlus candidate sample. Live USDC verification recovered 10 owners from 20 accounts at slot464139771 with zero unresolved accounts.

The engine now corroborates fresh HTTP response clocks from fixed public endpoints. It records local capture and provider comparison times separately, never rewrites transaction timestamps, rejects cached/error responses, and keeps the 120-second future-event guard. This solves observed local/provider clock disagreement without changing the OS clock. Market-only refresh does not perform clock probes.

Pool verification can discover creation through historical RPC code state followed by a mandatory official-factory creation event and canonical receipt. A code boundary is only a hint, never proof. Bounded cached hints are rechecked; native log retrieval can replace explorer logs. Public archive restrictions remain real: an authorized archival endpoint may be needed for historical eth_getCode/getLogs/receipts/headers/eth_call. No paid access was configured.
