import 'server-only';
import { createBitqueryClient } from './bitquery';
import { createInvestigationService } from './investigation-service';
import { scanToken } from './providers';
import { createPublicHistory } from './public-history';
import {createPonsLaunchRecord} from './pons-launch-record';
import {createFoboLaunchRecord} from './fobo-launch-record';
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
import {CrossTokenMemoryStore} from './cross-token-memory-store';
import {createEvmCrossTokenMemory} from './evm-cross-token-memory';
import {createAlchemyReadLane} from './alchemy-read-lane';
import {createBscHolderFallback} from './bsc-holder-fallback';
import {createEvmHolderFallback} from './evm-holder-fallback';
import {createEvmPoolReserves} from './evm-pool-reserves';
import {resolve} from 'node:path';

const reportCacheScope=globalThis as typeof globalThis&{traceforgeReportCache?:ReportCache};
function savedReports(){return reportCacheScope.traceforgeReportCache??=new ReportCache(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','reports.sqlite'));}
const launchProofScope=globalThis as typeof globalThis&{traceforgeLaunchProofs?:LaunchProofStore};
function savedLaunchProofs(){return launchProofScope.traceforgeLaunchProofs??=new LaunchProofStore(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','launch-proofs.sqlite'));}

const memoryCacheScope=globalThis as typeof globalThis&{traceforgeMemoryProofs?:CrossTokenMemoryStore};
function memoryProofs(){return memoryCacheScope.traceforgeMemoryProofs??=new CrossTokenMemoryStore(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_DATA_DIR||'.data','cross-token-memory.sqlite'));}

// All automatic EVM reads share one account lane, including simultaneous scans.
// Adapter-local pacing alone cannot bound their combined provider throughput.
const alchemyReads=createAlchemyReadLane();
const rpcUrls={ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL};
const robinhoodRpc=process.env.ROBINHOOD_RPC_URL||'https://rpc.mainnet.chain.robinhood.com';
const publicHistory=createPublicHistory();
const solanaHistory=createAlchemySolanaHistory({fetcher:alchemyReads});
const evmHistory=createAlchemyEvmHistory({rpcUrls,fetcher:alchemyReads});
// Reuse the exact authorized configured endpoint; never derive or forward its key.
const robinhoodAlchemyUrl=(()=>{try{const value=process.env.ROBINHOOD_RPC_URL;if(!value)return undefined;const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='alchemy.com'||url.hostname.endsWith('.alchemy.com'))?value:undefined;}catch{return undefined;}})();
const robinhoodHistory=createAlchemyEvmHistory({fetcher:alchemyReads,rpcUrls:{robinhood:robinhoodAlchemyUrl},fundingWalletLimit:15,maxRequests:72,deadlineMs:15000,pagesPerQuery:2,fundingTransfersPerWallet:1});
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
  crossTokenMemory:createEvmCrossTokenMemory({fetcher:alchemyReads,rpcUrls:{...rpcUrls,robinhood:robinhoodAlchemyUrl},cache:{get:(chain,addresses)=>memoryProofs().get(chain,addresses),set:records=>memoryProofs().set(records)}}),
  publicScan: scanToken,
  ponsLaunch:createPonsLaunchRecord({fetcher:alchemyReads,rpcUrl:robinhoodRpc}),
  // Indexed providers may restrict log spans; bounded logs use the public node.
  foboLaunch:createFoboLaunchRecord({fetcher:alchemyReads,rpcUrl:robinhoodRpc,logRpcUrl:'https://rpc.mainnet.chain.robinhood.com'}),
  evmHolders:createEvmHolderFallback({fetcher:alchemyReads,rpcUrls:{...rpcUrls,robinhood:robinhoodRpc}}),
  bscHolders:createBscHolderFallback({fetcher:alchemyReads,rpcUrl:process.env.BSC_RPC_URL,proofStore:{get:(chain,token)=>savedLaunchProofs().get(chain,token),set:proof=>savedLaunchProofs().set(proof),delete:(chain,token)=>savedLaunchProofs().delete(chain,token)}}),
  evmPoolReserves:(chain,pool,token,options)=>createEvmPoolReserves({fetcher:alchemyReads,rpcUrl:chain==='bsc'?process.env.BSC_RPC_URL:rpcUrls[chain]})(chain,pool,token,options),
  enrichSnapshot:createSnapshotEnrichment({fetcher:alchemyReads,rpcUrls:{...rpcUrls,robinhood:robinhoodRpc,solana:process.env.SOLANA_RPC_URL,bsc:process.env.BSC_RPC_URL||'https://bsc-rpc.publicnode.com'}}),
  poolReserves:createSolanaPoolReserves({rpcUrl:process.env.SOLANA_RPC_URL}),
  resolveClock:createEvidenceClock(),
  publicHistory:(chain,token,options)=>publicHistory(chain,token,{...options,skipFunding:chain==='robinhood'||(chain==='ethereum'||chain==='base')&&!!rpcUrls[chain]}),
  // This phase receives the final RPC/Pons holder snapshot. Earlier explorer
  // metadata reads intentionally skip Robinhood funding to avoid stale seeds.
  historicalEvidence:(chain,token,options)=>chain==='robinhood'?(robinhoodAlchemyUrl?robinhoodHistory(chain,token,options):publicHistory(chain,token,{...options,fundingOnly:true,skipFunding:false})):chain==='solana'&&process.env.SOLANA_RPC_URL?extendedSolanaHistory(options):(chain==='ethereum'||chain==='base')&&rpcUrls[chain]?extendedEvmHistory(chain,token,options):Promise.resolve(undefined),
  solanaPublic:createSolanaPublic({rpcUrl:process.env.SOLANA_RPC_URL}),
  poolLaunch:createPoolLaunch({fetcher:alchemyReads,rpcUrls:{ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL}}),
  makeClient: (signal) => createBitqueryClient({token:process.env.BITQUERY_ACCESS_TOKEN || '',signal,maxRequests:18}),
});

// Primary verdicts are computed by TraceForge from evidence, never imported ratings.
export const investigationService = {
 ...independentInvestigationService,
 ...createSearchCoordinator((chain,token,options)=>independentInvestigationService.scan(chain,token,options)),
};
