# Engine accuracy research and public-data implementation

Reviewed 2026-11-01. This document records source-backed behavior, implemented changes, observed live results, and unresolved coverage. This section records the earlier independent engine pass. Current behavior also supports the documented public SwarmEngine API as an explicitly attributed provider source, with an independent public-data fallback. Provider claims are not independent verification.

## What is now implemented

The no-key path previously stopped at public market/security snapshots. It now requests real recent pool trades and, on Ethereum/Base, explorer holder, deployment and incoming native-transaction evidence. `investigation-server.ts` injects `createPublicHistory()` into the live service. It runs when Bitquery is not configured or returns no usable trades, and also supports holder-only refresh. The existing paid adapter remains available. No account, credential, or subscription was created.

| Capability | Actual implemented evidence | Boundary |
| --- | --- | --- |
| Recent buyers and sellers | GeckoTerminal pool trades, sender address, transaction hash, time, scanned-token amount and direction | One selected pool; up to 300 recent rows, normally a 24-hour window. Sender is not proven beneficial owner. |
| Current holder sample | Blockscout ETH/Base token-holder pages; 100 default, 200 expanded | Two/four pages maximum. Values are explorer snapshots, not exhaustive ownership history. Unknown decimals withhold normalized balance. Raw balance and raw supply permit approximate share without mixing units. |
| Creator/deployment address | Blockscout creator address plus deployment transaction, only when no creator identity is already reported | May identify a deployment factory. Does not establish a human creator or current authority. GoPlus creator and owner stay separate. |
| Incoming funding observations | Latest incoming normal-transaction page for at most eight non-contract candidate holders/traders | Success, positive native value, confirmed block and matching recipient required. Internal transfers, first-ever funding, complete funding history and recursively funded wallets are absent. |
| Shared funder / connected selling | Existing evidence engine processes the actual transfer/trade records | Shared funding is an inference. Unrecognized exchanges/services remain possible. Five-minute selling requires distinct transactions and connection evidence strictly earlier than the first sale. |
| Event replay | Actual returned transactions in timestamp order | Not reconstructed historic balances, full launch replay or historical market/verdict replay. |

Public calls use fixed hosts, at most 16 requests, no recursive expansion, two concurrent funding calls, a 50-second total fallback deadline and per-call deadlines (18 seconds for holder pages, eight seconds otherwise). A failed later holder page preserves earlier returned balances and marks truncation. Each funding source has its own wallet-qualified name so a refresh cannot silently collapse success and failure for different wallets. Holder refresh never requests trade/funding history; market refresh never runs this fallback.

