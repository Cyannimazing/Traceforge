'use client';

import React,{useId,useState} from 'react';
import {ArrowUpRight,Check,Copy} from 'lucide-react';
import {OFFICIAL_TOKEN,type OfficialToken} from '../lib/official-token';

export async function copyOfficialTokenAddress(clipboard?:Pick<Clipboard,'writeText'>,token:OfficialToken|null=OFFICIAL_TOKEN):Promise<boolean>{
 if(!clipboard||!token)return false;
 try{await clipboard.writeText(token.address);return true;}catch{return false;}
}

/** Renders nothing when no official token is configured (see src/lib/official-token.ts). */
export default function OfficialTokenAddress(props:{token?:OfficialToken|null}){
 const token=props.token===undefined?OFFICIAL_TOKEN:props.token;
 const [state,setState]=useState<'idle'|'copying'|'copied'|'failed'>('idle'),statusId=useId();
 if(!token)return null;
 async function copy(){setState('copying');try{setState(await copyOfficialTokenAddress(navigator.clipboard,token)?'copied':'failed');}catch{setState('failed');}}
 return <section className="official-token-address" aria-label="Official project token address">
  <div className="official-token-address-copy">
   <a href={token.explorer} target="_blank" rel="noopener noreferrer" aria-label={`Our token - $${token.symbol} on ${token.network}, view on the explorer (opens in a new tab)`}>Our token - ${token.symbol} - {token.network}<ArrowUpRight size={13} aria-hidden="true"/></a>
   <code>{token.address}</code>
  </div>
  <button className="official-token-copy" type="button" onClick={()=>void copy()} disabled={state==='copying'} aria-label={`Copy full ${token.network} token address`} aria-describedby={statusId}>{state==='copied'?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}<span>{state==='copied'?'Copied':state==='copying'?'Copying':'Copy'}</span></button>
  <span id={statusId} className="official-token-copy-status" role="status" aria-live="polite">{state==='copied'?'Address copied.':state==='failed'?'Copy failed. Select the address above to copy it manually.':''}</span>
 </section>;
}
