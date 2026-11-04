# Holder retrieval and matched-token validation - 4 November 2026

Follow-up: [independent cross-token memory validation](cross-token-memory-validation-2026-11-04.md) closes the previously missing memory input for supported configured EVM chains and records newer live snapshots. Earlier counts and prices below remain dated observations.

## Result

Robinhood token `0x72bfcf23b089403a1056fd9719c577966b941f57` now produces the same 47 top-wallet addresses and adjusted shares as the captured Swarm report. Both Swarm-displayed links have independent transaction evidence in TraceForge. An additional shared-funder relationship is also observed. No address, target count, provider score or example percentage was hardcoded into the engine.

This fixes the reproduced 10-raw / 7-top-holder fallback and its unsupported Clear score of 78. Exact private-model parity and complete historical coverage are not established.

## Changes

- Older Pons tokens previously lost creation coverage outside one recent ten-million-block query. Discovery now walks contiguous factory intervals to the canonical creation receipt, reads missing token-log intervals and splits explicit result-size limits. Missing intervals never qualify a ledger.
- Live diagnostics showed page-splitting bursts ending in HTTP 429. Public requests now share a conservative paced lane across scans, counting each JSON-RPC method in a batch. Rate denial takes priority over ambiguous size-limit wording, stops discovery and establishes a cooldown. A size-limit split is not a retry after a rate denial.
- Same-anchor `balanceOf`, supply and decimals remain authoritative. Full completeness requires exact raw-unit reconciliation. A separate typed ranking proof requires a supply-reconciled creation ledger and independent verification of every raw top-50 balance. It supports the conditional top-wallet model while smaller unread balances remain unknown. A short provider fallback cannot emit this proof.
- Funding receives final ranked external addresses, including unflagged holders. Configured Robinhood Alchemy funding checks transaction values, successful receipts and canonical block headers. It is a bounded external-native sample, not first-ever funding or internal-call coverage.
- Ledger logs nominate direct current-holder transfers. At most four transactions and 32 logs receive exact receipt, header and ending-anchor verification within the remaining holder deadline and paced lane. Failed proofs preserve verified balances. Ordinary transfers never become buys or sniper flags.
- Provider contract flags had suppressed funding inference for EIP-7702 EOAs. Fresh finalized code and positive nonce evidence can qualify EOAs before inference; raw provider assertions remain attributed evidence. Missing, conflicting, stale, reorged or zero-nonce proof does not clear exclusions.
- Large activity batches could starve controls of their shorter timeout. Expanded controls now finish their anchor check before large activity batches, within the same overall deadline and compute-unit pacing.
- Degraded fallback reports retry after 30 seconds, including after restart. Complete inventories retain normal reuse. Cache schema 19 invalidates prior interpretations.

### Production primary-index correction

The first deployed check at 10:54 UTC still returned seven top wallets: the public log route returned HTTP 429 from the deployed environment. That failure was not treated as a completed comparison or retried through another public host.

Configured Robinhood Alchemy endpoints now select the authenticated token-transfer index as their primary candidate source, before any public-RPC preflight. Fixed-safe-anchor pages are exhausted with raw-unit, ordering, duplicate, cursor and budget checks. The initial mint and official factory event are verified against an actual successful receipt and canonical headers. Index records do not acquire fabricated block hashes or become trade evidence. Current balances still require independent same-block `balanceOf`, supply and ending-anchor checks; nominated connections require separate exact receipts and headers. Rate/access denial stops the selected provider path, without public failover or retries.

The authenticated path allows 35 seconds for discovery and 60 seconds total from the original holder-stage start, with one paced endpoint lane and an anchor/proof reserve. The public route retains its existing 20/38-second bounds. Cache schema 20 invalidates earlier interpretations.

The bounded live adapter exhausted 18 pages containing 17,539 events, independently verified all 199 positive balances, reconciled 100% of same-block supply and verified four direct-transfer receipts in 47.8 seconds. The full independent report below took 92.3 seconds cold; a subsequent populated-cache check returned the same 199 balances and score in 0.11 seconds. This is not cold-speed parity with Swarm's cached scan.

## Matched-token results

Public comparison and independent production-build requests were close together, but their underlying capture times differ.

