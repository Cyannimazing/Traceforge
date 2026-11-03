# Retrieval and verdict verification - 2026-11-02

## Independent engine

The primary scan calls TraceForge's own adapters. Swarm results do not supply the independent verdict. Raw observations carry sources, timestamps and scope. Provider-indexed ERC20 transfers are not converted into receipt-verified trades or sniper labels.

## Changes

- Ethereum and Base: finalized-block-anchored ERC20 archive, durable pagination keys, raw integer amounts, duplicate suppression, cross-process leases and retry cooldowns.
- Solana: saved mint-address transaction pagination; removed the old 10,000-row cutoff. Storage safety limits remain explicit incomplete states.
- Crawler scheduling: sequential batches, hidden-tab pause, repeated-cursor backoff, no completion before the provider returns its terminal cursor, and retryable final report application.
- Holder lists separate source-identified infrastructure on every supported chain. Traced addresses remain a different count.
- Fresh snapshots recompute derived metrics. An old clear control cannot pass current verification after a refresh fails.
- Tiny SOL receipts below 0.0001 SOL remain transaction evidence but do not establish funding relationships. This conservative threshold can omit genuine small funding and is explicitly scoped to SOL.
- PumpSwap reserve parsing checks pool ownership, account layout, mint/vault identities and same-finalized-bank consistency. Verified reserves do not imply a validated price-impact model for every quote asset.

## Live evidence checked

Alchemy Ethereum WETH: 200 distinct transfers retrieved over two pages, with another cursor still present. Exact raw amounts retained; no trades inferred from transfer rows. This establishes real pagination support, not complete WETH history.

Saved Grokbot comparison used different observation times: Swarm 2026-11-01 20:49:44Z; TraceForge 22:00:07Z. Independent largest adjusted holder share was 4.6046% versus Swarm 4.5867%; creator adjusted share 3.7416% versus 3.7271%. These close measurements do not validate Swarm's private verdict algorithm or establish superior accuracy.

## Remaining limitations

- BNB Chain has no compatible authorized history archive configured.
- Full token-wide launch and current-holder acquisition histories are not established by exhausting one address index.
- API reports use bounded subsets of saved archive events; archived totals and analyzed events are different scopes.
- No calibrated numeric trust probability or recovered Swarm production model is available. Numeric display bands are 75-89 OK and 90-100 CLEAN, but a missing score stays missing.
- A larger archive can reveal new warnings; page count is not a safety score.

## First-search orchestration

A search now starts the largest configured initial scope and automatically mounts its history workers. The visible report is gated until every configured worker settles and final evidence refresh/application succeeds. Progress counts appear in the center scan status. No Continue, Resume, Expand sample or Update action is needed. Unsupported/stopped scopes are incomplete, never exhaustive. Cancel restores only a completed same-token report; stale callbacks cannot release a newer search. Browser verification covered automatic start, report suppression while hasMore remains true, cancel/research checkpoint reuse, no continuation controls, and no horizontal overflow on mobile.
