# SwarmEngine behavior audit and independent implementation boundary

## Public API integration update - 2026-11-02

The user subsequently authorized a server-side integration with SwarmEngine. The current app requests its documented public read-only API and attributes imported wallet flags, groups, links and ratings. Independent public sources remain available as fallback and market context. A real stored BSC report was verified end to end in the browser. This supersedes the earlier no-wrapper architecture below; it does not claim recovery of the private backend or complete historical coverage.

## Current implementation correction - 2026-11-01

Latest engine pass: finalized Solana mint/freeze roles and owner-aggregation adapter are implemented; selected-pool first-minute verification is distinct from token-global launch; bounded normal/internal funding pagination, stale-snapshot recovery and clock-conflict rejection are implemented. All 132 tests and the production build pass. The detailed comparison tables below retain historical implementation observations and must not be treated as the latest status. See the current engine acceptance matrix and engine-research.md for verified capabilities and remaining provider gaps.


The historical TraceForge comparison below records the earlier implementation and is superseded where noted here. The current live engine does not equate matching archive/combined rows with verified launch coverage: early-buyer and sniper classifications stay withheld without independent verification. A no-key GeckoTerminal recent-trade fallback plus Ethereum/Base Blockscout holder, creator and bounded native funding adapters have been implemented and exercised end to end. Current UI is a dark, visible holder table with evidence tabs, not a 3D universe. Read `engine-research.md` for source citations, new regression tests, actual successful live results and remaining historical gaps. Swarm observations and REA evidence IDs below remain unchanged.

Audited 2026-11-01. This is a static audit of captured public browser assets and the current TraceForge source, not a claim to have recovered SwarmEngine's private backend. TraceForge uses its own providers and rules; it is not a Swarm API wrapper.

## Evidence and method

The original [REA skill](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md), version 59 at retrieval, was fetched and read through the GitHub connector during this audit, together with its [JavaScript applications guide](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/references/javascript-applications.md). It requires separating observations, inferences and unknowns and reusing matching evidence. The existing REA 6.8.0 `app.js` analysis was reused; a new focused REA analysis of previously unselected `engine.js` was executed as described below.

- Evidence record: `ev_2aec5c2892a89a4fd54739c6e025fdcd759370d96a99f88341a25f16ca6cb7a1` in `work/swarm-rea-evidence.json` relative to the chat workspace.
- Operation: `analyze_javascript_application`.
- Application digest recorded by the earlier investigation: `ad97ce0b6841330a19e2c528d733f54c3325ebb54ec450b8feb5240ecd1640a5`.
- Captured `app.js` SHA-256 rechecked during this audit: `f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380`.
- Captured `engine.js` SHA-256 rechecked: `bbe1c83f6179b8d26ccbaf7922549f5f558d1cc8b8f8c3fe2dd1c35285160226`.
- The REA record explicitly reports eight inventoried files outside its selected source-analysis scope, incomplete graph coverage, and inert parsing without bootstrap execution. Follow-up reading here inspected selected functions in the sibling `work/swarm-evidence/` files without executing those artifacts.
- Public endpoint and rule descriptions below come from the captured `docsView` and other public UI text. They are published product claims, not verified backend computations or guarantees of current service availability.

Source anchors use captured file names and line numbers. Local implementation anchors use paths relative to the TraceForge project. Files may change after this audit.

### New REA execution in this audit

Using the existing cached REA 6.8.0 official `scripts/rea.mjs` launcher and Node 24.22.1, the audit ran `analyze-javascript-application` against the captured artifact directory with `--source-path engine.js --detail summary --analysis-timeout-ms 60000 --format json` and an explicit evidence output path. No new tool/runtime was installed and no website JavaScript was executed.

The first sandboxed attempt failed during worker source transfer with an `EPERM` temporary-file read error. Its partial observation is `ev_5066043fa2833aa615236e89f2145ca3582488bbb268fbadd0e3cdd0c97b1a44`, saved in `work/swarm-engine-dashboard-rea-summary.json`. The original recovery guide was consulted. A scoped, explicitly escalated retry resolved the host permission boundary and exited **0**; this was not an unchanged retry inside the failing sandbox.

