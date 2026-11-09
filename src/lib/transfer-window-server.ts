import 'server-only';
import {resolve} from 'node:path';
import {createTransferWindow} from './transfer-window';
const scope=globalThis as typeof globalThis&{traceforgeTransferWindow?:ReturnType<typeof createTransferWindow>};
export function transferWindowStore(){
 return scope.traceforgeTransferWindow??=createTransferWindow({dbPath:resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_TRANSFER_WINDOW_DB||'.data/transfer-window.sqlite'),rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL,robinhood:process.env.ROBINHOOD_RPC_URL,bsc:process.env.BSC_RPC_URL}});
}
