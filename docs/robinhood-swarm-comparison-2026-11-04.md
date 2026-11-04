# Saved Swarm comparison: Robinhood ZKBLAST and Solana Grokbot

This comparison separates numerical model compatibility from independently retrieved evidence. It does not establish full Swarm parity. Swarm's displayed inputs were used offline to check arithmetic only; its balances, classifications and decision weights were not imported into the independent investigation.

## Captures and scope

All artifacts below are local validation captures, excluded from Git. The committed document records the comparison without making the test suite depend on those files.

| Capture | Time and scope |
| --- | --- |
| `validation/robinhood-chain/report-live.json` | ZKBLAST independent report requested 2026-11-04 00:52:46.723 UTC; **before** the Pons classification/candidate corrections. Safe block 105488379, block time 00:41:44 UTC. |
| `validation/robinhood-chain/swarm-zkblast-dom.txt` | Saved public Swarm UI; latest scan displayed November 4, 08:59:27 in the browser's UTC+8 timezone (00:59:27 UTC). |
| `validation/robinhood-chain/grok-reference-live.json` | Independent Grokbot report requested 2026-11-04 01:01:22.747 UTC. |
| `validation/robinhood-chain/swarm-grok-dom.txt` | Saved public Swarm UI; scan displayed November 4, 09:00:13 UTC+8 (01:00:13 UTC). |

The captures are not simultaneous. DOM percentages are rounded and do not expose raw balances; an address/rounded-percentage match must not be described as an exact raw-balance comparison.

## ZKBLAST before corrections

Token: `0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7`, Robinhood Chain.

| Layer | Independent capture | Swarm capture |
| --- | --- | --- |
| Positive snapshot balances | 41, including one verified shared PoolManager | 46 table holders plus four set-aside entries |
| Non-infrastructure table population | 40 | 46 |
| Address overlap | **13 of Swarm's 46**; 33 Swarm-only, 27 independent-only | Same comparison |
| Measured snapshot supply | 49.5579500794% including infrastructure | Not recoverable exactly from rounded DOM rows |
| Supply denominator after exclusions | 87.0367176035% | Approximately 77.0%, inferred from rounded exclusions |
| Largest shared ordinary holder | 3.9735000790% total supply; 4.5653147182% adjusted supply | 5.2% float |
| Pons locker | 8.1632653061% total supply incorrectly retained among ordinary holders | Set aside as 8.2% infrastructure |
| Other exclusions | Shared PoolManager 12.9632823965% | Shared PoolManager 13.0%, locker 8.2%, burn 1.1%, generic contract 0.7% |
| Fresh-wallet assessment | 25/40 have more than ten observed outgoing transactions; 15 remain unknown | Four fresh among 15 readable rows; 31 rows marked unread |
| Creator | GoPlus-reported contract deployment address | Different launch initiator |
| Six-factor result | Strict score unresolved; no observed-scope point score | Score 77 |
| Decision | Watch, 99.9369556827% uncertainty allocation | OK, 55.6% judge weight |

None of the 13 shared holder percentages match at one decimal under the pre-correction independent denominator. Excluding the measured Pons locker alone would produce a 78.8734522973% denominator, still different from Swarm's approximately 77.0%. A generic contract must not be excluded merely to match Swarm; its custody role requires independent evidence. The overlap gap also cannot be repaired by denominator changes.

Neither capture demonstrates complete token-wide launch coverage. The independent Robinhood path has no verified first-minute proof or supported V4 executable sell-impact model. A shared V4 PoolManager's entire balance is not selected-pool liquidity. Swarm's lack of visible sniper/insider flags is not independent proof that those behaviors are absent.

## Grokbot comparison

Token: `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`, Solana.

- Independent snapshot: 20 positive owner balances, including one current pool; 19 non-infrastructure holders. All **19/19 Swarm table addresses** occur in that independent table, with no extra independent non-infrastructure holder.
- All **19 displayed float percentages match at one decimal**. The independent denominator is 71.8338803502% after excluding the measured 28.1661196498% pool balance. Swarm displays that pool as 28.2%.
- The independently authenticated Pump creator matches Swarm's creator row. Swarm has five readable non-creator rows and thirteen unread non-creator rows; its creator row is also unread. The independent observed-scope freshness calculation likewise uses five readable non-creator holders, excluding thirteen unknown rows.
- The independent observed-scope point score is 87 and its decision vector is exactly `avoid 0.003 / caution 0.196 / ok 0.801`, matching Swarm's displayed vector. The independent strict score remains null because complete history and ownership coverage have not been established.
- The point calculation explicitly treats no retrieved early/sniper matches as observed-scope zeros, not verified global absence. Its reserve scenario assumes fee-free constant-product behavior and successful transfers; it is not an executable sell quote. Matching the point output does not remove these limitations.