GeckoTerminal documents its public API and its relation to CoinGecko's onchain data. The trade schema supplies `tx_from_address`, token addresses and amounts; this engine derives buy/sell from the scanned token's actual from/to leg rather than trusting pool-relative `kind`. The preserved provider event ID prevents repeated rows inflating totals. [GeckoTerminal public API](https://apiguide.geckoterminal.com/), [pool trade schema and default window](https://docs.coingecko.com/reference/pool-trades-contract-address).

Blockscout's documented address response contains deployment identity and transaction fields; the address-transaction endpoint supports to/from filtering. The adapter accepts only positive, successful incoming native value with a block number. It does not relabel arbitrary token transfers as buys. [Address metadata](https://docs.blockscout.com/api-reference/addresses/retrieve-detailed-information-about-a-specific-address-or-contract), [address transactions](https://docs.blockscout.com/api-reference/addresses/list-transactions-involving-a-specific-address-with-to-from-filtering).

Current Blockscout documentation describes a keyed multichain API and an October 2026 v12 migration. Direct Ethereum instance endpoints returned HTTP 200 without credentials in this session, but that observation is not a permanent free-access guarantee. Base holder availability remains intermittent. Failures stay visible rather than manufacturing evidence. [Blockscout API and migration notice](https://docs.blockscout.com/devs/blockscout-api).

## Accuracy corrections

1. **Matching Bitquery samples no longer verify launch.** Archive/combined agreement identifies an earliest observed indexed trade. Both can share missing coverage. The timestamp and real trade remain visible, but the live adapter keeps `launchVerified=false`, withholding launch-based early-buyer and sniper categories. Market-pair creation is not substituted for token launch.
2. **Checksummed EVM holders retain trade evidence.** Public holder addresses are normalized before selecting recent trade wallets. Previously lowercase Bitquery rows could miss a mixed-case public holder.
3. **Solana multi-swap identities no longer collapse.** Trade IDs include instruction index, internal sequence and trade index. Two swaps within one instruction remain separate; duplicate copies remain deduplicated. Bitquery's documentation describes these ordering fields. [Solana DEX trades](https://docs.bitquery.io/docs/blockchain/Solana/solana-dextrades/), [Solana cube fields](https://docs.bitquery.io/docs/cubes/solana/).
4. **Same-time links do not prove a prior connection.** Without transaction ordering, a transfer sharing the first sale's timestamp cannot establish that connection predates selling. Such links remain observed, but do not support the selling inference for that window.
5. **Positive holder share does not become zero through integer truncation.** Very small positive percentages retain their magnitude. Missing/invalid/unrepresentable fields remain null/absent. This is approximate JavaScript numeric display, not exact accounting.
6. **Authority evidence describes its snapshot.** Retained historical authority evidence no longer claims continuing control after a newer refresh changes the current category.

EVM trade attribution intentionally uses `Transaction.From`: Bitquery recommends it over buyer/seller fields that can identify routers. It is still a transaction-sender observation, not proof of economic ownership under relayers or account abstraction. Counter-leg `Side.Type=sell` denotes a buy of `Trade.Currency`; that existing inversion is retained. [Bitquery EVM trader attribution and direction](https://docs.bitquery.io/docs/blockchain/Ethereum/dextrades/evm-bullx-api/).

GoPlus documents missing owner as unknown and an empty owner string as no owner; absent security fields are not affirmative zeros. TraceForge keeps exact binary security parsing and separate creator/current-authority roles. It does not infer a creator from the oldest holder or first trader. [GoPlus response fields](https://docs.gopluslabs.io/reference/response-details).

## Original REA evidence revisited

The original repository [REA skill](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md), version 59, and its [JavaScript guide](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/references/javascript-applications.md) were fetched again through the GitHub connector. Its matching-evidence reuse workflow was followed; no identical expensive analysis was repeated. This review is a focused static follow-up, not a claim of a fresh runtime capture or recovered private backend.

Existing evidence reused:

- `ev_2aec5c2892a89a4fd54739c6e025fdcd759370d96a99f88341a25f16ca6cb7a1` in the chat workspace's `work/swarm-rea-evidence.json`.
- Engine parent `ev_726041963b437891897b6fc72ce05afb99726699132343f44ed13ac97c45cc4d` in `work/swarm-engine-dashboard-rea-evidence.json`.
- Summary `ev_536e1726405a00ac0a8d6429adce0f28925185415a55f3d5f04786414621108c` retains the partial-coverage limitations: eight unselected inventoried files, eight application unknowns and 1,873 semantic unknowns. It is not whole-backend coverage.

Artifact hashes rechecked in this review: `app.js` SHA-256 `f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380`; `engine.js` SHA-256 `bbe1c83f6179b8d26ccbaf7922549f5f558d1cc8b8f8c3fe2dd1c35285160226`. They match the previous audit.

Focused missing-data observations in captured `app.js`:

- Lines 53–55 explicitly render a server-provided `TOO_EARLY` band. They do not calculate its backend threshold.
- Lines 434–435 display an unavailable-security empty state when no checks are returned.
- Lines 439–441 render `unread`, unknown entry kind, and absent transaction-count placeholders.
- Line 622 suppresses the creator-history panel when the creator is unknown.
- Lines 428–431 show “no multi-wallet swarms” text when the server supplies no multi-wallet clusters. This UI empty state does not prove complete upstream relationship coverage.

Therefore Swarm's visible frontend also handles missing evidence. Its precise retry, coverage-completeness and final-verdict policies remain unrecovered. Copying an affirmative verdict or a numeric score into TraceForge would not supply those missing facts. The prior `swarm-behavior-audit.md` remains the broader static evidence ledger; its earlier live-adapter discussion is superseded by the implementation changes above.

## Live observations and verification

The coordinating agent made no-key public endpoint probes and an end-to-end local `/api/scan` request. The resulting WETH report was independently read from `work/live-public-report.json` in the chat workspace: fetched 2026-11-01 at 09:18:21 UTC, **247 wallet nodes, 300 trade evidence records and 87 transfer evidence records**, with `launchVerified=false`. GeckoTerminal trades, Blockscout deployment metadata, GoPlus and DEX Screener responded. Six funding pages responded; two funding requests and the initial Blockscout holder request failed. Existing public holders were preserved.

That run validated actual public trade/funding ingestion through the application, not complete WETH history or every supported network. It preceded the holder timeout increase and wallet-qualified funding source names. Provider failures are part of this evidence record, not omitted successes. No authenticated Bitquery request was made.

Automated checks after implementation: `npm test` — 68 tests passed; `npm run typecheck` passed, including the final deadline/source-name and concurrent-cancellation changes. New tests cover target-leg trade direction, holder raw-unit handling, tiny positive share, confirmed incoming funding only, cap/pagination preservation, source-specific failures, preflight and in-flight cancellation, service integration, refresh preservation, launch nonpromotion, EVM case matching, Solana duplicate identity and same-timestamp connection ambiguity. The in-flight cancellation regression first exposed a detached pool-request rejection; the pool promise now joins the same aggregate as the explorer requests.

## Remaining gaps and concrete closure conditions

| Gap | Why still missing | What would close it |
| --- | --- | --- |
| Verified first buyers/snipers | Earliest indexed sample does not certify actual launch coverage | Define trading-start venue scope; acquire creation/first-liquidity evidence and history covering that boundary; verify ordering and every relevant page. Retain evidence of provider coverage. |
| Complete or first-ever funding | Latest normal-transaction pages omit older/internal transfers and off-scope wallets | Paginated indexed normal/internal transfers with explicit earliest-coverage bounds and independent infrastructure labels; bounded cost policy and real fixtures. |
| Beneficial owner / real hands | Sender addresses, shared funding and transfers do not establish common control | Additional independent identity/control evidence. Do not infer a person-count from address clusters. |
| Solana authority and holder ownership | Current fallback only adds pool trades there; existing paid holder path remains bounded | Read mint/account state through a validated RPC; map token accounts to owners and preserve snapshot slot. `getTokenLargestAccounts` returns 20 token accounts, not 20 guaranteed distinct owners. |
| Complete launch replay | Recent swaps plus current holders do not reconstruct historic balances | Complete supply-aware transfers/mints/burns or historical balance snapshots, with missing intervals explicit. |
| Reliable provider availability | Public endpoints have latency, rate limits and changing access policies | Provider-specific live acceptance tests, monitored errors and authorized credentials where required; never silently bypass a paywall or label failed data empty. |

Solana mint/freeze authorities are distinct roles that can change or be revoked. They must be read from actual account state; a present authority is not necessarily the historical creator. [Solana authority semantics](https://solana.com/docs/tokens/basics/set-authority), [largest token-account scope](https://solana.com/docs/rpc/http/gettokenlargestaccounts).

The tangible public-data gap is reduced: users can now inspect real observed trades, deployment identity and sampled incoming funding without a Bitquery credential. Full-history reliability remains an explicit data-acquisition problem, not a missing visual badge.

### Follow-up live holder verification
The revised holder deadline was exercised through mode=holders on localhost. At 09:21-09:22 UTC, Blockscout metadata, creator and both holder pages returned successfully: 100 current holder shares and 101 investigation addresses. This directly verifies deeper current-holder ingestion; it does not change launch or complete-funding coverage.

## Engine completion pass - 2026-11-01

The explicit rescan now bypasses the 15-minute investigation cache. Concurrent scans have a generation guard so a slower, older request cannot replace the newest cache entry. A complete upstream outage fails the refresh and retains the previous successful report instead of replacing it with an empty report.

### Direct Solana evidence

The new server-side RPC adapter reads finalized token supply, mint/freeze roles, and up to 20 largest token accounts. It resolves selected token accounts to their parsed owners and reads the mint and balances at the same finalized slot for the share denominator. These are sampled token-account balances aggregated by owner, not all accounts belonging to those owners or a census of holders. Mint and freeze roles remain separate even when held by one address. Explicit null means that specific role is revoked; missing fields do not mean revocation. Token-2022 extensions are identified but not audited.

A real integrated API check on 2026-11-01 at 11:41 UTC read USDC supply and separate mint/freeze authorities at finalized slot 464128516. The public largest-account method was unavailable; a direct adapter probe returned HTTP 429. No holder rows were synthesized. An optional server-only SOLANA_RPC_URL supports an authorized dedicated provider. No purchase or credential provisioning was performed.

### Funding pagination and reliability

Public ETH/Base history now includes normal incoming transactions and successful native internal calls/self-destruct transfers. Default scans sample eight non-contract addresses with 24 funding-page slots; expanded scans sample twelve with 32 slots. Normal/internal requests are interleaved so one busy wallet does not consume the entire scope. Default maximum HTTP attempts are 33, expanded 45, including small shared retry reserves. The adapter has a 50-second total deadline, two concurrent funding requests and at most five seconds of retry waits. Retry-After is honored or the retry is skipped; longer waits are never shortened to evade limits. All successful pages survive later failures. Malformed or repeated cursors and fractional block numbers are rejected or explicitly marked incomplete. Root normal/internal duplicate value transfers are deduplicated while legitimate child trace events remain distinct.

This is bounded observed funding, not proof of the first-ever funder, all internal call history, common ownership or coverage of every wallet.

### Selected-pool first-minute verification

A new independent verifier checks supported official Uniswap V2/V3 factories on Ethereum and Uniswap V3 on Base. It verifies pool creation, token membership, contiguous indexed Swap-log ranges, a closed first-minute interval and matching canonical receipts. Factory/deployment and token checks are mandatory. Capped ranges are subdivided; an unresolved gap, malformed event, unavailable receipt, request budget or deadline withholds the timing proof. Transaction initiator is the attribution, not proven economic ownership. Other protocols and token-wide first-ever launch remain outside this proof.

The classification engine has a separate selected-pool proof. Only eligible event IDs inside its inclusive 60-second window receive early-buyer/possible-sniper labels. The token-global launchVerified flag remains false. Other feed rows sharing canonical pool transaction hashes are replaced to avoid inflated amounts. Pool scope is visible in the table, verdict and sources. Live historical verification is reported separately from fixture-tested behavior.

Primary references: [Solana getTokenLargestAccounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts), [getMultipleAccounts](https://solana.com/docs/rpc/http/getmultipleaccounts), [authority semantics](https://solana.com/docs/tokens/basics/set-authority), [Blockscout logs](https://docs.blockscout.com/devs/apis/rpc/logs), [Blockscout API schema](https://github.com/blockscout/blockscout-api-v2-swagger/blob/main/swagger.yaml), [Uniswap V2 factory](https://github.com/Uniswap/v2-core/blob/master/contracts/interfaces/IUniswapV2Factory.sol), [Uniswap V3 pool events](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolEvents.sol), [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).

The original REA analysis remains a reverse engineering of SwarmEngine's publicly delivered frontend and observable behavior. It does not disclose or recover the private backend. The independent engine must substantiate each result with its own evidence.

### Adapter acceptance evidence — 2026-11-01, 11:48 UTC

**Solana:** eight focused adapter tests passed, covering distinct-owner aggregation, same-slot supply denominators, separate mint/freeze evidence, explicit revocation versus missing fields, tiny balances, partial owner failures, Token-2022 limitations and cancellation. A real USDC adapter call read supply and authorities at finalized slot 464125275; the integrated application later read slot 464128516 as described above. Public largest-account requests returned HTTP 429, so this run did not validate live holder-owner aggregation. The aggregation is fixture-tested and must be exercised against an available authorized RPC before claiming that live path succeeded. No historical creator is inferred from these current authority roles.

**Selected pool:** `npx tsx --test tests/pool-launch.test.ts` passed all **15** tests, and `npm run typecheck` passed after the final adapter changes. Independent review also ran the 15 pool tests and 15 service tests successfully. Tests cover delayed first swap, the inclusive 60-second boundary, same-block ordering, capped-range subdivision, single-block saturation, wrong token/factory/chain, canonical receipt mismatch, missing indexed or receipt events, deduplication, V2/V3 direction, archive fallback and preflight/in-flight cancellation. These tests validate implementation behavior, not live provider completeness.

The real Ethereum WETH/USDC V3 pool `0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640` supplied a creation anchor through Blockscout's legacy contract-creation endpoint after the v2 address endpoint returned HTTP 500. Creation transaction `0x125e0b641d4a4b08806bf52c0c6757648c9963bcda8681e4f996f09e00d4c2cc` is at block **12376729**, hash `0x3496d03e6efd9a02417c713fa0de00915b78581a2eaf0e8b3fce435a96ab02c7`. The default public execution RPC returned null for this old receipt; Blockscout's public ETH RPC returned the successful receipt containing the official factory's matching PoolCreated event. The adapter now checks the fallback RPC network and applies the same canonical receipt/header checks. One live pass reached the contiguous-log stage, exposing null-padded topic slots. The [official Blockscout LogsView implementation](https://github.com/blockscout/blockscout/blob/master/apps/block_scout_web/lib/block_scout_web/views/api/rpc/logs_view.ex) confirms four slots including absent trailing values. Only trailing nulls are normalized; an interior missing topic remains invalid. Subsequent public log requests returned HTTP 429. A later bounded attempt stopped after five requests on a public endpoint failure. **No complete live first-minute proof was obtained**, and no proof-derived trades were emitted.

A single Base attempt for WETH and candidate pool `0xd0b53d9277642d899df5c87a3966a349a798f224` made three requests. Both Blockscout creation-discovery routes returned HTTP 403. That attempt could not validate the pool identity and returned no proof or trades. It was not retried. This is an availability failure, not evidence that the pool has no trades.

The verifier is bounded to 25 seconds, 60 HTTP attempts, 64 checked transactions and 2,048-block initial log ranges. A 1,000-row response is subdivided; a saturated single block fails closed. It covers one supported pool from its authenticated creation event through a finalized block after the first swap plus 60 seconds. It still relies on the provider's indexed-range completeness: checking known receipts can detect omissions inside those transactions but cannot prove the absence of an entirely omitted transaction. Token-wide launch, other venues, automation, beneficial ownership and full history remain unproven. Operational closure requires a successful live acceptance run with reliable historical RPC and explorer availability; supplying only a dedicated RPC does not remove the explorer dependency.

Additional primary references: [Blockscout historical RPC methods](https://docs.blockscout.com/devs/apis/rpc/eth-rpc), [Uniswap V2 deployments](https://developers.uniswap.org/docs/protocols/v2/deployments), [Uniswap V3 Ethereum deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments), [Uniswap V3 Base deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments), [Base network endpoint and chain ID](https://docs.base.org/get-started/connect-to-base). Deployment allowlists use these exact chain-specific addresses; arbitrary clones are not accepted.

## Final engine verification
- Full suite after the shared cooldown-budget regression:125/125 passed.
- Independent source review accepted pool verification, snapshot recovery and funding fairness.
- Desktop dependency installation completed, npm audit reported0 vulnerabilities at install time.
- Historical live provider restrictions remain explicit: Solana largest-account429 and Blockscout failures/rate limits. Public data success does not imply complete-history coverage.

## Timestamp conflict closure and production acceptance

The production browser check found GeckoTerminal event times roughly three hours ahead of the server capture clock. Four pure-engine regressions failed before the fix and passed afterward. The shared engine now withholds invalid or more-than-120-second-future trades, transfers, identities and labels before derived amounts, roles, graphs or findings. It also validates the capture clock, trading-start anchor and selected-pool proof timestamps. Provider source/count explanations make rejected records a coverage gap, never an absence-of-activity claim. The pool adapter independently rejects future or nonmonotonic block timestamps.

Final automated verification: 132/132 tests pass, including an integrated service regression. Type checking and the Desktop optimized production build pass. The independent manager accepted the engine implementation and source/progress wording. The local production server is running on port 3101.

The post-fix live Solana USDC report captured at 2026-11-01T12:03:24.343Z withheld 300 conflicting GeckoTerminal trade records, retained mint and freeze authorities at finalized slot 464134578, and exposed the rejection reason and authority evidence in the production browser. Largest-account access remained unavailable. This verifies the guard, not the correctness of the upstream/server clock discrepancy. No historical or first-minute claim was promoted.

The current user-facing acceptance matrix is outputs/traceforge-engine-acceptance.md in the chat workspace. Design implementation remains paused under the user's engine-first direction; Swarm design research is reference material only.

### Final bounded Ethereum funding check

A fresh production WETH scan captured at **2026-11-01T12:05:50.218Z** returned **46 investigated addresses, 10 current supply shares and 99 accepted transfer records**. The new holder subdeadline stopped the slow explorer-holder phase and reserved time for normal/internal funding requests. Successful funding pages survived other HTTP 500 responses and deadline failures. This verifies the funding fairness change against live data; it does not establish complete funding history. The ten shares came from available public holder evidence while the deeper explorer-holder phase failed.

The same run accepted no trade records because of timestamp conflicts. The selected-pool adapter also withheld its timing proof when a returned block timestamp exceeded the capture-clock tolerance. This is a verified rejection path, not a successful live first-minute proof. Source failures and coverage limits remain explicit.

## Engine recovery - latest state

The engine now uses the canonical Solana public RPC hostname. A bounded GoPlus token-account candidate fallback is verified with one same-bank finalized mint/account batch. Live production verification recovered10holder shares from20accounts with0unresolved, alongside300acceptedtrades. Each holder has account-state evidence with exact raw amounts, decimals, slot and denominator; refresh retains correct provenance and stale records only after failures.

Clock comparison now uses a corroborated fresh HTTPS provider reference, with strict cached-response rejection, unique quorum and monotonic60-second expiry. Local capture, local observation timestamps and chain event timestamps remain separate and unchanged. Both clock directions are tested. RPC-native historical pool creation/log discovery removes the hard explorer dependency while retaining official-factory/canonical-receipt validation. Public archive/rate restrictions still prevent complete live first-minute proof; no sniper label is fabricated.

Final full suite158/158passed; independent review accepted; optimized Desktop production build including TypeScript passed. The canonical local app remains on3101. No credentials or provider subscription were purchased. Authenticated Bitquery and complete archival first-minute acceptance remain access-dependent. Design implementation stays paused.

Final production browser/API check:2026-11-01T12:29:52.136Z,10shares/300trades/10holdingrecords/20accounts/0unresolved/0missingholdinglinks, finalized slot464141976. Numeric-share owner opens Balance snapshot evidence. Final production build passed, server3101running.


## Investigation reliability corrections - 2026-11-02

- Completed configured-factory snapshots now revalidate their prior canonical anchor and extend to newly finalized blocks on explicit discovery. Existing unfinished snapshots remain fixed. Fork/backward-head cases invalidate stale candidates; this does not expand supported venues.
- Native transfers from the scanned EVM token contract are retained as observations but excluded from inferred shared-funder/deployer/selling relationships. This prevents unwrap-like contract flows from being mistaken for common wallet funding when provider metadata is missing. No fabricated contract classification is added.
- Public provider lookup and optional scan share a ten-second budget, with documented wait=5. The earlier fifty-second allowance could starve the independent fallback inside the eighty-second stream budget. Controlled-time regression verifies a 67-second fallback after a ten-second provider timeout finishes at 77 seconds. Cancellation and cooldown remain respected.
- Full automated suite: 293 tests passed. Current live staging WETH scan returned 318 investigation addresses with incomplete coverage; this is not 318 verified holders or a complete history claim. Historical access, unsupported venues and provider outages remain explicit.
