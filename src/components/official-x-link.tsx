import {ArrowUpRight} from 'lucide-react';
import React from 'react';

export default function OfficialXLink({compact=false,className=''}:{compact?:boolean;className?:string}){
 return <a className={`official-x-link ${className}`} data-compact={compact} href="https://x.com/traceengine17" target="_blank" rel="noopener noreferrer" aria-label="Official TraceForge X - @traceengine17 (opens in a new tab)"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26L22.827 21.75h-6.657l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117Z"/></svg><span className="official-x-copy">@traceengine17</span><ArrowUpRight className="official-x-arrow" size={13} aria-hidden="true"/></a>;
}
