import 'server-only';
import { createBitqueryClient } from './bitquery';
import { createInvestigationService } from './investigation-service';
import { scanToken } from './providers';
import { createPublicHistory } from './public-history';
import {createPonsLaunchRecord} from './pons-launch-record';
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
import {createSnapshotEnrichment} from './snapshot-enrichment';
import {ReportCache} from './report-cache';
import {LaunchProofStore} from './launch-proof-store';
import {createBscHolderFallback} from './bsc-holder-fallback';
import {createEvmHolderFallback} from './evm-holder-fallback';
import {createEvmPoolReserves} from './evm-pool-reserves';
import {resolve} from 'node:path';

const reportCacheScope=globalThis as typeof globalThis&{traceforgeReportCache?:ReportCache};
function savedReports(){return reportCacheScope.traceforgeReportCache??=new ReportCache(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','reports.sqlite'));}
const launchProofScope=globalThis as typeof globalThis&{traceforgeLaunchProofs?:LaunchProofStore};
function savedLaunchProofs(){return launchProofScope.traceforgeLaunchProofs??=new LaunchProofStore(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','launch-proofs.sqlite'));}

const rpcUrls={ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL};
const robinhoodRpc=process.env.ROBINHOOD_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
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
  ponsLaunch:createPonsLaunchRecord({rpcUrl:robinhoodRpc}),
  evmHolders:createEvmHolderFallback({rpcUrls:{...rpcUrls,robinhood:robinhoodRpc}}),
  bscHolders:createBscHolderFallback({rpcUrl:process.env.BSC_RPC_URL,proofStore:{get:(chain,token)=>savedLaunchProofs().get(chain,token),set:proof=>savedLaunchProofs().set(proof),delete:(chain,token)=>savedLaunchProofs().delete(chain,token)}}),
  evmPoolReserves:(chain,pool,token,options)=>createEvmPoolReserves({rpcUrl:chain==='bsc'?process.env.BSC_RPC_URL:rpcUrls[chain]})(chain,pool,token,options),
  enrichSnapshot:createSnapshotEnrichment({rpcUrls:{...rpcUrls,robinhood:robinhoodRpc,solana:process.env.SOLANA_RPC_URL,bsc:process.env.BSC_RPC_URL||'https://bsc-rpc.publicnode.com'}}),
  poolReserves:createSolanaPoolReserves({rpcUrl:process.env.SOLANA_RPC_URL}),
  resolveClock:createEvidenceClock(),
  publicHistory:(chain,token,options)=>publicHistory(chain,token,{...options,skipFunding:chain==='robinhood'||(chain==='ethereum'||chain==='base')&&!!rpcUrls[chain]}),
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
