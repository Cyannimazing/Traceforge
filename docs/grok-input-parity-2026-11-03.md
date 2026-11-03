# Grok side-by-side input audit

Token: Solana `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`. The main comparison below used saved source snapshots offline. A subsequent single public stored-report GET is recorded at the end. No active provider scan or LLM call was made.

| Snapshot | Source time (UTC) | Saved artifact |
| --- | --- | --- |
| Swarm report used for the detailed comparison | 2026-11-03 06:36:05 | `validation/swarm-2026-11-03/grok-solana-stored.json`, `body.result` |
| TraceForge independent report | 2026-11-03 08:23:34.907 | `validation/judge-live-grok.json` |

The Swarm snapshot was retrieved at 06:41:37.104. The independent report is 1 hour 47 minutes 29.907 seconds newer than the Swarm source snapshot. Small balance differences are not a synchronized retrieval comparison.

## Holders and map

Both snapshots contain the same 19 non-infrastructure holder addresses. TraceForge has 20 raw snapshot rows, excludes one observed pool row, and renders 19 current-holder graph nodes with zero qualifying connections. Swarm reports 19 holders, 19 singleton hands, zero links and 13 unread holder histories. Neither graph proves 19 distinct beneficial owners.

TraceForge's 1,256 investigation addresses include historical counterparties. They are not 1,256 current holders and should not be compared with Swarm's 19 hands. The independent raw holder snapshot covers 64.2737766% of reported total supply, including 23.9145522% observed pool infrastructure.

Both reports select PumpSwap pair `AxfHbztLN7uxmgA4d2HxpP539FzFAHNEGXYY9T3JC8v9`. Swarm's retained header reports liquidity $22,806.97, but contains no independently reproducible reserve snapshot or quote-token extension handling for its impact estimate.

## Score inputs and missing-data handling

Values below are percentages except component points. TraceForge ranges are missing-evidence bounds, not confidence intervals.

| Factor | Swarm reported input | Swarm component | TraceForge independent evidence | Reason the exact input differs or remains unknown |
| --- | ---: | ---: | --- | --- |
| Largest-hand sell impact | 25.4282661% | 20.7 / 30 | Unavailable, bound 0-100% | Reserves verified, but SPCX quote-token extensions are outside the qualified simplified constant-product model. |
| Fresh wallets | 0% | 20 / 20 | 0-68.4210526% | Six current holders have more than ten verified address transactions; 13 remain unverified. |
| Insider exposure | 0% | 15 / 15 | Unavailable, bound 0-100% | No complete qualified prelaunch/acquisition coverage; absent classified exposure is not verified zero exposure. |
| Top-ten grouped concentration | 34.8694582% | 13.5 / 15 | Observed 34.7496355%, bound 34.7496355-81.7050317% | Same current holder set, later balances; independent bound also includes unobserved supply. |
| First-minute buyer exposure | 0% | 10 / 10 | Unavailable, bound 0-100% | Launch verification is false and history is truncated. An earliest observed trade does not establish the token-wide launch boundary. |
| Creator-linked exposure | 4.5035900% | 8.1 / 10 | Observed creator 4.4881142%, bound 4.4881142-100% | Creator identified; unobserved recipients/funding and ownership scope are not established as absent. |

The largest observed adjusted holder share is 5.0207859% independently versus 5.0380985% in Swarm. Creator and concentration differences are about 0.0155 and 0.1198 percentage points respectively. Those small point-estimate differences do not explain the broad independent score range.

### Fresh denominator detail

Swarm's fresh fraction for this snapshot is zero fresh flags divided by six readable, non-dev holder rows. Thirteen rows are unread, including the creator. Five readable rows carry `tx_count: 1000`; one carries 92. These reported counts are sufficient for the greater-than-ten predicate, but 1000 must not be described as a proven exact lifetime total.

TraceForge evaluates all 19 current non-infrastructure holders. Six have at least 11 finalized address signatures and cannot meet the at-most-ten predicate. The other 13 activity probes expired at the bounded deadline and remain unknown. Only three of the six independently readable addresses overlap Swarm's six readable addresses. Thus equal readable counts do not mean identical history coverage.

TraceForge also includes the creator in its current fresh denominator, while Swarm excludes dev rows. Adopting a readable-subset denominator would be a scope change, not retrieval of the missing histories. It may be useful as a separately labeled scoped metric, but must not silently replace the all-selected-holder uncertainty bound.

### Pool qualification detail

The independent reserve snapshot is finalized at slot 464830030, observed 08:23:35.306 UTC. The selected quote mint is `SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb`. Its reported extensions include permanent delegate, default account state, pausing, confidential transfer, transfer hook and scaled UI amount. The snapshot therefore sets `constantProductEligible: false`.

This does not mean reserves are absent, nor that the scanned Grok token itself has these quote-token controls. It means the engine has not verified an executable vanilla pool-impact interpretation under that quote asset. The public Swarm report does not reveal whether it accounts for these controls. A clearly labeled mathematical reserve scenario and a verified execution estimate are different outputs.

## Reproducing Swarm's 87 score

Applying the six reconstructed curves to the retained Swarm inputs gives these unrounded points:

| Component | Reconstructed points |
| --- | ---: |
| Swarm | 20.74304031996686 |
| Fresh | 20 |
| Insiders | 15 |
| Concentration | 13.539162539029286 |
| Snipers | 10 |
| Dev | 8.07416156521928 |
| Sum | 87.35636442421543 |

Rounding the sum produces 87. The score is reproduced from public input values; it is not an independently measured score for the newer TraceForge snapshot. Swarm displays CLEAN at this value. TraceForge's user-requested 90/75 display bands would call a complete score of 87 OK, an explicit label-policy difference.

## Reproducing the 80.1% decision weight

