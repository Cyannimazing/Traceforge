/** A provider-corroborated comparison clock, not certified UTC or an OS adjustment. */
export type EvidenceClock = {
  basis: 'provider-quorum' | 'local'; referenceAt: string; localCapturedAt: string;
  offsetMs: number; sources: {name:string; date:string; age:string|null; cache:string|null;roundTripMs?:number;cacheHeaders?:Record<string,string>}[]; excluded?:{name:string;reason:string}[]; referenceAgeMs?:number; detail:string;
};
export function clockReferenceTime(clock:EvidenceClock|undefined,capturedAt:number):number {
  if(!Number.isFinite(capturedAt))return NaN;
  if(clock?.basis!=='provider-quorum'||new Set(clock.sources.map(s=>s.name)).size<2)return capturedAt;
  const reference=Date.parse(clock.referenceAt),local=Date.parse(clock.localCapturedAt),age=capturedAt-local;
  return Number.isFinite(reference)&&Number.isFinite(local)&&Math.abs(reference-local)<=86_400_000&&age>=-1000&&age<=120_000?reference:capturedAt;
}
const probes = [
  {name:'Ethereum PublicNode',url:'https://ethereum-rpc.publicnode.com',body:{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},valid:(v:any)=>v?.id===1&&!v.error&&v.result==='0x1'},
  {name:'Solana public RPC',url:'https://api.mainnet-beta.solana.com',body:{jsonrpc:'2.0',id:1,method:'getHealth',params:[]},valid:(v:any)=>v?.id===1&&!v.error&&v.result==='ok'},
  {name:'Ethereum Blockscout',url:'https://eth.blockscout.com/api/v2/stats',body:undefined,valid:(v:any)=>/^\d+$/.test(String(v?.total_blocks))&&Number(v.total_blocks)>0},
];
const httpDate=/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
type Sample=EvidenceClock['sources'][number]&{at:number;mono:number};
export function createEvidenceClock(deps:{fetcher?:typeof fetch;now?:()=>number;monotonic?:()=>number}={}) {
  const now=deps.now||Date.now,mono=deps.monotonic||(()=>performance.now());
  let cached:{at:number;mono:number;sources:EvidenceClock['sources'];excluded:NonNullable<EvidenceClock['excluded']>}|undefined;
  const local=(detail:string,excluded:NonNullable<EvidenceClock['excluded']>=[]):EvidenceClock=>{const at=new Date(now()).toISOString();return {basis:'local',referenceAt:at,localCapturedAt:at,offsetMs:0,sources:[],excluded,detail};};
  const resolved=(entry:NonNullable<typeof cached>):EvidenceClock=>{
    const localTime=now(),reference=entry.at+Math.max(0,mono()-entry.mono),offsetMs=Math.round(reference-localTime);
    if(Math.abs(offsetMs)>86_400_000)return local('Provider/local clock disagreement exceeds 24 hours. No provider reference accepted; local timestamp checks remain active.');
    return {basis:'provider-quorum',referenceAt:new Date(reference).toISOString(),localCapturedAt:new Date(localTime).toISOString(),offsetMs,sources:entry.sources,excluded:entry.excluded,referenceAgeMs:Math.max(0,Math.round(mono()-entry.mono)),detail:`Timestamp validation uses corroborated provider response time (${Math.round(offsetMs/1000)} seconds relative to the local capture clock). Event timestamps and local capture times are unchanged. HTTP clocks may share infrastructure; this is not independent UTC certification.`};
  };
  return async(options:{signal?:AbortSignal}={}):Promise<EvidenceClock>=>{
    options.signal?.throwIfAborted();
    if(cached&&mono()>=cached.mono&&mono()-cached.mono<60_000)return resolved(cached);
    cached=undefined;
    const excluded:NonNullable<EvidenceClock['excluded']>=[];
    const results=await Promise.all(probes.map(async probe=>{
      const start=mono();
      const reject=(reason:string)=>{excluded.push({name:probe.name,reason});return undefined;};
      try {
        const response=await(deps.fetcher||fetch)(probe.url,{method:probe.body?'POST':'GET',headers:{'Content-Type':'application/json','Cache-Control':'no-cache, no-store'},...(probe.body?{body:JSON.stringify(probe.body)}:{}),cache:'no-store',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(5000),...(options.signal?[options.signal]:[])])});
        if(!response.ok||response.redirected)return reject('Unsuccessful or redirected response.');
        const date=response.headers.get('date')||'',age=response.headers.get('age'),cache=response.headers.get('cf-cache-status');
        if(!httpDate.test(date)||new Date(date).toUTCString()!==date||!Number.isFinite(Date.parse(date)))return reject('Missing or invalid HTTP Date.');
        if(age!==null&&(!/^\d+$/.test(age)||Number(age)!==0))return reject('Cached or invalid Age header.');
        if(cache&&!['DYNAMIC','BYPASS','MISS','EXPIRED'].includes(cache.toUpperCase()))return reject('Cache status indicates a reused response.');
        const cacheHeaders=Object.fromEntries(['cache-status','x-cache','x-cache-status','x-proxy-cache'].flatMap(name=>{const value=response.headers.get(name);return value?[[name,value]]:[];}));
        if(Object.values(cacheHeaders).some(value=>/\b(hit|stale|revalidated|updating)\b/i.test(value)))return reject('An intermediary cache reports a reused response.');
        if(!probe.valid(await response.json()))return reject('Unexpected endpoint response schema.');
        const end=mono();if(end<start||end-start>5000)return reject('Round trip exceeds the bounded clock window.');
        return {name:probe.name,date,age,cache,roundTripMs:Math.round(end-start),cacheHeaders,at:Date.parse(date),mono:end} satisfies Sample;
      } catch {return reject('Request failed or timed out.');}
    }));
    options.signal?.throwIfAborted();
    const end=mono(),samples=results.filter(v=>v!==undefined).map(v=>({...v,at:v.at+Math.max(0,end-v.mono)})).sort((a,b)=>a.at-b.at);
    const groups=samples.map((sample,index)=>samples.slice(index).filter(other=>other.at-sample.at<=5000));
    const largest=Math.max(0,...groups.map(g=>g.length)),winners=groups.filter(g=>g.length===largest);
    if(largest<2||winners.length!==1)return local('Fresh provider response clocks did not establish a unique quorum. Local timestamp checks remain active; conflicting future records are withheld.',excluded);
    const group=winners[0],at=group.reduce((sum,v)=>sum+v.at,0)/group.length;
    cached={at,mono:end,sources:group.map(({name,date,age,cache,roundTripMs,cacheHeaders})=>({name,date,age,cache,roundTripMs,cacheHeaders})),excluded:[...excluded,...samples.filter(sample=>!group.includes(sample)).map(sample=>({name:sample.name,reason:'Response clock disagrees with the accepted quorum.'}))]};
    return resolved(cached);
  };
}
