import 'server-only';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createTransferWindow} from './transfer-window';
const scope=globalThis as typeof globalThis&{traceforgeTransferWindow?:ReturnType<typeof createTransferWindow>};
/** Same data directory as the other stores. On Vercel only the temp folder is
 * writable, so it is used when no data directory is configured. */
export function dataDirectory(){return process.env.TRACEFORGE_DATA_DIR||(process.env.VERCEL?tmpdir():'.data');}
export function transferWindowStore(){
 return scope.traceforgeTransferWindow??=createTransferWindow({dbPath:resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_TRANSFER_WINDOW_DB||join(dataDirectory(),'transfer-window.sqlite')),rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL,robinhood:process.env.ROBINHOOD_RPC_URL,bsc:process.env.BSC_RPC_URL}});
}
