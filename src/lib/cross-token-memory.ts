import {CHAINS,type Chain} from './analysis';
import type {InvestigationReport} from './investigation-types';
import {topHolderCohort} from './top-holder-cohort';
import {holderScope} from './holder-scope';

export type MemoryBlock={number:string;hash:string;timestamp:string};
export type MemoryEvent={kind:'erc20'|'native';token:string;from:string;to:string;amountRaw:string;transaction:string;block:MemoryBlock;logIndex:number|null;initiator:string};
export type MemoryParticipant={address:string;activity:MemoryEvent;holding:{block:MemoryBlock;balanceRaw:string;totalSupplyRaw:string;decimals:number};code:string};
export type MemoryConnection={event:MemoryEvent;participants:MemoryParticipant[];senderFanout:{recipients:number;complete:boolean}};
export type VerifiedMemoryRecord={chain:Chain;chainId:string;token:string;anchor:MemoryBlock;verifiedAt:string;source:'configured-rpc';connections:MemoryConnection[]};
export type CrossTokenMemory={version:1;chain:Chain;token:string;observedAt:string;status:'partial'|'unavailable';records:VerifiedMemoryRecord[];scope:{selectedWallets:number;queriedWallets:number;candidateTokens:number;verifiedTransactions:number;truncated:boolean};reasons:string[]};
export type MemoryHit={id:string;chain:Chain;token:string;wallets:string[];events:MemoryEvent[];connections:MemoryConnection[];verifiedAt:string};
const ADDRESS=/^0x[0-9a-f]{40}$/i,HASH=/^0x[0-9a-f]{64}$/i,HEX=/^0x(?:0|[1-9a-f][0-9a-f]*)$/i;
const norm=(v:string)=>v.toLowerCase();
const address=(v:unknown):v is string=>typeof v==='string'&&ADDRESS.test(v)&&!/^0x0{40}$/i.test(v)&&norm(v)!=='0x000000000000000000000000000000000000dead';
const uint=(v:unknown):bigint|null=>typeof v==='string'&&/^\d{1,78}$/.test(v)&&BigInt(v)<2n**256n?BigInt(v):null;
const date=(v:unknown)=>typeof v==='string'?Date.parse(v):NaN;
const blockNumber=(b:MemoryBlock)=>BigInt(b.number);
const eventKey=(e:MemoryEvent)=>`${norm(e.transaction)}:${e.kind}:${e.logIndex??'native'}`;
const fresh=(at:unknown,reference:number)=>Number.isFinite(date(at))&&date(at)>=reference-600_000&&date(at)<=reference+120_000;
const validBlock=(b:MemoryBlock,latest:number)=>!!b&&typeof b.number==='string'&&HEX.test(b.number)&&BigInt(b.number)<=BigInt(Number.MAX_SAFE_INTEGER)&&typeof b.hash==='string'&&HASH.test(b.hash)&&Number.isFinite(date(b.timestamp))&&date(b.timestamp)>0&&date(b.timestamp)<=latest;
function canonicalEvent(e:MemoryEvent):MemoryEvent{return {...e,token:norm(e.token),from:norm(e.from),to:norm(e.to),initiator:norm(e.initiator),transaction:norm(e.transaction),amountRaw:BigInt(e.amountRaw).toString(),block:{...e.block,number:'0x'+blockNumber(e.block).toString(16),hash:norm(e.block.hash)}};}

/** Admission of adapter-verified proofs, not an RPC verifier. The collector must
 * validate receipts, historical state and canonical anchors before constructing
 * records. Names, provider classifications and unanchored report edges are not
 * proofs. Missing search coverage always retains the possible two-hit ceiling. */
