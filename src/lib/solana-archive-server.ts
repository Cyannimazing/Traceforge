import 'server-only';
import {resolve} from 'node:path';
import {createSolanaHistoryArchive} from './solana-history-archive';
const scope=globalThis as typeof globalThis&{traceforgeSolanaArchive?:ReturnType<typeof createSolanaHistoryArchive>};
export function solanaArchive(){
 return scope.traceforgeSolanaArchive??=(createSolanaHistoryArchive({dbPath:resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_SOLANA_HISTORY_DB||'.data/solana-history.sqlite'),rpcUrl:process.env.SOLANA_RPC_URL||''}));
}
