'use client';

import React,{useId,useState} from 'react';
import {ArrowUpRight,Check,Copy} from 'lucide-react';
import {OFFICIAL_TOKEN} from '../lib/official-token';

export async function copyOfficialTokenAddress(clipboard?:Pick<Clipboard,'writeText'>):Promise<boolean>{
 if(!clipboard)return false;
 try{await clipboard.writeText(OFFICIAL_TOKEN.address);return true;}catch{return false;}
}

export default function OfficialTokenAddress(){
 const [state,setState]=useState<'idle'|'copying'|'copied'|'failed'>('idle'),statusId=useId();
 async function copy(){setState('copying');try{setState(await copyOfficialTokenAddress(navigator.clipboard)?'copied':'failed');}catch{setState('failed');}}
 return <section className="official-token-address" aria-label="Official project token address">
  <div className="official-token-address-copy">
   <a href={OFFICIAL_TOKEN.explorer} target="_blank" rel="noopener noreferrer" aria-label={`Our token - $${OFFICIAL_TOKEN.symbol} on ${OFFICIAL_TOKEN.network}, view on Solscan (opens in a new tab)`}>Our token - ${OFFICIAL_TOKEN.symbol} - {OFFICIAL_TOKEN.network}<ArrowUpRight size={13} aria-hidden="true"/></a>
   <code>{OFFICIAL_TOKEN.address}</code>
  </div>
  <button className="official-token-copy" type="button" onClick={()=>void copy()} disabled={state==='copying'} aria-label="Copy full Solana token address" aria-describedby={statusId}>{state==='copied'?<Check size={15} aria-hidden="true"/>:<Copy size={15} aria-hidden="true"/>}<span>{state==='copied'?'Copied':state==='copying'?'Copying':'Copy'}</span></button>
  <span id={statusId} className="official-token-copy-status" role="status" aria-live="polite">{state==='copied'?'Address copied.':state==='failed'?'Copy failed. Select the address above to copy it manually.':''}</span>
 </section>;
}
