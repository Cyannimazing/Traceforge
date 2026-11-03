# Base 1KTO100M end-to-end comparison

Token: Base `0x1151ee0a489f58d662c543cff9fdf53ad2ffdcbf` (from1kto100Mcoin / 1KTO100M). Selected Uniswap pool: `0x7998ba2afcb87808c3eafb054cc3ab0969f0aee4`. Observations below were collected on 2026-11-03 UTC, during 2026-11-04 in Singapore.

This comparison uses Swarm's public report and one normal fresh scan, independent public market feeds and configured Base RPC. Swarm reports were retained as comparison artifacts, never passed into TraceForge's investigation, holder discovery, flags or decision model. No LLM or token-specific score override was used.

## The market changed during the comparison

| Measurement | Swarm stored scan, 17:22:22 UTC | Swarm fresh scan, 17:28:22 UTC |
| --- | ---: | ---: |
| Price, USD | 0.000001755 | 0.000000000000004250 |
| Reported liquidity, USD | 18,763.44 | 0 |
| 24-hour volume, USD | 431.48 | 888.17 |
| Analyzed holder wallets | 11 | 14 |
| Addresses set aside | 2 | 3 |
| Provider score / band | 75 / OK | 59 / RISKY |
| Separate judge decision | CAUTION | CAUTION |
| Judge's selected normalized weight | 49.8% | 77.9% |
| Current holder sniper flags | 4 | 3 |

The fresh component parts are 30 + 20 + 15 + 0 + 1.7 + 7.3 = 74.0. Swarm's reported thin-liquidity gate caps this to 59. Its separate judge returns 15.4% avoid, 77.9% caution and 6.8% OK, with small displayed rounding error. A score band and a separate judge decision are different outputs; the earlier 75/OK was already accompanied by a CAUTION decision.

DEX Screener independently returned the same selected pool, price and zero displayed liquidity at 17:29:23 UTC. Same-block RPC reserve checks at safe block 53468934 (17:33:35 UTC) and latest block 53468943 (17:33:53 UTC), with block hashes rechecked, returned 2,569,279,391.984157772578527183 token units and only 0.000000004757713756 WETH. Thus the near-zero quote reserve is an on-chain observation. These reads alone do not establish whether selling, liquidity withdrawal or another mechanism caused it.

## Retrieval bugs reproduced

The initial fresh TraceForge scan took 6.845 seconds and returned no current holders, although recent public pool trades were available. GoPlus returned no holder rows and a contradictory zero holder count; Base Blockscout holder, token and creator routes rejected the requests with HTTP 403. Its historical finalized boundary at 17:07:17 UTC preceded this pool's reported 17:19:07 UTC creation. Treating the explorer response as a complete zero-holder census would be incorrect.

A second issue rejected every finalized reserve block older than 15 minutes. Base safe and finalized state have different meanings; normal L1 finality delay is not itself proof that a provider's current head is stale. Current provider freshness must be checked independently from the age and identity of the state being measured. [Base derivation and finality specification](https://docs.base.org/base-chain/specs/protocol/consensus/derivation).

## Retrieval changes

- An empty or unusable Ethereum/Base holder response now triggers bounded independent RPC candidate verification. Ethereum uses finalized state; Base uses explicitly labeled safe state. Safe is not relabeled as finalized.
- Existing holder identities, pool identity, observed trade participants and token-transfer endpoints nominate candidates. With a configured Alchemy endpoint, one target-token ERC20 transfer-index page (at most 100 rows) adds non-trading recipients. It does not assign balances, flags or a complete holder count.
- Up to 100 distinct candidates are measured using `balanceOf`, `totalSupply` and `decimals` at the same numeric block. The canonical block hash is rechecked. Positive balances become holders; verified zero balances are excluded; failed reads stay unknown. A contract, including the token itself, is not automatically infrastructure.
- Funding and account enrichment now receive the recovered holder snapshot. Refresh retention, failed-empty cache handling, risk measurements and scoring provenance recognize the new attributed source.
- A fresh current head no longer causes ordinary L2 finality lag to be mistaken for a dead RPC. Reserve reads remain finalized with their own block time. Existing scoring freshness and matching-balance guards continue to reject old or incompatible reserve snapshots; current safe holdings are not silently combined with older finalized reserves.

