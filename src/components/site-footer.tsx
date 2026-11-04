import React from 'react';

export default function SiteFooter(){
 return <footer className="site-footer" aria-label="Site information">
  <span className="site-footer-credit">Built by Cyril AI</span>
  <nav aria-label="Legal and contact"><a href="/privacy">Privacy</a><a href="/cookies">Cookies &amp; storage</a><a href="/terms">Terms</a><a href="mailto:cyril@izee.ai">Contact</a></nav>
 </footer>;
}
