# Historical investigation execution ledger

User approved persistent historical pipeline, multi-venue scope, removal of unnecessary archive state dependencies, live verification and evidence-backed results. Engine first; no design overhaul.

1. Durable SQLite job/pool checkpoints with revision leases and restart recovery.
2. Resumable canonical pool verification, factory-event discovery, receipt batches beyond64, raw-unit timing without historical decimals.
3. Discover chain/token-matching pool candidates across venues, explicit incompleteness, up to20/100 pools; no token-global launch claim from candidatefeed.
4. Background bounded work slices, pause/resume/status API, progressive verified results. Retrylimits and providerdenials remain respected.
5. Merge verified historical evidence into current report without duplicate events or lost holder/authority evidence; UI progress and controls.
6. Restart/partialfailure/rate/reorg/multi-pool tests, fulltests/build/livebrowser acceptance.

Ruling: SQLite uses installed Node24 built-in API and local .data/history.sqlite, not a new hosted service. Deployment must exclude .data and all database files.
Ruling: Discovery is a candidatefeed, not an exhaustive factoryregistry. Completion describes only enumerated pool intervals; unsupported pools stay explicit.
Ruling: User-approved history action runs bounded background slices; no new paid account or purchase is authorized. Pause and outage preserve checkpoints.

## Verification - 2026-11-01

Implemented items 1-5. Independent review and root verification: 201 tests pass; TypeScript and the deployed production build pass. Store restart, lease fencing, raw-only timing, 80-transaction continuation, reorg reset, duplicate merging, stale clocks and provider cooldowns have regression coverage.

Browser verified the live Ethereum report, start/resume/pause controls, explicit cooldown, and a persisted 20-pool WETH job. Restart retained its job ID, revision 9, scope and paused state; Resume advanced the job after restart. A subsequent public-provider rate limit preserved progress. No paid access was purchased or access restriction bypassed.

A staging live WETH scan verified pool 0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 from creation block 12376729 through 12378776, first swap 2021-05-05T22:15:01Z and first-minute end 22:16:01Z. Historical decimals were unavailable; the timing proof survived. This selected-pool result does not prove complete token history. The later deployed multi-pool batch has zero completed windows because public evidence requests were rate limited; it remains resumable rather than falsely complete.

Outstanding external coverage: an exhaustive historical venue registry, unsupported factory adapters, token-global launch attribution, and reliable provider access across every requested window. Configured RPC URLs and Bitquery integration remain server-only; account entitlements and quotas are external prerequisites where providers require them. Design work remains paused.
