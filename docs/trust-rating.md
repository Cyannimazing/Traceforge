# TraceForge six-factor rating

The primary independent rating is `six-factor-v1`, replacing the four-family `evidence-v3` policy. It combines behavioral reconstruction with explicit TraceForge evidence and decision rules. It is not a trained probability of safety, a calibrated prediction, or a recovered copy of Swarm's private judge. No Gemini output is required.

## Component curves

For all six factors, inputs are qualified risk fractions between zero and one:

    points = maximum * clamp((zeroAt - risk) / (zeroAt - clearAt), 0, 1)

| Factor | Maximum | Full points at/below | Zero at/above |
| --- | ---: | ---: | ---: |
| Largest-hand sell impact | 30 | 0.10 | 0.60 |
| Fresh wallets | 20 | 0.15 | 0.80 |
| Early / creator-origin exposure | 15 | 0.02 | 0.20 |
| Top-ten hands concentration | 15 | 0.30 | 0.80 |
| First-minute buyer exposure | 10 | 0.03 | 0.25 |
| Creator-linked exposure | 10 | 0.02 | 0.15 |

These candidate curves reproduce displayed component values across 57 retained public snapshots: 55/55 for available impact and 57/57 for each other factor, including interior observations and later holdout checks. They remain behavioral inference, not source-confirmed backend formulas. See [scoring-formula-evidence.md](scoring-formula-evidence.md) and `tests/fixtures/swarm-score-observations.json`.

### Fresh-wallet curve follow-up

Fresh now uses the inferred clipped-linear curve with 20 maximum points, a full-points endpoint of 0.15 and a zero-points endpoint of 0.80. Twenty additional numerical stored reports matched it, including nine usable preselected holdouts with six interior values. Together with the earlier 57 snapshots, fresh matches 77/77 displayed components. One additional holdout was TOO_EARLY and had no component to test.

The new 1/3 ->14.4 discovery point eliminated the other eleven whole-percentage endpoint candidates. Independent holdouts include 0.4 ->12.3, 4/7 ->7.0, 8/15 ->8.2 and 0.8 ->0. This supports the formula separately from the 80% hard gate. It remains behavioral reconstruction within a tested function family, not recovered private code. See `tests/fixtures/swarm-fresh-curve-observations.json`.

Swarm's observed fresh fraction divides fresh rows by readable, non-dev holder rows. TraceForge currently evaluates all qualified non-infrastructure current holders and bounds unknown activity instead of dropping it from the denominator. This preserves uncertainty but is not denominator parity.

## Independent measurement scope

- Current holders and infrastructure require snapshot and matching label evidence. Historical counterparties do not become current holders; connected groups do not establish beneficial ownership.
- Concentration uses the ten largest documented current-holder groups, including singletons, and an infrastructure-adjusted denominator. Missing supply widens its bound; unknown relationships can still change grouping.
- EVM outgoing counts above ten and more than ten observed finalized Solana signatures can rule out lifetime freshness. Lower outgoing counts and short signature pages cannot establish lifetime freshness. Counts retain their chain-specific meaning and anchor.
- Creator exposure includes observed current creator and directly funded/recipient holdings once. Prelaunch and first-minute classifications require matching transaction/timing evidence. Partial tracing gives lower bounds, not proof of absent related wallets or insider intent.
- Supported PumpSwap sell impact is an explicit zero-fee terminal-price scenario, `1 - x² / (x + q)²`, using matching finalized reserves and raw token-account balances. It is not an execution quote and excludes verified fees, routing, other pools, arbitrage and unknown ownership. Unsupported pools remain unknown; largest-holder share is not silently substituted for impact.
- Source identity, timestamps, stale refresh status and contradictory snapshots qualify required core evidence. Imported provider reports do not establish independent inputs.

## Bounds and final score

Unknown input retains a risk interval. Monotonically decreasing curves map input endpoints to reversed point endpoints, including uncertain fresh prevalence. A score range is a mathematical policy bound, not a confidence interval or safety probability.

An exact score requires all six component point values and adequate core evidence. Otherwise `score` is null with a range, including when a hard gate produces AVOID. Missing-core results display CAUTION without an exact percentage unless a qualified hard gate requires AVOID; imported provider-only reports display UNRATED.

