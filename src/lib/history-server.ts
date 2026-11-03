import 'server-only';
import {resolve} from 'node:path';
import {HistoryStore} from './history-store';
import {createHistoryRunner} from './history-runner';
import {discoverHistoryPools} from './history-discovery';
import {createEvidenceClock} from './evidence-clock';
import {createPoolLaunch} from './pool-launch';
import {createRegistryDiscovery} from './registry-discovery';
import {createRegistryReader} from './registry-reader';
import {queryEvmHistory} from './sqd-history';
import type {RegistryReader} from './factory-registry';
// Lazy initialization avoids database I/O during build. State survives requests and
// development reloads; the SQLite file survives process restarts. Credentials do not.
const scope=globalThis as typeof globalThis&{traceforgeHistory?:ReturnType<typeof createHistoryRunner>};
export function historyRunner(){
 if(scope.traceforgeHistory)return scope.traceforgeHistory;
 const rpcUrls={ethereum:process.env.ETHEREUM_RPC_URL,base:process.env.BASE_RPC_URL};
 let sqdReadyAt=0;
 const alternativeLogs:RegistryReader['logs']|undefined=process.env.SQD_EVALUATION_ENABLED==='1'?async(chain,r,signal)=>{
  if(Date.now()<sqdReadyAt)throw Object.assign(Error('SQD evaluation provider cooldown.'),{retryAfterMs:sqdReadyAt-Date.now()});
  const result=await queryEvmHistory(chain,{fromBlock:r.from,toBlock:r.to,logs:[{address:[r.address],topic0:[r.topics[0]!],...(r.topics[1]?{topic1:[r.topics[1]]}:{}),...(r.topics[2]?{topic2:[r.topics[2]]}:{})}]},{signal});
  if(result.retryAfterMs)sqdReadyAt=Date.now()+result.retryAfterMs;
  if(result.through===null)throw Object.assign(Error(result.detail),{retryAfterMs:result.retryAfterMs,rangeTooLarge:result.status==='response-limit'});
  return {logs:result.logs,through:result.through,source:result.source};
 }:undefined;
 const registryStore=new HistoryStore(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_REGISTRY_DB||'.data/registry.sqlite'));
 return scope.traceforgeHistory=(createHistoryRunner({
  store:new HistoryStore(resolve(/* turbopackIgnore: true */ process.env.TRACEFORGE_HISTORY_DB||'.data/history.sqlite')),
  discover:createRegistryDiscovery({store:registryStore,reader:createRegistryReader({rpcUrls,alternativeLogs}),market:discoverHistoryPools}),
  resolveClock:createEvidenceClock(),
  verify:createPoolLaunch({rpcUrls}),
 }));
}
