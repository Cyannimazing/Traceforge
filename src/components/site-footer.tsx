import React from 'react';

export default function SiteFooter(){
 return <footer className="site-footer" aria-label="Site information">
  <a className="site-footer-brand" href="/" aria-label="TraceForge Engine home"><img src="/brand/traceforge-logo-transparent.png" width="1100" height="209" alt="" aria-hidden="true" decoding="async" loading="lazy"/></a>
  <a className="site-footer-credit" href="https://portfolio-cyannimazing.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Built by Cyril AI - visit portfolio (opens in a new tab)"><img src="/brand/cyril-ai-icon-dark.webp" width="28" height="28" alt="" aria-hidden="true"/><span>Built by Cyril AI</span></a>
  <nav aria-label="Legal and contact"><a href="/privacy">Privacy</a><a href="/cookies">Cookies &amp; storage</a><a href="/terms">Terms</a><a href="mailto:cyril@izee.ai">Contact</a></nav>
 </footer>;
}
