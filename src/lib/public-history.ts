import { parseCount, sameToken, validateToken, isMarketPairId, type Chain, type Report } from './analysis';
import type { IdentityRecord, InvestigationInput, LabelRecord, TradeRecord, TransferRecord } from './investigation';

type Row = Record<string, unknown>;
const obj = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const str = (v: unknown) => typeof v === 'string' ? v : '';
const evmAddress = (v: unknown) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v) ? v.toLowerCase() : '';
const normalized = (v: string, chain: Chain) => chain === 'solana' ? v : v.toLowerCase();
const items = (payload: unknown) => {
  const value = obj(payload).items;
  if (!Array.isArray(value)) throw Error('Explorer response is missing its dataset.');
  return value.map(obj);
};
const rawAmount = (v: unknown) => typeof v === 'string' && /^\d+$/.test(v) ? BigInt(v) : undefined;
const unitAmount = (v: unknown, decimals: unknown): number | undefined => {
  const raw = rawAmount(v), scale = parseCount(decimals);
  if (raw === undefined || scale === null || !Number.isInteger(scale) || scale > 255) return undefined;
  const n = Number(raw) / 10 ** scale;
  return Number.isFinite(n) && (raw === 0n || n > 0) ? n : undefined;
};

export type PublicHistoryResult = {
  holders?: InvestigationInput['holders']; holderCount?: number | null; totalSupply?: number | null;
  trades: TradeRecord[]; transfers: TransferRecord[]; identities: IdentityRecord[]; labels: LabelRecord[];
  reasons: string[]; sources: Report['sources']; truncated: boolean;
};
export type PublicHistoryOptions = { report: Report; mode: 'deep' | 'holders'; limit: number; signal?: AbortSignal; walletAddresses?:string[]; skipFunding?:boolean };

export function parsePoolTrades(payload: unknown, chain: Chain, token: string): TradeRecord[] {
  const rows = obj(payload).data;
  if (!Array.isArray(rows)) throw Error('Pool response is missing its trades dataset.');
  return rows.slice(0, 300).flatMap(raw => {
    const row = obj(raw), t = obj(row.attributes);
    const from = str(t.from_token_address), to = str(t.to_token_address);
    const sold = sameToken(chain, from, token), bought = sameToken(chain, to, token);
    const wallet = normalized(str(t.tx_from_address), chain), timestamp = str(t.block_timestamp), transaction = str(t.tx_hash);
    const amount = parseCount(sold ? t.from_token_amount : t.to_token_amount);
    if (sold === bought || !str(row.id) || !transaction || validateToken(chain, wallet) || !Number.isFinite(Date.parse(timestamp)) || amount === null || amount <= 0) return [];
    return [{id:`gecko:${str(row.id)}`,wallet,timestamp,transaction,side:sold?'sell' as const:'buy' as const,amount,source:'GeckoTerminal public pool trades (transaction sender; economic owner unverified)'}];
  });
}

export function parseExplorerHolders(payload: unknown, metadata: unknown): InvestigationInput['holders'] {
  const token = obj(metadata), supply = rawAmount(token.total_supply);
  return items(payload).flatMap(row => {
    const address = evmAddress(obj(row.address).hash), raw = rawAmount(row.value);
    if (!address || raw === undefined || raw <= 0n) return [];
    const balance = unitAmount(row.value, token.decimals);
    // Both values use identical raw units. Keep positive fractions positive;
    // fixed-point integer division would silently floor small holdings to zero.
    const ratio = supply && supply >= raw ? Number(raw * 100n) / Number(supply) : NaN;
    const share = Number.isFinite(ratio) && ratio > 0 ? ratio : null;
    return [{address,share,...(balance === undefined ? {} : {balance})}];
  });
}

export function parseExplorerTransfers(payload: unknown, receiver: string): TransferRecord[] {
  return items(payload).slice(0,50).flatMap(row => {
    const from = evmAddress(obj(row.from).hash), to = evmAddress(obj(row.to).hash);
    const timestamp = str(row.timestamp), transaction = str(row.hash), amount = unitAmount(row.value,18);
    if (!from || to !== receiver.toLowerCase() || !transaction || row.status !== 'ok' || !Number.isSafeInteger(parseCount(row.block_number)) || !Number.isFinite(Date.parse(timestamp)) || amount === undefined || amount <= 0) return [];
    return [{id:`blockscout:${transaction}:native`,from,to,timestamp,transaction,amount,native:true,token:'native',source:'Blockscout confirmed native transaction (bounded incoming history; first observed, not first-ever)'}];
  });
}

