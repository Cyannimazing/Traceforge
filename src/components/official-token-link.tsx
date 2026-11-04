import React from 'react';
import {ArrowUpRight,Coins} from 'lucide-react';
import {OFFICIAL_TOKEN} from '@/lib/official-token';

export default function OfficialTokenLink(){
 return <a className="official-token-link" href={OFFICIAL_TOKEN.explorer} target="_blank" rel="noopener noreferrer" aria-label={`Our token - ${OFFICIAL_TOKEN.name} ($${OFFICIAL_TOKEN.symbol}) on ${OFFICIAL_TOKEN.network} (opens in a new tab)`} title={`${OFFICIAL_TOKEN.name} ($${OFFICIAL_TOKEN.symbol}) - ${OFFICIAL_TOKEN.network}\n${OFFICIAL_TOKEN.address}`}><Coins className="official-token-icon" size={17} aria-hidden="true"/><span>${OFFICIAL_TOKEN.symbol}</span><ArrowUpRight className="official-token-arrow" size={13} aria-hidden="true"/></a>;
}
