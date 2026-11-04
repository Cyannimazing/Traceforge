import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PrivacyPage,{metadata as privacyMetadata} from '../src/app/(legal)/privacy/page';
import CookiesPage,{metadata as cookiesMetadata} from '../src/app/(legal)/cookies/page';
import TermsPage,{metadata as termsMetadata} from '../src/app/(legal)/terms/page';

test('each legal route renders an accessible notice with working scanner, contact and legal destinations',()=>{
 for(const [Component,path,metadata] of [[PrivacyPage,'/privacy',privacyMetadata],[CookiesPage,'/cookies',cookiesMetadata],[TermsPage,'/terms',termsMetadata]] as const){
  const html=renderToStaticMarkup(React.createElement(Component));
  assert.equal((html.match(/<main\b/g)||[]).length,1);assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.match(html,/aria-label="Main navigation"/);assert.match(html,/href="\/"/);assert.match(html,/aria-label="Legal and contact"/);
  for(const href of ['/privacy','/cookies','/terms','mailto:cyril@izee.ai'])assert(html.includes(`href="${href}"`),`${path} is missing ${href}`);
  assert.equal(metadata.alternates?.canonical,`https://www.traceengine.tech${path}`);
 }
});
test('the storage route exposes explicit choices and keeps history disabled until the browser can read the saved choice',()=>{
 const html=renderToStaticMarkup(React.createElement(CookiesPage));
 assert.match(html,/id="storage-controls"/);assert.match(html,/id="storage-controls-title"/);
 assert.match(html,/<button type="button" disabled="">Enable report history<\/button>/);
 assert.match(html,/<button type="button" disabled="">Clear saved report history<\/button>/);
 assert.match(html,/<button type="button" disabled="">Clear TraceForge browser data<\/button>/);
 assert.match(html,/role="status" aria-live="polite"/);
});
