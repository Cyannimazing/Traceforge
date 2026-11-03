# Public Swarm analysis validation

Latest release: [report and retrieval validation](report-release-validation-2026-11-03.md), including the reproduced Four.Meme custody/float/first-minute fixes, current chain-state changes and remaining evidence limits. Earlier measurements below remain historical observations.

Observed 2026-11-03. This audit uses public reports, publicly shipped JavaScript, selected explorer transaction records, and independent TraceForge snapshots. No private backend access, credential bypass, purchase, or Gemini call was used. Swarm is a comparison source, not a ground-truth accuracy label.

## What is publicly specified

Swarm's frontend publishes six maximum component weights:

| Component | Maximum | Described input |
| --- | ---: | --- |
| Swarm | 30 | Price drop if the largest hand sells into the pool |
| Fresh | 20 | Top holders with at most 10 lifetime transactions |
| Insiders | 15 | Float received before trading or from the creator |
| Concentration | 15 | Top-ten hands' share of float |
| Snipers | 10 | Float bought within the first minute |
| Dev | 10 | Creator and creator-funded wallets |

Publicly described hard DANGER conditions are dump impact at least 50%, fresh prevalence at least 80%, honeypot, owner balance seizure, and freeze authority. Described soft caps of 59 cover groups of at least three wallets, packs, creator exposure at least 10%, thin liquidity, active owner powers, unverified proxies, and cross-token swarm history.

The shipped client **renders server-returned scores and parts**. It does not contain the complete feature-to-points curves, grouping algorithm, gate ordering, missing-data policy, readiness exceptions, or calibrated decision model. Thresholds for some qualitative gates are unspecified. Subsequent behavioral testing identified five strongly supported candidate curves; this does not recover the entire private backend.

