# TraceForge Engine

A token investigation workspace built with Next.js, React and TypeScript. Inspect current holders, contract authorities, funding transfers, early purchases and documented wallet connections with source evidence.

## Run locally

Requires Node.js 24.18 or newer and npm. Persistent history uses Node's built-in SQLite API.

```sh
git clone https://github.com/Cyannimazing/Traceforge.git
cd Traceforge
npm ci
cp .env.example .env.local
npm run dev -- --port 3100
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. Configure provider credentials in `.env.local` only. Open http://127.0.0.1:3100.

For a production build:

```sh
npm run build
npm start -- --port 3100
```

The server binds to localhost. A hosted deployment needs a reverse proxy with TLS, access controls, request limits and provider quota controls. Preserve the private `.data` directory across restarts. The SQLite job store expects one persistent Node server, not an ephemeral serverless filesystem or a distributed worker fleet.

## Investigation

- Independent searches on Ethereum, Base, BNB Chain and Solana, with address-specific report URLs.
- Market data from DEX Screener, contract checks from GoPlus and configured RPC providers, and supported explorer/indexed-history adapters.
- Server-only Alchemy-compatible endpoints through `SOLANA_RPC_URL`, `ETHEREUM_RPC_URL` and `BASE_RPC_URL`. Bitquery requires suitable historical access; see [configuration](docs/bitquery.md).
- A compact holder table with share, observed entry, role flags, documented connections and expandable transaction details.
- A synchronized holder map that excludes evidenced infrastructure and historical-only addresses. Links require transaction evidence; a connected group does not establish common ownership.
- Cached reports, streamed scan stages, independent market/holder refreshes, resumable historical jobs, watchlists and evidence exports.

Public SwarmEngine adapters and comparative research remain in the codebase for explicitly attributed comparisons. A SwarmEngine verdict is not an independently calculated TraceForge verdict. The default scan endpoint uses the independent investigation service.

## Verdict status

**LLM review is disabled** in `src/lib/features.ts`, including its API endpoint. Supplying a Gemini key does not enable it.

The current overall percentage is the documented [TraceForge evidence rating](docs/trust-rating.md), calculated from the report's evidence. It is not a measured probability of safety and is not SwarmEngine's private scoring formula. Passed contract checks are separate from the overall verdict. Unknown history and incomplete source coverage remain explicit.

Swarm's published six factor weights and hard/soft rules are documented in [the reconstruction audit](docs/swarm-verdict-reconstruction.md). The public frontend does not expose all factor-to-point curves or the private judge's complete normalization model. Matching a token's displayed score alone does not validate a model. This repository does not claim scoring parity or superior predictive accuracy. See the [matched-token validation](docs/swarm-analysis-validation.md) for verified differences.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests cover provenance, incomplete history, pagination/checkpoints, duplicate events, holder scope, qualified graph edges, authority controls, verdict boundaries and partial failures. Synthetic fixtures are labeled and separate from live scans. Local scan captures, credentials, databases and build artifacts are excluded from Git.

## Scope

TraceForge reads public blockchain data. It does not request wallet signing keys, execute trades, or identify legal wallet owners. Historical access and coverage depend on provider capabilities and account entitlements. Documented relationships are observations; common ownership and coordinated behavior require separate evidence and remain inferences.
