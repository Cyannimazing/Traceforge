# Public missing-score judge audit

The original example percentages were **not a user-requested TraceForge policy**. They are captured provider output. Interpreting the request for percentages as permission to ship a fixed split was a mistake; the user explicitly rejected it before deployment. The current output is calculated from supported model bounds and does not target 46% or copy 34/46/20.

## Dynamic uncertainty allocation: verdict-output-v2

The pure `buildVerdictOutput` adapter accepts existing rating/model inputs, never token identifiers or provider verdicts. It leaves unresolved scores and factor measurements unchanged.

1. Qualified hard rules override with an explicitly labelled AVOID rule allocation. A model selecting AVOID is not itself a hard rule.
2. With verified core evidence, preserve a valid exact observed-scope vector, then a valid strict vector, without alteration. Score 87 remains OK with 0.3/19.6/80.1. Exact AVOID vectors also remain calculated vectors rather than 100/0/0 replacements.
3. Otherwise use validated model ranges or evaluate `TrustRating.judgeInputs`, attached directly from the actual six-factor score bounds, qualified security, unresolved cross-token memory and sell-impact bounds. Apply the existing qualified soft ceiling before evaluation, including when cached metadata conflicts with it.
4. Unknown security is evaluated at both supported endpoints, 0 and 1, retaining their enclosing ranges. Neither endpoint is treated as observed or assigned a likelihood. Missing or malformed metadata uses the full supported model domain and any valid ceiling. Component `earned` values are never used to invent missing risk measurements.
5. Let A be the minimum normalized Avoid weight and O the minimum normalized OK weight across admissible model inputs. Allocate Avoid=A, OK=O, Caution=1-A-O. If core holder/control evidence is not verified, transfer O from OK to Caution and record that adjustment. The largest allocation selects the decision; Caution wins ties.

This is a conservative uncertainty allocation, not empirical confidence, a safety probability, an average over invented priors, or recovered Swarm null-score behavior. Caution contains both existing model caution mass and unresolved output ambiguity. As bounds collapse to supported exact inputs, the allocation converges to the existing normalized model masses, subject only to the existing rounding. A proposed point-budget partition was rejected because it lacked this convergence property.

The successful saved MeiMei snapshot at 2026-11-03 15:12:15 UTC has score bounds 20..75, security 0, unqueried memory and impact bounds 0..1. Its minima A=0.018474207384007034 and O=0.00006108642375556025 produce Caution=0.9814647061922374: approximately 1.8474/98.1465/0.0061%, not 34/46/20. Different evidence produces different bounds and allocations. The later manager-only retrieval gap is not evidence of absent holders.

The optional API `decisionOutput` contains version, decision, p, selectedWeight, basis, score, explanation, optional calculationScope, normalized bounds, adjustment records, inputBasis, and exact masses/total where available. Basis is calculated, uncertainty-allocation, or rule. Service, refresh and historical merges recalculate it. Assessment and UI share the helper; a derived assessment status is never fed back as a hard-stop input. Output version v2 and cache schema 11 exclude earlier output semantics. Raw API values remain unrounded; display rounding is separate.

## Evidence

The research fixture `tests/fixtures/swarm-null-score-observations.json` contains **20 distinct score-null snapshots**, deduplicated by chain, token and scan timestamp, found by recursively auditing the saved public responses. The five chains are Ethereum, Base, BNB Chain, Solana and Robinhood. All 20 are `TOO_EARLY`, give a too-few-holders reason, return CAUTION with weights 34/46/20, confidence .46, escalation bar .6 and `escalate:true`.

This invariance includes three security-warning inputs and one `memory_hits:2` input. Known liquidity ranges from 0.276 to 424,026.08; age ranges from 0 to 73.6 hours. Full-result examples report 1, 2 and 7 hands. These observations do not establish the readiness threshold or behavior for all missing-data causes, critical-security cases, future versions or unsupported inputs. They also show that “too early” is not simply a young-token-age rule.

