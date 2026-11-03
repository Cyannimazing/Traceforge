import 'server-only';
import { createBitqueryClient } from './bitquery';
import { createInvestigationService } from './investigation-service';
import { scanToken } from './providers';
import { createPublicHistory } from './public-history';
import { createSolanaPublic } from './solana-public';
import { createPoolLaunch } from './pool-launch';
import { createEvidenceClock } from './evidence-clock';
import { createAlchemySolanaHistory } from './alchemy-solana-history';
import { createAlchemyEvmHistory } from './alchemy-evm-history';
import { solanaArchive } from './solana-archive-server';
import {evmTransferArchive} from './evm-transfer-archive-server';
import {createSolanaPoolReserves} from './solana-pool-reserves';
import type {PublicHistoryOptions,PublicHistoryResult} from './public-history';
import {createSearchCoordinator} from './search-coordinator';
import {ReportCache} from './report-cache';
import {resolve} from 'node:path';

const reportCacheScope=globalThis as typeof globalThis&{traceforgeReportCache?:ReportCache};
function savedReports(){return reportCacheScope.traceforgeReportCache??=new ReportCache(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','reports.sqlite'));}

const rpcUrls={ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL};
const publicHistory=createPublicHistory();
const solanaHistory=createAlchemySolanaHistory();
const evmHistory=createAlchemyEvmHistory({rpcUrls});
async function extendedEvmHistory(chain:'ethereum'|'base',token:string,options:PublicHistoryOptions):Promise<PublicHistoryResult>{
 const current=await evmHistory(chain,token,options);
 try{
  const archived=evmTransferArchive().evidence(chain,token);if(!archived)return current;
  // Indexed transfer rows supplement transaction evidence; they never become trades.
  return {...current,transfers:[...new Map([...archived.transfers,...current.transfers].map(t=>[t.id,t])).values()],sources:[...current.sources,...archived.sources],reasons:[...current.reasons,...archived.reasons],truncated:current.truncated||archived.truncated};
 }catch{return {...current,reasons:[...current.reasons,'Saved ERC20 transfer index could not be read. Current receipt-verified evidence is preserved.']};}
}
async function extendedSolanaHistory(options:PublicHistoryOptions):Promise<PublicHistoryResult>{
 const current=await solanaHistory(options);
 try{
  const archived=solanaArchive().evidence(options.report.token);if(!archived)return current;
  return {...current,trades:[...new Map([...archived.trades,...current.trades].map(t=>[t.id,t])).values()],transfers:[...new Map([...archived.transfers,...current.transfers].map(t=>[t.id,t])).values()],identities:[...archived.identities,...current.identities],labels:[...archived.labels,...current.labels],sources:[...current.sources,...archived.sources],reasons:[...current.reasons,...archived.reasons],truncated:true};
 }catch{return {...current,reasons:[...current.reasons,'Saved extended history could not be read. Current RPC evidence is preserved.']};}
}

// Only this server boundary reads secrets. Neither fixture nor UI imports it.
export const independentInvestigationService = createInvestigationService({
  persistentCache:{get:(chain,token,limit)=>savedReports().get(chain,token,limit),set:(chain,token,limit,entry)=>savedReports().set(chain,token,limit,entry)},
  publicScan: scanToken,
  poolReserves:createSolanaPoolReserves({rpcUrl:process.env.SOLANA_RPC_URL}),
  resolveClock:createEvidenceClock(),
  publicHistory:(chain,token,options)=>publicHistory(chain,token,{...options,skipFunding:(chain==='ethereum'||chain==='base')&&!!rpcUrls[chain]}),
  historicalEvidence:(chain,token,options)=>chain==='solana'&&process.env.SOLANA_RPC_URL?extendedSolanaHistory(options):(chain==='ethereum'||chain==='base')&&rpcUrls[chain]?extendedEvmHistory(chain,token,options):Promise.resolve(undefined),
  solanaPublic:createSolanaPublic({rpcUrl:process.env.SOLANA_RPC_URL}),
  poolLaunch:createPoolLaunch({rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL}}),
  makeClient: (signal) => createBitqueryClient({token:process.env.BITQUERY_ACCESS_TOKEN || '',signal,maxRequests:18}),
});

// Primary verdicts are computed by TraceForge from evidence, never imported ratings.
export const investigationService = {
 ...independentInvestigationService,
 ...createSearchCoordinator((chain,token,options)=>independentInvestigationService.scan(chain,token,options)),
};
