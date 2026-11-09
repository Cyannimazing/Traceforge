import 'server-only';
import {resolve} from 'node:path';
import {createEvmTransferArchive} from './evm-transfer-archive';
import {join} from 'node:path';
import {dataDirectory} from './transfer-window-server';
const scope=globalThis as typeof globalThis&{traceforgeEvmTransferArchive?:ReturnType<typeof createEvmTransferArchive>};
export function evmTransferArchive(){
 return scope.traceforgeEvmTransferArchive??=createEvmTransferArchive({dbPath:resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_EVM_TRANSFER_DB||join(dataDirectory(),'evm-transfers.sqlite')),rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL}});
}