## Arithmetic reproduction from observed Swarm inputs

The six factor curves are the existing bounded linear reconstruction, with respective maxima 30/20/15/15/10/10 and clear/zero thresholds: impact 0.10/0.60, fresh 0.15/0.80, insiders 0.02/0.20, concentration 0.30/0.80, snipers 0.03/0.25, creator exposure 0.02/0.15. Each contribution is `maximum × clamp((zeroAt - input)/(zeroAt - clearAt), 0, 1)`.

| Case | Displayed factor points: impact / fresh / insiders / concentration / snipers / creator | Rounded score |
| --- | --- | --- |
| ZKBLAST | 11.2 / 16.4 / 15 / 14.6 / 10 / 10 | 77 |
| Grokbot | 22.5 / 20 / 15 / 11.8 / 10 / 7.9 | 87 |

ZKBLAST's displayed inputs (impact .414, fresh .267, top-ten rounded-row sum .312, remaining three risks zero) produce 11.16/16.4/15/14.64/10/10, totaling 77.2. This agrees at the captured display precision; the top-ten sum and feature values are rounded, so it is not proof of exact hidden inputs.

Grokbot's displayed creator input .048 produces 7.84615 points if treated as exact, whereas the UI shows 7.9. This is compatible with rounded feature metadata: the independent measured creator share .0475374817 produces 7.8817322. Its independently measured factors produce 22.5242949/20/15/11.7610543/10/7.8817322, totaling 87.1670814; every one-decimal factor matches. Do not report .048 as an exact raw input or call this rounding difference a model defect.

With the captured security/memory inputs zero and dump impact below .5, judge masses are `A = sigmoid((48 - score)/7)`, `O = sigmoid((score - 74)/6)`, `C = 1.12 - A - O`, normalized by 1.12. Rounding each output to three decimals reproduces both vectors exactly:

| Score | Avoid | Caution | OK |
| --- | --- | --- | --- |
| 77 | .014 | .430 | .556 |
| 87 | .003 | .196 | .801 |

This validates arithmetic for the observed inputs. It does not validate risk calibration, future outcomes, every private Swarm branch, or independent retrieval parity. No LLM is required or used for these calculations.

## Correction verification and remaining work

The saved `pons-state-probe.json` is an independent RPC probe, not a Swarm lookup. It records chain 4663, code present at the documented factory, exact requested token with `exists=true`, and a rechecked block hash at block 105495960 (00:54:25 UTC). Its `deployer` matches Swarm's launch initiator; this explains the earlier GoPlus deployment-address disagreement. A state record is not a creation transaction or first-minute timing proof.

Pons role qualification, candidate-cap accounting and retention of relevant verified-zero evidence were subsequently corrected. The following production capture verifies the resulting report rather than treating the adapter probe as an end-to-end result.

