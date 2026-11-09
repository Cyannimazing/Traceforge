import type { Chain } from './analysis';
import type { Evidence, Finding, Investigation, InvestigatedWallet, Relationship, WalletCategory, PoolTimingProof, CurveTimingProof } from './investigation-types';
import {clockReferenceTime,type EvidenceClock} from './evidence-clock';

export type TradeRecord = { id: string; wallet: string; timestamp: string; side: 'buy' | 'sell'; amount?: number; amountRaw?:string; decimals?:number; transaction: string; source: string };
export type TransferRecord = { id: string; from: string; to: string; timestamp: string; amount: number; amountRaw?:string; decimals?:number; fundingEligible?:boolean; token: string; native: boolean; transaction: string; source: string };
export type IdentityRecord = { timestampBasis?:'local-observation'|'provider-event'; address: string; role: 'creator' | 'authority'; source: string; timestamp: string; transaction?: string; authorityKind?: 'mint' | 'freeze'; label?: string; slot?: number };
export function identityEvidence(identity:IdentityRecord,address:string):Evidence {
  return {id:`identity:${identity.role}:${address}${identity.authorityKind?`:${identity.authorityKind}`:''}`,kind:'authority',timestamp:identity.timestamp,transaction:identity.transaction,description:identity.role==='creator'?'Provider-reported deployment/creator address, which may be a factory. This does not establish current control.':identity.authorityKind?`${identity.label || identity.authorityKind+' authority'} read at finalized slot ${identity.slot}. This token-program role does not identify the original creator or beneficial owner.`:'Owner or authority reported at this evidence timestamp. This does not establish the original creator or control after that snapshot.',source:identity.source};
}
export type LabelRecord = { timestampBasis?:'local-observation'|'provider-event'; address: string; category: 'pool' | 'exchange' | 'bridge' | 'burn' | 'contract'; label: string; source: string; timestamp: string };
export type InvestigationInput = {
  chain: Chain; token: string;
  holders: { address: string; share: number | null; balance?: number }[];
  /** Server-attested current RPC inventory bound. Does not widen historical queries or buyer sampling. */
  currentHolderLimit?:number;
  earlyBuyerAddresses?: string[];
  trades: TradeRecord[]; transfers: TransferRecord[]; identities: IdentityRecord[]; labels: LabelRecord[];
  launchVerified: boolean; curveTiming?:CurveTimingProof; poolTiming?:PoolTimingProof; poolTimings?:PoolTimingProof[]; clock?:EvidenceClock; earliestTradeAt?: string; complete: boolean; reasons: string[]; fetchedAt: string;
  holderLimit: number; buyerLimit: number; fundingHops: number; truncated: boolean;
};

const infrastructure: WalletCategory[] = ['pool', 'exchange', 'bridge', 'burn', 'contract'];
const time = (s: string) => Date.parse(s);
// Explicit per-transfer inference policy, not a spam detector or a financial
// materiality guarantee. Original receipts remain visible below this amount.
export const SOLANA_NATIVE_FUNDING_MIN_SOL = 0.0001;

// Deterministic shortest paths from one seller to each other seller. A connected
// component may contain unrelated branches; those are not support for this finding.
function sellerConnectionEvidence(sellers:string[],relationships:Relationship[]):string[]{
  const root=sellers[0],remaining=new Set(sellers.slice(1));
  const adjacent=new Map<string,{to:string;relationship:Relationship}[]>();
  for(const relationship of relationships)for(const [from,to]of [[relationship.from,relationship.to],[relationship.to,relationship.from]]){
    const edges=adjacent.get(from)||[];edges.push({to,relationship});adjacent.set(from,edges);
  }
  const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
  for(const edges of adjacent.values())edges.sort((a,b)=>compare(a.to,b.to)||compare(a.relationship.id,b.relationship.id));
  const visited=new Set([root]),parents=new Map<string,{from:string;relationship:Relationship}>(),queue=[root];
  for(let index=0;index<queue.length&&remaining.size;index++){
    const from=queue[index];
    for(const edge of adjacent.get(from)||[]){
      if(visited.has(edge.to))continue;
      visited.add(edge.to);parents.set(edge.to,{from,relationship:edge.relationship});queue.push(edge.to);remaining.delete(edge.to);
    }
  }
  const evidence=new Set<string>();
  for(const seller of sellers.slice(1)){
    let current=seller;
    while(current!==root){const parent=parents.get(current);if(!parent)break;for(const id of parent.relationship.evidenceIds)evidence.add(id);current=parent.from;}
  }
  return [...evidence].sort(compare);
}

