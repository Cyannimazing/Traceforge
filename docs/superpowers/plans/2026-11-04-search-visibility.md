# Search visibility implementation plan

**Goal:** Make TraceForge's public information pages discoverable at the user-confirmed canonical origin `https://www.traceengine.tech` and push the verified implementation.

**Architecture:** Use Next.js metadata, sitemap, robots and generated social-image conventions. Share public page copy with client navigation so titles and canonical/indexing directives remain correct after history navigation. Preserve the current interface and investigation engine.

**Scope:** Index `/`, `/discover` and `/methodology`. Device-only watchlists and client-loaded token reports use noindex/follow; they are not standalone server-rendered evidence documents. Bots receive no fabricated token findings. API responses are excluded from indexing. Preview/development builds remain nonindexable.

**Approach:** Native Next.js conventions fit the existing app; a third-party SEO dependency adds no required capability. A static hand-written sitemap would duplicate route/origin policy. User has delegated implementation; the public origin was confirmed during this task.

- [x] Write failing checks for origin validation, production/preview policy, canonical normalization, public route scope, social metadata and JSON-LD escaping.
- [x] Add shared page content and metadata helpers; wire page/layout metadata, crawler files, site verification and API indexing headers.
- [x] Generate a neutral black-studio social card from the existing TF mark using Next's ImageResponse; no invented score or endorsement.
- [x] Keep client history navigation metadata in sync without fetching or rerunning investigations.
- [x] Run focused/full tests, TypeScript, production build and HTTP/browser checks, including social image output and noindex routes.
- [ ] Push the verified release, check the public deployment and document Search Console submission steps. Google indexing is separate from technical eligibility.

Validation: 895 tests passed; TypeScript and production build passed. Actual HTTP checks verified page titles/canonicals/index directives, sitemap XML, robots text, API indexing header, 404 behavior and valid JSON-LD. Generated social image rendered at 1200x630 and was visually inspected. Browser navigation across Scan, Discovery, Methodology and Watchlist plus browser Back kept metadata in sync, with no console warnings or errors. Independent read-only review found no concrete issues. Apex redirects 308 to the canonical www hostname.
