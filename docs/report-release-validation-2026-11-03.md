# Report and retrieval validation - 2026-11-03

This release closes the reproduced Four.Meme custody, percentage-basis, first-minute classification and refresh regressions. It does not claim complete recovery of Swarm's backend, complete ownership history, calibrated safety probabilities or predictive superiority.

## Exact user token

BNB Chain: `0x07419f180cd9beec21e68477a71f9d92090dffff`.

The earlier comparison recovered two external holders at 50.18% and 49.82% of supply after excluding verified platform custody, matching Swarm's displayed 50.2% and 49.8%. The wrong 99.96% Authority row was the canonical Four.Meme shared manager, not an individual holder. A second bug treated the DEX listing identifier ending in `:4meme` as a wallet and disabled the percentage calculation. Both causes are corrected.

The final full production scan was captured at **2026-11-03 16:06:41.009 UTC** and completed in **4.816 seconds** using `fresh=1`. Chain state changed during validation:

| Address | Current total-supply share | Current presentation |
| --- | ---: | --- |
| `0x5c952063c7fc8610ffdb798152d69f0b9550762b` | 99.97912617858077% | Platform contract, listed in Infrastructure; control remains separately inspectable |
| `0x662055e3e1d5171c922653f632ec08450607d86d` | 0.0208738214192387% | Sniper, limited to the verified selected-launchpad first minute; 100% of measured snapshot float |
| `0x964a7f99bb4276138e7e0cbc068fcb411ca72757` | No positive balance returned by finalized verification | Historical first-minute buy retained in Activity/Traced addresses; excluded from current Holders |

The main report shows one current holder and two historically identified first-minute buyers. These are different scopes. It does not claim that the old two-holder snapshot is current.

Canonical first purchase: **2026-11-03 13:41:48 UTC**, transaction `0x92d7df427ef67a959a382b1795353816d77c242b8270ffb3843dc689c4d22e35`. The selected-launchpad timing proof is verified. Token-wide `launchVerified` remains false. See [the receipt verification and limitations](four-meme-verification.md).

## Retrieval and refresh corrections

- Historical pre-deployment `eth_getCode` was an unnecessary archive dependency for a label limited to this launchpad. The canonical manager's TokenCreate event plus exact preceding mint now establishes that marker. It does not establish the address's pre-event deployment state. Contiguous event coverage, forward/reverse receipt matching, routing, ordering, finality and block-hash checks remain required.
- Recent Transfer discovery uses 5,000-block ranges, two workers and one retry for transient failures. The ten-second overall deadline and request cap remain. Authorization failures are not retried or bypassed; failed ranges remain unknown. Empty RPC batches are never sent.
- A failed holder refresh retains independently backed infrastructure labels, balances and original timestamps. It does not retain old trading or funding classifications as new evidence. A manager-only GoPlus response cannot replace a previously verified external-holder snapshot.
- An empty report caused by an explicit holder-source failure expires after 30 seconds instead of hiding recovery behind a ten-minute cache. Positive and verified-empty snapshots retain ten-minute reuse. Older persisted empty failures are also clamped. Report schema 11 invalidates incompatible interpretation.
- Previously known holder addresses are candidate seeds only: balances are re-read at the finalized anchor. Canonical receipts can contribute additional candidates through a bounded same-anchor balance pass.
- A final live run exposed GoPlus changing from a manager-only response to a mixed manager-and-buyer response. Custody verification now runs whenever the canonical manager appears, including mixed snapshots. Market-only updates remain narrow; holder updates verify custody without starting a deep history scan. Failed verification never silently excludes the manager or invents a Sniper label. The successful full rescan recovered both historical buys and the current external holder.

## Percentage and verdict semantics

Map, table, mobile cards, accessible names and wallet rail share one controlled percentage basis and formatter. Snapshot float subtracts measured current infrastructure balances; the valid current market pair still requires a balance. Historically identified infrastructure without a current balance stays unknown and is outside that denominator. It is not silently assigned zero. This matches the denominator used by the existing observed-scope risk measurements.

The exact-token case also exposed floating-point cancellation near 100%. Computed values within `1e-8` percentage points of the boundary normalize to 100%; genuinely inconsistent values remain unavailable. Raw balances are unchanged.

Separate live Grok captures showed TraceForge at 14:34:58 UTC and Swarm at 14:36:26 UTC, both with 19 external holder rows, score87 and judge OK with weights 0.3% / 19.6% / 80.1%. Eighteen holder addresses overlapped and their raw supply shares agreed to floating-point precision; one address changed between captures. These are timestamped observations, not a claim of identical snapshots. Swarm's band was CLEAN; the independent score band follows the user's 75-89 OK / 90-100 CLEAN policy. Model weights are not measured safety probabilities.

