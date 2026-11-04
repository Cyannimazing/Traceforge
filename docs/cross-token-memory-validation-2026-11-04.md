# Independent cross-token memory validation - 4 November 2026

This supersedes the cross-token-memory limitation in the earlier [holder audit](holder-inventory-validation-2026-11-04.md). Historical matches are now discovered and verified by TraceForge. No Swarm payload, group list, score or decision is consumed by the independent collector.

## Admission and calculation

- Search all eligible selected top holders, including current isolates. Independently observed native transfers can prioritize candidates; existing current connectivity is not a requirement.
- Index rows and saved records nominate events. Successful transactions, exact receipt logs, block hashes, network identity and pinned historical state are checked again before admission.
- Each participant must have signed its own prior-token activity and held at least 0.01% of that token's historical total supply. Historical balance, total supply and decimals use the same block. A complete outgoing exit can use the immediately preceding block, disclosed separately.
- A direct-token or native-funding relationship must connect the participants. Native funding precedes the recipient's token activity. Contract/service exclusions and a complete observed sender fanout of at most 20 recipients narrow admission. This does not establish common ownership or coordinated trading.
- One prior connected component intersecting at least two selected current holders is one claim. Repeated scans and receipts do not add claims. Overlapping pairs form one component; separate components or separate prior contracts remain distinct claims.
- A qualified historical match activates the existing reconstructed 59-point ceiling. Decision mass adds `min(0.5, 0.25 * qualifyingClaims)` before normalization. Component measurements and critical overrides remain unchanged. Strict incomplete search retains bounds; the explicitly conditional observed calculation counts admitted evidence only.

These are generic rules, not token-specific scores or calibrated probabilities of safety. Same-chain EVM identity is used. Configured Ethereum, Base and Robinhood Alchemy indexes are supported. Other chains, internal funding and a global historical corpus are outside this adapter.

## Independent cold discovery

The standalone collector was run without saved nominations on a retained independent SWARM holder snapshot. The retained holder capture remained dated 11:14:36 UTC; it was not presented as a newly checked current inventory. The collector independently pinned safe block `0x64fa79c`, dated 12:00 UTC, and rechecked that anchor before returning.

It took 15.46 seconds and 42 logical RPC reads. Seven transactions were verified. Two current wallet histories produced two admissible matches across these other contracts:

| Other contract | Connecting evidence | Voluntary participation |
| --- | --- | --- |
| `0x9d783133a3ff9ba27fa1605547368cf9a316341e` | Native funding `0xe1e609e08e1fb72c61116671fc0e397919be288ca020f3e6d64f8291fbbddc49` | Donor transaction `0xa2e1e2c860478d6e9547d558b2c7292565111bbf633ee7c03783618942e8c42c`; recipient `0xd550689366699b4d405439092fdf06a5884fb689a31f390c656d9a871343683a` |
| `0x25c4cfc88bf4b5cda8e6841fd1a7b1353d37f01d` | The same independently verified funding relationship | Donor `0x20945a1954d0fc85cb7dbf8b820ef3ef6ff501ac5a7c871ec6a47afea781b94f`; recipient `0x51fd1ade99e859ba6b2bef9c0f92907d2475cac96841426d4bdb268ff09f235f` |

The matching current addresses are `0x5c56009ea88a350b36f102ef4f8abb4c7fc3d4a6` and `0xd8d088ed93132e32c3de4211679ff6ecff7eeb1b`. The latter is an exact EIP-7702 delegated EOA with self-initiated activity, not an ordinary contract exclusion. The donor's exhausted native index exposed seven distinct recipients in this capture. The two matches are two contract contexts for the same wallet pair, not a claim of four unrelated people or two independent ownership groups.

Other-token activity need not precede the current token's launch: these are historical relationships as of the dated observation, not claims that funding was intended for the current launch. Actual event dates remain visible. Unsolicited token receipt alone, dust, shared execution through a router and third-party transaction initiation do not satisfy admission.

## Search and deployment boundaries

The search stops after two qualifying components saturate the existing decision term, or at its request/deadline budget. Reported scope retains how many of the selected wallets were actually profiled. No claim of complete cross-token coverage follows from saturation. Safe-head lag is disclosed using its actual timestamp; later history is not silently included.

The optional SQLite store holds bounded proof nominations for up to 30 days. It preserves verification times; every accepted cached candidate goes through fresh canonical checks. A cold or read-only deployment uses the same independent discovery path. Previous positive claims are withheld when a fresh verification fails. Historical evidence never adds current-token graph edges or changes current group counts.