- New complete parent Evidence: `ev_726041963b437891897b6fc72ce05afb99726699132343f44ed13ac97c45cc4d`.
- Summary-view Evidence: `ev_536e1726405a00ac0a8d6429adce0f28925185415a55f3d5f04786414621108c`.
- Exported bundle: `work/swarm-engine-dashboard-rea-evidence.json`, 9,254,042 bytes; summary: `work/swarm-engine-dashboard-rea-success-summary.json`, both relative to the chat workspace.
- REA examined one selected JavaScript file, read 34,290 text bytes, visited 7,827 AST nodes, reported 21 findings, and had zero parse failures. Findings here are analyzer observations, not 21 security vulnerabilities.
- Whole-application and semantic coverage remain **partial**: eight inventoried files outside this run's source selection, eight application unknowns and 1,873 semantic unknowns. The summary's `complete-within-view` means the summary projection is exhausted, not that private behavior or the application is completely recovered.

The one-shot CLI process ended after exporting evidence; no persistent REA MCP/native session was opened by this audit. The selected dashboard source observations below are grounded in these artifact bytes and direct function reading; static execution paths remain distinct from runtime observation.

## Scan state and result contract

| Question | Static observation | Boundary |
| --- | --- | --- |
| Start a scan | `app.js:251` posts `{token, chain, fresh}` to `/api/scan`, receives a job, reads initial events, and navigates to `/t/<chain>/<token>`. | Does not establish server job scheduling, deduplication or provider behavior. |
| Reuse a result | `tokenView` at `app.js:263` displays a stored result when `scanned_at` is less than 600 seconds old. | Ten minutes is a frontend reuse condition; the comment's server-dedup claim is not backend evidence. |
| Progress | `crawlView`, `app.js:275`, polls `/api/events?job=...&after=...` at 350 ms intervals after successful unfinished polls. The cursor increments by received event count. | Poll timing is browser behavior, not measured execution latency. |
| Stages | Stage detail maps `token` to RESOLVE; `holders` to SCOUT; `wallets` and `funders` to TRACE; `analysis` to LINK; `security` to AUDIT. `judge` or `done` advances VERDICT. | Stage names describe the presentation contract; they do not prove separate AI agents or parallel backend workers. |
| Completion | When `done` is true the client reads `/api/result?job=...`, then token history. It allows manual result viewing or waits for animation drain and an extra 2.6 seconds. | The animation can finish later than the actual job. |
| Event fields | `logEvent`, `app.js:323`, consumes `type`, `detail`, elapsed `t`, wallet/funder, link `a`/`b`, judge decision/confidence, and done band/score/headline. | These are consumed fields, not a recovered complete schema. |

`resultView` (`app.js:380`) consumes these families:

| Result family | Visible fields and use |
| --- | --- |
| Identity and snapshot | `chain`, `chain_name`, `token`, `scanned_at`; `header` name, symbol, image, price, market cap, liquidity, volume, age, holder count, links/socials. |
| Assessment | `score`, `band`, `reason`, `parts`, `gates`; metrics including wallets and hands. |
| Holder evidence | `holders[]`: wallet address, supply/float share, entry data and signals such as `dev`, `fresh`, `sniper`, `insider`, `contract`, `unread`, transaction count and funder. |
| Groups and graph | `clusters[]`: id, wallets, share and level; `links[]`: endpoints and kind; map nodes/edges and signal details. The client shows only groups with more than one wallet in its swarm list. |
| Contract | `security.checks[]`: level, title and optional detail. Absence renders checks unavailable. |
| Judge | `model`, `decision`, `confidence`, `p.avoid/caution/ok`, `escalate`, `bar`, `latency_ms`, `cost_usd`, `receipt`, `features`, optional evidence mass entries. |
| Historical replay | Optional `timeline.blocks`, `timeline.t`, `timeline.share[address][frame]`; separate replay endpoints return market/assessment points and events. |

The presence of a field or an affirmative UI label is not independent proof that a wallet is a person, a cluster is one operator, or a token is safe.

## Snipers, owners and connected groups

