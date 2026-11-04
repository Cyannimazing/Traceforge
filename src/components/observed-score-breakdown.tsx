import React from 'react';
import {ChevronDown} from 'lucide-react';
import {FACTORS,factorPoints} from '@/lib/reconstructed-score';
import type {ObservedFactor} from '@/lib/observed-decision';

const labels={swarm:'Sell impact',fresh:'Wallet activity',insiders:'Insider exposure',concentration:'Concentration',snipers:'Sniper exposure',dev:'Creator exposure'};
export default function ObservedScoreBreakdown({factors}:{factors:ObservedFactor[]}){
 return <section className="ro-observed-factors" aria-label="Observed score breakdown"><header><h3>Score breakdown</h3><span>Retrieved scope</span></header><div>{factors.map(factor=>{const earned=factorPoints(factor.id,factor.value),maximum=FACTORS[factor.id].maximum,basis=factor.basis==='conditional-scenario'?'Scenario':factor.basis==='account-nonce-proxy'||factor.basis==='readable-wallets'?'Read subset':factor.basis==='observed-holdings'?'Balances':'Observed matches';return <details key={factor.id}><summary><span>{labels[factor.id]}<small>{basis}</small></span><strong aria-label={`${labels[factor.id]}: ${earned===null?'unavailable':Number(earned.toFixed(1))} out of ${maximum}`}>{earned===null?'Unavailable':Number(earned.toFixed(1))}<small>/{maximum}</small></strong><ChevronDown size={13} aria-hidden="true"/></summary><p>{factor.detail}</p></details>;})}</div></section>;
}
