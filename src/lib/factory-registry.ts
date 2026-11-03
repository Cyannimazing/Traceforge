import {validateToken} from './analysis';
import {SUPPORTED_POOL_FACTORIES,POOL_CREATION_TOPICS,decodePoolCreationEvent,type PoolChain,type PoolProtocol} from './pool-launch';
export type RegistryPool={pool:string;factory:string;protocol:PoolProtocol;creationTransactionHint:string;blockNumber:number;blockHash:string;token0:string;token1:string};
type Range={protocol:PoolProtocol;position:1|2;from:number;to:number};
export type RegistryCheckpoint={version:1;chain:PoolChain;token:string;anchor:{number:number;hash:string};pending:Range[];covered:Range[];pools:RegistryPool[];completedRanges:number;source:string};
export type RegistryResult={checkpoint:RegistryCheckpoint;status:'complete'|'partial'|'unavailable';detail:string;retryAfterMs?:number};
export type RegistryReader={head:(chain:PoolChain,signal?:AbortSignal)=>Promise<{number:number;hash:string}>;blockHash:(chain:PoolChain,number:number,signal?:AbortSignal)=>Promise<string>;logs:(chain:PoolChain,range:{from:number;to:number;address:string;topics:(string|null)[]},signal?:AbortSignal)=>Promise<{logs:unknown[];through:number;source:string}>};
const validHash=(s:unknown):s is string=>typeof s==='string'&&/^0x[0-9a-f]{64}$/i.test(s);
const clean=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
// Official subgraph indexing starts, not independently proved deployment receipts.
// https://github.com/Uniswap/{v2-subgraph,v3-subgraph}/tree/main/config
const starts:Record<PoolChain,Record<PoolProtocol,number>>={ethereum:{v2:10000834,v3:12369621},base:{v2:6601915,v3:2009445}};
export function createFactoryRegistry(reader:RegistryReader){
 return async(chain:PoolChain,tokenInput:string,options:{checkpoint?:RegistryCheckpoint;signal?:AbortSignal;onCheckpoint?:(cp:RegistryCheckpoint)=>Promise<void>;maxRanges?:number}={}):Promise<RegistryResult>=>{
  if(validateToken(chain,tokenInput))throw Error('Invalid registry token.');const token=tokenInput.toLowerCase();
  const head=await reader.head(chain,options.signal);if(!Number.isSafeInteger(head.number)||head.number<0||!validHash(head.hash))throw Error('Registry finalized head is invalid.');
  const fresh=():RegistryCheckpoint=>({version:1,chain,token,anchor:head,pending:(['v2','v3'] as const).flatMap(protocol=>SUPPORTED_POOL_FACTORIES[chain][protocol]&&head.number>=starts[chain][protocol]?([1,2] as const).map(position=>({protocol,position,from:starts[chain][protocol],to:head.number})):[]),covered:[],pools:[],completedRanges:0,source:'Configured official Uniswap factories since published subgraph indexing starts'});
  let cp=fresh();
  if(options.checkpoint){const c=clean(options.checkpoint);if(c.version!==1||c.chain!==chain||c.token!==token||!validHash(c.anchor?.hash)||!Number.isSafeInteger(c.anchor?.number)||c.anchor.number<0||!Array.isArray(c.pending)||!Array.isArray(c.covered)||!Array.isArray(c.pools)||c.pools.length>10000||c.completedRanges!==c.covered.length||typeof c.source!=='string')throw Error('Registry checkpoint does not match this token scope.');
   const ranges=[...c.covered,...c.pending];
   if(ranges.some(r=>!r||!['v2','v3'].includes(r.protocol)||![1,2].includes(r.position)||!Number.isSafeInteger(r.from)||!Number.isSafeInteger(r.to)||r.from>r.to||r.from<starts[chain][r.protocol]||r.to>c.anchor.number))throw Error('Registry checkpoint has invalid ranges.');
   for(const protocol of ['v2','v3'] as const)for(const position of [1,2] as const){let next=starts[chain][protocol];const parts=ranges.filter(r=>r.protocol===protocol&&r.position===position).sort((a,b)=>a.from-b.from);for(const r of parts){if(r.from!==next)throw Error('Registry checkpoint coverage has a gap or overlap.');next=r.to+1;}if(c.anchor.number>=starts[chain][protocol]&&SUPPORTED_POOL_FACTORIES[chain][protocol]&&next!==c.anchor.number+1)throw Error('Registry checkpoint coverage is missing a factory range.');}
   if(new Set(c.pools.map(p=>p.pool)).size!==c.pools.length||c.pools.some(p=>!p||validateToken(chain,p.pool)||!['v2','v3'].includes(p.protocol)||p.factory!==SUPPORTED_POOL_FACTORIES[chain][p.protocol]||validateToken(chain,p.token0)||validateToken(chain,p.token1)||![p.token0,p.token1].includes(token)||!validHash(p.creationTransactionHint)||!validHash(p.blockHash)||!Number.isSafeInteger(p.blockNumber)||p.blockNumber<starts[chain][p.protocol]||p.blockNumber>c.anchor.number))throw Error('Registry checkpoint has invalid candidate identities.');cp=c;
   if(cp.anchor.number>head.number||await reader.blockHash(chain,cp.anchor.number,options.signal)!==cp.anchor.hash)cp=fresh();
   else if(!cp.pending.length&&head.number>cp.anchor.number){
    // A completed snapshot can catch up on an explicit discovery request. Keep
    // unfinished snapshots anchored so a moving head cannot make them endless.
    const from=cp.anchor.number+1;
    cp.pending=(['v2','v3'] as const).flatMap(protocol=>SUPPORTED_POOL_FACTORIES[chain][protocol]&&head.number>=starts[chain][protocol]?([1,2] as const).map(position=>({protocol,position,from:Math.max(from,starts[chain][protocol]),to:head.number})):[]);
    cp.anchor=head;
   }
  }
  const publish=async()=>{await options.onCheckpoint?.(clean(cp));};
  await publish();
  for(let step=0;step<(options.maxRanges??4)&&cp.pending.length;step++){
   options.signal?.throwIfAborted();const r=cp.pending[0],factory=SUPPORTED_POOL_FACTORIES[chain][r.protocol];
   if(!factory||![1,2].includes(r.position)||!Number.isSafeInteger(r.from)||!Number.isSafeInteger(r.to)||r.from<starts[chain][r.protocol]||r.from>r.to||r.to>cp.anchor.number)throw Error('Registry checkpoint contains an invalid range.');
   const padded='0x'+token.slice(2).padStart(64,'0'),topics=r.position===1?[POOL_CREATION_TOPICS[r.protocol],padded]:[POOL_CREATION_TOPICS[r.protocol],null,padded];
   let batch:Awaited<ReturnType<RegistryReader['logs']>>;
   try{batch=await reader.logs(chain,{from:r.from,to:r.to,address:factory,topics},options.signal);}
   catch(error){options.signal?.throwIfAborted();const e=error as Error&{retryAfterMs?:number;rangeTooLarge?:boolean};if(e.rangeTooLarge&&r.from<r.to){const mid=Math.floor((r.from+r.to)/2);cp.pending.splice(0,1,{...r,to:mid},{...r,from:mid+1});await publish();continue;}return {checkpoint:cp,status:'unavailable',detail:'Factory history remains unfinished: '+(e.message||'provider unavailable'),...(e.retryAfterMs?{retryAfterMs:e.retryAfterMs}:{})};}
   if(!Number.isSafeInteger(batch.through)||batch.through<r.from||batch.through>r.to||!Array.isArray(batch.logs))return {checkpoint:cp,status:'unavailable',detail:'Factory query did not attest an advancing covered block range.'};
   const found:RegistryPool[]=[];
   for(const raw of batch.logs){const event=decodePoolCreationEvent(chain,raw);
    if(!event||event.factory!==factory||event.protocol!==r.protocol||event.blockNumber<r.from||event.blockNumber>batch.through||!validHash(event.blockHash)||(r.position===1?event.token0:event.token1)!==token)return {checkpoint:cp,status:'unavailable',detail:'Factory data did not match the requested event, token position or range.'};
    found.push({pool:event.pool,factory:event.factory,protocol:event.protocol,creationTransactionHint:event.transaction,blockNumber:event.blockNumber,blockHash:event.blockHash,token0:event.token0,token1:event.token1});
   }
   const all=new Map(cp.pools.map(p=>[p.pool,p]));for(const p of found){const prior=all.get(p.pool);if(prior&&(prior.creationTransactionHint!==p.creationTransactionHint||prior.blockHash!==p.blockHash))return {checkpoint:cp,status:'unavailable',detail:'Conflicting pool creation records require revalidation.'};all.set(p.pool,p);}
   if(all.size>10000)return {checkpoint:cp,status:'partial',detail:'The 10000-pool registry storage bound was reached; coverage is incomplete.'};
   cp.pools=[...all.values()].sort((a,b)=>a.blockNumber-b.blockNumber||a.pool.localeCompare(b.pool));cp.source=batch.source;cp.covered.push({...r,to:batch.through});cp.completedRanges++;
   if(batch.through===r.to)cp.pending.shift();else cp.pending[0]={...r,from:batch.through+1};await publish();
  }
  return {checkpoint:cp,status:cp.pending.length?'partial':'complete',detail:cp.pending.length?'Factory ranges remain. Continue discovery to resume at the saved cursor.':'Configured factory ranges covered through the fixed finalized anchor. Other factories and earlier-than-index-start activity are outside this registry. Each candidate still needs receipt verification.'};
 };
}
