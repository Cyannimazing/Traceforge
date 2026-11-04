# Full current-holder analysis - ZKBLAST, November 4

The user requested checking every retrievable holder while showing only the leading holders. This supersedes the earlier top-100-balance/top-15-activity scope in the [initial comparison](zkblast-validation-2026-11-04.md). TraceForge uses independent RPC evidence, with no imported Swarm holders, verdict or LLM output.

Token: Robinhood Chain `0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7`.

## Measured production result

The fresh production streaming request on port 3100 started **2026-11-04 03:00:36.974 UTC** and completed in **73.401 seconds**. Balances completed at 32.71 seconds; activity and assessment completed at 73.37 seconds.

| Measurement | Verified result |
| --- | ---: |
| Recorded positive holder accounts | 242 |
| Independently checked positive balances | 242 |
| Holding proofs, including two zero balances | 244 |
| Sum of raw balances and raw total supply | Both 1,000,000,000,000,000,000,000,000,000 |
| Infrastructure accounts set aside | 3 |
| Ordinary current holders analyzed | 239 |
| Ordinary holders selected for activity checks | 239 |
| Readable EOA account nonces | 222 |
| Verified contract accounts, activity unknown | 17 |
| Low-account-nonce observations | 69 of 222 |
| Map and initial list presentation | Top 50 |
| Historical and current addresses traced | 350 |
| Calculated score | 77/100 |
| Selected decision weight | Clear, 55.6% |
| High risk / Watch / Clear weights | 1.4% / 43.0% / 55.6% |

Every selected activity address matches an ordinary current holder. The 17 unknown rows are verified contract accounts, not failed requests or favorable invented counts. No nonce is labeled verified lifetime freshness.

Balances use safe block **105563227**, hash `0xc9a7516f875bf20b455fa3811b6a51cd4207bd9b3693f869ef75c505ab18a895`, block time **02:49:18 UTC**, retrieved **03:01:09.654 UTC**. Activity uses finalized block `0x64ab692`, hash `0x7c89569fd3f5cd4f6aefcf226585a11be4172fd6263176feb262b2f8de9844f2`, block time **02:43:16 UTC**. These are distinct states. The balance anchor was rechecked and raw integer amounts reconcile exactly to total supply.

## Actual calculation

The six unrounded point values are **12.3231018263 + 15.0519750520 + 15 + 14.5706361827 + 10 + 10 = 76.9457130610**, rounded once to **77**. Their inputs are nominal impact 0.39461496956101394, low-nonce fraction 69/222, zero recorded insider matches, top-ten group fraction 0.31431212724321056, zero recorded first-minute matches and zero recorded creator-linked exposure. Zero recorded matches do not prove absent lifetime activity.

The selected raw decision mass 0.6224593312018546 divided by total mass 1.12 yields 0.5557672600016559, displayed as **55.6%**. Pure recomputation from the saved report matches the API. This is a calculated model weight, not a calibrated probability of safety.

The nominal market scenario uses DEX liquidity $27,704.75, price $0.00009944, and largest group holdings 39,735,000.78970987 token units. With `x=L/(2P)=139303851.5687852`, impact is `1-(x/(x+q))^2`. Balanced constant-product liquidity, zero fees and successful sales are assumptions. This is not verified Uniswap V4 concentrated reserves or an executable quote. Strict evidence bounds and security/group stop rules remain separate; full historical launch/funding coverage is not established.

## Side-by-side comparison

The refreshed [Swarm ZKBLAST report](https://swarmengine.tech/t/robinhood/0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7) was captured **02:52:09.756 UTC**, before our request. It displayed price $0.0000987, liquidity $27,610.54 and history chart block 105557498. That chart block does not establish every Swarm input's anchor.

| Measurement | TraceForge | Swarm capture |
| --- | ---: | ---: |
| Recorded total | 242, balances checked | 242, reported |
| Ordinary holders analyzed / displayed | 239 / 50 | 46 / 46 |
| Readable activity cohort | 222 | 15 readable rows |
| Low-nonce proxy / reported fresh fraction | 31.08% | 20.0% |
| Score | 77 | 80 |
| Selected weight | 55.6% Clear | 65.3% OK |
| Six displayed points | 12.3 / 15.1 / 15 / 14.6 / 10 / 10 | 12.4 / 18.5 / 15 / 14.5 / 10 / 10 |

All **46/46** Swarm table addresses are independently recovered; **38/46** rounded float percentages match across these different captures. TraceForge sets aside three attributed infrastructure accounts. It retains generic contract `0x30f5069d2eb0d4b865498d101efe7e676777f730` without independent custody proof; Swarm excludes it. Our measured float denominator is **76.69352358673842%** of total supply. The expanded activity cohort, source times and exclusion policy explain the score difference. No coefficient or per-token value was changed to force parity. Broader data does not establish superior predictive accuracy.

## Defects fixed

- A creation-qualified Pons ledger nominates every positive account. Independent balances, exact ledger agreement, complete raw supply reconciliation and canonical anchor verification qualify the complete marker. Generic samples cannot unlock it.
- Full balance bursts exceeded provider capacity. Qualified reads now use five-call batches, one shared endpoint lane, at least 600 ms between starts, and a 38-second total stage bound with a two-second anchor reserve. Activity uses five-wallet batches near 250 CU/s, with a 60-second bound and three-second reserve. Outer report/stream bounds are 110 seconds, deployment budget 120 seconds. Denied full-holder batches are not retried or moved to another endpoint. [Alchemy throughput](https://www.alchemy.com/docs/reference/throughput) and [additive batch costs](https://www.alchemy.com/docs/reference/compute-unit-costs) support this pacing.
- A live run returned 242 balances but attached only 136 proofs because assembly still sliced current holders at the historical 100-holder request limit. A separate server-qualified current-holder bound preserves every verified current holder and proof while keeping historical query limits unchanged. Its regression reaches the actual scorer, including a verified zero creator balance. Cache schema 15 invalidates old assembled reports.
- Analysis, grouping and concentration retain the full inventory. Rendering and initial listing use 50. Search and flag filters run before that presentation cap. Float percentages never normalize to displayed rows.

## Verification

**890 tests passed**, zero failures; TypeScript and the final Desktop production build passed. Independent reviews checked pacing, cancellation, anchors, marker guards, raw reconciliation, assembly, refresh, stop rules and the final production artifact; they independently reproduced score 77 and the decision vector.

Browser checks on port 3100 show 242 total, 239 analyzed and exactly 50 initial table rows. Searching the originally rank-77 address `0x7d3a013ce46672ffcc130cf2bdfb86a8b04f8d04` finds its raw-balance proof; clearing search restores 50 rows. Normal search reopens the saved complete report at its token slug. At 390px and 320px, the header counts and 50 cards have no horizontal page overflow. No browser console errors were observed. Keys, local databases and private validation captures are excluded from Git.

This verifies ZKBLAST's recorded current balances and stated activity scope. Other chains/providers retain explicit enumeration/history limits. Complete wallet lifetime history and beneficial ownership are not claimed.