| Token | TraceForge capture UTC | Positive balances verified / ledger count | Top wallets, ours / Swarm | Independent point / output | Captured Swarm score / output |
| --- | --- | --- | --- | --- | --- |
| SWARM, Robinhood `0x72bf...1f57` | 11:14:36 | 199 / 199; all positive balances verified | 47 / 47 | 72, Watch 59.9% | 59, CAUTION 53.8% |
| ZKBLAST, Robinhood `0x3f9f...ecd7` | 11:17:06 | 203 / 348; raw top 50 verified, remaining balances unread | 46 / 46 | 70, Watch 48.6% | 81, OK 68.1% |
| Grokbot, Solana `6NaM...pump` | 10:43:49 | 20 sampled accounts/owners; census unknown | 19 / 19 | 87, Clear 80.1% | 87, OK 80.1% |

Percentages are calculated model weights, not calibrated probabilities of safety.

### SWARM addresses, links and calculation

All 47 addresses match, with no missing or additional top wallet. The maximum adjusted-share difference is below `2e-14` percentage points.

Swarm's direct link is independently supported by receipt `0x46b27a32a006145a74e37b73212bcd11635e8219ad5e97888a2209ed3d74eda0`, discovered from TraceForge's own ledger. Its other funding edge is also present. TraceForge additionally verifies 0.002 ETH and 0.05 ETH transfers from `0xea54c0e604513d479f1134449666bd91f4febf88` to two current holders. This produces 44 documented wallet groups versus Swarm's 45. An unrecognized service can explain shared funding; neither count establishes a number of people or common owners.

TraceForge's component points are approximately `21.65 + 14.36 + 15 + 0.55 + 10 + 10`, rounded to 72. Swarm reports `21.6 + 14.4 + 15 + 0.9 + 10 + 10`, also approximately 72 before its stop rule. The small concentration difference follows the extra documented group.

Swarm explicitly caps the score at 59 because three holders appeared in its cross-token memory, reporting six hits. TraceForge has not independently reproduced that dataset or matching rule. A bounded bidirectional Alchemy ERC-20 check of the largest independently connected pair returned five transfers, all in this token, and no verified other-token recurrence. This cannot justify inventing six hits or activating the provider's cap. Both outputs indicate caution, but their caps and weights remain different.

### Other snapshots and failures

ZKBLAST's Swarm capture was 06:40:48 UTC, more than four hours earlier. Forty-one top addresses overlap; five ranks differ on each side. Current liquidity, price and nonces differ too. Copying 81 would override later evidence. Its authenticated index exhausted seven pages and 6,998 events. Grokbot's Swarm capture was 01:00:13 UTC: fifteen addresses overlap and four current ranks differ on each side, despite matching score and weight.

An earlier Solana owner read returned unavailable. A focused four-read reproduction and subsequent full scans succeeded without changing parsing rules. The original generic error discarded the upstream detail, so its exact transient cause cannot be established.

## Verification and limits

1,012 tests pass with none skipped or failing; TypeScript and the Desktop production build pass. Coverage includes authenticated index exhaustion and malformed/cyclic pages, old/inactive tokens, page gaps and caps, duplicate events, canonical receipt mismatches, partial tails, missing top ranks, zero balances, provider denials without route changes, concurrent pacing, unflagged holders, delegated EOAs, refresh persistence, control starvation, cancellation and changed anchors.

The final authenticated independent SWARM report itself verifies all 199 positive balances; this is no longer substituted from a standalone capture. The earlier timed public-log snapshot checked only 177 and remains a separate historical observation. Browser verification confirms SWARM's 47 top wallets, three documented links, 44 groups, 72/100 and 59.9% Watch output, plus Grokbot's 19 top wallets, 87/100 and 80.1% Clear display. Navigation/footer token promotion was removed across eight deployed routes; the full project address and Copy remain on the home page.

Public log access is rate limited. Large inventories can exceed bounded deadlines. Ranked-prefix verification is not a complete ownership census. Complete acquisition/funding histories, internal transfers, executable V4 impact, cross-token recurrence coverage and outcome calibration remain unproven. Near-equal raw balances collapsing to equal floating-point shares can conservatively withhold prefix eligibility. Swarm's private memory and judge internals have not been recovered.

References: [Swarm methodology](https://swarmengine.tech/docs), [matched report](https://swarmengine.tech/t/robinhood/0x72bfcf23b089403a1056fd9719c577966b941f57), [Robinhood RPC](https://docs.robinhood.com/chain/connecting/), [Alchemy Transfers API](https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers).