The live holder adapter at 17:39:54 UTC used six HTTP requests in 2.071 seconds. One target-token transfer page supplied 38 rows; 22 candidates produced 17 positive balances (the selected pool plus 16 external holders), five verified zero balances and no unavailable reads. The safe block was 53469059 at 17:37:45 UTC, and its hash was rechecked. Both large contract recipients below were discovered through this generic path without a Swarm-address seed. These timings measure the holder adapter, not the complete investigation.

## Contract exclusions materially change float

Swarm's fresh report sets aside the verified Uniswap pool, plus these two addresses with the generic label "contract (pool / locker / curve)":

| Address | Share of total supply in Swarm's snapshot | Independent result |
| --- | ---: | --- |
| `0x6aa989249e423b0f843a2b10cab9ea7eca41c7e8` | 30.45382% | Custom contract holder; infrastructure identity unverified |
| `0x639fa26d6b7132d65ed20ee033313eab59e18bc1` | 15.22561% | Custom contract holder; infrastructure identity unverified |

Both have substantial custom runtime bytecode, not a standard minimal proxy. Neither exposes the standard V2 pool getter interface in its dispatcher. Public Sourcify full-match lookups returned no match; inaccessible explorer source pages do not prove no verified source exists elsewhere. Owner-related selectors and trading interactions do not establish a pool, locker, exchange or bridge identity, and do not by themselves prove malicious behavior.

Their combined 45.68% supply is substantial. TraceForge retains independently discovered positive contract balances among holders until infrastructure is independently qualified. Copying Swarm's exclusions would artificially lower concentration. Comparing raw total-supply balances by address comes before comparing percentages with different float denominators.

## Flags require transaction proof

Swarm's stored report marked four entries at 6, 24, 36 and 48 seconds after the reported pool creation, and did not mark the next entry at 64 seconds. A comparison-only RPC check corroborated one of those buys: successful transaction `0xf14521b49956af056aaaba640abeda5a608167ddb332eecffae0f05f6cc33868` in block 53468503 at 17:19:13 UTC. The pool swap and token transfer identify the reported recipient, and the canonical header matches the receipt. This independently proves that specific early buy, not global launch completeness or bot ownership.

TraceForge's pool locator previously searched from genesis, splitting oversized factory-log ranges from the oldest end. With a recent Base pool above block 53 million, the 60-request budget could expire before reaching creation. A bounded creation-time hint can nominate a recent search range; only a matching official factory event, successful canonical receipt and verified first-minute window can establish the selected-pool timing flag. A market timestamp alone cannot create a Sniper flag.

The corrected locator first brackets recent finalized history, then searches a narrow timestamp-nominated range. An inaccurate hint falls back to normal discovery; a hint newer than the finalized boundary waits. Removed/reorganized blocks, wrong-pool events and failed receipts cannot supply timing proof. Provider range restrictions split the query, while rate denials retain their cooldown and cannot be bypassed by the hint.

At 17:46:05-17:46:17 UTC, one bounded run against the user's configured Alchemy Base endpoint completed in 12.496 seconds and 50 HTTP requests, including narrow-range splitting required by that account. Official creation transaction `0x73b41f0089d8c3896f1ca88360c0fbd797367454f830091a93bb752390281f67` was verified at block 53468500. Contiguous pool history and canonical transaction receipts establish six buy initiators during 17:19:07-17:20:07 UTC, through a boundary at 17:20:15 UTC.

Four buy initiators match Swarm's older four Sniper-flagged rows. The other two include the creator and a buyer who no longer held tokens in the later provider snapshot. Creator and first-minute buyer are overlapping observations; a historical early buyer with a verified zero current balance does not become a current holder. The flag describes timing and transaction attribution, not proof of a bot or beneficial ownership.

## Production result after the fixes

One fresh independent scan through the rebuilt production endpoint on port 3100, requested at 17:49:08 UTC, completed in **10.636 seconds**. The returned holder snapshot was measured at Base safe block 53469343 (17:47:13 UTC), with the block hash rechecked. The browser rendered the same recovered holder list, full token address, flags and percentage basis.