| Feature | Public Swarm behavior or claim | TraceForge behavior now |
| --- | --- | --- |
| Snipers | `docsView`, `app.js:1155`, describes float bought in the first minute; holder flags are supplied by the server. Exact venue, launch definition, attribution and missing-history handling are not recovered. | `src/lib/investigation.ts` labels a non-infrastructure buyer only when `launchVerified` is true and buy delay is inclusively 0-60 seconds from `earliestTradeAt`. The UI says “possible sniper.” A timestamp flag does not prove a bot, privileged information or intent. |
| Trading start | No recovered private source demonstrates how the server determines true launch. | `parseIndexedStart` in `src/lib/bitquery.ts` requires matching earliest archive and combined EVM event identity, transaction and timestamp. This verifies agreement within the provider's indexed history, not token creation or coverage of every venue. Solana remains unverified and cannot acquire early-buyer/sniper labels in the live path. |
| Early buyers | Public holder entry fields are consumed, but full ranking rules remain unknown. | Up to the configured number of unique buyers from the bounded earliest-buy sample, with verified indexed start. This is not an exhaustive early-holder population. |
| Creator versus owner | `dev` becomes a creator badge. Docs describe creator-funded wallets and active owner powers separately, but the browser does not prove how either identity is obtained. | `src/lib/providers.ts` maps GoPlus `creator_address` to `creator` and `owner_address` to `authority`, separately, excluding the zero address. The engine preserves this distinction and does not infer creator from the first trader or oldest holder. Solana identities are unavailable in this path. |
| Creator links | Docs describe creator plus creator-funded wallets in the dev score. The private tracing depth and identity assurance are unknown. | A direct observed transfer from a provider-identified creator can create `deployer-linked`, unless infrastructure exclusion applies. It does not establish recipient control. This is bounded incoming-transfer evidence, not a complete creator transaction search. |
| Shared funder | The alarm explanation at `app.js:1061` claims shared first funder with exchanges/hubs filtered, same-transaction bundled buys, and wallet-to-wallet transfers. | The engine groups two or more recipients of observed native transfers from the same unlabeled source, at or before their first observed buy where one exists. It does not prove this was the first-ever funder. Known exchange/pool/bridge/burn/contract roles are excluded from inference. An unrecognized service may still explain the pattern. |
| Group certainty | Public clusters expose a server `level`, including `proven`; rendering does not substantiate that certainty. | Relationships link supporting evidence. Shared-funder and selling findings are explicitly inferred. No common-ownership or “real hands” count is asserted. |
| Visible group boundary | Swarm colors groups supplied by the result. | `universe3d.tsx` computes visible group components using only `shared-funder` and `deployer-linked` edges between rendered wallets. Ordinary transfer edges still render but do not alone create these group trays. The 160-wallet scene cap can hide part of a larger report graph; the map is not an exhaustive grouping. |
| Accumulation | No complete private rule recovered. | Bought minus sold within returned trade rows is positive. It is sample net buying, not historical net flow or current balance reconstruction. |

Trade attribution uses the transaction sender/signer, so relayers, routing and account abstraction can complicate the economic buyer. The adapter correctly inverts the provider's counter-leg `Side.Type`: counter-side `sell` is a buy of the scanned token. Neither correct parsing nor archive agreement establishes universal history completeness.

### Selling behavior is intentionally different

Swarm's public alarm explanation (`app.js:1060-1080`) describes a rolling **ten-minute** swarm window, staging transfers to fresh wallets, 2% dust exclusion, and bag-out/impact calculations. It advertises WATCH for one seller or staging; WARNING for two or more sellers or at least 20% out; DUMP for two or more sellers and at least 40% out. These are documentation claims; this audit did not verify their backend enforcement.

TraceForge's independent rule requires at least two connected non-infrastructure wallets selling in a rolling **five-minute inclusive** window, at least two distinct transaction IDs, and connection evidence predating the first sale in that window. It records possible coordination as an inference. It does not implement continuous alarm ingestion, staged-wallet inheritance, dust filtering, bag-out percentage, or Swarm's advertised alarm thresholds. It must not be described as equivalent to the Swarm alarm service.

## Score, security, verdict and readiness

