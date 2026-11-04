import React from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {MemoryHit} from '@/lib/cross-token-memory';

export default function MemoryFindings({hits,scope,onInspect}:{hits:MemoryHit[];scope:{queriedWallets:number;selectedWallets:number};onInspect:(hit:MemoryHit)=>void}){
 return <section className="ro-memory-findings" aria-label="Prior token connections"><header><h3>Prior token connections</h3><span>{hits.length} found</span></header><p>{scope.queriedWallets} of {scope.selectedWallets} selected wallet histories searched. Further history may remain unread.</p>{hits.length?<ul>{hits.map(hit=><li key={hit.id}><strong>{hit.wallets.length} current wallets connected in a prior token</strong><code>{hit.token}</code><button type="button" className="ro-factor-evidence" onClick={()=>onInspect(hit)}>Inspect prior-token evidence <ArrowUpRight size={13} aria-hidden="true"/></button></li>)}</ul>:<p>No qualifying prior connection found in this search.</p>}<small>Transactions establish the past relationship. They do not establish common ownership or coordination in this token.</small></section>;
}