Sum unrounded points, round the total to an integer, then apply the ceiling. Summing rounded display parts is incorrect: a captured report shows parts totaling 80.5, but raw points total 80.452654 and the score is 80. Exact half-integer tie behavior was not established from provider observations.

The compatibility report type may serialize unknown `earned` as zero while retaining `state: unknown` and bounds. This is not an assessed zero-point result; presentation must use the state/bounds rather than summing compatibility values.

## Gates

Qualified critical hazards, lower-bound sell impact of at least 50%, or lower-bound fresh prevalence of at least 80% produce AVOID. A hard gate changes the decision, not the component score: if all factors and core evidence are available, the numeric score remains their rounded sum subject to any soft cap; otherwise it stays null. AVOID can therefore coexist with a nonzero score, consistent with observed Swarm DANGER reports. This does not establish the provider's entire gate-ordering implementation.

Current soft gates cap at 59 for observed creator-linked exposure of at least 10%, documented connections among at least three current holders, or qualified current control warnings. Connections do not prove ownership or intent. Full recovery of additional public gate descriptions for packs, thin liquidity, proxies and cross-token memory is not claimed.

## Display bands

- 90-100: CLEAN.
- 75-89: OK.
- Below 75: CAUTION.
- Hard gate: AVOID.
- Unavailable exact score: CAUTION with unresolved scope/bounds, or UNRATED for imported reports.

These are requested TraceForge bands, not recovered Swarm band rules: Swarm CLEAN at 80 and OK at 78 were observed. The separate private judge's avoid/caution/OK weights are not reproduced. Missing history retains bounds rather than the retired automatic 15-point deduction.

## Refresh and provenance

Holder refresh and historical merges recompute measurements before rating/presentation. Source timestamps and retained-stale states must remain explicit. Repeated searches may use cached evidence; a cache hit does not establish complete historical coverage.

Contract pass counts remain a separate diagnostic. Four passed controls do not imply a 100% overall rating. Historical warnings remain inspectable with their current-holder membership scope; observed sell amounts and unknown market impact remain distinct.

## Validation limits

Regression evidence covers component arithmetic, raw-sum rounding, conditional soft caps, unknown inputs, current-holder graph scope and source-qualified guards. The 57/57 final-score comparison uses observed fresh components and observed gate decisions, so it is conditional curve validation, not end-to-end independent parity.

Complete parity still requires full independent feature extraction/grouping and gate/readiness behavior. Agreement does not establish predictive accuracy. Calibrated confidence or superiority claims require independently labeled outcomes and time-separated evaluation.

EVM activity correction: an outgoing nonce above ten can rule out the <=10 lifetime-transaction predicate. A nonce at or below ten cannot establish it because incoming/internal activity is absent from that count; these wallets remain unresolved. Low nonce alone never triggers the fresh-wallet hard rule.

## Observed-scope decision shown in the report

The report now distinguishes the strict evidence bounds from a conditional observed-scope model. Supported verified base-side PumpSwap snapshots can use the latter for the primary displayed decision. Its confidence is the selected normalized decision weight from the reconstructed judge, not a data-coverage index. The independent API returns it as `observedDecision`, alongside the unchanged strict `trustRating`.

The observed model uses current documented holder groups, current creator-linked holdings, recorded early/sniper exposure, and readable non-creator wallet activity. Zero recorded matches means no documented match in the retrieved scope; it does not prove absent activity. Unread histories are excluded from the fresh-wallet denominator. Cross-token memory is explicitly assumed to have no additional match because that search has not been performed. Its raw reserve-price scenario assumes zero fees, successful transfers, constant-product updates and no token-hook side effects. It never changes the reserve snapshot's `constantProductEligible` flag or creates a verified hard-stop capability. Verified independent critical controls retain precedence.

See the [Grok comparison](grok-input-parity-2026-11-03.md) and [judge reconstruction](swarm-judge-reconstruction-2026-11-03.md). The earlier6.9% coverage display was removed because it was not comparable to Swarm's80.1% model output.
