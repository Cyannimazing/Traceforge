# ZKBLAST end-to-end validation - 2026-11-04

This is the initial bounded comparison. The later [full-holder follow-up](all-holder-validation-2026-11-04.md) verifies 242 balances, 239 ordinary holders, top-50 presentation and a newly calculated score.

Token: Robinhood Chain `0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7`.

Fresh public comparison: [Swarm ZKBLAST](https://swarmengine.tech/t/robinhood/0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7). TraceForge runs its independent evidence and calculation pipeline. No Swarm score, holder list or judge result is imported into its report; no LLM is enabled.

## Captured results

Swarm's fresh scan was captured at 10:03:09 Singapore time. TraceForge's request started at 10:04:55.610 and its holder source was retrieved at 10:05:01.799. These are different snapshots, not a same-block comparison.

| Measurement | TraceForge | Swarm |
| --- | ---: | ---: |
| Overall score | 78/100 | 78/100 |
| Decision label | Clear | OK |
| Selected calculated weight | 59.0% | 59.0% |
| High risk / avoid | 1.2% | 1.2% |
| Watch / caution | 39.8% | 39.8% |
| Clear / OK | 59.0% | 59.0% |
| Recorded holder accounts | 239, transfer-derived | 239, reported |
| Ordinary holders analyzed | 95 | 46 |
| Swarm table addresses recovered | All 46/46 | 46 |
| Infrastructure accounts set aside | 3, independently attributed | 4 |
| Traced addresses | 241, includes historical counterparties | Not the displayed holder count |

The 239 count comes from a validated, creation-to-safe-block Transfer ledger. It is separate from 100 independently queried candidate balances: 98 positive and two zero. The 98 positive addresses comprise 95 ordinary holders plus three infrastructure accounts, covering 95.9681643% of total supply. This is broader balance coverage, not proof of more accurate predictions.

The holder anchor was safe block 105533517, hash `0x01f1df4eae635d6194031af8bd851604a2792d6c01eb040cdd7b631960c3671d`, timestamp 01:58:20 UTC. Activity used a distinct finalized anchor, block 105526054, timestamp 01:45:36 UTC. Full hashes and raw evidence are retained in the local validation capture. Safe state is not finalized state; timestamps are not merged into an invented single simultaneous snapshot.

## Reproduced gaps and fixes

1. Recent traders were previously selected as holder candidates, missing much of the top-holder population. One bounded exact-token Transfer query now validates the canonical mint and Pons TokenLaunched receipt, orders positive ledger candidates, and independently checks same-block balances. The ledger ranks candidates; it does not replace balanceOf results. Anchor and supply reconciliation qualify the separately labeled recorded-account count.
2. The stronger receipt-backed creator identity replaced a state-only Pons identity. The observed scorer incorrectly rejected that upgrade, withholding the score. The accepted path now binds fresh source retrieval to the matching historical authority evidence, event timestamp and transaction hash. Creation time remains historical.
3. Three low-nonce holders were incorrectly skipped as contracts because they had EIP-7702 delegation code. Direct code and nonce checks confirmed all three exact 23-byte delegation designators and nonce 1. The largest ordinary holder is also delegated, nonce 723. Delegated EOAs are now recognized; arbitrary bytecode is still excluded from this EOA activity proxy.
4. Account nonce is no longer described as universally exact outgoing transaction history. EIP-7702 authorizations also increment it, and revocation can leave empty code. All EVM nonce reads therefore retain `fresh: null`. The observed score uses an explicitly named low-account-nonce proxy, not a verified Fresh flag or a lifetime-fresh hard stop.
5. The UI now distinguishes recorded total from analyzed holders, shows the calculated overall score and six numeric factor rows, and uses a bounded circular packing layout rather than ranked shelves. Addresses identify map selections instead of repetitive generic provider labels.

Reference: [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), especially delegation indicators, authorization nonce increments and code clearing.

## Actual arithmetic

| Factor | Independent input | TraceForge points | Swarm displayed points |
| --- | --- | ---: | ---: |
| Sell impact | 0.3958804769, nominal scenario | 12.2471714/30 | 12.2/30 |
| Wallet activity | 4/15 low account nonces | 16.4102564/20 | 16.4/20 |
| Insider exposure | No qualified matches in returned scope | 15/15 | 15/15 |
| Concentration | Top ten documented groups: 31.4182848% adjusted supply | 14.5745146/15 | 14.5/15 |
| Sniper exposure | No qualified first-minute matches in returned scope | 10/10 | 10/10 |
| Creator exposure | Direct creator balance read zero; no qualified recipient matches | 10/10 | 10/10 |

Sum: 78.2319424, rounded to 78. The selected decision weight is normalized from actual masses: avoid 0.0135769169, watch 0.4456667143, clear 0.6607563688; total 1.12. Clear is 58.9961044%, displayed as 59.0%. Neither 78 nor 59% is fixed per token.

The sell scenario derives nominal token-side liquidity `x = L/(2P) = 138649851.1904762` from DEX liquidity $27951.81 and price $0.0001008. The largest documented holder group owns `q = 39735000.78970987` token units. The scenario computes `1 - (x/(x+q))^2`. It assumes a balanced constant-product pool, zero fees and successful sales. This is a counterfactual for Uniswap V4, not verified concentrated reserves or an executable quote. Aggregate PoolManager token custody is never used as selected-pool reserves.

The activity proxy selects the top 15 readable non-creator EOAs by current holdings. The four low-nonce addresses match Swarm's four reported Fresh addresses. One current account remains unread/contract; 79 other readable accounts are outside this proxy's stated cap. They are not assigned invented favorable counts.

Insider, sniper and creator-linked zeros are observed-match results within returned evidence. They do not establish zero lifetime exposure. Strict evidence bounds are preserved separately; the strict complete-input score remains unestablished. Qualified security hazards and hard/soft stop rules still override the point model.

## Remaining differences

All 46 Swarm holder addresses are present; 38/46 displayed float percentages match at one decimal in these captures. TraceForge's adjusted denominator is 76.7250812% of total supply. It excludes the documented V4 PoolManager, Pons locker and burn account. Swarm also excludes `0x30f5069d2eb0d4b865498d101efe7e676777f730`, holding 0.7029288% of total supply in our snapshot, as a generic contract. TraceForge retains it as an ordinary holder because independent custody evidence is absent.

Hypothetically excluding that additional contract would produce denominator 76.0221524%, concentration points 14.4874 (14.5 displayed), and 44/46 one-decimal matches. This explains the policy difference; it is not permission to silently discard a contract wallet. No exact raw-balance, full-history, infrastructure-policy or predictive-accuracy parity is claimed.

The 59.0% is the calculated model weight for Clear under this observed-scope model. It is not an empirically calibrated probability of safety, and does not mean 59% evidence coverage.

## Verification

- Full suite: 863 tests passed, zero failures.
- TypeScript and the local production build passed.
- An independent reviewer reran 32 targeted tests and checked creator binding, EIP-7702 semantics, stop-rule precedence and count qualification.
- Browser checks use the exact ZKBLAST report on port 3100: full address and project links; overall score; six factors; separate counts; refresh returning to the connected scan instrument; map zoom/reset and wallet selection; single evidence close control and outside-click dismissal.
- Phone checks at 390px and 320px cover header actions, score, navigation, holder map and cards. The map uses a centered square camera at narrow card widths without changing holdings or node relationships.
- No browser console errors were observed in the final report. Secrets remain in server-only local environment configuration and are excluded from the repository.
