# Six-factor evidence scoring implementation plan

> Execute in this chat using the existing worker assignments and test-first changes.

Goal: replace the mismatched four-category verdict with six current-holder measurements and disclosed stop rules, while preserving independent sources and fast cached searches.

Constraints: no LLM; no provider score copied into an independent report; no inferred curve described as recovered source; no zero substituted for unavailable history; preserve port 3100 and the existing interface.

1. Validate candidate factor curves against multiple public returned inputs/components and held-out reports. Save sanitized pairs and distinguish inferred equations from public rules.
2. Unify current-holder/infrastructure/connection measurements. Reject bad timestamps, conflicting shares and unsupported links, with regression tests.
3. Add bounded read-only EVM control probes and wallet activity observations. Every result includes source, anchor and limits. Transfers simulated with eth_call never establish sellability.
4. Implement six-factor scoring with explicit input provenance, point ranges for unknown factors, critical overrides and the documented 59-point soft cap. Do not emit a single precise total when missing measurements can change it.
5. Wire the independent pipeline, refresh recomputation and cache invalidation. Show the six factors, known score range and reasons in the report. Preserve historical findings separately from current-holder groups.
6. Run the complete test suite, type check, production build, real-token comparison and browser checks. Push verified changes and report any unrecoverable private-model behavior precisely.

Review focus: missing data incorrectly treated as clean; historic wallets contaminating current exposure; provider findings receiving independent attribution; unsupported AMMs receiving false impact estimates; stale snapshots preserving a favorable current verdict.

Implementation status: six-factor pipeline, bounded RPC enrichment, current-holder scope, refreshed snapshot clocks, rule precedence, range UI and cache invalidation implemented. Five inferred curves validated against57 public snapshots. Fresh curve, independent historical feature completeness and private judge parity are still unresolved; this plan does not certify full parity.
