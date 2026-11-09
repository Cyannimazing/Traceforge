import { validateToken, supplyShare, type Chain, type Report } from './analysis';
import { analyzeInvestigation, type InvestigationInput, type LabelRecord } from './investigation';
import { buildQuery, parseHolders, parseLabels, parseTrades, parseTransfers, parseIndexedStart, responseRowCount, TRADE_ROWS, TRANSFER_ROWS, type BitqueryClient } from './bitquery';
import type { InvestigationReport, ScanEvent } from './investigation-types';
import type { PublicHistoryOptions, PublicHistoryResult } from './public-history';
import type { SolanaPublicResult } from './solana-public';
import { mergeReportRefresh, mergeDeepReport } from './report-refresh';
import type { PoolLaunchResult } from './pool-launch';
import { getDisplayAssessment } from './verdict-summary';
import {trustRating} from './trust-rating';
import {observedDecision} from './observed-decision';
import {buildVerdictOutput} from './verdict-output';
import {computeRiskMetrics} from './risk-metrics';
import type {SolanaPoolReserveResult} from './solana-pool-reserves';
import {clockReferenceTime,type EvidenceClock} from './evidence-clock';
import type {PersistentReportCache} from './report-cache';
import type {SnapshotEnrichment,SnapshotEnrichmentOptions} from './snapshot-enrichment';
import {FOUR_MEME_MANAGER,isBscCustodyOnly,type BscHolderFallbackResult} from './bsc-holder-fallback';
import type {EvmReserveChain,EvmPoolReserveResult} from './evm-pool-reserves';
import {EVM_HOLDER_SOURCE,type EvmHolderResult,type EvmHolderOptions} from './evm-holder-fallback';
import {PONS_FACTORY,PONS_DEPLOYER,type PonsLaunchRecordResult,type PonsLaunchOptions} from './pons-launch-record';
import type {TransferWindowResult,WindowChain} from './transfer-window-types';
import {FOBO_FACTORY,FOBO_HOOK,FOBO_VESTING,FOBO_LAUNCH_SOURCE,type FoboLaunchRecordResult,type FoboLaunchOptions} from './fobo-launch-record';
import {qualifiedEvmEoas} from './qualified-evm-eoa';
import type {CrossTokenMemory} from './cross-token-memory';
import {crossTokenMemoryEvidence} from './cross-token-memory-evidence';

export type ScanOptions = { mode?: 'deep' | 'market' | 'holders'; expanded?: boolean; fresh?: boolean; signal?: AbortSignal; onEvent?: (event: ScanEvent) => void };
type Dependencies = { crossTokenMemory?:(report:InvestigationReport,options:{signal?:AbortSignal;deadlineMs?:number;onProgress?:(detail:string)=>void})=>Promise<CrossTokenMemory>; evmPoolReserves?:(chain:EvmReserveChain,pool:string,token:string,options:{holders?:string[];signal?:AbortSignal})=>Promise<EvmPoolReserveResult>; bscHolders?:(report:Report,options:{signal?:AbortSignal;history?:boolean;candidateAddresses?:string[]})=>Promise<BscHolderFallbackResult>; enrichSnapshot?:(report:Report,options:SnapshotEnrichmentOptions)=>Promise<SnapshotEnrichment>; publicScan: (chain: Chain, token: string, options: {mode?: 'deep' | 'market' | 'holders'; signal?: AbortSignal}) => Promise<Report>; makeClient: (signal?: AbortSignal) => BitqueryClient; publicHistory?: (chain: Chain, token: string, options: PublicHistoryOptions) => Promise<PublicHistoryResult>; historicalEvidence?: (chain:Chain,token:string,options:PublicHistoryOptions)=>Promise<PublicHistoryResult|undefined>; solanaPublic?: (token:string,options:{signal?:AbortSignal})=>Promise<SolanaPublicResult>; poolLaunch?:(chain:Chain,token:string,pool:string,options:{signal?:AbortSignal;validationTime?:number;creationTimeHint?:number})=>Promise<PoolLaunchResult>; poolReserves?:(pool:string,token:string,options:{signal?:AbortSignal})=>Promise<SolanaPoolReserveResult>; resolveClock?:(options:{signal?:AbortSignal})=>Promise<EvidenceClock>; now?: () => number };
type Cached = { expires: number; report: InvestigationReport };
type HolderDependencies={evmHolders?:(report:Report,options:EvmHolderOptions)=>Promise<EvmHolderResult>;ponsLaunch?:(chain:Chain,token:string,options:PonsLaunchOptions)=>Promise<PonsLaunchRecordResult>;foboLaunch?:(chain:Chain,token:string,options:FoboLaunchOptions)=>Promise<FoboLaunchRecordResult>;transferWindow?:(chain:WindowChain,token:string,options:{signal?:AbortSignal;deadlineMs?:number})=>Promise<TransferWindowResult>};
const batch = <T>(items: T[], size: number) => Array.from({length:Math.ceil(items.length/size)},(_,i)=>items.slice(i*size,(i+1)*size));
const cacheLifetime=(report:InvestigationReport)=>{
  const holderSources=report.sources.filter(source=>/^(Bitquery|Blockscout|Solana RPC) Holders$/i.test(source.name)||source.name==='BSC RPC finalized holder balances'||source.name===EVM_HOLDER_SOURCE);
  // Responding market/security endpoints cannot turn a failed, empty holder
  // retrieval into a ten-minute result. An explicitly verified empty snapshot can.
  const emptyFailure=!report.holders.length&&holderSources.some(source=>source.status==='unavailable')&&!holderSources.some(source=>source.status==='available');
  // A measured manager balance below total supply leaves outside ownership
  // unresolved when this snapshot explicitly documents failed candidate work.
  // Read the current holder source, not old history reasons carried by a merge.
  const incompleteCustody=isBscCustodyOnly(report)&&report.holders.every(holder=>Number.isFinite(holder.share)&&holder.share>0&&holder.share<100-1e-8)&&holderSources.some(source=>source.name==='BSC RPC finalized holder balances'&&source.status==='available'&&(/Recent Transfer logs were unavailable/i.test(source.detail)||/\b[1-9]\d* (?:reads unavailable|candidates outside the 100-address bound)\b/i.test(source.detail)||/Post-history balance verification[^.]*was unavailable/i.test(source.detail)));
  // Positive provider fallback rows do not mean the independent holder read
  // succeeded. Pons launches also remain degraded until their qualified current
  // inventory is complete, regardless of how many fallback balances were read.
  const evmHolderFailure=holderSources.some(source=>source.name===EVM_HOLDER_SOURCE&&source.status==='unavailable');
  const incompletePons=report.chain==='robinhood'&&report.sources.some(source=>source.name==='Pons factory launch record'&&source.status==='available')&&report.holderEnumeration?.complete!==true;
  return emptyFailure||incompleteCustody||evmHolderFailure||incompletePons?30_000:10*60_000;
};

