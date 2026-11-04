import React from 'react';
import LegalShell from '@/components/legal-shell';
import BrowserStorageControls from '@/components/browser-storage-controls';
import {createPageMetadata} from '@/lib/seo';
export const metadata=createPageMetadata('/cookies');

export default function CookiesPage(){
 return <LegalShell title="Cookies & storage" intro="Scanning works without optional report history. Manage what TraceForge keeps on this browser.">
  <section><h2>What the current app uses</h2><p>TraceForge does not set application cookies or use advertising or analytics SDKs. It uses localStorage for the browser features below. localStorage is stored on your device and is not automatically attached to every server request like a cookie.</p><div className="legal-table-wrap"><table><caption>TraceForge browser storage</caption><thead><tr><th scope="col">Storage key</th><th scope="col">Purpose and choice</th><th scope="col">Duration</th></tr></thead><tbody><tr><th scope="row"><code>traceforge.watchlist.v1</code></th><td>Token names and identifiers saved when you choose Watch. Remove individual tokens in Watchlist or clear app data below.</td><td>Until you remove it or clear site data.</td></tr><tr><th scope="row"><code>traceforge.report-history.v1</code></th><td>Records your explicit choice to enable report history. Absent means off.</td><td>Until you turn it off or clear site data.</td></tr><tr><th scope="row"><code>traceforge.report-feed.v9</code></th><td>Up to 12 completed report summaries, saved and read only with history enabled. Earlier version keys may remain from previous visits.</td><td>Until replaced within the limit, you clear history, or you clear site data.</td></tr></tbody></table></div></section>
  <BrowserStorageControls/>
  <section><h2>External services and browser settings</h2><p>Hosting or network services may handle request information. Token logos can load from outside image hosts, and external links lead to services with their own policies. See the <a href="/privacy">privacy notice</a> for recipients and retention limits.</p><p>You can block or delete site storage in your browser. If storage is blocked, scanning still works, but saving a watchlist or report history may not. Changing these choices affects this browser and website origin only.</p></section>
 </LegalShell>;
}