/** Schema: blockscout/blockscout-api-v2-swagger, InternalTransaction.
 * The view exposes call_type as type: delegatecall/callcode do not transfer value.
 */
export function parseExplorerInternalTransfers(payload: unknown, receiver: string): TransferRecord[] {
  return items(payload).slice(0,50).flatMap(row => {
    const from=evmAddress(obj(row.from).hash),to=evmAddress(obj(row.to).hash),index=parseCount(row.index);
    const timestamp=str(row.timestamp),transaction=str(row.transaction_hash),amount=unitAmount(row.value,18);
    if(!from||to!==receiver.toLowerCase()||!transaction||row.success!==true||row.error||!['call','selfdestruct','suicide'].includes(str(row.type))||index===null||!Number.isSafeInteger(index)||!Number.isSafeInteger(parseCount(row.block_number))||!Number.isFinite(Date.parse(timestamp))||amount===undefined||amount<=0)return [];
    return [{id:`blockscout:${transaction}:internal:${index}`,from,to,timestamp,transaction,amount,native:true,token:'native',source:'Blockscout successful native-value internal trace (bounded incoming history; first observed, not first-ever)'}];
  });
}

const cursor = (payload: unknown) => {
  const raw=obj(payload).next_page_params;
  if(raw===null)return '';
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  if(Object.keys(raw).length>16)return null;
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(raw).sort(([a],[b])=>a.localeCompare(b))){
    if(!key||key.length>64||!((typeof value==='string'&&value.length<=512)||(typeof value==='number'&&Number.isFinite(value))))return null;
    query.set(key,String(value));
  }
  return query.toString();
};
const pause = (ms:number, signal:AbortSignal) => new Promise<void>((resolve,reject)=>{
  signal.throwIfAborted();
  const abort=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
  signal.addEventListener('abort',abort,{once:true});
});
class PublicRequestError extends Error {
  constructor(message:string,readonly retryable=false,readonly retryAfterMs?:number){super(message);}
}