MeiMei's returned holder records include possible-sniper flags while the null-score judge features show `snipers:0`; that zero must not be copied into an independent measurement. The narrow observed branch appears to short-circuit the ordinary scored calculation.

| Saved public capture | SHA256 |
|---|---|
| `validation/swarm-2026-11-03/fresh-followup-agent.json` | `e71551efaef1a3bc4138db28bc41a93761b8fdc78e8abd14779313f26963b3b9` |
| `validation/launchpad-comparison/swarm-meimei.json` | `3531b62eab981581d96be9f7cd7b4c0f35b039c41c473d83fab41986360b5434` |
| `validation/swarm-2026-11-03/bsc-user-token-stored.json` | `a5d520556c49da44bbb8411f5db1afe666eacd39b533ce6c896e3a17a7eda3f0` |
| `validation/swarm-2026-11-03/fresh-followup-sample-15.json` | `7fec85a283460d0ca864c987d9494d88228cfc566db733b54b2ff13921124960` |
| `validation/launchpad-comparison/swarm-chads.json` | `6d7892b2faf9942477e6e8659ecc100ce3249e7b1b25c0c4f6ead40d1e90b7c3` |

A fresh read-only HTTPS200 of [the public application script](https://swarmengine.tech/assets/app.js) returned119,602bytes and SHA256 `f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380`, identical to the cached script. `judgeCard` at lines336–350 renders the server's decision and weights. `evidenceHtml` at353–363 renders supplied evidence masses. The [public API documentation](https://swarmengine.tech/docs), generated by that script around1136–1155, describes endpoints and selected score/gate rules; it does not disclose a dynamic missing-score formula. No private judge source was recovered.

## Hypotheses and validation boundary

- H1: the observed `TOO_EARLY`/too-few-holders branch returns a fixed decision distribution. All20 saved cases are consistent with H1.
- H2: this branch applies the ordinary scored-model security and memory additions to its base weights. The unchanged outputs with security1 and memory2 contradict that simple extension.
- H3: null-score outputs vary with actual partial factor measurements. The inspected corpus supplies no supporting case; several feature values are defaults in this branch, not independent measurements.

This is retrospective analysis. The captures were inspected before these hypotheses were finalized, so **none of the20 is claimed as a blind holdout**. A future prospective test must freeze these predictions first, then select the next previously unseen score-null snapshots from the public stored feed in response order, deduplicate by chain/token/scan timestamp, and record every mismatch without changing the hypothesis. Include security-warning, positive-memory and non-young-age cases where naturally available. Fetch stored results only; do not manufacture scans or alter production inputs. Until that test, the supported claim is observed invariance, not universal backend equivalence.

## Earlier recommendation and rejected experiment

Earlier recommendations offered only model intervals or unavailable values. The current dynamic uncertainty allocation adds an explicit decision rule over those bounds, not a probability distribution over missing inputs. It preserves unavailable overall and factor scores.

The rejected scenario implementation assigned independent uniform risks to unknown 0–1 intervals and additional priors to unqueried inputs. Its AVOID result for WETH was driven by those assumptions, not detected hazards. It remains outside production. Its archived plaintext records a rejected experiment, not the current model. The existing calculated-model tests and legacy `DecisionOutput({result})` compatibility remain intact. This research fixture and its test are offline evidence only and must never be imported by application code.

Reproduce the frozen-corpus checks with `npx tsx --test tests/swarm-null-score-observations.test.ts`. The test reads only the committed JSON fixture and verifies observed outputs, distinctness and provenance fields. It has no ignored-file, external-workspace or network dependency and does not assert future behavior. The five raw capture hashes were independently checked during this audit. To repeat a raw-file check separately where the original captures exist, use `Get-FileHash -Algorithm SHA256 -LiteralPath <capture-path>` and compare with the table above; raw capture verification is not part of the clean-checkout test suite.
