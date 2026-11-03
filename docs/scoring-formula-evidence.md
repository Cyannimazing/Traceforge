# Scoring formula evidence

Research date: 2026-11-03. This document records **behavioral reconstruction**, not recovered backend source code. The sanitized numerical fixture is `tests/fixtures/swarm-score-observations.json`. It contains 57 unique source snapshots across Ethereum, Base, BNB Chain, Solana and Robinhood Chain. Observations are provider outputs, not labeled safety outcomes.

## Method and holdouts

The audit reused older saved reports, read the public recent/radar indexes, and fetched 52 existing stored reports. No new scans, historical pagination, Gemini requests or paid services were used. The first eight new reports were designated discovery and the next four holdout before inspecting their values. Later batches were designated additional validation, fresh discovery and fresh holdout. Duplicate token/scan timestamps were removed.

Holdout status is factor-specific: the insider interior curve was developed after the initial holdout batch supplied the first informative point. Two later independent snapshots then matched it. The fresh discovery batch supplied only one interior fresh point; its later holdouts contain plateau/extreme values and do not identify the fresh slope.

The shipped frontend supplies six component maxima and human-readable gate descriptions, but receives component values and final score from the server. [Public application source](https://swarmengine.tech/assets/app.js), [public documentation](https://swarmengine.tech/docs).

## Five strongly supported candidate curves

All inputs below are **fractions between 0 and 1**, not percent numbers. Define:

```text
clamp01(z) = min(1, max(0, z))
points(x, maximum, low, high) = maximum * clamp01((high - x) / (high - low))
```

The displayed component is the candidate result rounded to one decimal. Keep unrounded points for the score calculation.

| Component | Maximum | Full points at/below | Zero at/above | Exact displayed matches | Interior observations |
| --- | ---: | ---: | ---: | ---: | ---: |
| Swarm, input `impact` | 30 | 0.10 | 0.60 | 55 / 55 available-impact snapshots | 24 |
| Concentration | 15 | 0.30 | 0.80 | 57 / 57 | 32 |
| Snipers | 10 | 0.03 | 0.25 | 57 / 57 | 27 |
| Dev | 10 | 0.02 | 0.15 | 57 / 57 | 8 |
| Insiders | 15 | 0.02 | 0.20 | 57 / 57 | 3 |

Within the restricted family of clipped straight-line curves with endpoints on a one-percentage-point grid, **each of these five endpoint pairs is the only pair consistent with every captured displayed value**. This is useful evidence for an implementation named and versioned as a reconstructed policy. It does not establish unique equivalence among every possible nonlinear function, hidden branch or future backend version.

### Informative exact input/output pairs

| Factor | Input | Returned component | Snapshot/token identifier |
| --- | ---: | ---: | --- |
| Swarm | 0.22560688571848853 | 22.5 | Grok, source timestamp 1793566184 |
| Swarm | 0.4257890999158499 | 10.5 | `FxQ5GbqCBxNHDpFTpiL9RDVHiP58ar5nMkR3eMwepump` |
| Swarm | 0.10264306955038416 | 29.8 | `0x94074860d930aa5d78379419d422bff8bdbab972` |
| Concentration | 0.34869458203235715 | 13.5 | Grok, source timestamp 1793687765 |
| Concentration | 0.7142875988957628 | 2.6 | `0x1723cb47047559cdac20a53907ff9057612deef7` |
| Concentration | 0.7971646271935663 | 0.1 | `0x068c1a8a8c4c5484768e6818c2dcf568f45ff902` |
| Snipers | 0.18641382808418883 | 2.9 | `0x1723cb47047559cdac20a53907ff9057612deef7` |
| Snipers | 0.09950561082919639 | 6.8 | `TFWbVHQmW3Y8kHRPBoc8wttiZ7RufzZMPbgqdquSBQR` |
| Snipers | 0.22303826048930578 | 1.2 | `3rNMYJTc6EMJzarVatga4dA8yrampk6uyRfrgbas7dGb` |
| Dev | 0.04503589965214935 | 8.1 | Grok, source timestamp 1793687765 |
| Dev | 0.05734003429107243 | 7.1 | `5cKX3tn119ayha94BD6xEZQekQUG8stwHHNTuNBppump` |
| Dev | 0.09500056040461402 | 4.2 | `0xb10e423ac4a6fefeff5fc9e33ad71c1a2d4b3bbd` |
| Insiders | 0.1372382102858269 | 5.2 | `3rNMYJTc6EMJzarVatga4dA8yrampk6uyRfrgbas7dGb` |
| Insiders | 0.02232887446446135 | 14.8 | Bitsan, source timestamp 1793687433 |
| Insiders | 0.0932232050700144 | 8.9 | `6iaCioryV4NiPLdWMmjjQr4GTCq7zkE4p6XoQyoFxeqS` |

The fixture is authoritative for the exact token identifiers and source timestamps; sample names are not identity keys.

## Fresh measurement recovered, curve unresolved

For all 52 newly fetched raw reports, the following reconstruction exactly reproduces `metrics.fresh`:

```text
eligible = holder rows that are neither unread nor dev-marked
fresh = count(eligible rows marked fresh) / count(eligible)
```

This is **not** fresh wallets divided by every holder row. For example, one BNB Chain report has 48 holders, 33 unread and one readable creator, leaving 14 eligible rows. Three are fresh, yielding 3/14 = 0.21428571428571427 and a returned fresh component of 18. Reports of the same pattern with one and two fresh rows return 20 points. Another report with 12/14 fresh returns zero points.

The candidate `points(fresh, 20, 0.15, 0.80)` fits every observation, but it is **not uniquely identified**. Even limiting endpoints to whole percentages leaves twelve fitting pairs:

```text
(0.15,0.78), (0.15,0.79), (0.15,0.80),
(0.16,0.69), (0.16,0.70), (0.16,0.71),
(0.17,0.61), (0.17,0.62), (0.18,0.52),
(0.18,0.53), (0.19,0.43), (0.20,0.34)
```

Only one distinct interior point is available. Do not select the most aesthetically plausible curve and call it recovered. Additional existing reports with distinct intermediate fresh fractions are needed, ideally between 0.3 and 0.7, followed by fresh holdout validation. The documented 80% hard-danger threshold does not prove that the component becomes zero at the same threshold.

Minimal supported implementation: a fully qualified fresh fraction of exactly zero maps to 20 points; an unknown fraction stays unknown. The captured high-end observations are 0.8571428571428571 and 1.0, both returning zero. A rule assigning zero throughout `fresh >= 0.80` would be a conservative policy aligned with the documented hard gate, not proof of the hidden component boundary. Do not assume a full-score plateau through 0.15; report other unvalidated interior points as unavailable until the curve is established.

## Missing inputs and coverage

Two reports return `impact: null` but numerical swarm points. Substituting `metrics.biggest` for impact in the swarm candidate reproduces both: 0.20521215243987428 gives 23.7, and 0.08167137598309075 gives 30. This suggests an observed fallback, but the second point is on the full-score plateau. More missing-impact interior samples are needed before claiming the fallback's complete behavior.

Grok returns fresh 0 and 20 fresh points while 13 of its 19 holder histories are unread. Six readable non-dev holders have no fresh flags. This is a scoped zero among assessed rows, **not proof that every holder is non-fresh**. The independent engine should preserve coverage uncertainty instead of silently importing this zero as complete evidence. The fresh denominator with zero eligible rows was not independently established by an informative captured case.

Similar caution applies to insider/sniper zeros and developer identity. Curve parity does not establish measurement parity, complete historical retrieval or correct ownership inference.

## Final score rounding and caps

Using the five candidate raw curves, the observed fresh component, the observed missing-impact fallback, and a cap of 59 where a returned gate starts with `soft:`, reproduces the final score for all **57 / 57 snapshots**.

This is conditional reconstruction: the fresh component and gate decisions are still observed inputs, not independently generated predictions.

Two observations distinguish rounding order:

| Snapshot | Sum of displayed parts | Sum of raw candidate parts | Returned score |
| --- | ---: | ---: | ---: |
| UNPOOLED `FxQ5...pump`, timestamp 1793690374 | 80.5 | 80.452654005049 | 80 |
| `0x87dbab859e1a39b0ca11a5e6a3e7298ab319683b`, timestamp 1793682227 | 76.5 | 76.391673118054 | 76 |

Thus summing already-rounded display parts before integer rounding is wrong for these cases. No exact half-integer raw sum was observed, so ties-to-even versus ties-away behavior remains unproven.

Hard danger does not necessarily set numeric score to zero: a captured hard-dump report retains score 66 but displays DANGER. Band selection and numeric score are separate. CLEAN at 80 and OK at 78 are observed; an exact universal boundary cannot be established from those two values alone. Gate ordering/readiness rules remain outside these curve tests.

## Public source availability

Public listings reference a candidate repository at `https://github.com/moltcagent-rgb/swarm`. The repository and account URLs returned 404 during this audit. Their status cannot establish whether code was deleted, made private, renamed, or never available. No official backend scoring source or model-calibration documentation was recovered. Do not claim these inferred curves are source-confirmed.

## Recommended implementation boundary

Implement the five supported curves under a versioned reconstructed-policy identifier with the public fixtures as regression evidence. Preserve factor-level input provenance, observed scope, unknown values and interval bounds. Keep the fresh curve unavailable or explicitly experimental until separately validated. Generate hard/soft gates only from independently qualified evidence; never copy the provider's returned gates into an independent report. A policy score remains a rule-based assessment, not a safety probability or measured confidence percentage.
