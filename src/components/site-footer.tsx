import React from 'react';
import OfficialTokenAddress from './official-token-address';

export default function SiteFooter(){
 return <footer className="site-footer" aria-label="Site information">
  <OfficialTokenAddress/>
  <a className="site-footer-credit" href="https://portfolio-cyannimazing.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Built by Cyril AI - visit portfolio (opens in a new tab)"><img src="/brand/cyril-ai-icon-dark.webp" width="28" height="28" alt="" aria-hidden="true"/><span>Built by Cyril AI</span></a>
  <nav aria-label="Official links, legal and contact"><a href="https://x.com/traceengine17" target="_blank" rel="noopener noreferrer" aria-label="Official X - @traceengine17 (opens in a new tab)">Official X</a><a href="/privacy">Privacy</a><a href="/cookies">Cookies &amp; storage</a><a href="/terms">Terms</a><a href="mailto:cyril@izee.ai">Contact</a></nav>
 </footer>;
}
