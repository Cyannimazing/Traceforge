# Public Swarm analysis validation

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

The shipped client **renders server-returned scores and parts**. It does not contain the complete feature-to-points curves, grouping algorithm, gate ordering, missing-data policy, readiness exceptions, or calibrated decision model. Thresholds for some qualitative gates are unspecified. A component maximum plus a few observed examples is not enough to recover its curve. An independently chosen formula must be documented as TraceForge policy, not claimed as Swarm's recovered implementation.

The public token UI checks a stored report before starting a scan, using a ten-minute freshness window. A fast cached result is not proof of an equally fast cold crawl. Source: [Swarm public application](https://swarmengine.tech/assets/app.js) and [API documentation](https://swarmengine.tech/docs).

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

These observations describe the recorded snapshots and pre-redesign implementation. They are audit evidence, not a claim that every listed gap has been fixed.
