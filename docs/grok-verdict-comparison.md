# Grokbot verdict comparison - 2026-11-02

Token: `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`, Solana.

TraceForge fresh report: 2026-11-02 05:31:57 UTC. Public Swarm fresh report: 2026-11-02 05:34:51 UTC, job `7982a160c220`, judge receipt `rcpt_09f160037cabc1fa`. The job events and result receipt match. These are different source times, about three minutes apart.

| Observed output | TraceForge | Swarm |
| --- | --- | --- |
| Independent holder rows, excluding pool | 19 | 19 |
| Matching holder addresses | 19/19 | 19/19 |
| Largest holder, adjusted denominator | 4.8430% | 4.8602% |
| Top ten, adjusted denominator | 31.9914% | 32.1051% |
| Creator, adjusted denominator | 3.8300% | 3.8436% |
| Overall rating | 70% CAUTION | 87 CLEAN |
| Separate judge output | Not a calibrated probability | OK; confidence 80.1%; escalate=true |
| Current-holder relationships in Swarm result | Not used as our source | 0 links |

All 19 unadjusted total-supply shares match within floating-point tolerance (maximum absolute difference 4.44e-16 percentage points). The adjusted shares differ because the observed infrastructure denominator changes between snapshots. This verifies the matched holder measurements, not token-wide ownership or predictive accuracy.

## Why the verdict differs

TraceForge's historical evidence contains two shared-funder patterns and two connected-selling windows. The flagged historical wallets are outside the current 19-holder ring; their current balances are unknown, not zero. Swarm's report and our historical finding set therefore assess different scopes. Its current-holder report does not establish that those historical transactions never occurred.

- Sources `5tzFki...uAi9` and `AQ6cc8...Gugv` funded the same two early wallets in October 22-23 records. Each finding links two transaction records. Shared funding is observed, but common ownership is not proven; an unidentified service remains an alternative explanation.
- October 28 selling window: 36,619,239.913853 observed tokens across seven trades, supported by one prior connecting transfer. Eight supporting records, reduced from nine after excluding an unrelated branch.
- November 2 selling window: 2,845.974562 observed tokens across two trades, supported by two prior connecting transfers. Four supporting records, reduced from 168 after removing unrelated component branches. Small observed volume is not presented as a large market-impact event.

The overall 70 is computed from controls 40/40, holder distribution 20/20, funding 10/20, activity 0/20. Repeated funders and selling windows do not multiply family penalties. The rules and limitations are in `trust-rating.md`. It is not Swarm's judge probability or a fitted safety probability.

## Corrected gaps

- Linked only the seller-to-seller evidence paths, excluding unrelated graph branches.
- Added event date ranges, observed sale amounts and current-holder membership to warning explanations.
- Required qualified funding relationships, not arbitrary token transfers, before awarding funding points.
- Kept security findings out of the wallet-activity family to avoid duplicate classification.
- Recomputed holder measurements before scoring refreshed or merged reports.
- Exposed one overall rating and its category calculation, separate from contract check percentages.
- Versioned the persistent cache and saved feed so obsolete scores do not survive this policy change.

## Verification

468 automated tests passed, TypeScript passed, production build passed. Native browser inspection confirmed 70% CAUTION and the four expanded calculation rows on port 3100. Fresh independent scan took 14.35 seconds; repeat cached retrieval took 0.353 seconds with the same source timestamp. No Swarm source was present in the independent report. Search did not resume exhaustive historical pagination.

Captured artifacts in the staging project: `verification-verdict-final.json`, `verification-verdict-swarm-current.json`, `verification-verdict-swarm-fresh-events.json`, `verification-verdict-comparison-summary.json`, `verification-verdict-cache.json`.

## Still not established

Complete token-wide launch history, complete ownership census, true beneficial ownership, all-pool sell impact, recovered Swarm production weights/model, and superior predictive accuracy. Public Swarm observations do not disclose its full server model. Both 87/CLEAN and 80.1%/OK are returned provider outputs, not independently validated ground truth. Outcome-based calibration remains required before calling the percentage a measured confidence probability.
