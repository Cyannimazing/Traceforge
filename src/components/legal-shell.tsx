import React,{type ReactNode} from 'react';
import {ArrowUpRight} from 'lucide-react';
import SiteFooter from './site-footer';
import {ForgeLogo} from './brand';
import OfficialXLink from './official-x-link';

export default function LegalShell({title,intro,children}:{title:string;intro:string;children:ReactNode}){
 return <div className="legal-shell">
  <header className="legal-header"><a href="/" className="legal-brand" aria-label="TraceForge home"><ForgeLogo/></a><nav aria-label="Main navigation"><a href="/methodology">Methodology</a><OfficialXLink compact/><a href="/">Open scanner <ArrowUpRight size={14} aria-hidden="true"/></a></nav></header>
  <main id="main-content" className="legal-content">
   <header className="legal-intro"><h1>{title}</h1><p>{intro}</p><p className="legal-updated">Updated <time dateTime="2026-11-04">4 November 2026</time></p></header>
   <div className="legal-sections">{children}</div>
  </main>
  <SiteFooter/>
 </div>;
}