The missing-score branch is separate: [20 retained public TOO_EARLY reports](swarm-null-score-audit-2026-11-03.md) returned the same 34/46/20 split. The user rejected copying that fixed split. TraceForge's `verdict-output-v2` instead uses the existing calculated model envelope: retain its minimum supported Avoid and OK weights, then assign the remainder to model caution plus unresolved support. Unknown security is bounded at both supported endpoints; no likelihood or uniform prior is invented. Required current-evidence gates withhold favorable support. Qualified hard stops retain explicit rule precedence; a model choosing an adverse result is not converted into a hard stop.

For the final MeiMei snapshot, score bounds are 20..75, with required current controls verified. Minimum Avoid weight is 1.8474207384% and minimum OK weight is 0.0061086424%; the remainder is 98.1464706192%. The UI displays **High risk 1.9% / Watch 98.1% / Clear 0.0%**, using display-only largest-remainder rounding to total 100%. Expanding the calculation shows the original arithmetic. This is a conservative allocation, not empirical confidence, a safety probability, a literal percentage of unknown checks or an exact Swarm null-score reconstruction. The unresolved overall numeric score remains null.

The user selected TraceForge's own presentation terms: **Clear / Watch / High risk**, with **Assessment** and **Decision support** headings. These names replace Swarm-style independent labels throughout the interface. Machine enums, weights and thresholds remain unchanged; explicitly attributed external reports retain their own terminology.

## Browser and release checks

- 758 automated tests passed after the mixed-snapshot and presentation fixes, with no skipped or failing tests. Production build and its TypeScript check passed.
- Impeccable detector returned no findings for the changed component files.
- Real production browser check on port3100 confirmed the exact-token row, Sniper label, 100% snapshot float, 0.02% rounded total-supply mode and Platform contract exclusion. Toggling either map or table changes both; Infrastructure remains on total supply. Three numeric decision weights and the expandable minimum-weight arithmetic are visible. A 390px phone check found no horizontal overflow, including all arithmetic rows.
- Evidence drawer has one close button, a 78% black backdrop, inert background navigation and one scrolling surface. Outside click closes it. Refresh opens the full scan instrument; cancellation restores the report and focus to Refresh investigation. A completed refresh also returned the verified report.
- Discovery at 1280x720 has matching 24px top/bottom gaps, an in-bounds selected-profile row and no nested scrolling or horizontal overflow. Initial loading uses 137 skeleton spans without changing the console frame. At 390px it reflows without horizontal or nested scrolling.
- Report checks at 390px and 320px found no page-width overflow; the full contract address wraps and Refresh remains 44px tall. Methodology chapters support keyboard navigation and phone layouts. Browser error log was empty.
- The final naming pass shows Assessment / Watch and High risk / Watch / Clear support rows in the real browser. Phone arithmetic rows do not overflow. Refresh removes the report and opens the scan instrument; immediate cancellation restores the retained assessment and focus to Refresh investigation. Tablet metric rows use three columns between761px and1100px, keeping unavailable values readable.
- Local screenshots, source captures, raw receipts and comparison JSON are retained under ignored `validation/`; no credentials or runtime databases are published.

## Remaining evidence limits

Swarm's successful fresh MeiMei scan at 15:18:54 UTC returned one current holder, the same raw balances, 100% float, a Sniper flag, the same first purchase transaction and creator, and no current multi-wallet connection. It returned no overall score and used the fixed 34/46/20 TOO_EARLY branch. A later fresh job `d5ef95f40e10` failed with `blockNum not reached`; that failure is retained alongside the earlier successful response rather than claiming a same-block comparison. The old two-holder screenshot is not current ground truth.

The earlier claimed funding relationship supplied no funding transaction hash. Independent public tracing rejected the archive request; no funding edge was fabricated. Curve sell-impact modeling, complete cross-token funding history and a full historical balance replay remain unverified. Swarm identifies an EIP-1167 implementation in this report; the current independent control probes do not yet reproduce that clone identification. Current public market data for this token did not provide USD price/liquidity; missing values are not replaced with invented prices. Exact private-backend parity and outcome calibration are not claimed.

Later scans also demonstrated the bounded-history limit: once creation and first purchases leave the recent20,000-block candidate window, a cold report can retain verified current balances/custody but withhold the first-minute label if it cannot rediscover the canonical receipts. At16:20:57 UTC this produced a higher Watch allocation because timing became unresolved. The earlier verified13:41:48 transaction remains a valid historical observation, but this release does not claim durable launch-proof retrieval for every token age. It does not silently copy a past role into a newly verified history scope. Historical receipt seeding/indexing remains required to close that retrieval gap.
