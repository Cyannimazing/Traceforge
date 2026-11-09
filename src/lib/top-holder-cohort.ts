import type {Holder} from './analysis';
import type {InvestigationReport} from './investigation-types';
import {holderScope} from './holder-scope';
import {holderMapFloatBasis} from './holder-map-basis';

/** An empirical top-holder assessment scope. Contract set-aside means code
 * account, never a claim that the account is a pool, locker or one real person.
 * The complete report and strict risk model retain every holder. */
export function topHolderCohort(report:InvestigationReport){
 const real=realHolderCohort(report);if(real)return real;
 const normalize=(a:string)=>report.chain==='solana'?a:a.toLowerCase(),scope=holderScope(report),rawLimit=report.chain==='solana'?20:50;
 const rawRanked=scope.allSnapshot.filter(h=>Number.isFinite(h.share)&&h.share>0&&h.share<=100).sort((a,b)=>b.share-a.share||normalize(a.address).localeCompare(normalize(b.address))).slice(0,rawLimit);
 const infrastructureAddresses=new Set(scope.infrastructureAddresses.map(normalize)),infrastructure=rawRanked.filter(h=>infrastructureAddresses.has(normalize(h.address)));
 const captured=Date.parse(report.fetchedAt),activity=report.walletActivity;
 const fresh=(at:string|undefined)=>{const n=Date.parse(at||'');return Number.isFinite(captured)&&Number.isFinite(n)&&n>=captured-600000&&n<=captured+120000;};
 const ref=activity?.blockRef,anchored=report.chain!=='solana'&&activity?.source==='EVM RPC wallet activity'&&fresh(activity.observedAt)&&activity.finality==='finalized'&&!!ref&&/^0x[0-9a-f]+:0x[0-9a-f]{64}$/i.test(ref)&&Number.isFinite(Date.parse(activity.blockTimestamp||''))&&Date.parse(activity.blockTimestamp!)<=captured+120000&&activity.failure!=='anchor-changed'&&report.sources.some(s=>s.name===activity.source&&s.status==='available'&&s.fetchedAt===activity.observedAt&&fresh(s.fetchedAt));
 const rows=new Map(activity?.wallets.map(w=>[normalize(w.address),w])||[]),proofs=new Map(report.investigation.evidence.map(e=>[e.id,e]));
 const measured=(h:Holder)=>{const e=proofs.get(`holding:evm:${normalize(h.address)}`),supply=report.totalSupply;if(!e||e.kind!=='holding'||e.attribution==='provider-reported'||e.source!=='EVM RPC holder balances'||normalize(e.to||'')!==normalize(h.address)||normalize(e.token||'')!==normalize(report.token)||!fresh(e.timestamp)||!report.sources.some(s=>s.name===e.source&&s.status==='available'&&s.fetchedAt===e.timestamp)||typeof e.amountRaw!=='string'||!/^\d{1,78}$/.test(e.amountRaw)||BigInt(e.amountRaw)>=2n**256n||!Number.isInteger(e.decimals)||e.decimals!<0||e.decimals!>255||typeof supply!=='number'||!Number.isFinite(supply)||supply<=0)return false;const share=Number(BigInt(e.amountRaw))/10**e.decimals!/supply*100;return Number.isFinite(share)&&Math.abs(share-h.share)<=1e-6;};
 const contracts=rawRanked.filter(h=>{
  if(!anchored||infrastructureAddresses.has(normalize(h.address)))return false;
  const w=rows.get(normalize(h.address)),code=w?.codeProof?.code;
  return w?.accountKind==='contract'&&fresh(w.observedAt||activity!.observedAt)&&w.codeProof?.blockRef===ref&&typeof code==='string'&&/^0x(?:[0-9a-f]{2})+$/i.test(code)&&!/^0xef0100[0-9a-f]{40}$/i.test(code)&&measured(h);
 });
 const contractAddresses=new Set(contracts.map(h=>normalize(h.address))),holders=rawRanked.filter(h=>!infrastructureAddresses.has(normalize(h.address))&&!contractAddresses.has(normalize(h.address)));
 // Do not lose a known current infrastructure balance merely because it ranks
 // below the assessment cap. A missing required current pool still withholds
 // float, just as it does for the full snapshot.
 const setAside=[...scope.infrastructure,...contracts],required=[...scope.currentInfrastructureAddresses,...contracts.map(h=>h.address)],floatBasis=holderMapFloatBasis(setAside,required,report.chain==='solana',scope.allSnapshot);
 return {rawLimit,rawRanked,holders,infrastructure,contracts,activityCandidates:holders.slice(0,15),denominator:floatBasis.denominator,floatBasis,infrastructureAddresses:infrastructure.map(h=>h.address),contractAddresses:contracts.map(h=>h.address)};
}

