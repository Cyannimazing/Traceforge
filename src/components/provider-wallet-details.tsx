"use client";
import { ExternalLink } from 'lucide-react';
import { CHAINS, short, type Chain } from '@/lib/analysis';
import type { SwarmHolder } from '@/lib/swarm';

/** The upstream entry is a reported observation, not a verified first-ever buy. */
export default function ProviderWalletDetails({holder,chain}:{holder:SwarmHolder;chain:Chain}) {
 const signal=holder.signals;
 const time=signal.entryAt?new Date(signal.entryAt).toLocaleString():'Not reported';
 const walletLink=(address:string)=><a href={`${CHAINS[chain].explorer}/${chain==='solana'?'account':'address'}/${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" title={address}>{short(address)} <ExternalLink size={12}/></a>;
 return <section className="provider-wallet-details" aria-label="Provider-reported wallet history"><h3>SwarmEngine wallet history</h3><p>Reported entry and funding references. An entry is not necessarily the first buy or complete wallet history.</p><dl>
  <div><dt>Entry time</dt><dd>{signal.entryAt?<time dateTime={signal.entryAt}>{time}</time>:time}</dd></div>
  <div><dt>Entry type</dt><dd>{signal.kind||'Not reported'}</dd></div>
  <div><dt>Entry source</dt><dd>{signal.entryFrom?walletLink(signal.entryFrom):'Not reported'}</dd></div>
  <div><dt>Funder</dt><dd>{signal.funder?walletLink(signal.funder):'Not reported'}</dd></div>
  <div><dt>Reported transaction count</dt><dd>{signal.transactionCount==null?'Not reported':signal.transactionCount.toLocaleString()}</dd></div>
 </dl>{signal.entryTransaction&&<a className="provider-entry-link" href={`${CHAINS[chain].explorer}/tx/${encodeURIComponent(signal.entryTransaction)}`} target="_blank" rel="noreferrer">Open reported entry transaction <ExternalLink size={13}/></a>}
 <p>SwarmEngine supplies these references. TraceForge has not independently verified the entry classification or funding trail.</p></section>;
}