export function qualifyCrossTokenMemory(report:InvestigationReport):{hits:MemoryHit[];count:number;strictRange:{lower:number;upper:number};notes:string[]}{
 const empty=(reason:string)=>({hits:[] as MemoryHit[],count:0,strictRange:{lower:0,upper:2},notes:[reason,'A bounded cross-token search does not establish the absence of other prior relationships.']});
 // Market-only refreshes advance report.fetchedAt without re-reading history.
 // Validate against the investigation capture, preserving the proof's own date.
 const memory=(report as InvestigationReport&{crossTokenMemory?:CrossTokenMemory}).crossTokenMemory,captured=date(report.investigation.coverage.fetchedAt||report.fetchedAt);
 if(report.fixture||report.providerAnalysis||report.chain==='solana'||!address(report.token)||!Number.isFinite(captured))return empty('Independent EVM report provenance is required for memory admission.');
 if(!memory||memory.version!==1||memory.chain!==report.chain||typeof memory.token!=='string'||norm(memory.token)!==norm(report.token)||memory.status!=='partial'||!fresh(memory.observedAt,captured)||!Array.isArray(memory.records)||memory.records.length>64)return empty('No current admissible cross-token search result is available.');
 const eligible=new Set(topHolderCohort(report).holders.map(h=>norm(h.address))),excluded=new Set(holderScope(report).infrastructureAddresses.map(norm));
 const records:VerifiedMemoryRecord[]=[],canonicalBlocks=new Map<string,{hash:string;time:number}>(),canonicalEvents=new Map<string,string>();let conflict=false,rejected=0;
 const noteBlock=(b:MemoryBlock)=>{const key=blockNumber(b).toString(),value={hash:norm(b.hash),time:date(b.timestamp)},previous=canonicalBlocks.get(key);if(previous&&(previous.hash!==value.hash||previous.time!==value.time))conflict=true;else canonicalBlocks.set(key,value);};
 const noteEvent=(e:MemoryEvent)=>{const key=eventKey(e),value=JSON.stringify(canonicalEvent(e)),previous=canonicalEvents.get(key);if(previous&&previous!==value)conflict=true;else canonicalEvents.set(key,value);};
 for(const candidate of memory.records){
  try{
   const r=candidate,latest=Math.min(captured+120_000,date(r.verifiedAt)+120_000);
   if(r.chain!==report.chain||typeof r.chainId!=='string'||! /^(?:[1-9]\d*|0x[0-9a-f]+)$/i.test(r.chainId)||BigInt(r.chainId)!==BigInt(CHAINS[report.chain].id!)||r.source!=='configured-rpc'||!address(r.token)||norm(r.token)===norm(report.token)||!fresh(r.verifiedAt,captured)||!validBlock(r.anchor,latest)||!Array.isArray(r.connections)||r.connections.length<1||r.connections.length>128){rejected++;continue;}
   const token=norm(r.token),within=(b:MemoryBlock)=>validBlock(b,latest)&&blockNumber(b)<=blockNumber(r.anchor)&&date(b.timestamp)<=date(r.anchor.timestamp);
   const validEvent=(e:MemoryEvent)=>!!e&&['erc20','native'].includes(e.kind)&&address(e.from)&&address(e.to)&&norm(e.from)!==norm(e.to)&&address(e.initiator)&&typeof e.transaction==='string'&&HASH.test(e.transaction)&&(uint(e.amountRaw)??0n)>0n&&within(e.block)&&(e.kind==='erc20'?typeof e.token==='string'&&norm(e.token)===token&&Number.isSafeInteger(e.logIndex)&&e.logIndex!>=0:e.logIndex===null&&['native',report.chain==='bsc'?'BNB':'ETH'].includes(e.token));
   const connections:MemoryConnection[]=[];
   noteBlock(r.anchor);
   for(const c of r.connections){
    if(!c||!validEvent(c.event)||norm(c.event.initiator)!==norm(c.event.from)||!Array.isArray(c.participants)||c.participants.length!==2||c.senderFanout?.complete!==true||!Number.isSafeInteger(c.senderFanout.recipients)||c.senderFanout.recipients<1||c.senderFanout.recipients>20){rejected++;continue;}
    const members=new Set<string>();let valid=true;
    for(const p of c.participants){
     const h=p?.holding,balance=uint(h?.balanceRaw),supply=uint(h?.totalSupplyRaw);
     if(!p||!address(p.address)||excluded.has(norm(p.address))||norm(p.address)===token||typeof p.code!=='string'||!(p.code==='0x'||/^0xef0100[0-9a-f]{40}$/i.test(p.code))||!h||balance===null||supply===null||balance<=0n||supply<=0n||balance>supply||balance*10000n<supply||!Number.isInteger(h.decimals)||h.decimals<0||h.decimals>255||!within(h.block)||!validEvent(p.activity)||p.activity.kind!=='erc20'||norm(p.activity.initiator)!==norm(p.address)||![norm(p.activity.from),norm(p.activity.to)].includes(norm(p.address))||!(blockNumber(p.activity.block)<=blockNumber(h.block)&&date(p.activity.block.timestamp)<=date(h.block.timestamp)||norm(p.activity.from)===norm(p.address)&&blockNumber(p.activity.block)===blockNumber(h.block)+1n&&date(h.block.timestamp)<=date(p.activity.block.timestamp))){valid=false;break;}
     members.add(norm(p.address));
    }
    if(!valid||members.size!==2||!members.has(norm(c.event.from))||!members.has(norm(c.event.to))){rejected++;continue;}
    const receiver=c.participants.find(p=>norm(p.address)===norm(c.event.to))!;
    if(c.event.kind==='native'&&(date(c.event.block.timestamp)>date(receiver.activity.block.timestamp)||blockNumber(c.event.block)>blockNumber(receiver.activity.block))){rejected++;continue;}
    const [a,b]=c.participants;
    if(blockNumber(a.holding.block)===blockNumber(b.holding.block)&&(a.holding.totalSupplyRaw!==b.holding.totalSupplyRaw||a.holding.decimals!==b.holding.decimals)){rejected++;continue;}
    noteBlock(c.event.block);noteEvent(c.event);
    for(const p of c.participants){noteBlock(p.activity.block);noteBlock(p.holding.block);noteEvent(p.activity);}
    connections.push(c);
   }
   if(connections.length)records.push({...r,token,connections});
  }catch{rejected++;}
 }
 const blocks=[...canonicalBlocks].sort((a,b)=>BigInt(a[0])<BigInt(b[0])?-1:1);for(let i=1;i<blocks.length;i++)if(blocks[i][1].time<blocks[i-1][1].time)conflict=true;
 if(conflict)return empty('Conflicting canonical event or block anchors were withheld; the collector must revalidate them.');
 const byToken=new Map<string,VerifiedMemoryRecord[]>();for(const r of records){const rows=byToken.get(r.token)||[];rows.push(r);byToken.set(r.token,rows);}
 const hits:MemoryHit[]=[];
 for(const [token,rows] of byToken){
  const adjacency=new Map<string,Set<string>>(),events=new Map<string,MemoryEvent>();
  for(const r of rows)for(const c of r.connections){const e=canonicalEvent(c.event);events.set(eventKey(e),e);for(const [a,b]of [[e.from,e.to],[e.to,e.from]]){const neighbors=adjacency.get(a)||new Set<string>();neighbors.add(b);adjacency.set(a,neighbors);}}
  const seen=new Set<string>();
  for(const start of [...adjacency.keys()].sort()){if(seen.has(start))continue;const pending=[start],component:string[]=[];while(pending.length){const a=pending.pop()!;if(seen.has(a))continue;seen.add(a);component.push(a);pending.push(...adjacency.get(a)!);}component.sort();const wallets=component.filter(a=>eligible.has(a));if(wallets.length<2)continue;
   const componentSet=new Set(component),proofs=[...events.values()].filter(e=>componentSet.has(e.from)&&componentSet.has(e.to)).sort((a,b)=>eventKey(a).localeCompare(eventKey(b))),relevant=rows.filter(r=>r.connections.some(c=>componentSet.has(norm(c.event.from))));
   const admitted=new Map<string,MemoryConnection>();for(const r of relevant)for(const c of r.connections)if(componentSet.has(norm(c.event.from))&&componentSet.has(norm(c.event.to))&&!admitted.has(eventKey(c.event)))admitted.set(eventKey(c.event),structuredClone(c));
   hits.push({id:`memory:${report.chain}:${token}:${component.join(':')}`,chain:report.chain,token,wallets,events:proofs,connections:[...admitted].sort(([a],[b])=>a.localeCompare(b)).map(([,c])=>c),verifiedAt:relevant.map(r=>r.verifiedAt).sort((a,b)=>date(a)-date(b))[0]});
  }
 }
 hits.sort((a,b)=>a.id.localeCompare(b.id));
 return {hits,count:hits.length,strictRange:{lower:Math.min(2,hits.length),upper:2},notes:[`${hits.length} distinct prior-token connected component(s) overlap at least two eligible current top holders, including current isolates.`,`${rejected} inadmissible record or connection(s) withheld. Material historical holdings require at least 0.01% of same-block supply; relationships do not establish common ownership.`,`Search is bounded and incomplete. Two qualifying claims saturate the existing model contribution; further relationships may remain unread.`]};
}