/** A real account "leads" when it holds at least this fraction of the
 * circulating supply (total supply minus infrastructure and contract balances). */
export const REAL_HAND_MIN_FLOAT_SHARE=0.001;

/** Real hands for EVM reports with a verified real-holder ranking. There is no
 * fixed count: every independently balance-verified account that is not
 * attributed infrastructure, has no contract code at the same anchor, and holds
 * at least 0.1% of the circulating supply is a real hand. Accounts without a
 * code proof are never counted, and provider "contract" flags are never used. */
export function realHolderCohort(report:InvestigationReport){
 const inventory=report.holderEnumeration;
 if(report.chain==='solana'||inventory?.kind!=='real-holder-prefix'||!inventory.ranked?.verified||!inventory.accountKinds)return null;
 const normalize=(a:string)=>a.toLowerCase(),scope=holderScope(report),kinds=inventory.accountKinds;
 const byAddress=new Map(scope.allSnapshot.map(h=>[normalize(h.address),h]));
 const ranked=inventory.ranked.addresses.map(a=>byAddress.get(normalize(a))).filter((h):h is NonNullable<typeof h>=>!!h&&Number.isFinite(h.share)&&h.share>0&&h.share<=100);
 // The ranking must descend by verified balance; anything else is not trusted.
 if(ranked.length!==inventory.ranked.addresses.length||ranked.some((h,i)=>i>0&&h.share>ranked[i-1].share))return null;
 const infrastructureAddresses=new Set(scope.infrastructureAddresses.map(normalize));
 const kindOf=(h:{address:string})=>{const key=normalize(h.address);return infrastructureAddresses.has(key)?'infrastructure':kinds[key]==='contract'?'contract':kinds[key]==='eoa'||kinds[key]==='delegated-eoa'?'real':'unproven';};
 const allContracts=ranked.filter(h=>kindOf(h)==='contract');
 const setAside=[...scope.infrastructure,...allContracts],required=[...scope.currentInfrastructureAddresses,...allContracts.map(h=>h.address)],floatBasis=holderMapFloatBasis(setAside,required,false,scope.allSnapshot);
 const denominator=floatBasis.denominator,threshold=denominator===null?Infinity:denominator*REAL_HAND_MIN_FLOAT_SHARE;
 // Ranked descending, so the leading real accounts form a prefix of the real ones.
 let cut=0;for(let i=0;i<ranked.length;i++){if(ranked[i].share<threshold)break;cut=i+1;}
 const rawRanked=ranked.slice(0,cut);
 const holders=rawRanked.filter(h=>kindOf(h)==='real'),infrastructure=rawRanked.filter(h=>kindOf(h)==='infrastructure'),contracts=rawRanked.filter(h=>kindOf(h)==='contract'),unproven=rawRanked.filter(h=>kindOf(h)==='unproven');
 // If even the smallest verified balance still leads, more leaders may sit
 // outside the verified candidate set; the verdict states this.
 const smallest=ranked.at(-1);
 return {rawLimit:rawRanked.length,rawRanked,holders,infrastructure,contracts,activityCandidates:holders,denominator,floatBasis,infrastructureAddresses:infrastructure.map(h=>h.address),contractAddresses:contracts.map(h=>h.address),unprovenAddresses:unproven.map(h=>h.address),leaderThreshold:threshold,leadersMayContinue:!!smallest&&smallest.share>=threshold};
}
