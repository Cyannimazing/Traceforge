# Swarm decision-output reconstruction - 2026-11-03

This follows the earlier `swarm-verdict-reconstruction.md` audit. It recovers a behavioral formula from public input/output observations, not private source code, trained weights, or a calibrated safety model. No new external request was made by this audit. No application code was changed.

## Verified result

The candidate formula reproduces **77 of 77 distinct scored snapshots**, including all three rounded decision weights, selected decision, confidence, escalation threshold, escalation flag, and every displayed evidence-mass row. Two additional distinct snapshots have null scores and remain outside the reconstructed numeric branch.

The fixed corpus is `tests/fixtures/swarm-judge-observations.json`. Each row has its capture path, SHA256, chain, token and scan time. Deduplication uses chain + token + scan time; repeated file copies are not counted as independent examples. Split counts are prior observation 6, discovery 8, holdout 4, additional validation 21, fresh discovery 12, fresh holdout 7, fresh followup discovery 11, fresh followup holdout 10. These labels were assigned by the earlier component audit. All responses were visible during this retrospective judge analysis, so the 21 holdout-labeled rows are consistency checks, **not a new blind validation set**.

Reproduce offline:

```powershell
node validation/derive-judge-evidence.mjs
npx tsx --test tests/swarm-judge-reconstruction.test.ts
```

The first command deliberately regenerates the corpus from current saved artifacts; it may change counts if more captures are added. The second uses the checked-in fixed corpus. Four tests passed on the 79-row corpus described above.

## Reconstructed equations

For integer score `s`, define `sigmoid(x) = 1 / (1 + exp(-x))`:

```text
baseAvoid   = sigmoid((48 - s) / 7)
baseOK      = sigmoid((s - 74) / 6)
baseCaution = 1.12 - baseAvoid - baseOK
```

These are inferred behavioral constants. For example, the observed avoid mass of 0.500 at score48 anchors the first sigmoid midpoint; scores43,45,50 and59 match scale7. The OK masses at scores75,76,77,78,80 and90 match midpoint74, scale6. The unrounded base sum is1.12.

Observed additional **avoid mass**:

| Condition in public output | Added mass | Evidence coverage |
| --- | ---: | --- |
| `band == DANGER` | 0.60 | Multiple scored snapshots |
| Security feature1, displayed as `contract risk (warn)` | 0.35 | Multiple scored snapshots |
| Positive cross-token memory hit count | `min(0.50, 0.25 * hits)` | Counts1,2 and higher observed |
| Reported dump impact at least0.50 | 0.40 | Multiple snapshots above threshold; threshold boundary itself not probed |

Let `extra` be the sum of those observed additions. Then:

```text
total   = 1.12 + extra
avoid   = (baseAvoid + extra) / total
caution = baseCaution / total
ok      = baseOK / total
```

Choose the largest unrounded mass as the decision; confidence is that selected normalized mass. Observed thresholds are AVOID0.70, CAUTION0.60, OK0.90. Escalation agrees with confidence below the selected threshold. Ties and exact threshold equality have not been observed, so their production handling is not established.

Round each displayed evidence mass and each output weight to three decimals **after** its own calculation. Do not normalize already rounded evidence values. The rounded weights can sum to0.999 or1.001, so the interface should not silently change them and then claim exact display parity.

For scores in[0,100], `baseAvoid + baseOK <= 1`, so `baseCaution >= 0.12`. Caution is not monotonic: it peaks near score61.3472 at raw mass0.8824083. Any interval implementation must include interior extrema. TraceForge's score is integer-valued, so enumerating every possible integer score and additive-risk endpoints gives exact bounds for that discrete reconstructed model.

## Grok comparison

| Snapshot | Score / band | Reconstructed avoid | caution | OK | Decision / escalation |
| --- | --- | ---: | ---: | ---: | --- |
| Saved latest Grok | 87 / CLEAN | 0.3% | 19.6% | 80.1% | OK / escalate |
| Earlier Grok | 91 / CLEAN | 0.2% | 15.5% | 84.3% | OK / escalate |

The earlier audit's rounding mismatch is resolved: at score91, normalizing the displayed rounded masses `.002`, `.173`, `.944` gives a rounded OK value of0.844; applying the recovered unrounded equations first gives the observed0.843.

Another implication: in the reconstructed score range0..100, maximum OK mass without extra risks is `sigmoid(26/6)/1.12`, approximately88.13%. Positive risk additions only reduce it. Therefore this branch cannot reach its own90% OK escalation threshold. Every observed OK row escalates. This is an implication of the inferred equations, not an assertion that every possible unobserved server branch behaves identically.

## Public code evidence versus inference

`validation/swarm-2026-11-03/public-app.js`, `judgeCard` around lines336-350, renders fields returned by the server. `evidenceHtml` around lines353-361 sums returned avoid additions and divides by the returned base masses for its X-ray. It does not generate sigmoid masses. The formulas above are inferred from response observations; they were not found as executable model source in the public asset.