export function createInvestigationService(deps: Dependencies & HolderDependencies & {persistentCache?:PersistentReportCache}) {
  const cache = new Map<string, Cached>();
  const inFlight = new Map<string, number>();
  let generation = 0;
  let activeDeep = 0;
  const now = deps.now || Date.now;
  const persist=(chain:Chain,token:string,limit:number,entry:Cached)=>{
    if(entry.report.fixture||entry.report.providerAnalysis||!entry.report.sources.some(source=>source.status==='available'))return;
    try{deps.persistentCache?.set(chain,token,limit,structuredClone(entry));}catch{/* Persistence is optional; live results remain usable. */}
  };
  const store = (key: string, report: InvestigationReport,limit:number) => {
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    const entry={expires:now()+cacheLifetime(report),report:structuredClone(report)};
    cache.set(key,entry);persist(report.chain,report.token,limit,entry);
  };
  const load=(chain:Chain,token:string,limit:number)=>{
    const key=`${chain}:${chain==='solana'?token:token.toLowerCase()}:${limit}`,memory=cache.get(key);
    if(memory&&memory.expires>now())return memory;
    try{
      const entry=deps.persistentCache?.get(chain,token,limit);
      if(entry&&entry.expires>now()&&entry.expires<=now()+10*60_000&&!entry.report.fixture&&!entry.report.providerAnalysis&&entry.report.chain===chain&&(chain==='solana'?entry.report.token===token:entry.report.token.toLowerCase()===token.toLowerCase())&&entry.report.investigation.coverage.holderLimit===limit&&entry.report.sources.some(source=>source.status==='available')){
        // Older persisted entries may still carry the former ten-minute TTL.
        // Bound failed snapshots by their local capture time, never by event time.
        const expires=cacheLifetime(entry.report)===30_000?Math.min(entry.expires,Date.parse(entry.report.investigation.coverage.fetchedAt)+30_000):entry.expires;
        if(!(expires>now()))return memory;
        if(cache.size>=64)cache.delete(cache.keys().next().value!);
        const copied=structuredClone({...entry,expires});cache.set(key,copied);return copied;
      }
    }catch{/* Corrupt or unavailable persistence is a cache miss. */}
    return memory;
  };
  return {
    cachedReport(chain:Chain,token:string):InvestigationReport|null{
      const address=chain==='solana'?token:token.toLowerCase();
      const candidates=[load(chain,address,100),load(chain,address,200)].filter((entry):entry is Cached=>!!entry&&entry.expires>now());
      const latest=candidates.sort((a,b)=>Date.parse(b.report.fetchedAt)-Date.parse(a.report.fetchedAt))[0];
      return latest?structuredClone(latest.report):null;
    },
    async scan(chain: Chain, token: string, options: ScanOptions = {}): Promise<InvestigationReport> {
      options.signal?.throwIfAborted();
      const scanStarted=Date.now();
      const mode = options.mode || 'deep', limit = options.expanded ? 200 : 100;
      const key = `${chain}:${chain === 'solana' ? token : token.toLowerCase()}:${limit}`;
      // A fresh scan bypasses reuse below, but retains a saved baseline if providers fail.
      const prior = load(chain,token,limit);
      if (mode === 'deep' && !options.fresh && prior && prior.expires > now()) {
        options.onEvent?.({type:'stage',stage:'cache',status:'complete',detail:'Reusing the investigation captured within the last 10 minutes. Source timestamps are preserved.'});
        return structuredClone(prior.report);
      }
      if (mode === 'deep' && activeDeep >= 4) throw new Error('Investigation capacity reached. Retry shortly.');
      if (mode === 'deep') activeDeep++;
      const revision=++generation;
      if(mode!=='market')inFlight.set(key,revision);
      try {
        const stage = (name: string, status: 'running'|'complete'|'unavailable', detail: string) => options.onEvent?.({type:'stage',stage:name,status,detail});
        if(mode!=='market'&&deps.resolveClock)stage('clock-check','running','Checking response clocks before comparing event timestamps.');
        stage('public-data','running',mode === 'market' ? 'Refreshing market data only.' : 'Loading public market and contract evidence.');
        // Token account snapshots do not depend on market discovery. Start concurrently.
        const solanaTask=mode!=='market'&&chain==='solana'&&deps.solanaPublic ? deps.solanaPublic(token,{signal:options.signal}).catch(()=>undefined) : Promise.resolve(undefined);
        let [clock,publicReport]=await Promise.all([
          mode==='market'?undefined:deps.resolveClock?.({signal:options.signal}),
          deps.publicScan(chain,token,{mode,signal:options.signal}),
        ]);
        options.signal?.throwIfAborted();
        if(clock)stage('clock-check',clock.basis==='provider-quorum'?'complete':'unavailable',clock.basis==='provider-quorum'?'Provider comparison time established. Original capture and event times are preserved.':'Provider clocks could not be corroborated. Local timestamp checks remain active.');
        options.signal?.throwIfAborted();
        stage('public-data','complete','Public provider responses received. Unavailable fields remain unknown.');
        let bscSnapshot:BscHolderFallbackResult|undefined;
        if(chain==='bsc'&&mode!=='market'&&(!publicReport.holders.length||publicReport.holders.some(holder=>holder.address.toLowerCase()===FOUR_MEME_MANAGER))&&deps.bscHolders){
          stage('holder-rpc','running','Verifying BNB Chain holder candidates and balances at one finalized block.');
          try{bscSnapshot=await deps.bscHolders(publicReport,{signal:options.signal,history:mode==='deep',candidateAddresses:prior?.report.holders.map(h=>h.address).filter(address=>!validateToken('bsc',address)).slice(0,100)});}catch{options.signal?.throwIfAborted();}
          if(bscSnapshot){
            publicReport={...publicReport,sources:[...publicReport.sources,...bscSnapshot.sources]};
            if(bscSnapshot.holders?.length&&bscSnapshot.snapshot)publicReport={...publicReport,holders:bscSnapshot.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:null,locked:null,tag:''}]),holderCount:bscSnapshot.holderCount??null,totalSupply:bscSnapshot.totalSupply??publicReport.totalSupply};
          }
          stage('holder-rpc',bscSnapshot?.holders?.length?'complete':'unavailable',bscSnapshot?.holders?.length?`${bscSnapshot.holders.length} positive balances verified. Candidate scope and finalized block are retained.`:'Current BNB Chain holder balances could not be verified; missing values remain unknown.');
        }
        const captured = new Date(now()).toISOString();
        const input: InvestigationInput = { chain,token,holders:publicReport.holders.map(h=>({address:chain==='solana'?h.address:h.address.toLowerCase(),share:h.share})),trades:[],transfers:[],identities:publicReport.identities || [],labels:[],launchVerified:false,complete:false,reasons:[],fetchedAt:captured,holderLimit:limit,buyerLimit:limit,fundingHops:mode==='deep'?1:0,truncated:false };
        if(clock){input.clock=clock;input.reasons.push(clock.detail);}
        if(bscSnapshot){input.trades.push(...bscSnapshot.trades);input.identities=[...bscSnapshot.identities,...input.identities.filter(i=>!bscSnapshot.identities.some(d=>d.role===i.role&&d.address.toLowerCase()===i.address.toLowerCase()))];publicReport={...publicReport,identities:input.identities};input.curveTiming=bscSnapshot.curveTiming;input.earliestTradeAt=bscSnapshot.trades.map(t=>t.timestamp).sort()[0];input.labels.push(...bscSnapshot.labels);input.reasons.push(...bscSnapshot.reasons);input.truncated ||= bscSnapshot.truncated;}
        const sourceTimes: Report['sources'] = [];
        for (const h of publicReport.holders) {
          let category: LabelRecord['category'] | undefined;
          const tag = h.tag.toLowerCase();
          if (['exchange','bridge','pool','burn'].includes(tag)) category = tag as LabelRecord['category'];
          else if (h.contract) category = 'contract';
          if (category) input.labels.push({timestampBasis:'local-observation',address:h.address,category,label:h.tag || 'Provider-reported contract',source:'GoPlus Security',timestamp:publicReport.sources.find(s=>s.name==='GoPlus Security')?.fetchedAt || publicReport.fetchedAt});
        }
        const selectedPool=publicReport.market?.pairAddress&&!validateToken(chain,publicReport.market.pairAddress)?publicReport.market.pairAddress:undefined;
        if(publicReport.market?.pairAddress&&!selectedPool)input.reasons.push('The selected market uses a pool identifier, not an on-chain pool address. Address-based V2 reserve and pool timing probes are not applicable; selected-pool impact remains unevaluated.');
        if(chain==='robinhood')input.reasons.push('Robinhood V4 first-minute pool history and selected-pool reserves are not supported by the current verifier. Recent trades and shared manager custody do not establish launch coverage or pool reserves.');
        if (selectedPool) input.labels.push({timestampBasis:'local-observation',address:selectedPool,category:'pool',label:'Market pair address',source:'DEX Screener',timestamp:publicReport.sources.find(s=>s.name==='DEX Screener')?.fetchedAt || publicReport.fetchedAt});
        if (mode === 'market') {
          input.reasons.push('Market-only refresh. No wallet investigation was requested.');
          return {...publicReport,investigation:analyzeInvestigation(input)};
        }
        // Attach rejection handling immediately while independent providers run.
        // A cancelled sibling must never leave a detached promise rejection.
        const enrichSnapshot=async()=>{
          if(!deps.enrichSnapshot)return undefined;
          const snapshot=chain==='solana'?await solanaTask:undefined;
          options.signal?.throwIfAborted();
          const holderReport=snapshot?.holders?{...publicReport,holders:snapshot.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:null,locked:null,tag:''}])}:publicReport;
          stage('wallet-activity','running',`Checking activity for ${holderReport.holders.length} returned holder addresses; no exhaustive history crawl.`);
          const enumeration=chain==='robinhood'?evmSnapshot?.snapshot?.holderEnumeration:undefined;
          const enriched=await deps.enrichSnapshot!(holderReport,{signal:options.signal,timeoutMs:Math.max(1,103_000-(Date.now()-scanStarted)),...(enumeration?.kind==='pons-creation-ledger'?{activityScope:{kind:'pons-creation-ledger' as const,maxAddresses:Math.min(10000,holderReport.holders.length)}}:{})});
          const wallets=enriched.walletActivity?.wallets||[];
          stage('wallet-activity',wallets.some(w=>w.count!==null)?'complete':'unavailable',`${wallets.filter(w=>w.count!==null).length} of ${wallets.length} selected wallet activity responses verified. Short histories remain unresolved.`);
          if(enriched.controlProbes)stage('control-probes',enriched.controlProbes.status==='unavailable'?'unavailable':'complete',`${enriched.controlProbes.observations.filter(o=>o.status==='observed').length} direct RPC control observations at one block. Transfer simulation is not a sellability test.`);
          return enriched;
        };
        const startEnrichment=()=>enrichSnapshot().catch(()=>{if(!options.signal?.aborted)stage('wallet-activity','unavailable','Wallet activity could not be verified.');return undefined;});
        let enrichmentTask=chain==='solana'?startEnrichment():undefined;
        const candidateTime=publicReport.market?.pairCreatedAt,comparisonTime=clockReferenceTime(clock,Date.parse(captured));
        // Public market time nominates a creation search range only; the adapter
        // must still verify factory events, receipts and complete swap coverage.
        const creationTimeHint=publicReport.market?.chainId===chain&&publicReport.market.baseToken.address.toLowerCase()===token.toLowerCase()&&typeof candidateTime==='number'&&Number.isSafeInteger(candidateTime)&&candidateTime>0&&candidateTime<=comparisonTime+120000?candidateTime:undefined;
        const poolTask=mode==='deep'&&chain!=='robinhood'&&selectedPool&&deps.poolLaunch?deps.poolLaunch(chain,token,selectedPool,{signal:options.signal,validationTime:comparisonTime,creationTimeHint}).catch(()=>undefined):Promise.resolve(undefined);
        const foboTask=chain==='robinhood'&&deps.foboLaunch?deps.foboLaunch(chain,token,{signal:options.signal,validationTime:comparisonTime,history:mode==='deep'}).catch(()=>undefined):Promise.resolve(undefined);
        const ponsTask=chain==='robinhood'&&deps.ponsLaunch?deps.ponsLaunch(chain,token,{signal:options.signal,validationTime:comparisonTime}).catch(()=>undefined):Promise.resolve(undefined);
        const reserveTask=mode==='deep'&&chain==='solana'&&selectedPool&&deps.poolReserves?deps.poolReserves(selectedPool,token,{signal:options.signal}).catch(()=>undefined):Promise.resolve(undefined);
        const startHistorical=()=>mode==='deep'&&deps.historicalEvidence?(async()=>{
          const snapshot=chain==='solana'?await solanaTask:undefined;
          options.signal?.throwIfAborted();
          const report=snapshot?.holders?{...publicReport,holders:snapshot.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:null,locked:null,tag:''}])}:publicReport;
          // Funding starts only after the eventual holder snapshot is assembled.
          // Flags are findings, never an eligibility requirement. Omit known
          // custody/burn accounts before selecting a bounded top-wallet trace.
          const excluded=new Set(input.labels.filter(label=>['pool','exchange','bridge','burn'].includes(label.category)).map(label=>label.address.toLowerCase()));
          excluded.add('0x'+'0'.repeat(40));excluded.add('0x000000000000000000000000000000000000dead');
          const robinhoodWallets=chain==='robinhood'?[...new Map(report.holders.filter(holder=>!validateToken(chain,holder.address)&&Number.isFinite(holder.share)&&holder.share>0&&!excluded.has(holder.address.toLowerCase())).sort((a,b)=>b.share-a.share||a.address.toLowerCase().localeCompare(b.address.toLowerCase())).map(holder=>[holder.address.toLowerCase(),holder.address.toLowerCase()])).values()].slice(0,15):undefined;
          stage('rpc-history','running','Reading historical transactions from configured RPC sources.');
          try{
            const result=await deps.historicalEvidence!(chain,token,{report,mode:'deep',limit,signal:options.signal,walletAddresses:robinhoodWallets??snapshot?.holders?.map(holder=>holder.address)});
            if(result)stage('rpc-history',result.sources.some(s=>s.status==='available')?'complete':'unavailable',`${result.trades.length} decoded trade records and ${result.transfers.length} transfer records returned with transaction references.`);
            return result;
          }catch{options.signal?.throwIfAborted();stage('rpc-history','unavailable','Historical RPC data could not be completed. Other evidence remains available.');return undefined;}
        })().catch(()=>undefined):Promise.resolve(undefined);
        // EVM funding must see the eventual verified holder snapshot, including
        // candidates recovered after public history. Solana already awaits its snapshot.
        let historicalTask=chain==='solana'?startHistorical():undefined;
        const client = deps.makeClient(options.signal);
        if(!client.configured&&!deps.historicalEvidence)input.reasons.push('Historical access is not configured. Available public snapshots and bounded explorer records are used.');
        if(chain==='robinhood')sourceTimes.push({name:'Bitquery history',status:'unavailable',fetchedAt:new Date(now()).toISOString(),detail:'Robinhood Chain is not supported by the configured Bitquery query adapter; no query was sent.'});
        if (client.configured&&chain!=='robinhood') {
          const run = async <T>(name: string, operation: () => Promise<T>): Promise<T | undefined> => {
            stage(name,'running',`Requesting bounded ${name.toLowerCase()} evidence.`);
            try {
              options.signal?.throwIfAborted();
              const result = await operation();
              options.signal?.throwIfAborted();
              sourceTimes.push({name:`Bitquery ${name}`,status:'available',detail:'Provider response received. Dataset and scope limitations still apply.',fetchedAt:new Date(now()).toISOString()});
              stage(name,'complete',`${name} response received.`); return result;
            } catch {
              options.signal?.throwIfAborted();
              input.reasons.push(`${name} data was unavailable, invalid, timed out or exceeded the bounded query scope.`);
              sourceTimes.push({name:`Bitquery ${name}`,status:'unavailable',detail:'Request failed, returned invalid data or exceeded the bounded scope.'});
              stage(name,'unavailable',`${name} could not be verified; other evidence remains available.`); return undefined;
            }
          };
          const holders = await run('Holders',async()=>{
            const payload=await client.request(buildQuery('holders',chain,token,limit),chain==='solana');
            if(chain!=='solana' && responseRowCount(payload,chain)>limit) input.truncated=true;
            return parseHolders(payload,chain,limit);
          });
          if (holders) input.holders=holders.map(h=>({...h,share:publicReport.holders.find(p=>chain==='solana'?p.address===h.address:p.address.toLowerCase()===h.address.toLowerCase())?.share ?? (chain!=='solana'?supplyShare(h.balance,publicReport.totalSupply):null)}));
          if(holders&&chain!=='solana'&&publicReport.totalSupply)input.reasons.push('Supply shares outside the public top-holder snapshot use Bitquery decimal-adjusted balances divided by GoPlus total supply. Providers can have different snapshot times; rebasing-token balances may be inaccurate.');
          if (chain==='solana') input.reasons.push('Solana holder reconstruction uses bounded V1 full-history inflow/outflow lists, can lag about 10 minutes, and omits normalized balances and supply percentages without decimals and supply. A capped list is discarded.');
          if (mode === 'deep') {
            const [earlyResult,recentResult,indexedStart] = await Promise.all([
              run('Earliest buys', async()=>{const payload=await client.request(buildQuery('early',chain,token,limit));if(responseRowCount(payload,chain)>=TRADE_ROWS)input.truncated=true;return parseTrades(payload,chain);}),
              run('Recent trades', async()=>{const payload=await client.request(buildQuery('recent',chain,token,limit));if(responseRowCount(payload,chain)>=TRADE_ROWS)input.truncated=true;return parseTrades(payload,chain);}),
              chain==='solana'?Promise.resolve(undefined):run('Trading start',async()=>parseIndexedStart(await client.request(buildQuery('launch',chain,token,limit)),chain)),
            ]);
            const early = earlyResult || [], recent = recentResult || [];
            const earlyBuyers=[...new Set(early.filter(t=>t.side==='buy').map(t=>t.wallet))].slice(0,limit);
            input.earlyBuyerAddresses=earlyBuyers;
            const selected=[...new Set([...input.holders.map(h=>h.address),...earlyBuyers])].slice(0,limit*2);
            const selectedSet=new Set(selected);
            input.trades=[...(indexedStart?[indexedStart]:[]),...early.filter(t=>earlyBuyers.includes(t.wallet)),...recent.filter(t=>selectedSet.has(t.wallet))];
            // Archive and combined are overlapping views of one provider's index.
            // Agreement is an observation, not independent proof of launch coverage.
            input.launchVerified=false;
            input.earliestTradeAt=indexedStart?.timestamp || (early.length?early.map(t=>t.timestamp).sort()[0]:undefined);
            input.reasons.push(indexedStart?'Archive and combined agree on the earliest indexed trade, which is retained as an observation. Their shared index does not independently establish complete launch coverage. Early-buyer and sniper labels are withheld.':'Complete launch coverage could not be verified. Early-buyer and sniper labels are withheld; the earliest returned sample remains an observation only.');
            input.reasons.push(`Scope: top ${limit} holders and up to ${limit} earliest sampled buyers; at most ${TRADE_ROWS} earliest buy rows and ${TRADE_ROWS} recent trade rows; one incoming native funding hop. Trades outside these windows and wallets are not analyzed. Net buying means net buying in this sample only.`);
            const transferBatches=batch(selected,100);
            for (const group of batch(transferBatches,4)) {
              const results=await Promise.all(group.map((addresses,i)=>run(`Funding batch ${input.transfers.length+ i+1}`,async()=>{
                const payload=await client.request(buildQuery('transfers',chain,token,limit,addresses));
                if(responseRowCount(payload,chain)>=TRANSFER_ROWS)input.truncated=true;
                return parseTransfers(payload,chain).filter(t=>t.native||selectedSet.has(t.from));
              })));
              for(const result of results)if(result)input.transfers.push(...result);
            }
            if(chain==='solana')input.reasons.push('Solana transfer evidence covers the provider realtime window (about 12 hours), not complete launch funding history.');
            // Prioritize funding sources so known exchange withdrawals are excluded.
            const allLabelAddresses=[...new Set([...input.transfers.map(t=>t.from),...selected,...input.transfers.map(t=>t.to)])];
            const labelAddresses=allLabelAddresses.slice(0,600);
            if(allLabelAddresses.length>600){input.truncated=true;input.reasons.push('Address labels are capped at 600 addresses. Unrecognized infrastructure can still explain shared-funder patterns.');}
            for(const group of batch(batch(labelAddresses,100),3)){
              const results=await Promise.all(group.map(addresses=>run('Address labels',async()=>parseLabels(await client.request(buildQuery('labels',chain,token,limit,addresses))))));
              for(const result of results)if(result)input.labels.push(...result);
            }
          } else input.reasons.push('Holder snapshot only. No launch, trade or funding queries were run.');
        }
        if(deps.publicHistory && (chain==='robinhood'||!client.configured || !input.trades.length)){
          stage('public-history','running','Loading bounded public holder, deployment, pool-trade and incoming-transfer evidence.');
          try {
            const fallback=await deps.publicHistory(chain,token,{report:publicReport,mode,limit,signal:options.signal});
            options.signal?.throwIfAborted();
            sourceTimes.push(...fallback.sources);input.reasons.push(...fallback.reasons);input.truncated ||= fallback.truncated;
            if(fallback.holders && !sourceTimes.some(s=>s.name==='Bitquery Holders'&&s.status==='available')){
              input.holders=fallback.holders;
              publicReport={...publicReport,holders:fallback.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:fallback.labels.some(l=>l.address===h.address&&l.category==='contract')?true:null,locked:null,tag:''}]),holderCount:fallback.holderCount??publicReport.holderCount,totalSupply:fallback.totalSupply??publicReport.totalSupply};
            }
            if(!input.identities.some(i=>i.role==='creator'))input.identities.push(...fallback.identities.filter(i=>i.role==='creator'));
            publicReport={...publicReport,identities:input.identities};
            input.labels.push(...fallback.labels);
            // Never combine trade feeds with incompatible event IDs: the fallback
            // is used only when no usable indexed trade evidence was returned.
            if(!input.trades.length)input.trades=fallback.trades;
            if(!input.transfers.length)input.transfers=fallback.transfers;
            input.earliestTradeAt ||= input.trades.map(t=>t.timestamp).sort()[0];
            stage('public-history',fallback.sources.some(s=>s.status==='available')?'complete':'unavailable',`${fallback.trades.length} public trade rows and ${fallback.transfers.length} transfer rows received. Accepted evidence is shown in the completed report. Launch coverage remains unverified.`);
          } catch {
            options.signal?.throwIfAborted();
            input.reasons.push('Public history fallback was unavailable. Existing public snapshots and indexed evidence are preserved.');
            stage('public-history','unavailable','Public evidence could not be loaded; existing sources remain available.');
          }
        }
        const pons=await ponsTask;options.signal?.throwIfAborted();
        const ponsSnapshot=pons?.snapshot,ponsVerified=!!(ponsSnapshot&&ponsSnapshot.basis==='safe'&&ponsSnapshot.factory.toLowerCase()===PONS_FACTORY&&ponsSnapshot.deployerContract.toLowerCase()===PONS_DEPLOYER&&pons.identities.some(i=>i.role==='creator'&&i.address.toLowerCase()===ponsSnapshot.launcher.toLowerCase())&&pons.sources.some(s=>s.name==='Pons factory launch record'&&s.status==='available'));
        if(pons){sourceTimes.push(...pons.sources);input.reasons.push(...pons.reasons);if(ponsVerified){
          input.identities=[...pons.identities,...input.identities.filter(i=>!(i.role==='creator'&&i.source==='GoPlus Security'&&i.address.toLowerCase()===PONS_DEPLOYER)&&!pons.identities.some(p=>p.role===i.role&&p.address.toLowerCase()===i.address.toLowerCase()))];
          publicReport={...publicReport,identities:input.identities};input.labels.push(...pons.labels);
          input.reasons.push('Token-bound Pons factory and token records identify the launch initiator. The shared deployment service is not treated as the token creator. This is current protocol state, not a verified creation transaction or first-minute history.');
        }}
        const fobo=await foboTask;options.signal?.throwIfAborted();
        const foboSnapshot=fobo?.snapshot,foboVerified=!!(foboSnapshot&&foboSnapshot.basis==='safe'&&foboSnapshot.factory===FOBO_FACTORY&&foboSnapshot.hook===FOBO_HOOK&&fobo.identities.some(i=>i.role==='creator'&&i.address===foboSnapshot.creator&&i.transaction===foboSnapshot.launch.transaction)&&fobo.sources.some(s=>s.name===FOBO_LAUNCH_SOURCE&&s.status==='available'));
        if(fobo){sourceTimes.push(...fobo.sources);input.reasons.push(...fobo.reasons);if(foboVerified){
          // The factory deploys every FOBO token; a provider creator equal to it is the shared service.
          input.identities=[...fobo.identities,...input.identities.filter(i=>!(i.role==='creator'&&i.address.toLowerCase()===FOBO_FACTORY)&&!fobo.identities.some(p=>p.role===i.role&&p.address.toLowerCase()===i.address.toLowerCase()))];
          publicReport={...publicReport,identities:input.identities};input.labels.push(...fobo.labels);
          if(fobo.curveTiming&&fobo.trades.length){input.trades.push(...fobo.trades);input.curveTiming=fobo.curveTiming;input.earliestTradeAt=fobo.trades.map(t=>t.timestamp).sort()[0];}
          input.reasons.push('The canonical FOBO factory TokenLaunched event, its receipt and the hook pool record identify the launch creator and transaction. The shared factory is not treated as the token creator.');
        }}
        let evmSnapshot:EvmHolderResult|undefined;
        // Newest-first transfer window (capped at 150,000) nominates real-holder
        // candidates. Large tokens keep reading in the background between scans.
        let transferWindow:TransferWindowResult|undefined;
        if((chain==='ethereum'||chain==='base'||chain==='robinhood'||chain==='bsc')&&deps.transferWindow){
          stage('transfer-window','running','Reading the most recent token transfers to find real holders.');
          try{transferWindow=await deps.transferWindow(chain,token,{signal:options.signal,deadlineMs:mode==='deep'?22000:12000});}catch{options.signal?.throwIfAborted();}
          const w=transferWindow?.summary;
          stage('transfer-window',w&&w.status!=='unavailable'?'complete':'unavailable',w?w.detail:'Transfer window unavailable; real holders use provider candidates.');
          if(w)input.reasons.push(w.detail);
        }
        // Real holders are always balance-verified on EVM chains, even when a
        // provider already returned a holder list (it only nominates candidates).
        if((chain==='robinhood'||chain==='base'||chain==='ethereum'||chain==='bsc'&&!bscSnapshot?.holders?.length)&&deps.evmHolders){
          stage('holder-rpc','running',`Verifying real-holder balances at one ${chain==='robinhood'?'Robinhood safe':chain==='base'?'Base safe':chain==='bsc'?'BNB Chain finalized':'Ethereum finalized'} block.`);
          const candidateAddresses=[...new Set([...input.holders.map(h=>h.address),...(prior?.report.holders||[]).map(h=>h.address),...input.trades.map(t=>t.wallet),...input.transfers.filter(t=>!t.native&&t.token.toLowerCase()===token.toLowerCase()).flatMap(t=>[t.from,t.to])])];
          const providerTags=new Map(publicReport.holders.filter(h=>h.tag).map(h=>[h.address.toLowerCase(),h.tag]));
          try{evmSnapshot=await deps.evmHolders({...publicReport,market:publicReport.market??prior?.report.market??null},{signal:options.signal,candidateAddresses,windowCandidates:transferWindow?.candidates,ponsSnapshot:ponsVerified?ponsSnapshot:undefined,priorityCandidateAddresses:[...(ponsVerified?[ponsSnapshot!.launcher,ponsSnapshot!.creatorFeeRecipient,ponsSnapshot!.curve]:[]),...(foboVerified?[foboSnapshot!.creator,...(foboSnapshot!.currentCreator?[foboSnapshot!.currentCreator]:[]),FOBO_VESTING,FOBO_HOOK]:[])]});}catch{options.signal?.throwIfAborted();}
          if(evmSnapshot){const provenCreators=evmSnapshot.identities.filter(i=>i.role==='creator'&&i.transaction);if(provenCreators.length){input.identities=[...provenCreators,...input.identities.filter(i=>!provenCreators.some(p=>p.role===i.role&&p.address.toLowerCase()===i.address.toLowerCase()))];publicReport={...publicReport,identities:input.identities};}sourceTimes.push(...evmSnapshot.sources);input.reasons.push(...evmSnapshot.reasons);input.labels.push(...evmSnapshot.labels);input.transfers.push(...evmSnapshot.transfers);input.truncated=true;
            if(evmSnapshot.snapshot&&evmSnapshot.holders){const knownInfrastructure=new Map(evmSnapshot.labels.filter(l=>['pool','burn','exchange','bridge'].includes(l.category)).map(l=>[l.address.toLowerCase(),l.category]));if(selectedPool)knownInfrastructure.set(selectedPool.toLowerCase(),'pool');input.holders=evmSnapshot.holders;publicReport={...publicReport,holderCount:evmSnapshot.holderCount??null,totalSupply:evmSnapshot.totalSupply??publicReport.totalSupply,holders:evmSnapshot.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:knownInfrastructure.get(h.address.toLowerCase())==='pool'?true:null,locked:null,tag:knownInfrastructure.get(h.address.toLowerCase())||providerTags.get(h.address.toLowerCase())||''}])};}
          }
          // This bound applies only to already-verified current balances. The
          // historical holder/buyer query limits remain unchanged.
          const currentSnapshot=evmSnapshot?.snapshot;
          if(!currentSnapshot&&!sourceTimes.some(source=>source.name===EVM_HOLDER_SOURCE))sourceTimes.push({name:EVM_HOLDER_SOURCE,status:'unavailable',detail:'Independent holder balances could not be refreshed. Security-provider rows do not replace the last verified inventory.'});
          if(chain==='robinhood'&&currentSnapshot?.chain===chain&&currentSnapshot.holderEnumeration?.kind==='pons-creation-ledger'&&evmSnapshot?.holders){
            const positives=new Set(currentSnapshot.balances.filter(b=>b.status==='observed'&&typeof b.amountRaw==='string'&&/^[1-9]\d{0,77}$/.test(b.amountRaw)).map(b=>b.address.toLowerCase()));
            if(evmSnapshot.holders.every(h=>!validateToken(chain,h.address)&&typeof h.share==='number'&&Number.isFinite(h.share)&&h.share>0&&positives.has(h.address.toLowerCase())))input.currentHolderLimit=Math.min(10000,evmSnapshot.holders.length);
          }
          stage('holder-rpc',evmSnapshot?.snapshot?'complete':'unavailable',evmSnapshot?.snapshot?`${evmSnapshot.holders?.length||0} positive candidate balances verified at ${evmSnapshot.snapshot.finality} block ${evmSnapshot.snapshot.blockNumber}. ${evmSnapshot.holderCount!=null?`Separate transfer-ledger count: ${evmSnapshot.holderCount} recorded accounts.`:'Full holder count remains unknown.'}`:'Candidate balances could not be verified; missing values remain unknown.');
        }
        const solana=await solanaTask;
        options.signal?.throwIfAborted();
        if(solana){
          sourceTimes.push(...solana.sources);input.reasons.push(...solana.reasons);input.truncated=true;
          const authoritySource=solana.sources.find(s=>s.name==='Solana RPC authorities');
          input.identities.push(...solana.identities);
          const directKeys=new Set(solana.checks.map(c=>c.key));
          const retainedChecks=publicReport.checks.filter(c=>!directKeys.has(c.key)&&c.status!=='unknown');
          publicReport={...publicReport,identities:input.identities,holderCount:null,totalSupply:solana.totalSupply??publicReport.totalSupply,checks:[...retainedChecks,...solana.checks.map(c=>({...c,source:'Solana RPC authorities',fetchedAt:authoritySource?.fetchedAt}))]};
          if(solana.holders!==undefined){
            input.holders=solana.holders;
            publicReport.holders=solana.holders.flatMap(h=>h.share===null?[]:[{address:h.address,share:h.share,contract:null,locked:null,tag:'Sampled token-account owner'}]);
          }
          stage('solana-snapshot',solana.sources.some(s=>s.status==='available')?'complete':'unavailable','Finalized mint/freeze roles and sampled account owners checked. Per-source scope and slots are retained.');
        }
        // EVM explorer holders may replace the early GoPlus list. Probe the actual final snapshot.
        enrichmentTask ||= startEnrichment();
        historicalTask ||= startHistorical();
        const candidatePool=publicReport.market?.pairAddress||prior?.report.market?.pairAddress;
        const evmPool=candidatePool&&!validateToken(chain,candidatePool)?candidatePool:undefined;
        const evmReserveTask=(chain==='ethereum'||chain==='base'||chain==='bsc')&&evmPool&&deps.evmPoolReserves?deps.evmPoolReserves(chain,evmPool,token,{holders:publicReport.holders.map(h=>h.address),signal:options.signal}).catch(()=>undefined):Promise.resolve(undefined);
        const historical=await historicalTask;
        options.signal?.throwIfAborted();
        if(historical){
          sourceTimes.push(...historical.sources);input.reasons.push(...historical.reasons);input.truncated ||= historical.truncated;
          const verifiedIdentityKeys=new Set(historical.identities.filter(i=>i.transaction).map(i=>`${i.role}:${i.address}:${i.authorityKind||''}`));
          input.identities=[...historical.identities,...input.identities.filter(i=>!verifiedIdentityKeys.has(`${i.role}:${i.address}:${i.authorityKind||''}`))];input.labels.push(...historical.labels);
          publicReport={...publicReport,identities:input.identities};
          // Decoded RPC records replace other trade feeds for overlapping transactions.
          const canonical=(value:string)=>chain==='solana'?value:value.toLowerCase();
          const transactions=new Set(historical.trades.map(t=>canonical(t.transaction)));
          input.trades=[...input.trades.filter(t=>!transactions.has(canonical(t.transaction))),...historical.trades];
          const transferKey=(t:typeof input.transfers[number])=>[canonical(t.transaction),canonical(t.from),canonical(t.to),t.native?'native':canonical(t.token)].join(':');
          const observed=new Set(historical.transfers.map(transferKey));
          input.transfers=[...input.transfers.filter(t=>!observed.has(transferKey(t))),...historical.transfers];
          input.earliestTradeAt=input.trades.map(t=>t.timestamp).sort()[0]||input.earliestTradeAt;
        }
        // Discover prior relationships while the independent activity/control
        // reads finish. This provisional view is nomination input only: the final
        // matcher rechecks membership against the finished current-holder cohort.
        const memoryTask=mode==='deep'&&deps.crossTokenMemory?(async()=>{
          stage('cross-token-memory','running','Searching prior-token relationships and verifying their transactions.');
          try{return await deps.crossTokenMemory!({...publicReport,sources:[...publicReport.sources,...sourceTimes],investigation:analyzeInvestigation(input)},{signal:options.signal,deadlineMs:Math.min(45_000,Math.max(1,103_000-(Date.now()-scanStarted))),onProgress:detail=>stage('cross-token-memory','running',detail)});}
          catch{options.signal?.throwIfAborted();return {version:1 as const,chain,token,observedAt:new Date(now()).toISOString(),status:'unavailable' as const,records:[],scope:{selectedWallets:0,queriedWallets:0,candidateTokens:0,verifiedTransactions:0,truncated:true},reasons:['Independent cross-token verification was unavailable. No previous memory claim is carried into this scan.']};}
        })().catch(()=>undefined):Promise.resolve(undefined);
        const poolWindow=await poolTask;
        options.signal?.throwIfAborted();
        if(poolWindow){
          sourceTimes.push(...poolWindow.sources);input.reasons.push(...poolWindow.reasons);
          if(poolWindow.status==='verified'&&poolWindow.proof){
            // Other feeds may use incompatible event IDs or aggregate routed legs.
            // Prefer receipt-identified pool events for overlapping transactions.
            const hashes=new Set(poolWindow.trades.map(t=>t.transaction.toLowerCase()));
            input.trades=[...input.trades.filter(t=>!hashes.has(t.transaction.toLowerCase())),...poolWindow.trades];
            input.poolTiming=poolWindow.proof;
            input.reasons.push('First-minute labels are scoped to the verified selected pool only. Where trade feeds overlap a transaction, canonical pool events replace other feed rows to avoid double counting; other routed legs in that transaction are outside this sample.');
          }
          stage('pool-first-minute',poolWindow.status==='verified'?'complete':'unavailable',poolWindow.status==='verified'?'Selected pool creation, contiguous first-minute logs and receipts verified. Token-wide launch remains unverified.':'Selected pool timing could not be fully verified; no timing label is inferred from a partial window.');
        }
        if(input.truncated)input.reasons.push('One or more row or wallet caps were reached. Expand scope where available; results are not exhaustive.');
        if(!input.identities.length)input.reasons.push('Creator and current authority identities were not returned. They are not inferred from the oldest holder or first trader.');
        // This task is already running alongside history; waiting here adds no
        // RPC calls. Account type must be qualified before funding inference.
        const enrichment=await enrichmentTask;
        options.signal?.throwIfAborted();
        const activityProof=enrichment?.walletActivity;
        const activityProofSource=activityProof?{name:activityProof.source,status:activityProof.wallets.some(w=>w.count!==null)?'available' as const:'unavailable' as const,fetchedAt:activityProof.observedAt,detail:'Bounded wallet activity predicate. See chain-specific count semantics and unknown histories.'}:undefined;
        const eoas=qualifiedEvmEoas(chain==='solana'?undefined:activityProof,activityProofSource?[activityProofSource]:[],captured);
        const providerContractSources=new Set(['GoPlus Security','Blockscout address metadata']);
        const providerContracts=input.labels.filter(label=>label.category==='contract'&&providerContractSources.has(label.source)&&eoas.has(label.address.toLowerCase()));
        input.labels=input.labels.filter(label=>!providerContracts.includes(label));
        const investigation = analyzeInvestigation(input);
        for(const label of providerContracts){
          const address=label.address.toLowerCase(),baseId=`label:${address}:contract`,independent=investigation.evidence.some(e=>e.id===baseId&&!providerContractSources.has(e.source));
          const id=independent?`provider-contract:${address}:${label.source}`:baseId;
          investigation.evidence.push({id,kind:'label',to:address,source:label.source,timestamp:label.timestamp,attribution:'provider-reported',description:label.label});
          const wallet=investigation.wallets.find(w=>w.address===address);if(wallet)wallet.evidenceIds.push(id);
        }
        const applyEoaQualification=(inv:InvestigationReport['investigation'])=>{
          for(const [address,proof] of eoas){
            const wallet=inv.wallets.find(w=>w.address.toLowerCase()===address);if(!wallet)continue;
            const baseId=`label:${address}:contract`,flags=inv.evidence.filter(e=>e.kind==='label'&&providerContractSources.has(e.source)&&(e.id===baseId||e.id.startsWith(`provider-contract:${address}:`)));
            if(!flags.length)continue;
            const independent=inv.evidence.some(e=>e.id===baseId&&!providerContractSources.has(e.source));
            if(!independent){wallet.categories=wallet.categories.filter(category=>category!=='contract');if(!wallet.categories.length)wallet.categories=['unclassified'];if(flags.some(flag=>flag.description===wallet.label))delete wallet.label;}
            for(const flag of flags)flag.attribution='provider-reported';
            const id=`code-kind:evm:${address}:${proof.blockRef}`;
            if(!inv.evidence.some(e=>e.id===id))inv.evidence.push({id,kind:'label',to:address,source:'EVM RPC wallet activity',timestamp:proof.observedAt,description:`Canonical ${proof.kind==='eoa'?'empty-code EOA':'EIP-7702 delegated EOA'} code ${proof.code} at rechecked finalized anchor ${proof.blockRef}. The provider contract flag remains an attributed assertion; it does not exclude this EOA from funding inference. Account type does not establish beneficial ownership or lifetime activity.`});
            if(!wallet.evidenceIds.includes(id))wallet.evidenceIds.push(id);
          }
        };
        applyEoaQualification(investigation);
        if(bscSnapshot?.snapshot){
          const snapshot=bscSnapshot.snapshot,source=publicReport.sources.find(s=>s.name==='BSC RPC finalized holder balances');
          for(const balance of snapshot.balances){
            const wallet=investigation.wallets.find(w=>w.address.toLowerCase()===balance.address.toLowerCase());if(!wallet)continue;
            const id=`holding:bsc:${balance.address.toLowerCase()}`;
            investigation.evidence.push({id,kind:'holding',timestamp:source?.fetchedAt||captured,amountRaw:balance.amountRaw,decimals:snapshot.decimals,token,source:'BSC RPC finalized holder balances',description:`balanceOf(${balance.address}) = ${balance.amountRaw} raw units at finalized block ${snapshot.block} (${snapshot.blockHash}). Same-block total supply ${snapshot.totalSupplyRaw}, decimals ${snapshot.decimals}. Candidate discovery is bounded; this is not a complete ownership census.`});wallet.evidenceIds.push(id);
          }
        }
        if(evmSnapshot?.snapshot){
          const snapshot=evmSnapshot.snapshot;
          const enumeration=snapshot.holderEnumeration;
          const currentScope=enumeration?.complete&&input.currentHolderLimit===evmSnapshot.holders?.length&&enumeration.recordedAccounts===enumeration.verifiedAccounts&&enumeration.verifiedAccounts===evmSnapshot.holders?.length?'All recorded positive balances were checked and reconciled to same-block total supply at this anchor; this does not establish complete trading or funding history.':'Bounded candidate sample, not a holder census.';
          for(const balance of snapshot.balances.filter(b=>b.status==='observed'&&b.amountRaw!==undefined)){
            const wallet=investigation.wallets.find(w=>w.address.toLowerCase()===balance.address);if(!wallet)continue;
            const id=`holding:evm:${balance.address}`;
            investigation.evidence.push({id,kind:'holding',to:balance.address,timestamp:snapshot.observedAt,amountRaw:balance.amountRaw,decimals:snapshot.decimals,token,source:EVM_HOLDER_SOURCE,description:`balanceOf(${balance.address}) = ${balance.amountRaw} raw units at ${snapshot.chain} ${snapshot.finality} block ${snapshot.blockNumber} (${snapshot.blockHash}); block time ${snapshot.blockTimestamp}. Same-block total supply ${snapshot.totalSupplyRaw}, decimals ${snapshot.decimals}; block hash rechecked. ${currentScope}${snapshot.finality==='safe'?' Safe state is not finalized; a reorganization can change this observation.':''}`});wallet.evidenceIds.push(id);
          }
        }
        if(solana?.sources.some(source=>source.name==='Solana RPC Holders'&&source.status==='available')){
          for(const wallet of investigation.wallets){
            const accounts=solana.tokenAccounts.filter(account=>account.owner===wallet.address&&account.mint===token&&account.slot===solana.snapshot.ownersSlot);
            if(!accounts.length)continue;
            const id=`holding:solana:${wallet.address}`,slot=accounts[0].slot;
            const accountDetails=accounts.map(account=>`${account.address}: ${account.amountRaw} raw units / 10^${account.decimals} (${account.state})`).join('; ');
            const denominator=wallet.share!==null&&solana.snapshot.supplySlot===slot&&solana.totalSupply!==undefined?`Supply denominator: ${solana.totalSupply} token units from the same finalized bank; sampled supply share ${wallet.share}%.`:'A comparable same-bank supply denominator is unavailable; supply share is unknown.';
            investigation.evidence.push({id,kind:'holding',timestamp:accounts[0].timestamp,amount:wallet.balance,token,source:'Solana RPC Holders',description:`Verified parsed owner ${wallet.address} at finalized slot ${slot}. Token accounts: ${accountDetails}. ${denominator} Only these sampled accounts are included; this is account state, not a transaction or complete wallet balance. Timestamp is local retrieval time, not block time.`});
            wallet.evidenceIds.push(id);
          }
        }
        const refreshedSecurityKeys=new Set(publicReport.checks.filter(c=>c.status!=='unknown').map(c=>`security:${c.key}`));
        investigation.evidence=investigation.evidence.filter(e=>!refreshedSecurityKeys.has(e.id));
        investigation.findings=investigation.findings.filter(f=>!refreshedSecurityKeys.has(f.id));
        for(const check of publicReport.checks.filter(c=>c.status==='critical'||c.status==='warning')){
          const id=`security:${check.key}`;
          investigation.evidence.push({id,kind:'label',timestamp:check.fetchedAt||publicReport.sources.find(s=>s.name==='GoPlus Security')?.fetchedAt||publicReport.fetchedAt,description:`${check.source||'GoPlus Security'} reports: ${check.title} = ${check.value}. ${check.description}`,source:check.source||'GoPlus Security'});
          investigation.findings.push({id,title:check.title,description:`Provider-reported flag: ${check.description}`,level:check.status==='critical'?'critical':'warning',certainty:'observed',wallets:[],evidenceIds:[id]});
        }
        const status=investigation.findings.some(f=>f.level==='critical')?'critical':investigation.findings.some(f=>f.level==='warning')?'caution':investigation.coverage.status==='complete'?'clear':'insufficient';
        investigation.assessment={status,title:status==='critical'?'Critical provider flag':status==='caution'?'Evidence needs review':status==='insufficient'?'Insufficient evidence':'No flagged pattern in scope',summary:status==='critical'||status==='caution'?'Review the provider flags and linked transactions alongside the missing-history and scope limits. Provider reports are not an independent audit; relationships do not prove common control.':status==='insufficient'?'Missing history prevents a reliable all-clear. Public snapshots remain available where providers respond.':'No configured pattern was detected in the stated sample. This is not a safety guarantee.'};
        let result: InvestigationReport={...publicReport,holderEnumeration:evmSnapshot?.snapshot?.holderEnumeration,sources:[...publicReport.sources,...sourceTimes],investigation,...(solana?{solana:{snapshot:solana.snapshot,tokenAccounts:solana.tokenAccounts,authorities:solana.authorities,extensions:solana.extensions}}:{})};
        if(mode==='deep'&&prior?.report.sources.some(s=>s.status==='available')&&!result.sources.some(s=>s.status==='available'))throw Error('Providers are unavailable; the previous report is preserved.');
        if(mode==='holders'&&prior)result=mergeReportRefresh(prior.report,result,'holders');
        else if(mode==='deep'&&prior)result=mergeDeepReport(prior.report,result);
        // A holder refresh may retain historical categories. Do not reintroduce
        // a provider-only contract category disproven by the current code proof.
        applyEoaQualification(result.investigation);
        if(transferWindow)result.investigation.coverage.transferWindow=transferWindow.summary;
        if(foboVerified){
          result.identities=[...input.identities.filter(i=>i.role==='creator'),...(result.identities||[]).filter(i=>i.role!=='creator')];
          const id=`identity:creator:${FOBO_FACTORY}`,removeIds=new Set(result.investigation.evidence.filter(e=>e.id===id&&e.source!==FOBO_LAUNCH_SOURCE).map(e=>e.id));
          result.investigation.evidence=result.investigation.evidence.filter(e=>!removeIds.has(e.id));
          for(const wallet of result.investigation.wallets){wallet.evidenceIds=wallet.evidenceIds.filter(id=>!removeIds.has(id));if(wallet.address.toLowerCase()===FOBO_FACTORY){wallet.categories=wallet.categories.filter(c=>c!=='creator');if(!wallet.categories.length)wallet.categories=['unclassified'];}}
        }
        if(ponsVerified){
          // Holder refresh merges historical categories. Remove only the now
          // disproven GoPlus service attribution, retaining other identities.
          result.identities=[...input.identities.filter(i=>i.role==='creator'),...(result.identities||[]).filter(i=>i.role!=='creator')];
          const id=`identity:creator:${PONS_DEPLOYER}`,removeIds=new Set(result.investigation.evidence.filter(e=>e.id===id&&e.source==='GoPlus Security').map(e=>e.id));
          result.investigation.evidence=result.investigation.evidence.filter(e=>!removeIds.has(e.id));
          const activeFactoryCreator=result.identities.some(i=>i.role==='creator'&&i.address.toLowerCase()===PONS_DEPLOYER);
          for(const wallet of result.investigation.wallets){wallet.evidenceIds=wallet.evidenceIds.filter(id=>!removeIds.has(id));if(wallet.address.toLowerCase()===PONS_DEPLOYER&&!activeFactoryCreator){wallet.categories=wallet.categories.filter(c=>c!=='creator');if(!wallet.categories.length)wallet.categories=['unclassified'];}}
        }
        const reserves=await reserveTask;
        if(reserves){result.poolReserves=reserves;const snapshot=reserves.snapshot;if(snapshot){result.sources.push({name:snapshot.source,status:'available',fetchedAt:snapshot.observedAt,detail:`Verified PumpSwap pool and vault snapshot at finalized slot ${snapshot.slot}. ${snapshot.limitations.join(' ')}`});result.investigation.evidence.push({id:snapshot.evidenceId,kind:'label',timestamp:snapshot.observedAt,source:snapshot.source,description:`Verified pool reserves at finalized slot ${snapshot.slot}. Base ${snapshot.base.amountRaw} raw units; quote ${snapshot.quote.amountRaw} raw units. Virtual quote ${snapshot.virtualQuoteReservesRaw}. ${snapshot.feeAssumption}`});}}
        const evmReserves=await evmReserveTask;
        if(evmReserves){
          result.evmPoolReserves=evmReserves;const snapshot=evmReserves.snapshot;
          if(evmReserves.status==='verified'&&snapshot){
            result.sources.push({name:snapshot.source,status:'available',fetchedAt:snapshot.observedAt,detail:`Official V2 factory membership, pool identities, balances and reserves verified at finalized block ${snapshot.blockNumber} (${snapshot.blockHash}). ${snapshot.limitations.join(' ')}`});
            result.investigation.evidence.push({id:snapshot.evidenceId,kind:'label',timestamp:snapshot.observedAt,source:snapshot.source,description:`Finalized ${snapshot.protocol} pool ${snapshot.pool} at ${snapshot.blockRef}. Scanned token reserve ${snapshot.base.reserveRaw}, quote reserve ${snapshot.quote.reserveRaw} raw units; actual pool balances match: ${snapshot.base.reserveRaw===snapshot.base.balanceRaw&&snapshot.quote.reserveRaw===snapshot.quote.balanceRaw}. Total supply ${snapshot.totalSupplyRaw} raw units. Same-block holder balances: ${snapshot.holders.filter(h=>h.status==='observed').map(h=>`${h.address}: ${h.balanceRaw}`).join('; ')}. A zero-fee constant-product scenario is not an executable trade quote or sellability test.`});
          }else result.sources.push({name:'EVM RPC finalized V2 reserves',status:'unavailable',detail:evmReserves.reasons.join(' ')});
          stage('pool-reserves',evmReserves.status==='verified'?'complete':'unavailable',evmReserves.status==='verified'?'V2 pool reserves and current holder balances verified at one finalized block. Sell-impact scenario remains conditional.':'Current compatible pool reserves could not be verified.');
        }
        if(enrichment){
          result={...result,...enrichment};
          const activity=enrichment.walletActivity,probes=enrichment.controlProbes;
          if(activity)result.sources.push({name:activity.source,status:activity.wallets.some(w=>w.count!==null)?'available':'unavailable',fetchedAt:activity.observedAt,detail:'Bounded wallet activity predicate. See chain-specific count semantics and unknown histories.'});
          if(probes){result.sources.push({name:probes.source,status:probes.status==='unavailable'?'unavailable':'available',fetchedAt:probes.fetchedAt,detail:probes.limitations.join(' ')});result.investigation.evidence.push(...probes.evidence);}
        }
        const memory=await memoryTask;
        options.signal?.throwIfAborted();
        if(mode==='deep'){
          // A fresh failure must not inherit a prior scan's positive matches.
          result.crossTokenMemory=memory;
          if(memory){
            result.sources=result.sources.filter(source=>source.name!=='Independent cross-token memory');
            result.sources.push({name:'Independent cross-token memory',status:memory.status==='partial'?'available':'unavailable',fetchedAt:memory.observedAt,detail:`${memory.scope.queriedWallets} selected wallet histories queried; ${memory.scope.candidateTokens} prior token candidates; ${memory.scope.verifiedTransactions} canonical transactions checked. ${memory.reasons.join(' ')}`});
            stage('cross-token-memory',memory.status==='partial'?'complete':'unavailable','Bounded prior-token search finished. Only independently qualified relationships affect the verdict.');
          }
        }
        result.investigation.evidence=result.investigation.evidence.filter(e=>e.source!=='Independent cross-token memory');
        result.investigation.evidence.push(...crossTokenMemoryEvidence(result));
        result.riskMetrics=computeRiskMetrics(result);
        result.investigation.assessment=getDisplayAssessment(result);
        result.trustRating=trustRating(result);
        result.observedDecision=observedDecision(result,result.trustRating);
        result.decisionOutput=buildVerdictOutput({rating:result.trustRating,observed:result.observedDecision});
        if(inFlight.get(key)===revision){
          if(mode==='deep')store(key,result,limit);
          else if(mode==='holders'&&prior&&prior.expires>now()){
            const refreshed={...prior.report,...result,market:prior.report.market,sources:[...new Map([...prior.report.sources,...result.sources.filter(s=>s.name!=='DEX Screener')].map(s=>[s.name,s])).values()]};
            const entry={expires:Math.min(prior.expires,now()+cacheLifetime(refreshed)),report:refreshed};
            cache.set(key,entry);persist(chain,token,limit,entry);
          }
        }
        stage('assessment','complete','Evidence assembled. Observations, inferences and unknowns are separated.');
        return result;
      } finally {if(mode==='deep')activeDeep--;if(inFlight.get(key)===revision)inFlight.delete(key);}
    },
  };
}
