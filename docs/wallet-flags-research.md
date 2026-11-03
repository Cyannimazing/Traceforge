# Wallet flags: evidence, definitions and implementation

Research date: November 4, 2026 (Asia/Singapore).

TraceForge uses short flags for beginners, with the precise rule, transactions, scope and source available in Details. Flags describe supported observations or qualified inferences. A first-minute buyer is not automatically a malicious bot, a developer, or an insider.

## What trading tools actually mean

The vocabulary is not standardized. GMGN calls early-block buyers snipers, uses DEV for the creator, and describes suspected insiders using funding and activity patterns. Its buyer documentation also acknowledges legitimate airdrops as an explanation for holdings without an observed buy. Axiom exposes Dev, Snipers, Insiders and Bundle supply metrics without publishing an exact universal detection threshold. These are useful references, not an interchangeable specification. [GMGN buyer definitions](https://docs.gmgn.ai/index/insider-traders-snipers-first-70-buyers), [GMGN flag definitions](https://docs.gmgn.ai/index/featured-icon-definition), [Axiom Pulse](https://docs.axiom.trade/axiom/finding-tokens/pulse).

TraceForge's 60-second sniper interval is an explicit product rule. It must not be described as the universally accepted trader rule or as a recovered private Swarm implementation.

## Simple flags and their evidence

| Flag | Required evidence | What does not establish it |
| --- | --- | --- |
| Creator | Successful token creation and an authenticated launchpad/factory creation event identifying the initiator or declared creator. Preserve the deploying factory separately. | Current owner, fee recipient, largest holder, relayer or a provider field alone. |
| Owner | Current contract-control state at a specified block or slot. Details identify mint, freeze, admin or upgrade powers. | Original deployment alone. A zero Ownable owner does not revoke separate permissions. |
| Dev-linked | A traversable funding or transfer path to an independently established creator. Details retain direction, timing and each supporting transaction. | Shared exchange withdrawal, shared bridge/router, or merely buying at the same time. |
| Sniper | A verified successful buy between the verified trading start and 60 seconds afterward, in the named launchpad/pool scope. Record the transaction, buyer and elapsed time. | Recent transfer, mint, airdrop, later pool migration, or missing launch coverage. Timing does not prove automation. |
| Early buyer | A verified buy and its rank within the stated observed launch interval. | Calling the first returned recent trade the first-ever buy. |
| Possible insider | Supported creator-origin allocation or pre-trading receipt, with corroborating evidence and an explanation. | No buy found in incomplete history. Presales, distributions, vesting and airdrops need consideration. |
| Fresh wallet | Sufficient address-history coverage and a stated age/activity rule. Prefer a dated first-seen observation when lifetime coverage is absent. | Low EVM nonce, low balance or a new Solana token account alone. |
| Linked wallets | Documented transfers or eligible shared funding, with direction and source. | Treating all customers of one service as one owner. |
| Same-block buyers | Successful buys with matching block/slot identifiers near launch. | Claiming verified bundle membership or common ownership from timing alone. |
| Linked sellers | At least two documented connected wallets execute verified sells within the configured rolling five-minute interval. | A token transfer, exchange deposit or declining wallet balance alone. |
| Infrastructure | Chain-specific evidence identifying a pool, exchange custody, router, bridge, burn address or launchpad vault. Keep balances separately inspectable. | Excluding every smart contract. Smart accounts and multisigs can be genuine holders. |

Dev is commonly used as shorthand for Creator. TraceForge should not invent a second independent person or flag just to display both. Dev-linked means a documented relationship, not proven developer ownership.

## Chain-specific checks

### EVM: Ethereum, Base and BNB Chain

Creation and control are separate. Ownable accepts an initial owner that can differ from the deployment sender, and ownership can change later. AccessControl and proxy administration add independent permissions. Factory creation requires decoding the relevant internal creation/event rather than assuming the outer transaction sender created every token. [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/access-control), [ERC-1967 proxy storage](https://eips.ethereum.org/EIPS/eip-1967), [Geth execution tracing](https://geth.ethereum.org/docs/developers/evm-tracing).

For Four.Meme, authenticate the manager and decode its creation and purchase events. The shared manager's custody is infrastructure; it is not an individual holder simply because a security provider reports it in `owner_address`. A later PancakeSwap opening cannot substitute for the original launchpad opening. Bitquery documents the manager and its TokenCreate fields, which provide a protocol reference independently of Swarm's labels. [Four.Meme protocol integration](https://docs.bitquery.io/docs/blockchain/BSC/four-meme-api/).

Provider creator and owner fields need distinct treatment. GoPlus's public references use inconsistent owner/creator wording for `creator_address`; retain the original field and corroborate creation rather than copying it into an identity assertion. [GoPlus token fields](https://docs.gopluslabs.io/reference/response-details), [GoPlus contract fields](https://docs.gopluslabs.io/reference/response-details-2).

### Solana

An account's owning program, a token-account owner, a mint authority and a freeze authority are different facts. Token extensions can add further powers. Resolve token-account balances to their controlling addresses and inspect supported authority fields separately. [Solana authorities](https://solana.com/docs/tokens/basics/set-authority), [permanent delegate](https://solana.com/docs/tokens/extensions/permanent-delegate), [transaction structures](https://solana.com/docs/rpc/json-structures).

Pump's current holder-reward documentation says the bonding-curve creator field can identify a protocol-controlled fee destination. That field alone is therefore insufficient to establish the human/project creator. Version-aware creation instructions and events must remain separate from current fee-recipient state. [Pump holder-reward specification](https://github.com/pump-fun/pump-public-docs/blob/main/docs/HOLDER_REWARDS_README.md).

### Bundles and linked groups

Bubblemaps distinguishes launch-time grouping from longer-lived funding/transfer relationships and acknowledges organic shared-service connections. Actual Jito bundles have a specific atomic execution definition: at most five sequential transactions within one slot. Same-slot purchases do not by themselves prove that definition. TraceForge should display timing groups and verified bundle membership separately. [Bubblemaps distinction](https://blog.bubblemaps.io/whats-the-difference-between-bundle-cluster-2/), [Jito execution specification](https://docs.jito.wtf/lowlatencytxnsend/).

## Diagnosed missing Sniper flag

Token: `0x07419f180cd9beec21e68477a71f9d92090dffff` on BNB Chain.

The independent report captured at `2026-11-03T16:50:15Z` contained the current external holder `0x662055e3e1d5171c922653f632ec08450607d86d`, but no launch-window proof or first-buy timestamp. Its recent candidate interval, blocks 131447684-131467683, excluded creation block 131442648 and first-buy block 131442686. The old successful buy receipt remained available and its block hash still matched. The missing flag came from launch discovery and proof persistence, not a disappearance of the blockchain transaction.

The inspected Swarm result still carried the buyer flag and entry transaction, but its source scan time was `2026-11-03T16:04:06Z`. That older snapshot is useful comparison evidence; it is not proof that both reports evaluated the same balances or block.

Implemented remedy: retain independently verified canonical launch anchors separately from expiring report caches, revalidate receipts and block hashes, and recover cold launch candidates through bounded protocol-aware discovery. Current holder membership and balances are still read afresh. Live classifications are not seeded from screenshots, validation fixtures or copied provider flags.

This token's on-chain Helper3 launchTime is zero. A nonzero scheduled time cannot be assumed. The cold path therefore also accepts an already-retrieved market timestamp only when chain, token, Four.Meme venue and exact token pseudo-pair all match. Both timestamp sources merely locate a bounded candidate interval; canonical chain records must establish the result.

Independent live adapter validation recovered creation block 131442648 at `2026-11-03T13:41:31Z` and first buy block 131442686 at `13:41:48Z`. The complete manager-event interval through block 131442942 was checked against receipts and rechecked canonical header hashes. The cold adapter completed in 5.865 seconds; after closing and reopening its temporary SQLite store, fresh revalidation completed in 4.078 seconds. These are two measured adapter runs, not guaranteed end-to-end search times.

- [Creation transaction](https://bscscan.com/tx/0x09d3a7592374b667b070977ca8654070fadae9f8b25d7b8aabeda5adf4fdaf5b)
- [Current holder's first-minute buy](https://bscscan.com/tx/0x92d7df427ef67a959a382b1795353816d77c242b8270ffb3843dc689c4d22e35)
- [Former holder's historical buy](https://bscscan.com/tx/0x6a0cdca63a4e621962d844f11e50437adfa802405329019637e1daa09db49a00)

Two historical buyers were recovered. Only `0x662055e3e1d5171c922653f632ec08450607d86d` had a positive current balance in these adapter runs. The former buyer's zero balance does not become a current holder. This verifies selected-launchpad timing and the current snapshot, not complete history across every venue or a universal holder census.

## Required behavior

- Keep independent, provider-reported and inferred flags distinguishable.
- Allow compatible flags to overlap; Creator, Owner and Sniper are not mutually exclusive facts.
- Attach transaction IDs, timestamp/block anchors, rule version and named venue scope.
- Deduplicate by chain, transaction and event index; deduplicate holders by resolved wallet identity.
- Separate historical buyer cohorts from current holders. Zero-balance former buyers remain historical evidence.
- Distinguish a verified absent match within complete scope from incomplete/unavailable checks.
- Retain old verified launch anchors across cache expiry and process restarts, but revalidate canonical evidence before trusting reuse.
- Do not claim that Swarm score parity or a displayed percentage establishes calibrated safety accuracy.