The public token UI checks a stored report before starting a scan, using a ten-minute freshness window. A fast cached result is not proof of an equally fast cold crawl. Source: [Swarm public application](https://swarmengine.tech/assets/app.js) and [API documentation](https://swarmengine.tech/docs).

## Current reconstruction status

TraceForge now uses the independent `six-factor-v1` scoring path. The previous four-family scores below remain **before-state comparison evidence**, not current output claims.

Five clipped-linear candidate component curves reproduce 57 retained source snapshots: swarm 55/55 where impact is available; concentration, snipers, dev and insiders 57/57 each. Their full-score/zero-score input endpoints are respectively `(0.10, 0.60)`, `(0.30, 0.80)`, `(0.03, 0.25)`, `(0.02, 0.15)` and `(0.02, 0.20)`, with their published maxima. The evidence includes interior values and later holdout observations. These are behavioral inferences, not source-confirmed formulas. [Detailed evidence and fixtures](scoring-formula-evidence.md).

Fresh follow-up now supports a sixth clipped-linear curve: maximum 20, full points at/below 0.15, zero at/above 0.80. A new discovery value of 1/3 ->14.4 leaves one whole-percentage endpoint candidate; nine usable preselected holdouts match it, including six interior values and an exact 0.80 ->0 endpoint. Fresh matches 77/77 numerical snapshots across the original and follow-up fixtures. The curve is inferred, not private source recovery. TraceForge retains unknown current holders in its fresh denominator, unlike Swarm's observed readable/non-dev denominator, so independent measurement parity remains separate.

Independent inputs are bounded by source evidence, holder snapshot and verified timing. The current map scopes nodes to non-infrastructure current holders; historical counterparties remain separate evidence. Supported verified PumpSwap inputs can supply a labeled zero-fee sell-impact scenario. Other unproven factors remain unknown. An exact score is withheld while factors or required core evidence are unresolved. No LLM or imported Swarm verdict is required for this calculation.

Complete scoring parity is **not established**: some independent feature/group extraction, readiness/gate behavior, and the separate private judge remain incomplete. A hard gate changes the decision to AVOID while preserving the component score if fully known; it does not invent zero for unresolved factors. The requested 90/75 display thresholds remain explicit policy differences from observed Swarm behavior. See [current rating semantics](trust-rating.md).

## Matched Grok evidence

Token: Solana `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`.

| Measurement | TraceForge snapshot, 07:05:36 UTC | Swarm snapshot, 06:36:05 UTC |
| --- | --- | --- |
| Raw holder rows | 20, including one pool | 19, excluding the pool |
| Non-infrastructure holders | 19 | 19 |
| Address overlap | All 19 match | All 19 match |
| Total-supply shares | All match within floating-point rounding | Same after fraction-to-percent conversion |
| Largest adjusted-supply share | 5.037759% | 5.038098% of reported float |
| Top-ten adjusted-supply share | 34.867110% | 34.869458% of reported float |
| Traced addresses | 1,259 including historical participants | 19 displayed holder clusters |
| Relationship records | 3,178 across the investigation | 0 links |
| History limitation | Partial historical scope | 13 of 19 holder histories explicitly unread |

The old independent four-family policy returned 70/CAUTION: 40 controls + 20 distribution + 10 funding + 0 activity. Swarm returned 87/CLEAN from six components totaling 87.3 before rounding. These are different policies.

All three TraceForge warning groups in that snapshot involved addresses outside the current 19-holder sample. Those historical transactions remain evidence, but they do not establish connected current ownership. Conversely, Swarm's 19 singleton clusters do not prove 19 independent beneficial owners.

### Interpreting 19 holders and six tracer readouts

In the captured Grok report, 19 holder rows minus 13 explicitly unread rows leaves six readable holder histories. A scan display showing 19 selected wallets but six successful tracer readouts is consistent with these different scopes. It does not prove that all 19 histories were read, that there are six worker processes, or that every scan always traces exactly six wallets. An older captured scan reported seven entry-activity events and a different unread count. Transaction counts displayed in individual readouts likewise do not prove that every historical transaction was retrieved. Preserve selected, read, unread and currently held address counts separately.

Swarm separately returned a judge decision of OK with weights 0.3% avoid, 19.6% caution and 80.1% OK, plus escalation at its 90% bar. This separate output is not the quality score and is not evidence of empirical safety probability. [Public token report](https://swarmengine.tech/t/solana/6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump).

## CMC: specific Ethereum pipeline check

Token: `0x4f4d98b892063d4e811b6c6c7a8c6a0ba2306ce7`.

The public source scan at 07:05:25 UTC reported 22 requests and 4.4 seconds elapsed. Its fourteen holders exclude a DEX pool holding 95.530372% of total supply. All clusters are singletons; no relationship links or unread rows were returned.

| Input | Returned value | Component points |
| --- | ---: | ---: |
| Largest-hand modeled impact | 1.301167% | 30/30 |
| Fresh holders | 1 of 14 = 7.142857% | 20/20 |
| Insider exposure | 0% reported | 15/15 |
| Top-ten float share | 95.716482% | 0/15 |
| Sniper-marked current float | 98.612603% | 0/10 |
| Creator-related exposure | 0% reported | 10/10 |

The sum is 75/OK with no gate. High sniper and concentration values remove their component points; neither alone appears as a hard DANGER rule in the public description. Its separate judge returns CAUTION, with 1.8% avoid / 49.8% caution / 48.4% OK and escalation.

The twelve sniper-marked holder entry times are launch +12, +24, or +60 seconds; the two unmarked entries are +96 and +108 seconds. This supports an inclusive 60-second boundary for this example. Summing the twelve current holder float shares reproduces the sniper fraction.

Four entry transactions were independently checked through the public explorer. Their senders, successful status, swap methods and timestamps corroborate those specific entry records. Two entries have nonce 759 and one nonce 768, while Swarm reports transaction counts 760, 760 and 769. This supports an outgoing-account-count interpretation rather than a fabricated frontend default. A fourth entry has nonce 1 while Swarm reports 3; additional activity after entry is possible but was not verified. An explorer all-transaction counter is a different measure and is not interchangeable with account nonce.

The raw header age is zero despite a 158-second reported launch-to-scan interval. The client merely formats that zero. Whether the server truncated hours or used a fallback is not established. Timeline frame timestamps also differ from verified entry block times by 20-49 seconds in checked examples; entry timestamps themselves match. Timeline playback should not substitute for actual transaction timestamps.

Swarm reports direct control probes: no `owner()` function, not a proxy, and transfers simulated successfully for three sampled holders. The captured report does not prove those probes are comprehensive; absence of `owner()` is not absence of all privileged behavior, and transfer success is narrower than pool sellability.

TraceForge's later independent scan at 07:18:49 UTC completed in 2.762 seconds and returned 24 raw holders, 23 non-pool holders and 29 traced addresses. All fourteen earlier Swarm holders remained present, plus nine new non-pool holders. The snapshots differ by more than thirteen minutes. TraceForge's control provider returned unverified source and seven unknown checks; its finalized-history anchor preceded pool creation, so first-minute proof remained unavailable. This exposes a concrete gap in direct on-chain control probes and provisional recent-chain evidence, not a need for an LLM. [Public token report](https://swarmengine.tech/t/ethereum/0x4f4d98b892063d4e811b6c6c7a8c6a0ba2306ce7).

## Other comparison outcomes

- Ethereum WETH: Swarm's ordinary scan failed because the token exceeded its 150,000-transfer crawl limit. TraceForge returned a bounded independent report.
- Base WETH: no stored Swarm report; its ordinary scan was unfinished at the final bounded check. TraceForge returned a bounded independent report.
- Solana USDC: Swarm failed retrieving holder accounts. TraceForge returned holders and active mint/freeze authority findings.
- BSC `0xb00cf84d186ff4c3b36a9685f411e996ea50b3c0`: the stored Swarm report had seven holders, score null and TOO_EARLY, with reason “too few holders to judge yet.” This demonstrates score withholding, not an established universal minimum-holder threshold.

## Implementation priorities

1. Require matching source identity and current timestamps for individual controls, and reject contradictory/stale core snapshots as sufficient score evidence.
2. Use one infrastructure exclusion rule with proofs matching the actual address and category; preserve supply denominators and detect conflicting duplicates.
3. Scope current-holder measurements separately from historical counterparties. Preserve historical findings and independently proven critical hazards.
4. Implement direct read-only control probes and carefully scoped simulations. Do not equate an unavailable provider flag with a clean control.
5. Distinguish recent provisional evidence from finalized proof, especially for newly launched tokens. Keep transaction and block timestamps authoritative.
6. Feed verified reserve, fee and explicit sell-amount inputs into the correct AMM model; do not replace reserve proof with USD liquidity or apply constant-product math to unsupported pools.
7. Present measured six-factor inputs, gates and unavailable factors honestly. Do not invent hidden component curves, copy a provider score, or label a policy score a safety probability.
8. Use broader independently labeled outcomes before claiming more accurate predictions than another engine. Holder parity and successful retrieval on several tokens do not establish predictive superiority.

The token comparisons describe recorded snapshots and the old implementation. The reconstruction section describes the updated code. Neither claims that every gap is fixed, that independent results must match older provider snapshots, or that predictive accuracy is calibrated.

EVM freshness correction: nonce above ten can rule lifetime freshness out. Nonce at or below ten remains unresolved because incoming/internal activity is absent from that counter; it never triggers the 80% fresh-wallet hard stop.

## Live six-factor integration check - 2026-11-03

Two fresh scans against the local production service confirmed the integrated evidence path (no LLM):

| Token | Elapsed | Raw holder rows | Activity addresses / counts resolved | Direct EVM observations |
| --- | ---: | ---: | ---: | ---: |
| Grok, Solana | 18.05 s | 20 (19 after observed pool exclusion) | 19 / 6 | Not applicable |
| CMC comparison, Ethereum | 17.17 s | 40 | 39 / 38 | 7, partial control-probe result |

Earlier runs took 10.51 s and 5.23 s but the Ethereum activity probe then used the preliminary one-holder GoPlus list. The corrected ordering probes the explorer's final holder snapshot. These are observed timings, not a latency guarantee; archive pagination is not on the initial search path. Subsequent code starts Solana snapshots concurrently with market lookup rather than waiting for it; no timing claim is made for that scheduling change without a separate measurement.

Both independent verdicts remain CAUTION with unresolved factors, not fixed percentages. Grok's candidate range was 0-97; CMC's was 0-89. Grok's selected quote token exposes unsupported token extensions, so its reserves are not silently treated as a vanilla executable constant-product pool. The private source's favorable result cannot fill those independent evidence gaps. Counts and balances can change between captures.

Validation: 574 regression tests and TypeScript checking passed. The production build and browser presentation were checked separately. Public fixture matches validate five factor curves only, not end-to-end predictive accuracy or the private judge.

Browser verification: six factor rows rendered on the Grok report; the concentration evidence link opened its ten source records. Desktop1440 and mobile390 viewport checks found no page-width overflow. Browser error log was empty.

## Decision-model reconstruction follow-up

The separately reconstructed decision model and its production verification are documented in [the judge audit](swarm-judge-reconstruction-2026-11-03.md). Supported identical inputs match all77 retained scored provider outputs, including the Grok score87 distribution0.3% /19.6% /80.1%. This establishes observed numeric-branch compatibility, not identical retrieved features or calibrated safety confidence. The app preserves unknown measurements and qualified critical overrides. Full independent input parity is still incomplete.

## BSC zero-holder failure and EVM reserve follow-up

The same-token failure for `0xf4d17f21eb7bd0a678a7450622f3bf8810f6cbee` is documented in [the BSC validation](bsc-holder-gap-validation.md). A contradictory GoPlus zero is now withheld, finalized RPC checks recovered 14 positive balances, and independently verified V2 reserves support the existing high-impact AVOID stop rule. Missing launch history no longer hides that current hazard. Generic contracts are not automatically equated with infrastructure. Current evidence and historical clocks stay distinct through refresh, and old reserve proofs cannot replace newly verified results. This closes that reproduced data/verdict failure; it does not claim universal source availability or exact private-model parity.
