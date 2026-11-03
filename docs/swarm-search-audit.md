# Same-token search audit - 2026-11-02

Target: Solana Grokbot, `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`.

## Observed Swarm behavior

The retained public frontend (`../swarm-evidence/app.js`, functions `startScan`, `tokenView`, `crawlView`) checks a stored report first. A report younger than 600 seconds opens directly. Ordinary scans send `fresh:false`; a refresh can request fresh work. The UI follows a job's events and reads its result when done. The frontend says the server deduplicates; its private implementation was not inspected.

Live public verification used the same token and ordinary requests, without accessing credentials or private endpoints:

- Stored report lookup: HTTP 200 in 1,467 ms.
- Ordinary scan submission: job returned in 1,005 ms.
- Job events ended at 11,295 ms of server-reported processing time.
- Events identified 19 selected holders and one excluded infrastructure address. Seven wallet events reported entry activity; six had `tx_count:1000`, one had 92. These counts do not establish complete histories or reveal the private stopping algorithm.
- Stored prior result reported 11.5 seconds and 55 requests, with 12 unread wallets. The new job and the prior result are different snapshots.

Evidence: `verification-swarm-search.json`, `verification-swarm-job.json`, `verification-swarm-events.json`. These are observations of public outputs, not independent validation of Swarm classifications or verdicts.

## TraceForge root cause

The old browser withheld an already-produced independent report until separate archive workers exhausted every page. Each ordinary search also forced `fresh=1` and expanded scope. That disabled report reuse and turned a token lookup into a long-running archive operation.

The old browser bundle continued crawling after the server update until the open page was refreshed. An API timing alone therefore did not establish the user's visible completion time. The open preview was subsequently checked using desktop screenshots; it displayed Grokbot's report and 19 holders.

## Corrected behavior

- Search and route navigation permit reuse of recent reports; explicit Refresh investigation requests fresh analysis.
- Normal search uses a focused, bounded independent scan. It reads existing archive evidence but does not start archive pagination or wait for archive exhaustion.
- Identical requests share scan work and progress. Canceling one subscriber preserves another; canceling the last aborts the job. Explicit refresh is separate from an ordinary cache lookup.
- Clock and public-data requests start together. Solana's six funding checks run in bounded groups of three, retaining all six checks.
- The report opens when the service returns it. Original evidence timestamps, scope and gaps remain attached.

Initial corrected API measurement: 15,016 ms for an uncached report; repeat lookup under 275 ms (that measurement also included a subsequent archive-status read). It returned 3,875 evidence records, 20 holder rows including one pool, and zero Swarm sources. Archive counters remained exactly 62,900 transactions / 629 pages across this test. Timings vary with providers and are not a guaranteed UI latency. Final browser and restart-cache verification is recorded separately.
