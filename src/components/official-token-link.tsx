import React from 'react';
import {ArrowUpRight,Coins} from 'lucide-react';
import {OFFICIAL_TOKEN,type OfficialToken} from '../lib/official-token';

/** Renders nothing when no official token is configured. */
export default function OfficialTokenLink(props:{token?:OfficialToken|null}){
 const token=props.token===undefined?OFFICIAL_TOKEN:props.token;
 if(!token)return null;
 return <a className="official-token-link" href={token.explorer} target="_blank" rel="noopener noreferrer" aria-label={`Our token - ${token.name} ($${token.symbol}) on ${token.network} (opens in a new tab)`} title={`${token.name} ($${token.symbol}) - ${token.network}\n${token.address}`}><Coins className="official-token-icon" size={17} aria-hidden="true"/><span>${token.symbol}</span><ArrowUpRight className="official-token-arrow" size={13} aria-hidden="true"/></a>;
}