Public Swarm docs (`app.js:1154`) advertise weights totaling 100: swarm 30, fresh 20, insiders 15, concentration 15, snipers 10 and dev 10. Descriptions mention largest-hand pool impact, wallets with at most ten lifetime transactions, pre-trading/creator inflows, top-ten-hand concentration, first-minute float and creator-linked float. Hard rules are described as DANGER for at least 50% dump impact, at least 80% fresh wallets, honeypot, balance seizure or freeze authority. Soft rules are described as capping at RISKY/59 for specified swarm, creator, liquidity, ownership, proxy and cross-token-memory conditions.

Those weights and thresholds are **published claims**. The browser consumes the resulting score and parts. It does not supply the complete normalization, missing-data handling, pool model, threshold precedence or calibration needed to reproduce the backend score honestly. `TOO_EARLY` exists as a display band (`app.js:53`), but the inspected client has no corresponding authoritative readiness decision rule.

The judge card (`app.js:336`) displays server probabilities and an escalation route. Its X-ray sums returned avoid masses for presentation; that is not the full judge implementation. Default torus text and demo thresholds are not evidence of production model calibration. TraceForge therefore has no invented probability, confidence percentage, trading recommendation or synthetic 100-point score.

TraceForge's actual assessment ordering is:

1. A critical finding produces `critical`.
2. Otherwise a warning produces `caution`, including observed provider flags and inferred relationship patterns.
3. Otherwise incomplete scope produces `insufficient`.
4. Only complete scope with no configured finding can produce `clear`, described as no flagged pattern in scope rather than a safety guarantee.

The pure engine supports complete inputs, but the **live service initializes `complete: false` and never promotes it**. That is appropriate for these bounded provider windows. A successful provider response can enable a specific timing inference without turning the whole report complete. Missing credentials, failed datasets, capped rows, absent authority identities and unsupported chain features remain explicit coverage reasons.

`analyzeSecurity` in `src/lib/analysis.ts` recognizes only exact provider strings `"0"`/`"1"`; other values remain unknown. Honeypot, balance-control and self-destruct flags are critical; unverified source, minting, transfer pause, proxy and hidden owner are warnings under the configured rule set. Findings identify GoPlus as the reporting source, not an independent contract audit. The live Solana path has no GoPlus contract/authority equivalent.

Readiness has three different meanings and must remain separate:

- **Provider configured:** a nonempty server-side Bitquery credential enables attempts; it does not prove entitlement, working schema, successful requests or complete history.
- **Specific evidence verified:** matched indexed-start rows can enable timing categories while the overall investigation remains partial.
- **Production validated:** `docs/bitquery.md` states authenticated requests and current plan/schema/data behavior were not live-validated. Injected-response tests do not change that status.

## Replay: three features, not one

1. **Swarm holder time machine** (`app.js:473-518`): shown only with at least two blocks and nonempty per-wallet share arrays. Frames scale map holders from historical share relative to the final frame, show aggregate holder share, and track the currently largest cluster's historical member shares. The browser consumes the arrays; it does not reconstruct them from trades. The phrase “every holder since launch” exceeds what static client inspection can verify.
2. **Swarm verdict/market replay** (`app.js:522-557`): separate `/api/replay/<chain>/<token>` supplies points, events, headline, collapse indicator and note. Fewer than two points hides the section. `/api/replay?days=7` supplies warned-then-collapsed listings. This requires stored scans and market observations; neither private storage nor collapse detection is recovered.
3. **TraceForge observed-event replay** (`ActivityTimeline` in `src/components/investigation-panels.tsx`): timestamp-sorted observed buys/sells/funding/transfers, step/play/speed controls, wallet highlighting and cumulative event counts. Map sizes continue to show current holdings. No historical balances, historic group membership, full launch ledger, or historic market/verdict series are reconstructed.

TraceForge's third behavior is useful and honestly labeled. Implementing the first two independently requires additional data and persistence; current balances and sampled trades are insufficient substitutes.

## The animated dashboard is not backend telemetry

`engine.js:340` loads `/api/agent/feed`, stats, recent scans and cabals. When no feed entries exist, it can use the explicitly labeled `demoItems()` data (`engine.js:47`). Its `play()` function (`engine.js:379`) replays items through a timed animation.

Even when replaying real scan results, source selection, source lag, illustrative gate probabilities/skips, and some displayed funder/contract probabilities are randomized or derived for the animation. Several counters accumulate animation activity. Returned judge decision/confidence and selected feed fields are used directly, but not every animated number is measured server telemetry. These files establish presentation behavior, not the private engine's provider topology, actual latency, cost, gate accuracy or deployment architecture.