/** No keys, recursive crawling, fabricated history, or launch-coverage claims. */
export function createPublicHistory(deps: {fetcher?: typeof fetch; now?: () => number; clock?:()=>number; sleep?:(ms:number,signal:AbortSignal)=>Promise<void>} = {}) {
  return async (chain: Chain, token: string, options: PublicHistoryOptions): Promise<PublicHistoryResult> => {
    options.signal?.throwIfAborted();
    if (validateToken(chain,token)) throw Error('Invalid token address.');
    const result: PublicHistoryResult = {trades:[],transfers:[],identities:[],labels:[],reasons:[],sources:[],truncated:false};
    const now = deps.now || Date.now, fetchedAt = () => new Date(now()).toISOString();
    const clock=deps.clock||Date.now, startedAt=clock(),deadline=startedAt+50_000,sleep=deps.sleep||pause;
    // Deep scans reserve at least 23 seconds for incoming-address evidence.
    // Only holder requests use this sub-deadline; other tasks keep the shared one.
    const holderDeadline=options.mode==='deep'?startedAt+27_000:deadline;
    const cap=Math.min(200,Math.max(1,Number.isFinite(options.limit)?Math.floor(options.limit):100));
    const expanded=cap>100,fundingBudget=expanded?32:24,retryBudget=expanded?6:4;
    // Budget reserves metadata + creator + holder pages + optional pool request,
    // then funding pages. Retries have a separate small reserve, never new pages.
    const pageBudget=2+Math.ceil(cap/50)+(options.mode==='deep'?1+fundingBudget:0);
    const signal = AbortSignal.any([AbortSignal.timeout(50_000),...(options.signal?[options.signal]:[])]);
    const cooldown=new Map<string,number>();
    let requests=0, retries=0, retryWait=0;
    const checkDeadline=()=>{options.signal?.throwIfAborted();if(signal.aborted||clock()>=deadline)throw new PublicRequestError('Shared 50-second public evidence deadline expired.');};
    const get = async (url: string, timeoutMs = 8_000,phaseDeadline=deadline) => {
      const checkPhase=()=>{checkDeadline();if(clock()>=phaseDeadline)throw new PublicRequestError('Public holder phase deadline expired; remaining time reserved for funding.');};
      checkPhase();
      if(++requests>pageBudget)throw new PublicRequestError('Planned public evidence page budget reached.');
      const origin=new URL(url).origin;
      for(let attempt=0;attempt<2;attempt++){
        checkPhase();
        const wait=Math.max(0,(cooldown.get(origin)||0)-clock());
        if(wait){if(wait>5_000||retryWait+wait>5_000||wait>=Math.min(deadline,phaseDeadline)-clock())throw new PublicRequestError('Provider Retry-After exceeds the shared wait budget or request phase deadline.');retryWait+=wait;await sleep(wait,signal);checkPhase();}
        const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(timeoutMs,deadline-clock(),phaseDeadline-clock())))]);
        try{
          const response=await(deps.fetcher||fetch)(url,{headers:{Accept:'application/json'},signal:requestSignal,cache:'no-store'});
          if(!response.ok){
            const header=response.headers.get('Retry-After');
            const seconds=header&&/^\d+(?:\.\d+)?$/.test(header.trim())?Number(header)*1000:NaN;
            const after=header?(Number.isFinite(seconds)?seconds:Date.parse(header)-clock()):undefined;
            const delay=after!==undefined&&Number.isFinite(after)?Math.max(0,after):undefined;
            if(delay!==undefined)cooldown.set(origin,Math.max(cooldown.get(origin)||0,clock()+delay));
            throw new PublicRequestError(`Public provider returned HTTP ${response.status}.`,[408,429,500,502,503,504].includes(response.status),delay);
          }
          const payload:unknown=await response.json();checkPhase();return payload;
        }catch(error){
          checkPhase();
          const retryable=error instanceof PublicRequestError?error.retryable:error instanceof TypeError||requestSignal.aborted;
          const delay=error instanceof PublicRequestError&&error.retryAfterMs!==undefined?error.retryAfterMs:250;
          if(!retryable||attempt>0||retries>=retryBudget||delay>5_000||retryWait+delay>5_000||delay>=Math.min(deadline,phaseDeadline)-clock())throw error;
          retries++;retryWait+=delay;
          await sleep(delay,signal);checkPhase();
        }
      }
      throw new PublicRequestError('Public evidence retry limit reached.');
    };
    const run = async <T>(name: string, detail: string, operation: () => Promise<T>): Promise<T|undefined> => {
      try {
        const value = await operation();options.signal?.throwIfAborted();
        result.sources.push({name,status:'available',detail,fetchedAt:fetchedAt()});return value;
      } catch(error) {
        options.signal?.throwIfAborted();
        const explanation=error instanceof PublicRequestError?error.message:'Public endpoint failed, timed out or returned an invalid dataset.';
        result.sources.push({name,status:'unavailable',detail:`${explanation} No missing values were replaced with zero.`});
        result.reasons.push(`${name} was unavailable. Retry later; public endpoints may be rate limited or require access as provider policies change.`);
        return undefined;
      }
    };
    const labelsFrom = (values: unknown[], timestamp: string) => {
      for (const value of values) {
        const a = obj(value), address = evmAddress(a.hash);
        if (!address) continue;
        if (a.is_contract === true) result.labels.push({timestampBasis:'local-observation',address,category:'contract',label:str(a.name)||'Explorer-reported contract',source:'Blockscout address metadata',timestamp});
        if (/^0x0{40}$/.test(address) || address === '0x000000000000000000000000000000000000dead') result.labels.push({timestampBasis:'local-observation',address,category:'burn',label:'Burn address',source:'Known burn address',timestamp});
      }
    };
    const pool = options.report.market?.pairAddress;
    const tradesTask = options.mode === 'deep' && isMarketPairId(chain,pool)
      ? run('GeckoTerminal trades','Up to 300 recent trades from one selected market pool; sender attribution, not a complete wallet or launch history.',async()=>{
          const networks = {ethereum:'eth',base:'base',bsc:'bsc',solana:'solana',robinhood:'robinhood'};
          const payload = await get(`https://api.geckoterminal.com/api/v2/networks/${networks[chain]}/pools/${encodeURIComponent(pool)}/trades`);
          const trades = parsePoolTrades(payload,chain,token);
          if (Array.isArray(obj(payload).data) && (obj(payload).data as unknown[]).length >= 300) result.truncated=true;
          return trades;
        }) : Promise.resolve(undefined);
    const explorer = chain === 'ethereum' ? 'https://eth.blockscout.com' : chain === 'base' ? 'https://base.blockscout.com' : chain === 'robinhood' ? 'https://robinhoodchain.blockscout.com' : undefined;
    if (explorer) {
      const base = `${explorer}/api/v2`, path = encodeURIComponent(token.toLowerCase());
      const [metadata, firstPage, creation, publicTrades] = await Promise.all([
        run('Blockscout token','Explorer token decimals, total supply and holder count at retrieval time.',async()=>{
          const value = obj(await get(`${base}/tokens/${path}`));
          if (value.type !== 'ERC-20') throw Error('Fungible token metadata unavailable.');
          return value;
        }),
        run('Blockscout Holders','Bounded current token-holder pages. Omitted wallets have unknown holdings, not zero.',async()=>{
          const value = await get(`${base}/tokens/${path}/holders`,18_000,holderDeadline);items(value);return value;
        }),
        run('Blockscout creator','Explorer-reported deployment address and creation transaction; may identify a factory, not a person or current authority.',async()=>{
          const value = obj(await get(`${base}/addresses/${path}`));
          if (value.is_contract !== true) throw Error('Token contract metadata unavailable.');
          return value;
        }),
        // Attach the concurrent pool promise immediately so cancellation cannot
        // leave a detached rejection while explorer requests are being awaited.
        tradesTask,
      ]);
      if (metadata) {result.holderCount=parseCount(metadata.holders_count);result.totalSupply=unitAmount(metadata.total_supply,metadata.decimals)??null;}
      if (firstPage !== undefined) {
        result.holders=parseExplorerHolders(firstPage,metadata);
        labelsFrom(items(firstPage).map(row=>row.address),fetchedAt());
        let next=cursor(firstPage),pages=1;
        const seen=new Set<string>();
        while(next&&result.holders.length<cap&&pages<Math.ceil(cap/50)){
          if(seen.has(next)){result.truncated=true;result.reasons.push('Blockscout holder cursor repeated; paging stopped and acquired balances were retained.');break;}
          seen.add(next);
          const page = await run(`Blockscout holder page ${pages+1}`,'Additional bounded holder snapshot page; earlier successful pages are retained on failure.',async()=>{const p=await get(`${base}/tokens/${path}/holders?${next}`,18_000,holderDeadline);items(p);return p;});
          if (page === undefined) {result.truncated=true;break;}
          result.holders=[...new Map([...result.holders,...parseExplorerHolders(page,metadata)].map(h=>[h.address,h])).values()];labelsFrom(items(page).map(row=>row.address),fetchedAt());
          next=cursor(page);pages++;
        }
        if(next===null){result.truncated=true;result.reasons.push('Invalid pagination cursor from Blockscout Holders; acquired balances retained and remaining coverage unknown.');}
        if(next||result.holders.length>cap)result.truncated=true;
        result.holders=[...new Map(result.holders.map(h=>[h.address,h])).values()].slice(0,cap);
        const source=result.sources.find(source=>source.name==='Blockscout Holders');
        if(source)source.detail=`${pages} current holder page(s) captured; ${result.holders.length} distinct addresses retained (cap ${cap}). ${next===null?'Invalid pagination cursor; remaining coverage unknown.':next?'More pages exist or a later page failed.':'Provider cursor ended.'} This is a retrieval-time snapshot, not historical balances.`;
      }
      const creator = evmAddress(creation?.creator_address_hash), transaction = str(creation?.creation_transaction_hash);
      if (creator && transaction) result.identities.push({timestampBasis:'local-observation',address:creator,role:'creator',source:'Blockscout deployment metadata (may be a factory)',timestamp:fetchedAt(),transaction});
      result.trades=publicTrades||[];
      if (options.mode === 'deep' && !options.skipFunding) {
        const excluded = new Set([...result.labels.map(l=>l.address),...options.report.holders.filter(h=>h.contract||['exchange','bridge','pool','burn'].includes(h.tag.toLowerCase())).map(h=>h.address.toLowerCase()),...(pool?[pool.toLowerCase()]:[])]);
        const candidates = [...new Set([...(result.holders||options.report.holders).map(h=>h.address.toLowerCase()),...result.trades.map(t=>t.wallet)])].filter(a=>evmAddress(a)&&!excluded.has(a));
        const walletCap=expanded?12:8,selected=candidates.slice(0,walletCap);
        if(candidates.length>walletCap)result.truncated=true;
        type FundingState={address:string;internal:boolean;pages:number;next:string;seen:Set<string>;done:boolean;failure?:string;capturedAt?:string;transfers:TransferRecord[]};
        const states:FundingState[]=selected.flatMap(address=>[false,true].map(internal=>({address,internal,pages:0,next:'',seen:new Set<string>(),done:false,transfers:[]})));
        let fundingPages=0;
        const fetchPage=async(state:FundingState)=>{
          if(state.done||fundingPages>=fundingBudget)return;
          fundingPages++;
          const query=new URLSearchParams(state.next);query.set('filter','to');
          const endpoint=state.internal?'internal-transactions':'transactions';
          try{
            const payload=await get(`${base}/addresses/${state.address}/${endpoint}?${query}`);
            const parsed=state.internal?parseExplorerInternalTransfers(payload,state.address):parseExplorerTransfers(payload,state.address);
            state.transfers.push(...parsed);state.pages++;state.capturedAt=fetchedAt();
            labelsFrom(items(payload).flatMap(row=>[row.from,row.to]),state.capturedAt);
            const next=cursor(payload);
            if(next===null){state.failure='Invalid pagination cursor; acquired records retained and remaining coverage unknown.';state.done=true;result.truncated=true;return;}
            if(next&&state.seen.has(next)){state.failure='Provider cursor repeated; acquired records retained.';state.done=true;result.truncated=true;}
            if(next)state.seen.add(next);
            state.next=next;state.done=state.done||!next;
            if(items(payload).length>50||obj(obj(payload).meta).status===2){result.truncated=true;state.failure='Provider trace indexing is pending or page size exceeds the bounded parser.';}
          }catch(error){options.signal?.throwIfAborted();state.done=true;state.failure=error instanceof PublicRequestError?error.message:'Request failed, timed out or returned an invalid dataset.';result.truncated=true;}
        };
        // Breadth first: normal page 1 for every wallet, then internal page 1,
        // then older normal pages. At most two requests are in flight here.
        const passes=expanded?[false,true,false,true,false]:[false,true,false];
        for(const internal of passes){
          const pending=states.filter(state=>state.internal===internal&&!state.done);
          for(let i=0;i<pending.length&&fundingPages<fundingBudget;i+=2)await Promise.all(pending.slice(i,i+Math.min(2,fundingBudget-fundingPages)).map(fetchPage));
        }
        for(const state of states){
          const name=`Blockscout ${state.internal?'internal funding':'funding'} ${state.address}`;
          const bounded=!!state.next||!state.done;
          if(bounded)result.truncated=true;
          const detail=`${state.pages} ${state.internal?'internal native-value trace':'normal incoming transaction'} page(s), ${new Set(state.transfers.map(t=>t.id)).size} parsed transfer record(s) captured. ${state.failure|| (bounded?'Page/deadline budget limits further history.':'Provider cursor ended.')} First observed within these pages is not first-ever funding; explorer indexing can be incomplete.`;
          result.sources.push({name,status:state.pages?'available':'unavailable',detail,...(state.capturedAt?{fetchedAt:state.capturedAt}:{})});
          if(state.failure)result.reasons.push(`${name}: ${state.failure}${state.pages?' Earlier successful pages were retained.':''}`);
        }
        const all=states.flatMap(state=>state.transfers);
        const normalKeys=new Set(all.filter(t=>t.id.endsWith(':native')).map(t=>`${t.transaction}:${t.from}:${t.to}:${t.amount}`));
        // Index 0 can repeat the top-level coin transfer; keep legitimate child
        // traces with equal amounts and different indices as separate evidence.
        result.transfers=[...new Map(all.filter(t=>!t.id.endsWith(':internal:0')||!normalKeys.has(`${t.transaction}:${t.from}:${t.to}:${t.amount}`)).map(t=>[t.id,t])).values()];
        result.reasons.push(`Public funding scope: ${fundingPages} page request(s) across ${selected.length} selected addresses not labeled as contracts (maximum ${walletCap}; ${fundingBudget} funding pages). Up to ${expanded?3:2} normal and ${expanded?2:1} internal pages per address, subject to the shared 50-second deadline. Records are first observed in this bounded sample, never verified first-ever funding; unrecognized services and unindexed traces remain possible.`);
      }
    } else {
      result.trades=await tradesTask||[];
      result.reasons.push('Public explorer holder, creator and funding fallback currently supports Ethereum, Base and Robinhood Chain. Other chains retain available public snapshots and pool trades.');
    }
    if(options.mode==='deep')result.reasons.push('Public trade scope: at most 300 recent trades from one selected pool, normally within 24 hours. Transaction sender may be a relayer or shared service. Sample net buying is not current holdings; no complete launch or first-buyer history is established.');
    return result;
  };
}
