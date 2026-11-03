# TraceForge evidence rating, version evidence-v3

The percentage is an explicit product-policy rating of the returned evidence. It is not a trained probability of safety, a prediction of returns, or a reconstruction of Swarm's private judge. No calibration or accuracy superiority is claimed.

## Calculation

Four categories can earn 100 points in total:

| Category | Maximum | Rule |
| --- | ---: | --- |
| Contract controls | 40 | Required chain-specific controls attributed to available sources, all clear, no unknown controls, no stale verification, no security findings. Otherwise 0. |
| Holder distribution | 20 | Independently observed adjusted largest-holder share at most 10% and top-ten share at most 50%. Unknown/stale or above either policy threshold earns 0. Adjusted means only evidenced infrastructure is excluded; it is not a complete ownership census. |
| Funding relationships | 20 | Qualified native-funding relationships linked to independent transaction evidence and no shared-funder warning earn 20. A shared-funder warning earns 10 once for the family. Unknown funding earns 0. Ordinary token legs, dust and observation-only receipts do not prove funding coverage. |
| Wallet activity | 20 | Independently attributed observed trades without a wallet-behavior warning earn 20. A warning or unknown activity earns 0. Security findings are not counted again in this family. |

These weights and concentration thresholds are explicit TraceForge policy choices. They are not empirically fitted to token outcomes. Repeated funders, overlapping groups and additional pages do not multiply a family's points or penalties.

A material warning, failed concentration threshold, stale core snapshot or unverified required control caps the overall rating at 74. A critical finding overrides all favorable categories: AVOID, 0. Missing baseline controls/source/holder data produces UNRATED with no percentage. A provider-only report never acquires an independent numeric rating.

## Display bands

- 90-100: CLEAN within evaluated scope.
- 75 to below 90: OK within evaluated scope.
- Below 75: CAUTION.
- Critical finding: AVOID.

No rounding before classification. Missing full launch history is a separate coverage limitation, not the former automatic 15-point deduction. Unknown evaluated categories earn no favorable points. A partial record is never called a complete history.

## Refresh and provenance

Holder refresh and historical merges recompute measurements before the rating and presentation assessment. Provider timestamps and retained-stale states are preserved. Cache schema 2 rejects old computed reports; browser report-feed key v5 prevents old decision records from appearing as current scores. Repeated searches retain fast cached responses and do not launch exhaustive history crawls.

Contract pass counts remain a separate diagnostic. Four passed contract checks do not imply a 100% overall rating. Each warning exposes transactions, timestamps and whether its wallets occur in the current holder snapshot. Connected-selling evidence uses the paths between the actual sellers, not unrelated branches. Observed sales volume is shown separately from unknown market impact.

## Validation limits

Unit and regression tests verify policy boundaries, critical overrides, duplicate findings, missing evidence, ordinary-transfer exclusion, stale-source behavior and refresh recomputation. The same Grokbot token is compared against a timestamped public Swarm response. Neither comparison agreement nor passing tests establishes predictive accuracy. Claiming calibrated confidence or outperforming Swarm requires independent labeled outcomes and time-split false-positive/false-negative evaluation.
