# Scoring and evidence validation - 4 November 2026

Fresh independent scans ran from 14:28 to 14:31 Asia/Singapore across six tokens on all five supported networks. Each returned HTTP 200. Public Swarm stored reports were retrieved separately for comparison, never supplied as production evidence or model inputs. Stored Swarm reports and current TraceForge snapshots have different capture times; matching totals are not proof of matching every underlying measurement or calibrated safety prediction.

## Live case results

| Token and network | TraceForge result | Public Swarm stored comparison | Holder comparison |
| --- | --- | --- | --- |
| Grokbot - Solana | 87/100, Clear; 80.1% calculated decision weight | 87, CLEAN; OK 80.1%, captured 09:00 Singapore | 19 top wallets and 19 documented groups on both. 17 addresses overlap; two stored addresses are outside the current top account snapshot. Six overlapping shares match at one decimal. Current balances are retained instead of copying the five-hour-old list. |
| ZKBLAST - Robinhood | 81/100, Clear; 68.1% calculated decision weight | 81, CLEAN; OK 68.1%, captured 12:29 Singapore | 242 positive balances retained, top raw 50 minus four set-aside accounts gives 46 wallets/46 documented groups. All 46 addresses match; 45 shares match at one decimal. |
| MeiMei - BNB Chain | Watch; no numerical overall score. Eight source-qualified current controls checked. | No score, TOO_EARLY; CAUTION, captured 00:04 Singapore | Both currently show the same one top external wallet after custody is set aside. Its 100% snapshot-float share matches. Swarm's stored Sniper flag is not independently re-established in the current scan: historical receipt access is denied. |
| from1kto100Mcoin - Base | Watch; no numerical overall score. Existing connected-group rule retains the 59 ceiling. | 59/RISKY; CAUTION 77.9%, captured 01:28 Singapore | Nine top wallets from ten returned balances; seven overlap the older Swarm list of 14. Blockscout returns 403; selected-pool history reaches its saved work budget. This case has not achieved holder or flag parity. |
| USDC - Solana | Source-qualified active freeze authority triggers High risk under the existing capability stop rule; three current checks completed | No stored comparison returned | Twenty owner aggregates from the current largest-token-account sample. The active freeze capability is not an accusation of misuse or a prediction of fraud. |
| WETH - Ethereum | Watch; eight current controls completed; no six-factor total established | No stored comparison returned | Ten returned holder balances. Creator/holder explorer endpoints and the selected reserve proof are unavailable. No absent value was assigned zero risk. |

Exact addresses used: Grokbot `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`; ZKBLAST `0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7`; MeiMei `0x07419f180cd9beec21e68477a71f9d92090dffff`; Base `0x1151ee0a489f58d662c543cff9fdf53ad2ffdcbf`; USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; WETH `0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2`.

## Fixes made

- Classic SPL mints previously failed the required extension-coverage gate because only Token-2022 mints emitted that check. The snapshot reader now emits a source-qualified, finalized **not applicable** result after verifying classic token-program ownership, initialized mint type and non-executable state. Unknown owners cannot pass. Token-2022 decoding remains unchanged. The USDC live scan now has `coreVerified=true`; the real freeze stop remains effective.
- A blanket `Incomplete checks` badge incorrectly represented global history gaps as current-control failures. The final verdict badge names the source condition instead, such as missing market data or an observed warning. Current control results remain available in the evidence.
- Unscored snapshots display their decision and source-specific explanation without a fabricated zero, point-progress total, completion counter or confidence headline. Unknown factor values remain explicit in Analysis details. No partial point sum is normalized to 100 or passed into the six-factor judge. Existing full observed scores and decision vectors remain unchanged.
- Conservative uncertainty allocations remain available in details, labeled as allocations. They no longer appear as a 99.9% confidence headline merely because historical inputs are unresolved. Resolved scoring weight is explicitly distinct from safety confidence, history completeness and holder coverage.
- The BNB adapter recognizes explicit archive-access denials without exposing raw upstream messages or credential-bearing URLs. Source details identify the need for an authorized archive-capable `BSC_RPC_URL`; current verified balances are preserved. Denials do not imply empty history or invalidate saved discovery hints.
- Shared site headers, icon metadata and the Open Graph logo layer use the new transparent assets. The Cyril AI maker logo is unchanged. Shared brand styles load through the root layout so standalone legal rendering also works in tests.

## Remaining limits and actionable dependencies

MeiMei's saved launch anchors still exist and both block hashes were revalidated. PublicNode rejects creation and first-buy receipt retrieval with an archive-access requirement. An authorized BNB archive endpoint supporting historical receipts and bounded `eth_getLogs` is needed to verify those flags again. Official public dataseeds do not supply the required logs; no purchase, credential forwarding or access-control bypass was performed.

Base's explorer 403 and bounded historical proof failure remain explicit. Solana's standard largest-account method supplies at most 20 token accounts, not a distinct-holder census. No complete all-chain history, universal exact score, private Swarm backend parity or calibrated safety probability is claimed. Two matching score outputs do not establish superior predictive accuracy.

