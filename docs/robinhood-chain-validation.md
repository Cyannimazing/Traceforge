# Robinhood Chain and token project links

Validated on November 4, 2026. This release adds independent Robinhood Chain investigation and source-supplied project links across supported networks. It does not import Swarm scores or change the decision model.

## Network and evidence

- Robinhood Chain uses chain ID 4663. Auto detection, the manual picker, discovery and token report routes recognize the network.
- Token contract addresses must remain 20-byte EVM addresses. A 32-byte Uniswap V4 pool ID is accepted only as a market identifier, never as a contract address for RPC calls.
- Holder balances, total supply and decimals use one safe block, followed by block-hash revalidation. Contract and wallet checks retain their own finalized-block provenance. Safe and finalized are distinct states.
- The authorized Alchemy endpoint is configured only in the Desktop app's server-side `.env.local`. Public RPC returned safe block headers but rejected the corresponding historical contract state. The configured endpoint successfully served the pinned reads; no downgrade to latest state was used.
- Transfer logs supply bounded candidate addresses. Only verified positive balances become current holder rows. Failed reads remain unknown; historical addresses and verified infrastructure are counted separately.
- The official Robinhood Uniswap V4 PoolManager is set aside only after chain, deployed code and positive balance verification. Its balance represents shared custody across pools, not the selected pool's reserves or sell impact.

Official references: [Robinhood connection details](https://docs.robinhood.com/chain/connecting/), [transaction finality](https://docs.robinhood.com/chain/transaction-finality/) and [Uniswap V4 deployment registry](https://developers.uniswap.org/docs/protocols/v4/deployments).

## Live ZKBLAST result

Token: `0x3f9ff9f1d40369f99c281375bd19d6ecbebfecd7` on Robinhood Chain.

A fresh production scan requested at `2026-11-04T00:52:46.723Z` completed in 5.715 seconds with HTTP 200. The independently verified holder snapshot used safe block 105488379, hash `0x74d6d40819244f94de65678cc67c1168a357869808c28034b1fdac3b7dcf64e2`, timestamp `2026-11-04T00:41:44Z`.

| Measurement | Result |
| --- | --- |
| Candidate balances checked | 100 |
| Verified positive balances | 41 |
| Verified zero balances excluded | 59 |
| Unavailable balance reads | 0 |
| Verified infrastructure excluded from holder map/table | 1 shared PoolManager |
| Current holders displayed | 40 |
| Traced addresses, including historical evidence | 165 |
| Complete token-wide holder count | Not established |

The report displays Watch. Its 99.9% decision support comes from the existing uncertainty-allocation model, not a measured safety probability or verified accuracy rate. Lifetime wallet activity, complete creator funding, token-wide launch coverage and V4 sell impact remain unresolved. Eight GoPlus contract checks returned clear results; those checks do not resolve the missing wallet-history inputs.

Bounded log requests were unavailable during this verification. Matching provider/trade candidates were independently balance-checked instead. This establishes the reported balances within the analyzed scope, not complete historical or ownership coverage. Unsupported Robinhood Bitquery and V2 reserve/launch paths are skipped explicitly. No Sniper flag is invented without the required timing proof.

## Project metadata across tokens

The header reads logo, website and social metadata from a DEX Screener market matching both the requested chain and token. EVM addresses are matched without case sensitivity; Solana addresses retain case sensitivity. Missing metadata stays absent, and a missing or failed logo falls back to initials.

Live ZKBLAST metadata supplied [its website](https://zkblast.tech/) and [X account](https://x.com/zkblast9). Live matching-market metadata checks also returned logos, websites and social links for Ethereum Pepe (`0x6982508145454ce325ddbe47a25d4ec3d2311933`) and Solana Grokbot (`6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`). These are source-supplied project links, not verified endorsements of their destinations.

The implementation deduplicates and bounds project links, rejects unsafe schemes, credentials and malformed URLs, and removes control characters from labels. DEX Screener-branded links must use the exact approved host. Links include source attribution and safe external-window attributes. The full contract address remains visible.

## Verification

- Full suite: 813 tests passed, zero failures.
- TypeScript and production build passed.
- UI detector returned no findings for the changed components.
- Browser checks passed at desktop, 390px and 320px widths without horizontal overflow or console errors.
- Token logo loaded; project links and picker rows retain 44px touch targets. Picker menu and trigger widths match. Keyboard dismissal and responsive link wrapping were checked.
- The verified production app is served on port 3100. Credentials, local captures and generated validation artifacts are excluded from Git.