/** Pure evidence engine. The adapter, not a market-pair timestamp, attests launch coverage. */
export function analyzeInvestigation(input: InvestigationInput): Investigation {
  // Provider timestamps must agree with the capture clock before they can affect
  // amounts, roles, graph edges or findings. Never silently shift event times.
  const localCapturedAt=time(input.fetchedAt);
  const capturedAt = clockReferenceTime(input.clock,localCapturedAt);
  const validObservationTime=(timestamp:string)=>Number.isFinite(localCapturedAt)&&Number.isFinite(time(timestamp))&&time(timestamp)<=localCapturedAt+120_000;
  const validTime = (timestamp: string) => Number.isFinite(capturedAt) && Number.isFinite(time(timestamp)) && time(timestamp) <= capturedAt + 120_000;
  const rejected = new Map<string, number>();
  const acceptRecord = (record: {timestamp: string; source: string},observation=false) => {
    if ((observation?validObservationTime:validTime)(record.timestamp)) return true;
    rejected.set(record.source, (rejected.get(record.source) || 0) + 1);
    return false;
  };
  const reasons = [...input.reasons];
  if (!Number.isFinite(capturedAt)) reasons.push('The scan capture clock is invalid. Timestamped records and timing classifications are withheld.');
  const earliestTradeAt = input.earliestTradeAt && validTime(input.earliestTradeAt) ? input.earliestTradeAt : undefined;
  if (input.earliestTradeAt && !earliestTradeAt) reasons.push('The earliest trading timestamp conflicts with the scan clock or is invalid; it cannot establish launch timing.');
  const launchVerified = input.launchVerified && !!earliestTradeAt;
  if (input.launchVerified && !earliestTradeAt) reasons.push('Launch timing is unverified because its timestamp anchor is unavailable.');
  input = {...input, earliestTradeAt, launchVerified, reasons,
    trades: input.trades.filter(r=>acceptRecord(r)), transfers: input.transfers.filter(r=>acceptRecord(r)),
    identities: input.identities.filter(r=>acceptRecord(r,r.timestampBasis==='local-observation')), labels: input.labels.filter(r=>acceptRecord(r,r.timestampBasis==='local-observation'))};
  for (const [source, count] of rejected) reasons.push(`${count} record(s) from ${source} withheld: timestamps are invalid or conflict with the scan validation clock (more than 120 seconds ahead). This is a coverage gap, not evidence of no activity. Provider and server clocks require reconciliation; timestamps were not corrected.`);
  const address = (value: string) => input.chain === 'solana' ? value : value.toLowerCase();
  const currentLimit=Number.isSafeInteger(input.currentHolderLimit)&&input.currentHolderLimit!>=0?Math.min(10000,input.currentHolderLimit!):input.holderLimit;
  const currentHolders=input.holders.slice(0,currentLimit);
  if(input.currentHolderLimit!==undefined&&currentHolders.length<input.holders.length){input.truncated=true;reasons.push('The verified current-holder inventory exceeds the configured in-memory bound; some current holders are outside this analysis. Historical query limits are separate.');}
  const sampledHolders=new Set(currentHolders.map(holder=>address(holder.address)));
  const holderContext=(addresses:string[])=>{
    const count=addresses.filter(a=>sampledHolders.has(a)).length;
    return `${count} of ${addresses.length} wallets appear in the current holder snapshot.${count<addresses.length?' Current balances for wallets outside that snapshot are unknown, not zero.':''}`;
  };
  const candidates=input.poolTimings?.length?input.poolTimings:input.poolTiming?[input.poolTiming]:[];
  const validPool=(candidate:PoolTimingProof)=>candidate.verified&&candidate.scope==='selected-pool'&&candidate.chain===input.chain&&validObservationTime(candidate.verifiedAt)&&[candidate.firstSwapAt,candidate.windowEndAt,candidate.through.timestamp].every(validTime)&&[candidate.token0,candidate.token1].some(t=>address(t)===address(input.token))&&time(candidate.windowEndAt)===time(candidate.firstSwapAt)+60_000&&time(candidate.through.timestamp)>time(candidate.windowEndAt)&&candidate.creation.blockNumber<=candidate.through.blockNumber;
  const poolTimings=[...new Map(candidates.filter(validPool).map(p=>[address(p.pool),p])).values()];
  const poolTiming=poolTimings[0];
  if(candidates.some(p=>!validPool(p)))reasons.push('A pool timing proof failed scope or timestamp validation and was withheld.');
  const candidateCurve=input.curveTiming;
  const curveTiming=candidateCurve?.verified&&candidateCurve.scope==='selected-launchpad'&&((candidateCurve.protocol==='four-meme-v2'&&candidateCurve.chain==='bsc')||(candidateCurve.protocol==='fobo-v1'&&candidateCurve.chain==='robinhood'))&&candidateCurve.chain===input.chain&&address(candidateCurve.token)===address(input.token)&&validObservationTime(candidateCurve.verifiedAt)&&[candidateCurve.firstPurchaseAt,candidateCurve.windowEndAt,candidateCurve.through.timestamp].every(validTime)&&time(candidateCurve.windowEndAt)===time(candidateCurve.firstPurchaseAt)+60_000&&time(candidateCurve.through.timestamp)>time(candidateCurve.windowEndAt)&&candidateCurve.creation.blockNumber<=candidateCurve.through.blockNumber?candidateCurve:undefined;
  if(candidateCurve&&!curveTiming)reasons.push('A launchpad curve timing proof failed scope or timestamp validation and was withheld.');
  const curveTradeIds=new Set(curveTiming?.eligibleTradeIds||[]);
  const proofByTrade=new Map(poolTimings.flatMap(p=>p.eligibleTradeIds.map(id=>[id,p] as const)));
  const timingStartFor=(t:TradeRecord)=>(curveTradeIds.has(t.id)?curveTiming?.firstPurchaseAt:undefined)||proofByTrade.get(t.id)?.firstSwapAt||(!poolTimings.length&&!curveTiming?input.earliestTradeAt:undefined);
  const timedTrade=(t:TradeRecord)=>curveTradeIds.has(t.id)||(poolTimings.length?proofByTrade.has(t.id):!curveTiming&&input.launchVerified);
  const wallets = new Map<string, InvestigatedWallet>();
  const evidence: Evidence[] = [];
  const evidenceSeen = new Set<string>();
  const relationships: Relationship[] = [];
  const findings: Finding[] = [];
  const timeline: Investigation['timeline'] = [];
  const wallet = (raw: string) => {
    const key = address(raw);
    if (!wallets.has(key)) wallets.set(key, { address: key, share: null, categories: [], evidenceIds: [] });
    return wallets.get(key)!;
  };
  const category = (raw: string, cat: WalletCategory) => {
    const w = wallet(raw);
    if (!w.categories.includes(cat)) w.categories.push(cat);
  };
  // The scanned EVM token is not a wallet funding source: native withdrawals
  // or refunds can otherwise connect its users when optional contract labels
  // are absent. Exclude inference only; preserve observations without inventing
  // a provider label, RPC verification, or an address in an empty report.
  const evmToken = input.chain !== 'solana' && /^0x[0-9a-f]{40}$/.test(address(input.token)) ? address(input.token) : undefined;
  const isInfrastructure = (raw: string) => (evmToken !== undefined && address(raw) === evmToken) || wallet(raw).categories.some(c => infrastructure.includes(c));
  const addEvidence = (item: Evidence, addresses: string[]) => {
    if (!evidenceSeen.has(item.id)) { evidence.push(item); evidenceSeen.add(item.id); }
    for (const raw of addresses) {
      const w = wallet(raw);
      if (!w.evidenceIds.includes(item.id)) w.evidenceIds.push(item.id);
    }
  };
  for (const h of currentHolders) Object.assign(wallet(h.address), { share: h.share, balance: h.balance });
  for (const l of input.labels) {
    if (!l.address || !l.source) continue;
    category(l.address, l.category); wallet(l.address).label = l.label;
    addEvidence({ id: `label:${address(l.address)}:${l.category}`, kind: 'label', timestamp: l.timestamp, description: l.label, source: l.source }, [l.address]);
  }
  for (const identity of input.identities) {
    if (!identity.address || !identity.source) continue;
    category(identity.address, identity.role);
    addEvidence(identityEvidence(identity,address(identity.address)),[identity.address]);
    if(identity.label){const w=wallet(identity.address);w.label=[...new Set([w.label,identity.label].filter(Boolean))].join(' / ');}
  }
  for(const poolTiming of poolTimings){
    category(poolTiming.pool,'pool');
    addEvidence({id:`pool-timing:${poolTiming.pool}:creation`,kind:'label',transaction:poolTiming.creation.transaction,timestamp:poolTiming.verifiedAt,description:`Selected pool creation event verified against factory ${poolTiming.factory} at block ${poolTiming.creation.blockNumber}. Retrieval timestamp; this is not the token launch.`,source:'Pool timing verifier'},[poolTiming.pool]);
    addEvidence({id:`pool-timing:${poolTiming.pool}:window`,kind:'label',transaction:poolTiming.firstSwapTransaction,timestamp:poolTiming.firstSwapAt,description:`Provider-covered contiguous pool logs from creation through block ${poolTiming.through.blockNumber}. First swap ${poolTiming.firstSwapAt}; inclusive first-minute end ${poolTiming.windowEndAt}. Sender attribution is not beneficial ownership.`,source:'Pool timing verifier'},[poolTiming.pool]);
  }
  if(curveTiming){
    addEvidence({id:`curve-timing:${curveTiming.token}:creation`,kind:'label',transaction:curveTiming.creation.transaction,timestamp:curveTiming.verifiedAt,description:curveTiming.protocol==='fobo-v1'?`Canonical FOBO factory TokenLaunched event with the exact supply mint verified at block ${curveTiming.creation.blockNumber}; hook ${curveTiming.manager}. This establishes the selected launchpad creation marker, not token-wide launch.`:`Canonical Four.Meme TokenCreate with matching prior mint for its declared supply verified at block ${curveTiming.creation.blockNumber}; manager ${curveTiming.manager}. This establishes the selected launchpad creation marker, not pre-event contract deployment or token-wide launch.`,source:curveTiming.source},[curveTiming.manager]);
    addEvidence({id:`curve-timing:${curveTiming.token}:window`,kind:'label',transaction:curveTiming.firstPurchaseTransaction,timestamp:curveTiming.firstPurchaseAt,description:curveTiming.protocol==='fobo-v1'?`Contiguous FOBO hook TaxPaid events for this pool checked from creation through block ${curveTiming.through.blockNumber}. First purchase ${curveTiming.firstPurchaseAt}; inclusive sixty-second end ${curveTiming.windowEndAt}. Routed recipients require a single exact PoolManager delivery path. Other venues and beneficial ownership are not established.`:`Contiguous canonical manager events for this token checked from creation through block ${curveTiming.through.blockNumber}. First purchase ${curveTiming.firstPurchaseAt}; inclusive sixty-second end ${curveTiming.windowEndAt}. Routed recipients require exact matching token transfers. Other venues and beneficial ownership are not established.`,source:curveTiming.source},[curveTiming.manager]);
  }
  const tradeKeys = new Set<string>();
  const unknownTradeAmounts=new Set<string>();
  const trades = input.trades.filter(t => {
    const key = `${t.transaction}:${t.id}:${address(t.wallet)}:${t.side}`;
    const normalized=typeof t.amount==='number'&&Number.isFinite(t.amount)&&t.amount>0;
    const rawOnly=t.amount===undefined&&typeof t.amountRaw==='string'&&/^[1-9]\d{0,77}$/.test(t.amountRaw);
    if (!t.transaction || !t.wallet || !Number.isFinite(time(t.timestamp)) || (!normalized&&!rawOnly) || tradeKeys.has(key)) return false;
    if(rawOnly)unknownTradeAmounts.add(address(t.wallet));
    tradeKeys.add(key); return true;
  }).sort((a, b) => time(a.timestamp) - time(b.timestamp));
  const buyers = new Set<string>();
  for (const t of trades) {
    const w = wallet(t.wallet), id = `trade:${t.id}:${address(t.wallet)}:${t.side}`;
    addEvidence({ id, kind: 'trade', transaction: t.transaction, timestamp: t.timestamp, amount: t.amount, amountRaw:t.amountRaw, decimals:t.decimals, token: input.token, description: `Observed ${t.side} of the scanned token. ${t.amount===undefined?`Raw amount ${t.amountRaw}; historical decimals unavailable, so token-unit amount and net accumulation are not asserted.`:'Amounts are token units.'}`, source: t.source }, [t.wallet]);
    timeline.push({ id, timestamp: t.timestamp, kind: t.side, wallet: w.address, amount: t.amount, evidenceId: id });
    if (t.side === 'buy') {
      if(t.amount!==undefined)w.bought = (w.bought || 0) + t.amount;
      w.firstBuyAt ??= t.timestamp;
      if (buyers.size < input.buyerLimit || buyers.has(w.address)) buyers.add(w.address);
      const eligibleEarlyBuyer = input.earlyBuyerAddresses ? input.earlyBuyerAddresses.some(a=>address(a)===w.address) : buyers.has(w.address);
      const timingStart=timingStartFor(t);
      const delay = timingStart ? time(t.timestamp) - time(timingStart) : NaN;
      if (!isInfrastructure(w.address) && (poolTiming||curveTiming ? timedTrade(t)&&delay>=0&&delay<=60_000 : input.launchVerified&&eligibleEarlyBuyer)) category(w.address, 'early-buyer');
      if (!isInfrastructure(w.address) && timedTrade(t) && delay >= 0 && delay <= 60_000) category(w.address, 'sniper');
    } else if(t.amount!==undefined)w.sold = (w.sold || 0) + t.amount;
  }
  for (const w of wallets.values()) {
    if(unknownTradeAmounts.has(w.address)){delete w.bought;delete w.sold;}
    if (!unknownTradeAmounts.has(w.address)&&!isInfrastructure(w.address) && (w.bought || 0) > (w.sold || 0)) category(w.address, 'accumulator');
  }
  const transferKeys = new Set<string>();
  const funders = new Map<string, { to: string; evidenceId: string }[]>();
  const observationOnly=new Set<string>();
  let belowSolanaFundingFloor=0;
  for (const t of input.transfers) {
    const from = address(t.from), to = address(t.to);
    const key = `${t.transaction}:${t.id}:${from}:${to}`;
    if (!from || !to || from === to || !t.transaction || !Number.isFinite(t.amount) || t.amount <= 0 || !Number.isFinite(time(t.timestamp)) || transferKeys.has(key)) continue;
    transferKeys.add(key);
    const id = `transfer:${t.id}:${from}:${to}`;
    const belowFloor=input.chain==='solana'&&t.native&&t.amount<SOLANA_NATIVE_FUNDING_MIN_SOL;
    if(belowFloor)belowSolanaFundingFloor++;
    addEvidence({ id, kind: 'transfer', transaction: t.transaction, timestamp: t.timestamp, from, to, amount: t.amount, amountRaw:t.amountRaw, decimals:t.decimals, token: t.token, description: belowFloor ? 'Observed native transfer below TraceForge\'s 0.0001 SOL per-transfer funding-inference threshold. Retained as evidence, but excluded from shared-funder, creator-link and coordinated-selling inference. This is not a spam classification.' : t.native ? 'Observed native-asset transfer. Funding is a possible use, not proof of common ownership.' : 'Observed token transfer.', source: t.source }, [from, to]);
    const funding=t.native&&t.fundingEligible!==false&&!belowFloor;
    timeline.push({ id, timestamp: t.timestamp, kind: funding ? 'funding' : 'transfer', wallet: to, amount: t.amount, evidenceId: id });
    relationships.push({ id, from, to, kind: funding ? 'funding' : 'transfer', evidenceIds: [id], description: 'Observed on-chain transfer. No ownership assertion.' });
    if(t.native&&(t.fundingEligible===false||belowFloor)){observationOnly.add(id);continue;}
    if (isInfrastructure(from) || isInfrastructure(to)) continue;
    const firstBuy = wallet(to).firstBuyAt;
    if (t.native && (!firstBuy || time(t.timestamp) <= time(firstBuy))) {
      const group = funders.get(from) || [];
      group.push({ to, evidenceId: id }); funders.set(from, group);
    }
    if (wallet(from).categories.includes('creator')) {
      category(to, 'deployer-linked');
      relationships.push({ id: `deployer:${id}`, from, to, kind: 'deployer-linked', evidenceIds: [id], description: 'Direct transfer from the provider-identified creator. Control of the recipient is unknown.' });
    }
  }
  if(belowSolanaFundingFloor)input.reasons.push(`${belowSolanaFundingFloor} native receipt(s) below the 0.0001 SOL per-transfer inference floor remain visible as observations but do not establish funding, creator links or connected selling. This conservative policy is not proof of spam and can omit genuine small funding; split receipts are not summed to bypass the floor. No equivalent EVM or token-amount threshold is applied.`);
  const evidenceTimes=new Map(evidence.map(e=>[e.id,time(e.timestamp)]));
  for (const [funder, transfers] of funders) {
    const recipients = [...new Set(transfers.map(t => t.to))];
    if (recipients.length < 2) continue;
    const ids = transfers.map(t => t.evidenceId);
    for (const to of recipients) category(to, 'shared-funder');
    // A star, rather than N squared pair edges, keeps the graph bounded.
    for (const to of recipients.slice(1)) relationships.push({ id: `shared:${funder}:${to}`, from: recipients[0], to, kind: 'shared-funder', evidenceIds: transfers.filter(t => [recipients[0], to].includes(t.to)).map(t => t.evidenceId), description: `Both received native assets from ${funder}. Shared funding suggests a relationship; it does not prove common control.` });
    const dates=ids.map(id=>evidenceTimes.get(id)!);
    const observedFrom=new Date(Math.min(...dates)).toISOString(),observedTo=new Date(Math.max(...dates)).toISOString();
    findings.push({ id: `funder:${funder}`, title: 'Shared funding observed', observedFrom,observedTo,description: `${recipients.length} wallets received native assets from the same unlabeled source between ${observedFrom} and ${observedTo}. ${holderContext(recipients)} An unrecognized service could also explain this pattern.`, level: 'warning', certainty: 'inferred', wallets: recipients, evidenceIds: ids });
  }
  const connectionEdges=relationships.filter(r=>!observationOnly.has(r.id)&&!isInfrastructure(r.from)&&!isInfrastructure(r.to)).map(r=>({relationship:r,at:Math.max(...r.evidenceIds.map(id=>evidenceTimes.get(id)??Infinity))}));
  const sales=trades.filter(t=>t.side==='sell'&&!isInfrastructure(t.wallet));
  const sellingGroups=new Set<string>();
  for(let start=0;start<sales.length;start++){
    const startTime=time(sales[start].timestamp);
    let end=start;while(end<sales.length&&time(sales[end].timestamp)-startTime<=300_000)end++;
    const window=sales.slice(start,end);
    if(new Set(window.map(t=>address(t.wallet))).size<2)continue;
    // Every candidate window gets the graph that existed before its first sale.
    // An unrelated earlier sale cannot suppress a later connected pair.
    // Equal timestamps lack transaction/instruction ordering, so cannot prove
    // that the connection already existed before the first sale.
    const eligibleLinks=connectionEdges.filter(e=>e.at<startTime).map(e=>e.relationship);
    const neighbors=new Map<string,Set<string>>();
    for(const r of eligibleLinks)for(const [a,b]of [[r.from,r.to],[r.to,r.from]]){const n=neighbors.get(a)||new Set<string>();n.add(b);neighbors.set(a,n);}
    const visited=new Set<string>();
    for(const sale of window){
      const origin=address(sale.wallet);if(visited.has(origin))continue;
      const members=new Set<string>(),queue=[origin];
      while(queue.length){const a=queue.pop()!;if(visited.has(a))continue;visited.add(a);members.add(a);queue.push(...(neighbors.get(a)||[]));}
      const matched=window.filter(t=>members.has(address(t.wallet)));
      const sellers=[...new Set(matched.map(t=>address(t.wallet)))].sort();
      if(sellers.length<2||new Set(matched.map(t=>t.transaction)).size<2)continue;
      const groupKey=sellers.join(':');if(sellingGroups.has(groupKey))continue;sellingGroups.add(groupKey);
      for(const seller of sellers)category(seller,'coordinated-seller');
      const links=sellerConnectionEvidence(sellers,eligibleLinks);
      const observedFrom=new Date(time(matched[0].timestamp)).toISOString(),observedTo=new Date(time(matched[matched.length-1].timestamp)).toISOString();
      const amounts=matched.map(t=>t.amount),knownAmounts=amounts.filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0);
      const volume=knownAmounts.length===matched.length?` Observed sales total ${knownAmounts.reduce((sum,n)=>sum+n,0).toLocaleString('en-US',{maximumFractionDigits:6})} tokens across ${matched.length} trades. This does not establish market impact.`:' Sale amounts are incomplete; market impact is not established.';
      findings.push({id:`selling:${sellingGroups.size}`,title:'Connected wallets sold within five minutes',observedFrom,observedTo,description:`${sellers.length} connected wallets sold between ${observedFrom} and ${observedTo}, within a rolling five-minute window.${volume} ${holderContext(sellers)} Supporting transfers connect these sellers before the first sale; unrelated branches remain separate observations. Transfers and transaction times are observed; coordination is an inference, not a proven shared operator.`,level:'warning',certainty:'inferred',wallets:sellers,evidenceIds:[...new Set([...matched.map(t=>`trade:${t.id}:${address(t.wallet)}:${t.side}`),...links])]});
    }
  }
  const snipers = [...wallets.values()].filter(w => w.categories.includes('sniper'));
  if (snipers.length) findings.push({ id: 'snipers', title: curveTiming?'First-minute buys on the selected launchpad':poolTimings.length>1?'First-minute buys in verified pool windows':poolTiming?'First-minute buys in the selected pool':'Buys within 60 seconds of verified indexed trading start', description: curveTiming?'These wallets received canonical Four.Meme purchases in the verified first trading minute for this token on the selected launchpad. Receipt transfer paths resolve routed delivery. Other venues remain outside the proof; timing does not establish automation, privileged access or malicious intent.':poolTimings.length>1?'These senders bought during the first minute of at least one verified pool. Each transaction uses its own pool creation and first-swap reference. A later pool opening is not the token launch; other venues remain outside this proof.':poolTiming?'These senders initiated transactions containing buys within the selected pool\'s verified first trading minute. Other venues and the token\'s first-ever launch are not established. Timing does not prove automation, privileged access or malicious intent.':'This timing flag is relative to verified provider-indexed history. It does not prove automation, privileged access, malicious intent or complete coverage of all venues.', level: 'warning', certainty: 'observed', wallets: snipers.map(w => w.address), evidenceIds: [...(curveTiming?[`curve-timing:${curveTiming.token}:creation`,`curve-timing:${curveTiming.token}:window`]:[]),...poolTimings.flatMap(p=>[`pool-timing:${p.pool}:creation`,`pool-timing:${p.pool}:window`]),...trades.filter(t=>{
    const delay=time(t.timestamp)-time(timingStartFor(t)||'');
    return timedTrade(t)&&((t.side==='buy'&&delay>=0&&delay<=60_000&&snipers.some(w=>w.address===address(t.wallet)))||delay===0);
  }).map(t=>`trade:${t.id}:${address(t.wallet)}:${t.side}`)]});
  const partial = !input.complete || input.truncated || !input.launchVerified || rejected.size > 0 || !Number.isFinite(capturedAt) || candidates.some(p=>!validPool(p));
  if (partial) findings.push({ id: 'coverage', title: 'History is incomplete', description: input.reasons.join(' ') || 'Complete launch and wallet history could not be verified. Absence of a detected pattern is not evidence of absence.', level: 'info', certainty: 'unknown', wallets: [], evidenceIds: [] });
  const hasRisk = findings.some(f => f.level === 'warning');
  const status = findings.some(f => f.level === 'critical') ? 'critical' : hasRisk ? 'caution' : partial ? 'insufficient' : 'clear';
  for (const w of wallets.values()) if (!w.categories.length) w.categories.push('unclassified');
  return {
    wallets: [...wallets.values()], relationships, evidence, timeline: timeline.sort((a, b) => time(a.timestamp) - time(b.timestamp)), findings,
    assessment: { status, title: status === 'caution' ? 'Patterns need review' : status === 'critical' ? 'Critical evidence detected' : status === 'insufficient' ? 'Insufficient evidence' : 'No flagged pattern in scope', summary: hasRisk ? 'Review the linked transactions and coverage limits. Relationships do not establish ownership or intent.' : partial ? 'Missing history prevents a reliable all-clear. Public snapshots remain available where providers respond.' : 'No configured pattern was detected in the stated sample. This is not a safety guarantee.' },
    coverage: { status: partial ? (evidence.length || input.holders.length ? 'partial' : 'unavailable') : 'complete', launchVerified: input.launchVerified,...(curveTiming?{curveTiming}:{}),...(poolTiming?{poolTiming,poolTimings}:{}),...(input.clock?{clock:input.clock}:{}), earliestTradeAt: input.earliestTradeAt, holderLimit: input.holderLimit, buyerLimit: input.buyerLimit, fundingHops: input.fundingHops, truncated: input.truncated, reasons: input.reasons, source: 'Indexed and public provider evidence', fetchedAt: input.fetchedAt },
  };
}
