# BSC holder and verdict gap - 2026-11-03

Token: `0xf4d17f21eb7bd0a678a7450622f3bf8810f6cbee`.

The original report displayed zero holders, an empty map and Caution. GoPlus returned `holder_count: "0"` with no holder list, while reporting a positive creator balance of `880506244.862873362603061035` tokens. Treating that response as a valid empty ownership snapshot was incorrect.

## Corrected retrieval

- A bounded BSC fallback discovers candidates from recent token Transfer logs, the reported identities and the selected pool.
- It reads `balanceOf`, `totalSupply` and `decimals` at one finalized block and rechecks the block hash. Missing reads stay unknown. The candidate window does not establish a complete census.
- The captured scan verified 14 positive balances from 16 candidates, with no failed balance reads. Creator-address balance: 88.05062448628733% of total supply. The indexed zero count is withheld; the UI shows verified balances instead of inventing a total-holder count.
- Empty security data alone cannot erase a previous successful holder snapshot. Failed refreshes retain the last successful values with their original timestamps and a stale marker.
- Generic contract addresses remain holder accounts until their infrastructure role is established. Known pools and burn addresses are excluded from the default holder view with category-specific evidence.

## Corrected current-risk calculation

The EVM V2 adapter independently verifies chain ID, finalized block identity/time, contract bytecode, token orientation, official factory membership, pool reserves, actual pool balances, supply and the selected holders' raw balances. Ethereum and Base use configured RPC access; BSC can use documented public endpoints. Only supported Uniswap V2 and PancakeSwap V2 deployments qualify.

At block 131427757, the same-block creator-address balance was `880506244862873362603061035` raw units; the scanned-token reserve was `1977346288620950204952444`. The pool reserve equaled its actual token balance. These inputs exceed the existing 50% nominal sell-impact stop threshold under `1 - x² / (x + q)²`.

The returned verdict is **AVOID**, despite unresolved launch history. This is a hypothetical fee-free constant-product price scenario, not an executed sale, sellability test or calibrated outcome probability. Missing score factors are not assigned favorable defaults, and no fixed score or confidence percentage is substituted.

The first integrated fresh scan completed in 8.17 seconds. A supported model winner that is AVOID throughout its unresolved input range also cannot be silently relabeled Caution. Current reserve/holding evidence uses the current report clock; historical transfers retain their historical cutoff. Refresh merges carry new reserve proofs and replace old proofs when the new verification explicitly fails.

## Same-token Swarm comparison

The existing public Swarm report was scanned at **19:24:38 SGT**, with score 44, DANGER and AVOID at 77.3% model confidence. Its market snapshot showed $16,088.71 liquidity. TraceForge's independent capture at **19:50:40 SGT** used later DEX data showing $0.08 liquidity and about a 99.8% hourly price drop. Those market snapshots are more than 26 minutes apart and should not be forced to match.

Nine of Swarm's ten earlier displayed holder addresses remained in the later positive-balance snapshot; all nine matched exact raw balances in the independently retrieved reserve proof. One earlier holder was absent from the returned positive balances, while another small balance appeared. Swarm also excluded the selected DEX pool and three generic contract accounts. TraceForge excludes the proven pool while retaining the other accounts unless their infrastructure role is independently established. This explains the different visible counts; it does not establish beneficial ownership.

No Swarm verdict, score or percentage enters the independent calculation. Exact score parity, complete historical coverage and calibrated prediction accuracy are not claimed.

Primary references: [PublicNode BSC RPC](https://bsc.publicnode.com/), [BNB Chain JSON-RPC endpoints](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/), [Ethereum JSON-RPC specification](https://ethereum.org/en/developers/docs/apis/json-rpc/), [official PancakeSwap V2 deployments](https://developer.pancakeswap.finance/contracts/v2/addresses), [Uniswap V2 pool implementation](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol).
