import 'server-only';
import {resolve} from 'node:path';
import {createEvmTransferArchive} from './evm-transfer-archive';
const scope=globalThis as typeof globalThis&{traceforgeEvmTransferArchive?:ReturnType<typeof createEvmTransferArchive>};
export function evmTransferArchive(){
 return scope.traceforgeEvmTransferArchive??=createEvmTransferArchive({dbPath:resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_EVM_TRANSFER_DB||'.data/evm-transfers.sqlite'),rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL}});
}