## Prioritized implementation gaps

| Priority | Gap | Concrete next work / acceptance condition |
| --- | --- | --- |
| P1 | Authenticated history adapter remains unvalidated. | With an authorized entitled account, capture redacted real responses for one supported EVM token and Solana; check query acceptance, event identity/side attribution, holder units, label mapping, empty/missing datasets and source timestamps. Keep this limitation until validated. |
| P1 | No independent full launch/authority path on Solana. | Add verified creation and current-authority evidence with actual transaction/account sources before enabling launch-based labels or owner claims. Do not use pair creation as token creation. |
| P1 | Current group display and evidence inference are bounded samples. | Expose group membership/coverage independently from the rendered subset if exhaustive group review is required. Test groups spanning the scene limit and infrastructure exclusions. Preserve “relationship, not ownership” language. |
| P2 | Historical balance replay and scan/market replay are absent. | Add durable timestamped scan records for verdict history; acquire supply-aware historical balances or a complete relevant ledger for holder replay. Label sample coverage explicitly and test missing frames/reorgs/changed supply. |
| P2 | First-funder, same-transaction bundle, lifetime freshness, pre-trading insider and cross-token memory rules are absent. | Implement each as a separate evidence-backed query/rule with attribution, infrastructure exclusions, scope and regression fixtures. Do not infer them from holder rank, shared timing or current balances. |
| P2 | Continuous dump alarm is absent. | A separate ingestion/state model must track known groups and balance-out events over time. Define independent thresholds rather than silently presenting the five-minute sample rule as Swarm's ten-minute alarm. |
| P2 | Swarm score/judge cannot be reproduced from browser code alone. | Publish independent, testable assessment rules. If adding a score later, define formula, units, null handling and precedence; do not copy advertised weights without their unavailable semantics. |
| Resolved | Earlier research summary predated the bounded Bitquery adapter. | `docs/research.md` now records the bounded adapter and its remaining live-validation limits. |

These are capability and validation gaps, not evidence that missing capabilities have been delivered. No UI files or backend rules were changed by this audit.

## Validation and question ledger

Existing focused tests were executed with `tsx --test tests/investigation.test.ts tests/investigation-service.test.ts tests/bitquery.test.ts`: **24 passed, 0 failed**. They cover inclusive sniper timing, absent-launch withholding, identity separation, infrastructure exclusions, duplicates, selling-window chronology, query bounds, provider errors, indexed-start agreement, cached refresh and provider-flag replacement. They use synthetic/injected input; no Swarm artifact was executed and no authenticated Bitquery request was made for this audit.

| Question | Status |
| --- | --- |
| Public scan stages and consumed result fields | Answered within captured frontend scope. |
| Public sniper/owner/group descriptions and actual local classification | Answered statically; provider accuracy and private Swarm algorithms unresolved. |
| Public verdict/security/readiness behavior | Partially answered: display and published rules known; private score/judge/readiness computation unresolved. |
| Replay behavior and independent implementation gap | Answered at frontend/data-contract level; historical backend reconstruction unresolved. |
| Production readiness of current history integration | Explicitly not established; focused tests pass, authenticated integration remains unverified. |



## Runtime observations during this audit
- A public Ethereum WETH scan was submitted through SwarmEngine's own UI. It entered Resolve/Scout and stopped after its displayed 136.9 seconds with an explicit more-than-150,000-transfers size limit. No successful WETH verdict was inferred from its animation.
- A stored public Stonk Street report on Robinhood Chain was inspected through a link from Latest scans: https://swarmengine.tech/t/robinhood/0xf9ee3fbcf3fc11b5681e9a44666d2e1e4f8c5834 . At observation it displayed score81/CLEAN and judgeOK, 47 sampled holders, contract checks, holder flags including fresh/unread, time-machine controls, memory and deployer sections. These are observed outputs, not verification that its ownership, score or probability claims are accurate.
- The stored report distinguished excluded pool/contract infrastructure, sampled contract transfer tests, verdict history and creator history. TraceForge retains its independent evidence and explicitly recorded capability gaps rather than claiming these are equivalent.
