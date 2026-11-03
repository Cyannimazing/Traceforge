# Four.Meme holder and first-minute verification

Implemented independently from public BSC RPC and the [official TokenManager2 ABI](https://github.com/four-meme-community/fourmeme-docs/blob/main/abi/TokenManager2.lite.json). Swarm reports are comparison material, never engine inputs.

## Corrected behavior

- A manager-only provider snapshot triggers bounded Transfer-log candidate discovery and same-finalized-block balance verification. Shared custody is excluded only after the published BSC manager, Helper3 token membership, deployed code, positive balance and final block hash are verified. Ordinary contracts remain holders; authority roles remain separate.
- Opaque DEX identifiers such as `token:4meme` remain market metadata. They cannot become pool wallets or enter on-chain pool/reserve probes.
- Canonical TokenCreate with an exact preceding mint matching its declared supply, and TokenPurchase receipts, supply creators and observed buys. This is the published manager's launchpad creation marker, not proof of the token address's pre-event deployment state. A routed buy requires an exact manager-to-router transfer followed by exact delivery to the transaction sender; event.account alone is insufficient.
- `coverage.curveTiming` records a distinct selected-launchpad interval. Timing starts at the earliest verified purchase, not creation. Contiguous manager events cover creation through a finalized block after that purchase plus60seconds. Both indexed-event-to-receipt and receipt-to-indexed-event completeness are checked, including newly discovered receipts. Creation/window hashes are rechecked.
- Missing ranges, receipts, valid creation/mint evidence or routing withhold timing roles. Purchases must follow the creation marker, including same-block log order. Historical pre-creation eth_getCode is not required or requested for this selected-launchpad claim. Reorgs invalidate the affected records. Token-wide `launchVerified` remains false. Scoring consumes the same eligible transactions used for roles.
- Persistent report schema10 invalidates results predating custody and the scoped creation-event verification automatically.

## Same-token comparison

| Token | Independently recovered external holders | Timing result |
| --- | --- | --- |
| BSC MeiMei `0x07419f180cd9beec21e68477a71f9d92090dffff` | `0x964a...2757` and `0x6620...d86d`; approximately50.2%/49.8% of supply excluding verified custody, matching Swarm's displayed split | Both first-minute buys; first purchase13:41:48Z, one routed delivery verified |
| BSC GigaCall `0x10fa63f1dabd75189d791ac470b643fc19e5ffff` | Same two external addresses; current balances independently read | Both first-minute buys; first purchase13:21:11Z,139seconds after creation |
| Solana Chads `Ct2veu4rvWMiTtFyukHaVrpDGxuwwqbx7nn5SFiepump` | Total-supply shares1.1363973555%/.8840863149% equal Swarm's raw values; excluding97.9795163296% curve custody yields56.2438%/43.7562% float | Separate Solana curve support remains unresolved |

Live BSC holder plus curve-window validation took3.45seconds for MeiMei and2.86seconds for GigaCall. These are observed runs, not latency guarantees. Capture timestamps, raw balances, receipts, headers and proofs are retained under `validation/launchpad-comparison/`.

## Limits and checks

Candidate discovery covers at most20,000recent blocks and100addresses. Curve verification caps initial receipt candidates at32, relevant events/receipts at64, the interval at3,000blocks and adaptive log queries at8. Provider response, total request and time bounds also apply. This is not an exhaustive holder census or all-venue history.

Bonding-curve sell impact and funding-group reconstruction are not supplied by this change. Swarm reports that one MeiMei buyer funded the other, but gives an address rather than a funding transaction hash. Our bounded public trace request was explicitly rejected without archive access; no independent funding edge was fabricated.

Fourteen curve regressions cover canonical direct/routed buyers, purchase-versus-creation timing, missing ranges and receipts, unsupported routing, archive-code independence, forged or missing creation/mint evidence, same-block event ordering, finality, reorgs, adaptive splitting, service/scoring agreement and omitted events in newly loaded receipts. The last targeted curve/custody/service run passed58tests. Cache invalidation and broader refresh/scoring tests also pass. Full application build and live UI verification are recorded separately by the release workflow.


## Latest retrieval reliability check

A later public-node run rejected both historical deployment-code reads with HTTP403 / RPC-32602 archive-access errors, despite retaining the canonical receipts. The unnecessary pre-deployment dependency was removed from selected-launchpad timing; no archive restriction was bypassed. A fresh independent adapter run then completed in4.114seconds with the original first-minute proof and one current external holder, `0x6620...d86d`, correctly flagged as a first-minute buyer. The earlier `0x964a...2757` balance was zero and was not carried forward as a current holder. Manager custody was99.9791261786% of total supply; the remaining holder had0.0208738214%. Token-wide launch coverage remained false. Capture: `validation/launchpad-comparison/meimei-scoped-curve-live.json`.

Candidate requests now use at most5,000blocks each, two workers, a2-second log-request timeout and one transient retry within the unchanged10-second overall deadline. Empty RPC batches are skipped. Explicit archive failures are not retried, and failed log ranges remain unknown rather than empty or complete.


## Known-address recovery on refresh

At finalized block131455091, the manager-only report omitted buyer `0x6620...d86d` because two candidate log ranges failed. A direct read at that exact block and hash confirmed its balance was still208738214192387000000000 raw units; `0x964a...2757` was zero. The earlier purchase proof in that merged report retained an older timestamp and was not evidence of fresh cold discovery.

Refreshes now seed previously known holder addresses into the bounded verifier, with every balance read anew at the current finalized anchor. When newly verified canonical receipts reveal additional buyer or creator addresses, one bounded balance pass uses the remaining100-address capacity, the same supply/decimals/block, aggregate conservation and final hash recheck. Original snapshot time is preserved; failed reads remain unknown and a changed anchor invalidates current holdings. This cannot recover absent addresses if cold-start candidate ranges and creation/buy receipts are all unavailable.

The final direct adapter run from a manager-only input recovered manager plus `0x6620...d86d` and its selected-launchpad first-minute proof in6.166seconds. All six candidate Transfer logs were returned in that run, so it did not exercise the post-history recovery branch. That branch is separately tested with canonical receipt fixtures and omitted initial buyer candidates. Capture: `validation/launchpad-comparison/meimei-candidate-recovery-live.json`; exact-block diagnostic: `validation/launchpad-comparison/meimei-exact-block-balances.json`. The final focused holder/curve/service suite passed63tests and TypeScript checking passed.
