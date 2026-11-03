# TraceForge Engine Implementation Plan
> Execute using executing-plans; stack and design decisions delegated by user.
**Goal:** Deliver the independent live analysis app in the user's requested Desktop folder.
**Architecture:** Next.js server routes validate inputs and fetch fixed public providers with timeouts and bounded caching. A typed client renders evidence and persists only the local watchlist.
**Tech Stack:** Next.js, React, TypeScript, CSS, Lucide, Node test runner via tsx.
**Spec:** ../../design.md
## Global constraints
No fabricated live results or inferred wallet ownership. Unknown checks must not pass. Preserve Solana case. All external links use known explorers or checked HTTPS URLs.
## Review focus
Missing security data; malformed addresses; wrong-chain/token pairs; stale asynchronous scans; storage and network failures.
## Tasks
- [x] Data: write failing tests for address validation, missing/positive security flags, holder parsing and matching token pairs; implement lib/analysis.ts and providers.ts; verify tests.
- [x] Routes: implement validated scan and discovery APIs with timeouts and cache; verify live and invalid requests.
- [x] UI: scanner, report, holders, watchlist, methodology and export; verify keyboard flows and responsive layouts.
- [x] Finish: typecheck, build, review, deliver source and launch instructions to requested directory.

Validation: 9 tests passed; TypeScript and production build passed in the requested Desktop directory. Live WETH scan returned both providers and 10 holders. Invalid input returned HTTP 400. Mobile 390px layout and watchlist persistence verified. Targeted independent review cleared the fixes.