The retained Swarm judge has score 87, security feature zero, memory hits zero, dump impact below 50%, and no DANGER band. Therefore the reconstructed additional avoid mass is zero. With `sigmoid(x) = 1 / (1 + exp(-x))`:

```text
avoidMass   = sigmoid((48 - 87) / 7) = 0.003790617322036654
okMass      = sigmoid((87 - 74) / 6) = 0.8972159750827483
cautionMass = 1.12 - avoidMass - okMass = 0.21899340759521524
totalMass   = 1.12
```

Normalizing unrounded masses yields 0.3384479752% avoid, 19.5529828210% caution and 80.1085692038% OK. Rounded as Swarm returns them: **0.3% / 19.6% / 80.1%, decision OK**. Confidence is the selected normalized weight, 0.801. Swarm's OK escalation threshold is 0.9, so this report explicitly has `escalate: true` and route `escalate: needs words (LLM / human)`.

The formula's input/output reconstruction is documented separately in [the judge audit](swarm-judge-reconstruction-2026-11-03.md). These are deterministic model weights, not a measured 80.1% probability of safety. Fresh/sniper/insider values influence this branch through the aggregate score; the retained evidence row is `score 87` alone. Public input/output agreement does not reveal training or prove outcome calibration.

## What the independent snapshot actually supports

Its saved exact score and exact judge confidence are null. The six-factor range is 4-97; saved judge weights are intervals rather than a single distribution. The unresolved cross-token memory feature also widens the independent judge range. A displayed 6.9% coverage quantity must not be presented as the equivalent of Swarm's 80.1% judge weight.

This snapshot contains evidence: current holdings, creator identity, direct control observations, current activity negatives, verified reserve accounts and dated transaction history. Its missing exact score is caused by scope and qualification requirements, not absence of all evidence.

Remaining practical work is to complete the other 13 current-wallet activity probes within a controlled budget, recover qualified launch/acquisition evidence, distinguish observed-current-snapshot concentration from full-census uncertainty, qualify the pool-impact scenario, and evaluate cross-token history. These are input and scope decisions. Changing formulas to force 87 or 80.1% would not recover the missing measurements.

## Latest stored-report check

One ordinary public GET to the already observed token endpoint at 08:57:30.053 UTC returned a newer stored Swarm snapshot from **07:39:09 UTC**, already 78 minutes 21.053 seconds old at retrieval. This is not a simultaneous comparison or a newly initiated Swarm scan.

Its reported values are impact 0.2603626548764003, biggest 0.04990392856172802, concentration 0.3453928030911144, dev 0.04460945601713586, and zero fresh/insiders/snipers. It still has 19 holders, 13 unread rows, six readable non-dev rows and zero links. Displayed parts are 20.4 / 20 / 15 / 13.6 / 10 / 8.1. The current reconstructed curves yield a raw sum of **87.12342153644133**, rounding to the returned **87**. Swarm's band remains CLEAN.

The current reconstructed judge also matches the returned **OK, 0.3% avoid / 19.6% caution / 80.1% OK**, selected confidence 0.801 and escalation true. This validates the current numerical implementation against one additional retrieved snapshot's inputs; it does not validate independent input equivalence.

Sanitized source fields and the offline calculation are saved in `validation/swarm-2026-11-03/grok-latest-stored-check.json` and `validation/swarm-2026-11-03/grok-latest-model-check.json`.

## Independent observed-scope reproduction

The production `observedDecision` adapter now calculates a separately labeled conditional point result from TraceForge's own saved Grok balances, reserves and retrieved records. It produces score87 and judgeOK confidence0.801 without importing a Swarm verdict or token-specific constants. The regression fixture contains the required public observations only. Its raw conditional impact is25.6502605856%, observed top-ten grouped share34.7496355%, and creator-linked share4.4881142%. Freshness is evaluated over5 readable non-creator wallets with13 unread excluded. Both early/sniper exposure and additional cross-token memory are zero documented matches under the stated scope, not verified global absence.

This observed model leaves the strict independent input bounds unchanged. A usable source-attributed canonical history subset, current core controls, independently proven creator, at least one readable non-creator holder, matching raw token balances and finalized selected-pool reserves are required. Unsupported protocols abstain. Quote-token hooks, fees and permissions remain explicit scenario assumptions. Existing verified critical controls override the conditional model. Report, feed and API expose the same scoped decision; the strict `trustRating` remains separately available.

### Latest stored provider recheck

A single public stored-report GET at2026-11-03T08:57:30.053Z returned a newer provider source snapshot from07:39:09Z. It still reports19holders,13unread,6readable,0links, score87/CLEAN, and judgeOK with confidence0.801 and weights0.003/0.196/0.801. It was already78minutes21seconds old at retrieval, so it is not a simultaneous scan. Current reconstructed curves produce raw87.1234215364 ->87 from those inputs and exactly reproduce the displayed judge output. No active Swarm scan or LLM was called.

### Live independent validation after integration

At2026-11-03T08:59:00.202Z the independent port3100 scan completed in12.24seconds and returned observed score87, judgeOK, confidence0.801 and weights0.003/0.196/0.801. It found19 current non-infrastructure holders,8 readable non-creator histories,10 unread non-creator histories and381 qualified canonical trade records. The strict global score remains unavailable rather than being rewritten to87. No Swarm result is imported by the application model. The observed calculation is explicitly conditional on its recorded scope and nominal pool assumptions. Full suite602tests and production build passed.

The browser's subsequent scan returned18 readable non-creator holder activity checks and0 unread while retaining score87/OK80.1%. Desktop1440px and mobile390px renders have no document overflow; Analysis details is collapsed initially and browser console errors were empty. This activity predicate only establishes more than ten finalized observed transactions, not a full reconstruction of every wallet's lifetime trading history.
