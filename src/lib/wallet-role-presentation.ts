import type {InvestigationReport, InvestigatedWallet, WalletCategory} from './investigation-types';

export type WalletRoleFact = WalletCategory | 'funder' | 'funding-recipient' | 'seller';
export const walletRoleNames: Record<WalletRoleFact,string> = {creator:'Creator',authority:'Contract control',sniper:'Possible sniper',fresh:'Fresh wallet',insider:'Possible insider','early-buyer':'Early buyer',accumulator:'Accumulator',funder:'Funding source','funding-recipient':'Funding recipient',seller:'Seller','shared-funder':'Shared funding recipient','deployer-linked':'Creator-linked','coordinated-seller':'Related seller',pool:'Liquidity pool',exchange:'Exchange',bridge:'Bridge',burn:'Burn address',contract:'Contract address',unclassified:'No additional flag identified'};
export const simpleRoleNames={all:'All flags',creator:'Creator',control:'Owner',sniper:'Sniper',early:'Early buyer',connected:'Linked wallets',holder:'Holder'} as const;
export type SimpleRole = keyof typeof simpleRoleNames;
export type RolePresentation = {label:string;description:string;earlyExplanation:string|null;platformCustody:boolean;reported:boolean;roles:WalletRoleFact[];reportedRoles:WalletRoleFact[];matches:SimpleRole[]};

export function classifyWalletRoles(roles:WalletRoleFact[],reportedRoles:WalletRoleFact[],currentHolder:boolean,timingVerified:boolean,launchVerified=false,context:{platformCustody?:boolean;earlyScope?:'selected-launchpad'}={}):RolePresentation {
 const has=(value:WalletRoleFact)=>roles.includes(value),reported=(values:WalletRoleFact[])=>values.length>0&&values.every(value=>reportedRoles.includes(value));
 const infrastructure=(['pool','exchange','bridge','burn'] as const).find(has);
 const early=roles.filter(value=>value==='sniper'||value==='early-buyer');
 const connected=roles.filter(value=>['funder','funding-recipient','shared-funder','deployer-linked'].includes(value));
 const matches:SimpleRole[]=['all'];
 if(has('creator'))matches.push('creator');if(has('authority'))matches.push('control');if(has('sniper'))matches.push('sniper');if(early.length)matches.push('early');if(connected.length)matches.push('connected');if(currentHolder&&!infrastructure)matches.push('holder');
 const independentSniper=has('sniper')&&!reportedRoles.includes('sniper');
 const earlyExplanation=!early.length?null:reported(early)?'SwarmEngine reports early-buying activity. Its possible-sniper flag is not independently verified launch timing.':independentSniper&&timingVerified?`A buy in the verified first trading minute ${context.earlyScope==='selected-launchpad'?'of the selected launchpad':launchVerified?'of the provider-indexed trading start':'of a selected pool'}. This scope does not establish the token’s first-ever launch. The underlying label is possible sniper; this does not prove automated trading.`:'An early-buying label in the retrieved records. It does not by itself establish a first-minute purchase or token-wide launch coverage.';
 const platformCustody=!!context.platformCustody&&infrastructure==='pool';
 const base={roles,reportedRoles,matches,earlyExplanation,platformCustody};
 if(platformCustody)return {...base,label:'Platform contract',reported:false,description:'Independently documented shared launchpad custody. This is a platform contract, not an individual holder or a liquidity pair. Any contract-control flag remains in Details.'};
 if(infrastructure)return {...base,label:walletRoleNames[infrastructure],reported:reported([infrastructure]),description:'Infrastructure address. Verified infrastructure balances are listed separately from holder wallets.'};
 if(has('creator'))return {...base,label:'Creator',reported:reported(['creator']),description:'The address identified as creating this token. Creation does not establish current control; any contract-control flag remains in Details.'};
 if(has('authority'))return {...base,label:'Owner',reported:reported(['authority']),description:'An address with a reported owner or authority flag. See the evidence for its exact powers, including mint or freeze authority. This label does not establish ownership of the token project.'};
 if(independentSniper&&timingVerified)return {...base,label:'Sniper',reported:false,description:earlyExplanation!};
 if(has('deployer-linked'))return {...base,label:'Dev-linked',reported:reported(['deployer-linked']),description:'A documented or provider-reported link to the token creator. This does not establish common ownership, developer ownership of this wallet, or coordinated behavior.'};
 if(early.length)return {...base,label:'Early buyer',reported:reported(early),description:earlyExplanation!};
 if(connected.length)return {...base,label:'Linked wallet',reported:reported(connected),description:'A funding link is documented or provider-reported. A connection does not establish common ownership or coordinated behavior.'};
 return {...base,label:currentHolder?'Holder':'Traced wallet',reported:false,description:currentHolder?'An address in the current holder snapshot. No more specific primary flag is established; additional activity facts may appear in Details.':'An address found in retrieved activity. Current token ownership is not established by this label.'};
}

