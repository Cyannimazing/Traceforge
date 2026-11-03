# SwarmEngine investigation and TraceForge reconstruction

Investigation date: 2026-11-01. Target: https://swarmengine.tech/. Original REA skill: https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md.

## Actual REA execution

REA 6.8.0 was run through npm exec with a compatible temporary Node 24.22.1 runtime. The installed system Node was left unchanged. The public main application script was analyzed as inert JavaScript; it was not executed by REA.

Parent evidence ID: `ev_2aec5c2892a89a4fd54739c6e025fdcd759370d96a99f88341a25f16ca6cb7a1`.

Application digest: `ad97ce0b6841330a19e2c528d733f54c3325ebb54ec450b8feb5240ecd1640a5`.

app.js SHA-256: `f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380`.

REA reported one parsed selected JavaScript file, zero parse failures, 21,958 visited AST nodes and 24 findings. Eight inventoried files were outside the selected semantic-analysis scope. Application and semantic coverage were partial; dynamic behavior and private server logic remain unknown. The complete evidence bundle is retained in this chat's working directory as `work/swarm-rea-evidence.json` (27,735,669 bytes).

## Direct observations

The live documentation at `/docs` describes public scan, token-history, wallet, radar, cabal and replay endpoints. It advertises the score contributions: swarm 30, fresh 20, insiders 15, concentration 15, snipers 10 and dev 10, with hard and soft rules. These are published claims, not independent verification of the underlying implementation.

The served `/assets/app.js?v=1791791361` contains a `startScan` path that POSTs token/chain to `/api/scan`, polls `/api/events`, and retrieves `/api/result`. Stored scans younger than ten minutes are reused in the frontend. Result views consume server-provided holders, links, clusters, gates, score parts, security checks and judge output. Watchlists use localStorage.

The frontend does not provide the complete backend calculation or transaction index. Source inspection establishes the request flow and expected fields, not the accuracy of its risk labels or wallet-ownership conclusions.

## Reconstruction decisions

The user chose an independent app, live public data, Next.js and the TraceForge Engine working name. The new source is written independently; SwarmEngine's scripts are research artifacts and are not bundled into the application.

DEX Screener supplies exact-chain/base-token matching market pairs. GoPlus supplies security flags and top holders on supported EVM chains. These APIs were verified with live Wrapped Ether responses. TraceForge reports these values with provenance and avoids a synthetic aggregate safety score based on missing metrics.

A bounded independent Bitquery adapter now implements sampled trades, one-hop funding, evidence-linked groups and connected-selling analysis. It is fixture-tested, but authenticated historical queries are not live-verified. Cross-token memory, historical balance replay, automated launch intake and private judge logic remain unreconstructed. See swarm-behavior-audit.md for the fresh REA follow-up and exact parity limits.

## Primary references

- https://swarmengine.tech/docs
- https://github.com/morluto/rea
- https://docs.dexscreener.com/api/reference
- https://docs.gopluslabs.io/reference/token-security-api
