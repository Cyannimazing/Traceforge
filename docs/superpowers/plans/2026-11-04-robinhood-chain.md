# Robinhood Chain and token project links

**Goal:** Search and investigate Robinhood Chain tokens, including ZKBLAST, and show source-supplied project links across every supported chain.

**Architecture:** Extend the existing chain registry and generic EVM readers. Treat 32-byte DEX pool IDs as market identifiers, never RPC contract addresses. Use official Robinhood chain 4663, public/configured RPC and explorer sources. Unsupported history, pool simulations and provider checks remain explicit. Reuse the black studio interface and existing accessible controls.

**Constraints:** Port 3100; independent evidence; no LLM or imported Swarm verdict; no fabricated history; no purchases; no green theme; ordinary hyphens. Existing Ethereum/Base/BNB/Solana behavior must remain valid.

- [x] Root: regression tests for Robinhood address/Auto detection, 32-byte market IDs, discovery and token routes; extend registry, resolver and picker/filter choices.
- [x] Engine worker: chain-verified RPC holders, bounded token-transfer candidate discovery, controls/activity and service wiring. Pin supply/balances/hash; preserve safe/finalized provenance and provider limits.
- [x] Provider research: verify official network and provider capabilities, actual ZKBLAST markets, accessible holders/trades/security. Keep diagnostic artifacts local and sanitized.
- [x] Root: support Robinhood public market/explorer feeds. Skip unsupported Bitquery/archive/V2/V3 history paths explicitly instead of producing empty or mismatched evidence.
- [x] Root: normalize matching-token DEX metadata into website/X/other social links and optional logo. Reject unsafe URLs, credentials and mismatched chain/token metadata; deduplicate links, preserve provider attribution and fallback initials.
- [x] Root: render responsive external links/logo in report header without shortening the contract address or changing the studio layout.
- [x] Manager: review wrong-chain responses, unsupported providers, pool-ID/address boundaries, URL handling, stale data and cross-chain regressions.
- [x] Root: run tests, TypeScript, production build and real browser checks. Scan exact ZKBLAST token on Robinhood; verify links against provider metadata, controls, positive holdings and remaining source limitations. Synchronize Desktop, serve 3100 and push the verified result.

**Acceptance:** Robinhood appears in Auto/manual search and discovery; its token-specific route produces a real independent report; token addresses remain 20-byte EVM addresses; 32-byte market IDs cannot reach address-only readers; project links across tokens come from matching metadata and remain usable on phone and desktop. Missing provider capabilities are not scored as clear.