export function presentWalletRole(report:InvestigationReport,wallet:InvestigatedWallet):RolePresentation {
 const normalize=(address:string)=>report.chain==='solana'?address:address.toLowerCase(),address=normalize(wallet.address);
 const roles:WalletRoleFact[]=[...new Set(wallet.categories)],reportedRoles:WalletRoleFact[]=wallet.categories.filter(category=>wallet.categorySources?.[category]==='swarm');
 const add=(role:WalletRoleFact,isReported:boolean)=>{const independentExisting=roles.includes(role)&&!reportedRoles.includes(role);if(!roles.includes(role))roles.push(role);if(isReported&&!independentExisting&&!reportedRoles.includes(role))reportedRoles.push(role);if(!isReported&&reportedRoles.includes(role))reportedRoles.splice(reportedRoles.indexOf(role),1);};
 for(const [role,field] of [['funder','from'],['funding-recipient','to']] as const){const edges=report.investigation.relationships.filter(edge=>edge.kind==='funding'&&normalize(edge[field])===address);if(edges.length)add(role,edges.every(edge=>edge.attribution==='provider-reported'));}
 const creatorLinks=report.investigation.relationships.filter(edge=>edge.kind==='deployer-linked'&&(normalize(edge.from)===address||normalize(edge.to)===address));
 if(creatorLinks.length)add('deployer-linked',creatorLinks.every(edge=>edge.attribution==='provider-reported'));
 const sales=report.investigation.timeline.filter(event=>event.kind==='sell'&&normalize(event.wallet)===address);
 if(sales.length)add('seller',sales.every(event=>report.investigation.evidence.find(evidence=>evidence.id===event.evidenceId)?.attribution==='provider-reported'));
 const coverage=report.investigation.coverage;
 const curve=coverage.curveTiming;
 const launchpadTiming=!!curve?.verified&&curve.scope==='selected-launchpad'&&curve.chain===report.chain&&normalize(curve.token)===normalize(report.token)&&curve.eligibleTradeIds.some(id=>{
  const evidenceId=`trade:${id}:${address}:buy`;
  return wallet.evidenceIds.includes(evidenceId)&&report.investigation.evidence.some(record=>record.id===evidenceId&&record.kind==='trade'&&record.attribution!=='provider-reported'&&Date.parse(record.timestamp)>=Date.parse(curve.firstPurchaseAt)&&Date.parse(record.timestamp)<=Date.parse(curve.windowEndAt));
 });
 const custodyId=`label:${address}:pool`;
 const platformCustody=report.chain==='bsc'&&address==='0x5c952063c7fc8610ffdb798152d69f0b9550762b'&&wallet.categorySources?.pool!=='swarm'&&wallet.evidenceIds.some(id=>normalize(id)===custodyId)&&report.investigation.evidence.some(record=>normalize(record.id)===custodyId&&record.kind==='label'&&record.source==='BSC RPC Four.Meme custody verification'&&record.attribution!=='provider-reported'&&Number.isFinite(Date.parse(record.timestamp)));
 return classifyWalletRoles(roles,reportedRoles,report.holders.some(holder=>normalize(holder.address)===address),coverage.launchVerified||!!coverage.poolTiming||!!coverage.poolTimings?.length||launchpadTiming,coverage.launchVerified,{platformCustody,...(launchpadTiming?{earlyScope:'selected-launchpad' as const}:{})});
}
