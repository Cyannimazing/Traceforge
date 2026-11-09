# FOBO launch and first-minute verification

FOBO ([fobo.fun](https://fobo.fun)) is a Robinhood Chain (4663) launchpad built on Uniswap V4 hooks. TraceForge verifies FOBO tokens independently from Robinhood RPC, the [published contracts](https://github.com/fobodotfun/contracts) and the Sourcify-verified [factory](https://sourcify.dev/server/v2/contract/4663/0xd7e538e98A208fD19e46bc549FF4710C33664e18?fields=abi) and [hook](https://sourcify.dev/server/v2/contract/4663/0x0Af57F62982D03066ef917AcAd87F771c06528Ec?fields=abi) ABIs.

| Contract | Address |
| --- | --- |
| FoboFactory | `0xd7e538e98a208fd19e46bc549ff4710c33664e18` (first log at block 98531915) |
| FoboHook | `0x0af57f62982d03066ef917acad87f771c06528ec` |
| Uniswap V4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| FoboVesting | `0x51d217ecf7c0e4ebf54258444b9617d012fd7d0a` |

## Launch record (`src/lib/fobo-launch-record.ts`)

Runs on every Robinhood scan. A token is bound to FOBO only when all of these hold:

- Exactly one factory `TokenLaunched` event exists with this token as the indexed topic. The search uses bounded 10M-block windows from the factory's first block to the safe block.
- The log provider and the state provider agree on chain 4663 and the safe block hash.
- The launch receipt is successful and canonical, and contains the same event plus exactly one 1,000,000,000e18 mint to the factory before it.
- At the safe block, `factory.hook()` and `hook.factory()` point at each other.
- `hook.pools(poolId)` returns this token with `launchedAt` equal to the launch block time.
- `keccak256(abi.encode(hook.keyFor(quote, token)))` equals the event's poolId, and that pool key's hook field is FoboHook.
- Token supply is at most the launch supply (it is burnable) and decimals are 18.

When the binding holds:
- The event's `creator` becomes the creator identity, carrying the launch transaction.
- A provider creator equal to the shared factory is removed.
- The hook's current creator fee recipient is mutable and can be zero, so it is reported separately and never replaces the launcher.
- FoboHook is labeled as pool custody. PoolManager custody is labeled by the holder adapter.
- FoboVesting is labeled as a contract and counted like any other holder. It is a shared lock contract, and a lock's beneficiary is not necessarily the launcher: $FOBO's 50M lock (id 0) releases to `0xc631717e01add467e9ce96f8ca5e09f0db37386a`, not the launch creator. No creator attribution is made.

State reads use `ROBINHOOD_RPC_URL`. Logs use the public Robinhood node, because indexed providers may restrict log spans.

## First-minute window (`src/lib/fobo-history.ts`, deep scans only)

- **Window:** It starts at the earliest hook `TaxPaid` buy for the pool, which is the dev buy when one exists. Coverage runs from the launch block through the first block strictly after that buy plus 60 seconds, and the proof is withheld until that end is before the safe anchor.
- **Completeness:** Every indexed `TaxPaid` must appear in its canonical receipt, and every pool `TaxPaid` in a loaded receipt must be indexed. Separately, every PoolManager-origin token Transfer in the window must belong to an indexed taxed swap, except transfers to FOBO platform sinks. This means an omitted hook event cannot silently drop a buyer.
- **Buyer attribution:**
  - A buy needs exactly one taxed V4 `Swap` for the pool and exactly one PoolManager token delivery.
  - The delivery is followed along a single forwarding path: at most 4 hops, each the holder's only later outgoing transfer, losing at most 2 raw units to rounding.
  - The buy is attributed to the final recipient.
  - Any unresolved swap or delivery withholds the whole proof.
- **Output:** `coverage.curveTiming` with `scope: 'selected-launchpad'`, `protocol: 'fobo-v1'` and `chain: 'robinhood'`. Token-wide `launchVerified` remains false.

## Live validation 2026-11-09

$FOBO `0x000de658153f47f23e92973c8eb1e89762703676`:
- Launched in tx `0xe6d7a59e…0395eb` at block 98573047 (2026-10-26 17:02:37 UTC) by `0xc61abfd9a41889b30b32a87a7f6da4cbab36ef70`, with a 50M dev buy.
- The adapter verified 70 buys through block 98574071, with 23 in the first minute, in about 4.7 s.
- Seventy-six of the first 80 early buys were direct deliveries. The others were router or aggregator hops, including bot contracts and a 1-wei rounding loss.
- The production deep scan on port 3100 returned HTTP 200 in 80 s:
  - FOBO factory creator, first-minute proof verified, 19 sniper wallets.
  - All 19 snipers hold zero tokens now, independently checked by `balanceOf`.
  - PoolManager (67.58%) set aside; FoboVesting (15.48% of float) shown as the largest holder.
- Capture: `validation/launchpad-comparison/fobo-deep.json`.

Limits: scope is this token's FOBO pool. Other venues, beneficial ownership, automation and liquidity safety are not established.