All automatic EVM reads share a conservative provider lane, including concurrent history and activity work. Denied or rate-limited requests stop without credential forwarding, automatic endpoint switching or denied-request retries. This per-process lane is not a distributed account quota service across separate server instances.

References: [Swarm comparison report](https://swarmengine.tech/t/robinhood/0x72bfcf23b089403a1056fd9719c577966b941f57), [Alchemy Transfers API](https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers), [method costs](https://www.alchemy.com/docs/reference/compute-unit-costs), [account-wide throughput](https://www.alchemy.com/docs/reference/throughput).

## Full-report integration and reliability

A fresh full SWARM report captured at 12:33:09 UTC independently checked all 200 positive holder balances and reconciled total supply after exhausting 18 index pages / 17,546 transfer events. Fifty ranked balances yielded 47 eligible top wallets after three set-aside accounts. The current graph contained one documented link and 46 groups. Two historical contract-component matches qualified from two profiled wallet histories, seven canonical transactions and 42 RPC methods.

The resulting score was 59/100 and the computed decision weights were High risk 41.5%, Watch 53.8%, Clear 4.7%. The retrieved Swarm report, captured at 11:25:24 UTC, showed the same score and weights but six historical claims and 45 current groups. Two admitted memory claims already saturate the reconstructed memory contribution. This demonstrates the missing input and its effect without claiming independent reproduction of all six vendor claims, unchanged ownership between snapshots, or a learned safety probability.

The full cold report took 103.075 seconds before comparison retrieval; the standalone memory check took 15.46 seconds. These are measured timings, not a fast-search guarantee. During the ZKBLAST negative-case validation, the new memory stage initially reached the pre-existing 110-second stream cutoff after slow holder work. Both the collector and expanded wallet-activity stage now receive the remaining wall-clock scan budget, stopping by the 103-second target to reserve time for the report. The second live run identified activity as another independent late stage; a focused runtime regression confirms that the remaining budget shortens it without clearing unfinished observations. Completed evidence is preserved and unread scope stays explicit.

Browser validation also reproduced a holder-refresh regression: a failed independent RPC refresh allowed a shorter GoPlus sample to replace the verified inventory, invalidating memory membership. Such a refresh now preserves original balances, enumeration, evidence and memory timestamps and marks the holder snapshot stale. Independently successful replacement sources still replace it normally. A fresh deep-memory failure never silently inherits previous positive claims.

The final regression suite passes 1,087 tests with no skips or failures. The production build and TypeScript check pass. A separate reviewer ran 64 collector/service/refresh tests successfully and found no blocking issue. No provider credentials, private endpoint URLs or raw account configuration are committed.

## Cross-token regression cases

| Token / source snapshots | Independent result | Swarm comparison | Interpretation |
| --- | --- | --- | --- |
| SWARM, Robinhood, TraceForge 12:33 UTC / Swarm 11:25 UTC | 59/100; Watch 53.8%; two verified historical claims; 47 top wallets / 46 current groups | 59/100; CAUTION 53.8%; six claims; 47 top wallets / 45 groups | The memory cap and normalized weights agree. Different current group counts and the remaining four vendor memory claims are not asserted as reproduced. |
| ZKBLAST, Robinhood, TraceForge 12:55 UTC / Swarm 06:40 UTC | 70/100; Watch 48.6%; zero admitted memory claims in ten profiled histories; 46 top wallets / 46 groups | 81/100; OK 68.1%; zero memory claims; 46 top wallets | Negative memory case adds no cap or invented prior match. Low-nonce fraction agrees at 20%; the current conditional sell-impact input is 57.99% versus 38.54% in the six-hour-old comparison. New price/liquidity and balances are not forced to the older score. |
| Grokbot, Solana, TraceForge 12:57 UTC / Swarm 01:00 UTC | 87/100; Clear 80.1%; 19 top wallets / 19 groups | 87/100; OK 80.1%; 19 top wallets | Existing independent Solana calculation remains unchanged. Solana cross-token memory discovery is explicitly unsupported by this EVM adapter, not certified absent. |

The final ZKBLAST scan returned in 102.153 seconds including its comparison request. It independently verified 358 of 395 recorded positive accounts; raw top-rank verification qualified the bounded 46-wallet view, while the unread lower tail remained explicit. Grokbot returned its report in 15.959 seconds, 17.472 seconds including comparison. Public timestamps and market conditions can change these results.

The matcher anchors proof admission to the investigation capture, rather than a later market-only refresh timestamp. This prevents an ordinary price refresh from silently aging out a retained historical warning or assigning it a new verification time. A genuinely newer investigation must still pass the proof freshness checks.