Official chain/protocol references: [Robinhood connection details](https://docs.robinhood.com/chain/connecting/), [Robinhood finality](https://docs.robinhood.com/chain/transaction-finality/), [Uniswap V4 deployments](https://developers.uniswap.org/docs/protocols/v4/deployments), and [V4 PoolManager custody model](https://developers.uniswap.org/docs/protocols/v4/concepts/poolmanager). The provider-adapter review supplies [Pons V2 documentation](https://docs.ponsfamily.com/v2) and the [verified factory source and ABI](https://sourcify.dev/server/v2/contract/4663/0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e?fields=abi,sources). Its `deployer` identifies the launch initiator separately from `creatorFeeRecipient`; this creator-state verification does not itself prove locker ownership.

## After corrections: production report

`validation/robinhood-chain/report-after-comparison.json` was requested at **2026-11-04 01:21:44.329 UTC** and completed in 7.680 seconds (release-owner timing). The holder and Pons observations use safe block **105507299**, time **01:13:40 UTC**, hash `0xce93a50866099d77c8f8b0faf9be56b90310453c537f1438f603e584c751e40c`, rechecked after the reads. The comparison below still uses the earlier saved Swarm DOM; no fresh Swarm job or simultaneous state is claimed.

| Measurement | Verified after-correction result |
| --- | --- |
| Candidates checked | 100; another 76 outside the bounded selection |
| Positive / zero / unavailable balance reads | 39 / 61 / 0 |
| Current infrastructure | Three: shared PoolManager, documented Pons locker, dead address |
| Current non-infrastructure holders | 36 |
| Traced addresses, including historical evidence | 172 |
| Snapshot supply measured | 49.5387723548% |
| Shared PoolManager balance | 13.0835429469% total supply |
| Pons locker balance | 8.1632653061% total supply |
| Dead-address balance | 1.1445656964% total supply |
| Adjusted denominator | 77.6086260507% of total supply |
| Overlap with earlier Swarm table | 12/46; 34 Swarm-only and 24 independent-only |
| Shared holders matching displayed float at one decimal | 11/12 |
| Largest shared ordinary holder | 5.1199206598% adjusted supply, displayed 5.1%; earlier Swarm 5.2% |
| Creator identity | Independently verified Pons launch initiator; matches Swarm's creator |
| Lifetime freshness | 21/36 exceed ten observed outgoing transactions; 15 unknown; none independently proven lifetime-fresh |
| Score and decision | Strict score null, range 12–100; no observed point score; Watch with 99.9453822349% decision weight |

The output vector is `avoid 0.0005300739817047824 / caution 0.9994538223485053 / ok 0.000016103669789871367`. This remains the uncertainty-allocation result, not Swarm's score-77 judge output or an estimated safety probability. No score was fabricated to make the headline look complete.

The official public RPC candidate leg independently matched chain and anchor, then returned 13 valid Transfer rows across four bounded 5,000-block ranges, with no rejected rows, unavailable ranges or capped responses in this run. Candidates were still independently balance-checked on the configured RPC. This recent 20,000-block window and the 100-address selection are not a full holder census, and the after-correction overlap is not higher than the earlier capture. Candidate prioritization, changing activity and differing capture times prevent interpreting that count as proof of either total coverage or regression.

The report retains 57 zero-balance evidence entries for addresses represented in the investigation, including the Pons initiator; it does not turn zero balances into current holder rows. The RPC source's 61-zero count describes all checked candidates. Direct creator risk metrics and creator-linked scoring remain unresolved because this Pons identity is authenticated state without a creation transaction; the stored zero is not used to infer zero linked exposure.

Available sources include DEX Screener, GoPlus, recent GeckoTerminal trades, the bound Pons launch state, the official Uniswap/Pons registry plus same-block code checks, and RPC balances/activity/control probes. Blockscout token/creator/holder routes still returned HTTP 403. Robinhood Bitquery remains explicitly unsupported. First-minute timing and selected V4 sell impact remain unresolved. Five ordinary holder rows carry the contract category, which is not automatically infrastructure; no Swarm generic-contract exclusion was copied to force a denominator match.

### Release verification

- Release owner reports **837 tests passed**, TypeScript passed and production build passed.
- Independent manager review ran 31 focused Pons/service/headline/risk-metric tests before the final fixes, then reran the 15 Pons-reader/headline tests after them: all passed, exit code zero.
- The Pons reader now uses the validated scan reference for future/stale block bounds while preserving local retrieval timestamps. Offset-clock and invalid-reference regressions pass.
- The uncertainty headline now says **Decision weight**, replacing the misleading “Unresolved checks” percentage label. The calculated branch's verdict confidence is presented separately from the actual overall score; unavailable scores remain “Not scored.”
- Semantic Clear/Watch/High risk colors are scoped to the assessment; this source review does not substitute for the release owner's browser checks.

### Final browser and display verification

The new production Grokbot capture at `2026-11-04T01:22:18.363Z` returns observed-scope score **87**, decision **OK** (displayed as Clear), and selected model weight **0.801**. The screen now separates **Overall score 87/100** from **Verdict confidence 80.1%**. Clear uses green, Watch amber, and High risk red within the assessment; the holder map retains its neutral studio palette. These display changes do not alter the decision calculation.

Desktop rendering was visually checked at 1280px. Actual 390px and 320px iframe viewports were then checked, including screenshots of both verdicts: neither document overflowed horizontally (380px and 310px document widths with scrollbars). Overall score, verdict, confidence and the three distribution bars remained readable without overlap. The browser viewport override did not apply reliably, so the phone proof uses these real narrow browsing contexts rather than claiming emulation succeeded. Temporary verification serving was stopped after inspection. The final Grok report browser error log was empty.

ZKBLAST's final displayed result is **Watch** with **99.9% decision weight**, and **Not scored** for its unresolved overall point score. This weight is the model's uncertainty allocation, not 99.9% confidence that the token is dangerous. Its independent holder enumeration, lifetime-wallet predicate, first-minute coverage and executable V4 sell-impact evidence still do not match Swarm's retrieved inputs. The corrected creator and exclusions therefore do not justify claiming exact verdict parity.
