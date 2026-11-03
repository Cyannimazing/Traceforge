# Verdict scope audit

Audit date: 2026-11-03. Read-only analysis of the v2 analyst adapter and saved verification snapshots. No external requests, credentials or live account state were inspected. This audit does not establish that a new scan currently returns the same observations.

## Reproduced defects

### 1. Packet compression changes the decision as though blockchain evidence were missing

`src/lib/crypto-agent.ts:68` combines `omittedEvidence`, `omittedFindings` and `omittedChecks` with actual incomplete launch/source history. These are distinct conditions. The adapter deliberately selects only 60 evidence records, so adding a 61st harmless record can mechanically change an otherwise identical OK verdict to CAUTION.

Executed reproduction against `validateAgentReview`: complete scope, verified launch, no source truncation, all guards false, supplied model OK with confidence 90. With `omittedEvidence=0`, output is OK/90. With `omittedEvidence=1`, output is CAUTION/null. The saved Grok packet has 3,808 omitted evidence records.

Correction: represent packet reduction separately from source coverage. Include relevant aggregate facts and all material finding summaries, and give the analyst explicit representation limits. Packet size alone must not establish a material risk. Unsupported claims of complete history remain prohibited.

Regression: paired reports differing only by harmless excess evidence retain the same material facts and do not trigger a deterministic decision downgrade. A deliberately omitted material finding is separately surfaced as a representation gap.

### 2. Gemini's decision is constrained by the old weighted rating, rather than direct evidence guards

`src/lib/crypto-agent.ts:37,67` sets `guard.warning` from `trustRating(...).decision === CAUTION` and forcibly rejects model OK. In `trust-rating.ts`, unknown funding/activity categories earn zero weight. Therefore a low weighted score can gate the judge even without an observed material warning. Historical findings also count regardless of present-holder membership.

Correction: keep explicit sourced critical hazards, absent/stale core evidence and unresolved required controls as guards. Send measured concentration and historical findings as evidence, with their dates, amounts, current-holder membership and unknown current balances. Do not equate a composite policy threshold with a new independent fact.

Regressions: verified current controls/holders with no qualified funding history do not inherit a fixed CAUTION solely from the old score. An available sourced critical hazard remains AVOID. Missing required controls cannot become OK. Source-less or provider-reported flags must not masquerade as independently verified critical findings.

Required controls currently are Solana mint/freeze authorities; EVM honeypot, arbitrary balance changes, mintability and pausability. Qualify controls against available dated matching source records (Solana RPC authorities / GoPlus Security) and their per-check source. Preserve stale controls/holders handling.

### 3. Verified pool and quote-token information never reaches the analyst

`buildAgentPacket` omits `report.poolReserves`. The saved Grok report has a verified selected PumpSwap reserve snapshot, with `constantProductEligible=false`, `feeBps=null`, and quote-token extension limitations. Its quote mint exposes capability names including permanent delegate, default account state, pausable configuration, transfer hook and scaled UI amount. The packet only sends a generic unknown sell-impact metric, losing the concrete reason and the available reserve evidence.

Correction: include an allow-listed pool snapshot and limitations with chain, pool, token identities, finalized slot/time, provenance, reserve amounts/decimals and explicit model eligibility. Distinguish quote-token controls from the scanned token's own controls. Capability names alone do not prove abuse or even that a capability is currently exercised. Do not derive a generic constant-product result for this unsupported quote configuration.

Regression: the verified pool limitation survives model packet construction; quote controls are attributed to the quote mint, never the scanned token. Unsupported curve/fee configurations leave execution impact unknown.

## Same-token facts established from saved snapshots

`verification-crypto-live-report.json`, captured 2026-11-02T07:11:22.095Z:

- 20 raw snapshot holder rows, including pool infrastructure.
- 1,268 investigation graph addresses and 3,868 evidence records. Graph address count is not holder count.
- All current holder rows are included in the first 100 packet wallets.
- Both shared-funder findings concern two wallets each; none appears in the current holder snapshot.
- Both connected-selling findings concern two wallets each; none appears in the current holder snapshot.
- The older window covers 7 trades totaling 36,619,239.913853 tokens; the recent window covers 2 trades totaling 2,845.974562 tokens. These observed amounts are not present holdings or measured market impact.
- Wallets absent from the returned holder snapshot have unknown current balances, not proven zero balances.

`docs/grok-verdict-comparison.md` records the earlier matched snapshots: all 19 non-infrastructure holder addresses and unadjusted supply shares agree with Swarm to floating-point tolerance. Therefore 19 current holders versus many traced historical addresses is not a holder discrepancy. The four historical warning findings are genuine observations/inferences in a different scope from Swarm's present 19-holder graph.

The saved Swarm response uses the same selected PumpSwap pair. It reports quality 87/CLEAN, 19 wallets/19 hands, and a separate judge OK with avoid 0.3%, caution 19.6%, OK 80.1%, escalation enabled. Its response does not supply the reserve/fee derivation of its 27.86% dump-impact feature. Identical displayed results are not an accuracy test.

## Percentage interpretation

A single model confidence estimate cannot stand in for Swarm's separate score and three-way judge output. A normalized three-way model assessment can be displayed with its provenance and uncertainty, but normalization is not empirical calibration. Numerical safety accuracy would require held-out outcomes, a defined outcome/time horizon and calibration evaluation. This audit provides no basis to claim either system's percentage is a measured probability of safety.
