# TraceForge search visibility

Canonical production site: **https://www.traceengine.tech/**. The www hostname is the confirmed public origin. Home, Discovery and Methodology have server-rendered titles, descriptions, canonical links, social metadata and normal internal links. A generated black-studio 1200x630 PNG accompanies shared links. Website/application JSON-LD describes the tool without fabricated ratings or safety guarantees.

## Google Search Console

1. Open [Google Search Console](https://search.google.com/search-console/welcome).
2. Add the **Domain** property `traceengine.tech` and verify ownership using Google's TXT record at the domain's DNS provider. This covers www, apex and HTTPS variants. Follow the exact record/value Google supplies; SEO code does not establish domain ownership.
3. Alternatively, add the exact **URL-prefix** property `https://www.traceengine.tech/`, choose HTML-tag verification, set the tag's content value as `GOOGLE_SITE_VERIFICATION` in the production hosting environment, and redeploy. Do not use a Google API key here. The default is unset, so the app does not claim verification before you provide a code.
4. In **Sitemaps**, submit `https://www.traceengine.tech/sitemap.xml`.
5. Inspect `https://www.traceengine.tech/` with **URL Inspection**, run the live test and request indexing. Repeat for `/methodology` and `/discover` if needed.
6. Monitor **Page indexing** and **Performance** for actual indexing, impressions, queries and clicks. Submission does not guarantee inclusion or ranking, and crawling is not immediate.

For the user-selected HTML-file verification method on the URL-prefix property, the downloaded `google177c31db954070a2.html` is preserved unchanged in `public/`. Its public URL is `https://www.traceengine.tech/google177c31db954070a2.html`. Keep this file published after verification; Google periodically rechecks ownership. Click Verify in Search Console after the public file responds successfully with its original content.

Primary guidance: [Google's technical requirements](https://developers.google.com/search/docs/essentials/technical), [Search Console verification](https://support.google.com/webmasters/answer/9008080), and [sitemap submission](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

## What this release indexes

- `/`, `/discover`, `/methodology`: index/follow in production and included in the sitemap.
- `/watchlist`: noindex/follow, since its useful content lives only on the visitor's device.
- `/token/{chain}/{address}`: correct token-specific canonical metadata and noindex/follow. These currently load a live investigation on the client, rather than serving a stable, complete report in the initial HTML. Indexing report loading screens as if they contained verified token findings would produce thin or misleading search results. Future indexable report documents should serve real cached evidence, capture times and meaningful content on the server without starting paid scans for crawlers.
- `/api/*`: excluded from crawling and served with `X-Robots-Tag: noindex, nofollow, nosnippet`.
- Development and Vercel preview deployments: noindex; their sitemap is empty and robots disallows crawling. These are indexing directives, not authentication or access controls.

`SITE_URL` defaults to the confirmed production origin. Override it only for a deliberate domain move; it must be a public HTTPS origin without credentials, path, query or fragment. Production metadata does not trust a request Host header or a preview hostname. New builds are required after changing static metadata environment configuration.

## Ongoing work that helps users and search

- Keep methodology accurate and publish useful explanations of holder concentration, Creator/Owner/Dev/Sniper flags, evidence timestamps and coverage. Write for users instead of repeating keywords.
- Add real About/contact/policy information when available. Do not invent a team, audit, endorsement, performance result or safety guarantee.
- Keep headings, navigation, URLs and page-specific titles consistent. Use the canonical hostname when sharing public links.
- Measure mobile performance and Core Web Vitals on the deployed site. Reduce animation or JavaScript work where measurements show it harms usability. Do not claim a Lighthouse score without running it.
- Seek relevant, earned mentions and links. Avoid bought link packages, scraped token pages, fake reviews and bulk low-quality SEO content.
- Keep sitemap entries limited to genuinely indexable pages. Do not manufacture fresh last-modified dates when no content changed.

## Release verification

Check real HTTP responses, not only JavaScript objects: public pages must return 200 with readable text, the correct canonical domain and no unexpected `noindex`. `/robots.txt`, `/sitemap.xml` and the PNG preview must return their expected content types. Check watchlist/token noindex behavior, malformed report 404s, client navigation metadata, console errors and social-card rendering. Confirm the public deployment after pushing; a local build alone does not update Google.