| Check | Swarm fresh snapshot | TraceForge production result |
| --- | --- | --- |
| Token, chain and selected pool | Base 1KTO100M, same pool | Exact match |
| Reported market price / liquidity | 4.25e-15 USD / 0 USD | Same values |
| Displayed current non-infrastructure holders | 14 | 16 |
| Swarm holder addresses found independently | 14 | **14/14** |
| Raw balances of those 14 addresses | Provider snapshot values | **14/14 exact raw-unit matches**, no mismatches |
| Additional contract balances | Set aside as generic contracts | Same supply shares retained as unqualified contract holders |
| Pool balance | 45.87998914% of total supply | Same share; excluded as verified pool infrastructure |
| Largest displayed float share | 13.42980441% | 56.27090312%, because the two large contracts remain in float |
| Current Sniper-flagged holders | 3 | Those same 3, plus the creator's independently verified first-minute buy |
| Historical first-minute buy initiators | Four older flagged rows | Six receipt-backed buys; four have a current positive balance |
| Creator | `0x1019cc5eb92312c7e78223b03c8ba21ec89ab280` | Same source-attributed creator; no owner identity fabricated |
| Current-holder connections | None reported | Two documented shared-funder edges across three holders |
| Independent decision output | CAUTION 77.9% | **Watch 84.6%** decision support |

The 84.6% is calculated by TraceForge's existing conservative uncertainty-allocation model, not copied from Swarm or fixed per token. Its displayed split is 15.4% High risk, 84.6% Watch and 0.0% Clear after rounding. It is a normalized decision allocation, not a calibrated chance of safety or an accuracy benchmark. The earlier empty-holder report allocated 99.9% to Watch; measured holders and verified timing changed the inputs and output.

The shared funding is supported by successful native-transfer records from `0x76993f54263a627910ef4570eb017c60a4799999` to three current holders. An unidentified service can also explain a common funder. These transactions support observed funding connections, not proof of one beneficial owner or coordinated selling. There was no independently established coordinated-selling finding in this scan.

Eight GoPlus control checks returned clear, and direct RPC transfer simulations succeeded for three sampled holders. A reverted/unavailable `owner()` probe does not establish absence of every privileged function. The report preserves that distinction.

The independent six-factor point score remains withheld because lifetime freshness for three holders, complete creator-linked funding, token-wide early exposure and a sufficiently current compatible sell-impact snapshot are unresolved. The finalized reserve snapshot is retained as dated evidence, but its 17:32:45 UTC state is older than the scoring freshness threshold. This result is intentionally not labeled exact Swarm score/judge parity. No hidden provider score or LLM fills those gaps.

Browser verification also caught and fixed contradictory explanation text: a verified selected-pool first minute no longer appears as "First-minute buying is unverified" merely because complete token-wide early exposure remains unresolved. The report now explains the verified venue and the remaining broader scope separately.

## Verification

- 794 tests passed, including wrong-chain responses, reorganized anchors, failed receipts, token-held balances, zero/unknown balances, foreign transfer-index rows, provider rate denial, invalid/future creation hints, refresh retention and timing explanations.
- Final production build, including TypeScript checking, passed. Changed source files were synchronized to the Desktop project and hash-checked. The app runs on port 3100.
- Browser checks confirmed 16 holders in the table and map, consistent float basis, the actual Sniper transaction and balance records in the evidence drawer, Escape dismissal, the corrected verified-window explanation and no captured browser errors. At the tested 1280px viewport, document width was 1270px with no horizontal page overflow.
- The full token address is displayed in the report header. Primary UI labels remain Clear / Watch / High risk, with neutral studio styling and separate historical/current flag counts.
- Credentials, local databases, raw validation snapshots and provider configuration are excluded from the commit. The audit publishes no RPC keys.

Public references: [Swarm token report](https://swarmengine.tech/t/base/0x1151ee0a489f58d662c543cff9fdf53ad2ffdcbf), [Swarm methodology](https://swarmengine.tech/docs), [DEX pool](https://dexscreener.com/base/0x7998ba2afcb87808c3eafb054cc3ab0969f0aee4).