Source references: [Solana token extensions](https://solana.com/docs/tokens/extensions), [largest token accounts](https://solana.com/docs/rpc/http/gettokenlargestaccounts), [BNB Chain RPC endpoints](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/), [Swarm public documentation](https://swarmengine.tech/docs). Public comparison records are timestamped; private local validation captures and credentials are excluded from Git.

## Release checks

934 tests passed, TypeScript passed, and the production build passed. Read-only review found no important issues. HTTP checks covered eight page types, five transparent icon sizes, the original Cyril AI credit, the 1200 by 630 Open Graph image, sitemap, robots and Google ownership file. Desktop and actual 320-pixel browser views verified the verdict, transparent mark, navigation and custom picker. Mobile menu opens and closes with Escape; picker trigger and menu both measured 252 pixels with six equal 44-pixel options. No horizontal overflow was observed. Browser review also caught and corrected the missing-market placeholder wrapping within narrow metric cells.

## Superseded display experiment and project token

An earlier release displayed resolved point contributions as **Score progress**, with assessed-weight and pending-factor counters. This was rejected because it resembled a completed zero score and implied ongoing work. The experiment and its helper have been removed. The final presentation described above supersedes both the partial X/Y and `/100` progress formats.

The operator designated `0xf712daf52ee4097e369488b6eb4fa3bc299ba62d` as the project token. The network resolver found code only on Robinhood among checked networks. Separate configured-RPC calls verified chain ID 4663, name **Trace Engine**, symbol **TE**, and 18 decimals at 14:53 Singapore. Navigation and footer links identify this contract and open its Robinhood explorer page. This is identity configuration, not a token-safety endorsement, and the official-token configuration is not imported by the investigation or scoring code.

## Exact $TE comparison - 15:19 Singapore

A fresh independent scan of the project token returned HTTP 200 in 8.040 seconds. Its result was compared with the same token's public Swarm record, captured at 15:14:19 Singapore and retrieved separately at 15:19:25. This is a timestamped case comparison, not identical-block proof or private backend access.

Both results contain the same three positive-balance addresses. All three local finalized balances were verified and sum to the reported raw supply. The Pons phase-0 curve holds 99.64629016% of total supply; another code contract holds one raw unit. After those accounts are set aside, `0xf5fe53335dc42400e0a9f070948cbd9912ce94c1` is the single eligible top wallet. It holds 0.3537098363% of total supply and 100% of measured snapshot float. Its finalized account nonce is 19, matching Swarm's reported transaction count. The attributed launch creator matches; its separately read current token balance is zero. Eight GoPlus control results are clear and no stop rule is established.

The independent sources returned no usable market price, liquidity, selected pool or trades. Swarm also returns `score: null`, `TOO_EARLY`, an empty factor breakdown and the reason "too few holders to judge yet." Its 34/46/20 decision split belongs to the observed fixed unscored branch. It is not a six-factor calculation and is not copied into TraceForge.

The retrieval result is consistent with an unscored snapshot, not a measured 0/100 rating. TraceForge now shows **Watch**, **Market data unavailable** and the concrete findings. Unsupported percentages stay inside Analysis details as qualified uncertainty allocations. Full calculated scores, current stop rules and measured balances are unchanged. No minimum holder count has been invented, and the project token has no scoring exemption.

Public reference: [Swarm report for the exact $TE contract](https://swarmengine.tech/t/robinhood/0xf712daf52ee4097e369488b6eb4fa3bc299ba62d). Local timestamped comparison artifacts and raw provider responses are kept outside Git.

## Later live verification and final display

The token changed while this fix was being tested. Swarm's 15:34:33 snapshot and TraceForge's 15:36:44 snapshot both contain two eligible wallets: the original wallet at about 67.5% of snapshot float and the creator at about 32.5%. TraceForge reconciled four positive balances, with two accounts set aside. The newer creator balance is no longer zero. Swarm still leaves the overall score null and labels the case TOO_EARLY. TraceForge shows Watch and the now-observed creator-exposure warning. This does not overwrite the earlier single-wallet observation or infer a numerical overall score.

Grok's fresh UI result remains 87/100, Clear, 80.1% calculated decision weight. ZKBLAST initially hit RPC verification deadlines and correctly displayed an unscored Watch snapshot. A subsequent fresh request returned 248 holder balances and a conditional score of 79, Clear, 62.2%; the normal UI Refresh investigation flow reproduced that calculated result. Swarm's comparison snapshot captured at 14:40:48 remains 81, Clear/OK, 68.1%. The newer local market snapshot has $30,177.78 liquidity and 41.21% modeled impact, versus Swarm's $27,222.37 and 38.54%. These are different-time measurements, not a claim of exact live verdict parity. The fresh local retry took 76.839 seconds, so uniform fast-scan latency is not claimed.

Final verification: 934 tests pass, TypeScript and the Desktop production build pass, and the design detector reports no findings in the changed UI files. Read-only review caught and resolved two wording issues: generic missing measurements no longer invent a trading-history cause, and uncertainty-allocation percentages cannot leak into the headline through the assessment summary. Browser checks at 1280 and actual 320 pixels confirm that rejected progress labels and counters are absent, scored values remain visible, and there is no horizontal overflow. Refresh returns to the actual scanning state. Brand, maker-credit, legal-page, sitemap, robots, ownership-file and 1200-by-630 Open Graph HTTP checks pass.