The client-side copy-for-review text around line467 says the fast judge escalates cases to an LLM or human. The observed judge fields report model `swarm-judge-1`, zero monetary cost, and sub-millisecond latency. These observations do not establish its implementation language or any training/calibration process.

## Recommended independent integration mapping

Do not feed Swarm output into TraceForge production. Use TraceForge measurements and label the reconstructed layer separately from its policy rating:

| Judge input | Independent mapping | Missing behavior |
| --- | --- | --- |
| score | TraceForge six-factor exact score, or retained score interval | Do not replace a range with its midpoint or zero |
| DANGER addition | Explicit verified hard-stop evidence, separately from display label | Missing history is not a hard-stop finding |
| security warning | Current source-qualified transfer/control risk | Do not use every metadata or informational warning; unobserved security2 remains unsupported |
| memory hits | Proven cross-token connected-group registry, scoped and deduplicated | No registry is unknown, not zero; observed branch gives additional avoid range[0,.5] |
| dump impact | Verified eligible pool scenario with supported token behavior | Unsupported pool remains unknown; observed branch gives additional avoid range[0,.4] |

When every required input is established, output reconstructed weights with their scope. When supported inputs are intervals, enumerate possible integer scores and risk-addition endpoints, retaining per-category ranges. An exact classification is justified only if the same category is maximal for every admitted combination. A known independent critical finding must still force the primary verdict to AVOID; it must not be overruled by this reconstructed probability layer. Withhold a single confidence number for overridden or unsupported cases.

In particular, the observed `DANGER` addition is a finite mass, not a mathematically guaranteed AVOID override. A hypothetical high-score DANGER row could have an OK argmax under the fitted formula. Such high-score critical cases were not observed. Preserving a separate evidence-qualified critical stop is therefore essential.

## Remaining limits to parity

- Security feature2 / dangerous-security mass has not appeared in the corpus. Its coefficient or any special handling is not recovered. Do not guess0.7 or0.8.
- Two score-null rows show a fixed-looking `{avoid:.34,caution:.46,ok:.20}` CAUTION result, but two examples do not establish the complete missing-score branch. The offline candidate abstains for null scores.
- Score interval handling, unknown memory, independent partial coverage, and critical overrides are TraceForge safeguards, not recovered Swarm behavior.
- Boundary conditions, ties, feature rounding before decisions, alternative score/band combinations and future model versions remain untested.
- Public responses expose no token-outcome calibration labels. Matching provider outputs cannot establish an80% probability of safety or superior trading accuracy.
- Reproducing these equations does not solve upstream holder census, lifetime activity, launch coverage, token controls, memory indexing, or pool execution fidelity. Unknown upstream facts must remain explicit inputs.

## Implemented decision output - 2026-11-03

The application now runs the reconstructed numeric branch in `src/lib/decision-model.ts`. `tests/decision-model.test.ts` verifies the production implementation against the same 77 scored public snapshots. It does not import the offline helper. The six component curves include the newly verified fresh-wallet ramp: `20 * clamp((0.80 - fresh) / 0.65, 0, 1)`.

For incomplete inputs, every integer in the score interval is evaluated. Risk-addition endpoints bound each normalized mass. This includes the interior caution maximum; evaluating only score endpoints would be wrong. Unknown cross-token memory ranges from zero to the observed capped0.5 addition, and unresolved dump-impact threshold ranges from zero to0.4. Unknown or unobserved dangerous-security inputs withhold model weights. A verified critical finding overrides the decision with AVOID and withholds point confidence. An interval that has one winner throughout can identify that model decision without inventing a point percentage.

The UI displays decision weights separately from the six-factor rating, with calculation details. This is not calibration against future token outcomes. Unread wallets are not assigned clean historical evidence. TraceForge does not adopt Swarm's missing-data defaults merely to match its score.

Wallet activity now distinguishes rate limits from unavailable history, shares a paced signature lane, retries bounded temporary failures, and caches finalized nonfresh proofs for five minutes. Each cached proof retains its original observation timestamp. Two consecutive ten-second diagnostic scans resolved8/19 then12/19 wallets under the live account throttle. These counts measure observed retrieval, not guaranteed capacity. Exact feature-extraction parity remains separate from the77-case judge-output reconstruction.

### Verification of the deployed calculation

- Full suite: 593 tests passed. Production build and TypeScript passed.
- Local API on port3100 returned the new `traceforge-judge-v1` output in0.95 seconds from cache. The freshly scanned Grok snapshot had19 non-infrastructure holders,6 verified activity rows and a4-97 six-factor score range. This live report remains CAUTION with bounded decision weights, not a fabricated exact confidence.
- Browser checked at1440 and390 pixels; no document-width overflow and no console errors. The formula disclosure opens correctly.
- Reconstructed numeric behavior matches77 scored public captures. Feature extraction, dangerous-security coefficients and null-score provider fallback are not claimed to be identical. Real-world outcome calibration has not been performed.
