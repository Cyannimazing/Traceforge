# Swarm design reconstruction audit

Audited 2026-11-01. Reference: https://swarmengine.tech/ . Scope: public UI, browser-delivered HTML/CSS/JavaScript, and the existing REA records. This is a reconstruction specification, not a claim to possess Swarm's backend or permission to reuse its source/assets.

## Authority and evidence

The latest instruction is to reverse-engineer the actual Swarm design. Earlier TraceForge preferences against 3D, spiders, gradients, and ambient animation are superseded for this investigation. Existing PRODUCT.md and DESIGN.md still describe that previous direction; they must not silently constrain the next design phase. Neither file nor production implementation was changed by this audit.

Applied the original [REA skill v59](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md) and its [JavaScript artifact guide](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/references/javascript-applications.md), retrieved through the GitHub connector; Impeccable context/document guidance; and design-taste-frontend app-screen guidance. The assigned reference supplies the visual direction, so no unrelated style was drawn or substituted. In this delegated research task the supplied brief replaced an additional design interview. The two design skills inform measurement and verification; their generic anti-gradient/anti-glow preferences do not override this explicit reference.

Evidence labels used below:

- **Observed UI**: inspected live through the in-app browser with screenshots and accessibility state.
- **Delivered implementation**: directly read from captured public client files. This establishes client presentation logic, not successful execution of every branch.
- **Recommendation**: independent TraceForge implementation choice inferred from that evidence.
- **Unknown**: unavailable private logic, untested runtime state, or a claim that public evidence cannot establish.

Reused the matching app.js REA record `ev_2aec5c2892a89a4fd54739c6e025fdcd759370d96a99f88341a25f16ca6cb7a1` and engine.js record `ev_726041963b437891897b6fc72ce05afb99726699132343f44ed13ac97c45cc4d`. Their original selection/coverage remains partial. No repeated broad REA analysis was needed. Follow-up CSS and sibling-file reading is direct static evidence, not an expansion of those REA runs.

Captured source lives in the chat's `work/swarm-evidence/`. Rechecked SHA-256:

| Artifact | SHA-256 |
|---|---|
| app.js | f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380 |
| engine.js | bbe1c83f6179b8d26ccbaf7922549f5f558d1cc8b8f8c3fe2dd1c35285160226 |
| app.css, retrieved in this audit | 7ea543138d85f03d6e89f927d820e6b55022321e7df4ea2de3a461abcaa6b4d7 |
| radar-scope.css, retrieved in this audit | 0a42575bba3d31f7108b8d92394aa30388cd6f878ef3975b24678afbc32d5c83 |

The stylesheets were fetched from the exact `/assets/app.css?v=1791791361` and `/assets/radar-scope.css?v=1791791361` references in index.html. Initial sandbox DNS access failed; an approved scoped retry retrieved only those public assets. Delivered sources can change: these hashes and screenshots define this audit's version.

## 1. Actual visual identity

**Observed UI:** a black instrument console, not a conventional colored crypto dashboard. White is both text and the strongest state signal. Gray distinguishes inactive, secondary, and lower-intensity data. The visual signature is the combination of compact mono labels, squared outlined panels, white glowing events, tiny data fields, a large node-and-fiber engine, moving spiders, and shaded planets. Large empty black areas are intentional stages for motion, not missing cards.

**Important correction:** it is predominantly monochrome, not literally colorless. Radar/Cam use teal OK and blue CLEAN; Council and wallet-spider details use teal and amber; the official-token footer has a teal border. Preserve the role-specific exceptions instead of making every status gray or applying a rainbow palette globally.

**Important implementation fact:** delivered files implement these apparently dimensional scenes with native Canvas 2D, SVG, CSS, and procedural drawing. Planet texture/shading is generated into cached canvases; the torus uses projected geometry and shaded circles. The inspected page does not load Three.js, a model loader, React, a graph UI package, or an external chart library. 3D appearance does not establish WebGL.

### Final cascade tokens

Read the later unified-theme overrides, not only the initial declarations (`app.css:439` onward).

| Role | Delivered value / use |
|---|---|
| Ground | #000 |
| Panel | #050505 or rgba(5,5,5,.92); engine node rgba(8,8,8,.92) |
| Main text | #fff |
| Supporting text | #d6d6d6 / #ddd |
| Muted labels | #8c8c8c / #777 |
| Dim metadata | #5a5a5a / #555; some footnotes #4a4a4a |
| Structural borders | #1c1c1c, #222; controls #333 |
| Node title fill | #1a1a1a; gate/link/simulation #2a2a2a |
| Selected/active | white background, black text |
| Danger | white filled badge, black text, white glow |
| Risky | outlined badge, border #ccc |
| Clean/OK generic badge | gray text #bbb, border #3a3a3a |
| Too early | #777 text, dashed border |
| Radar/Cam OK | #19e3c4 |
| Radar/Cam CLEAN | #2f7dff / #5b9bff |
| Council alarm | #ffd36b |
| Radius | panels 3px, engine/header 4px, buttons/chips 2px; circles reserved for signal dots, planets, rings, avatars |

Body grid: 64×64px very faint white lines, masked toward the page edge. Engine has its own grid mask. Map has a #0a0a0a-to-black radial gradient. Node active state uses a white border plus 28px diffuse white glow; main button hover has a 24px glow. There is no broad saturated gradient wash.

### Type

`index.html:18` loads **Space Grotesk 400/500/600/700** and **JetBrains Mono 400/500/700/800** from Google Fonts. Body is Space Grotesk 15px/1.5; engine data and controls are JetBrains Mono. Typeface loading must be verified rather than relying on a fallback.

| Element | Delivered typography |
|---|---|
| Engine title | Space Grotesk 700, clamp(22px, 3.1vw, 36px), 1.05 line height, -.01em tracking |
| Shared page title | clamp(24px, 3.4vw, 40px), 1.05; suffix after // at .55 opacity and weight 500 |
| Section heading | JetBrains Mono 700, 11.5px, uppercase, .08em; often prefixed by gray // |
| Nav | JetBrains Mono 11.5px, uppercase, .08em |
| Engine node heading | 12.5px/600; rows 11px; type tag 9.5px |
| KPI label | 10px, uppercase, .12–.14em |
| Engine KPI | 21px/500, tabular figures; 16px on phone |
| Report KPI | JetBrains Mono 19px |
| Token name | Space Grotesk 30px/700; 24px below 640px |
| Score ring | JetBrains Mono 54px |
| Judge decision | JetBrains Mono 42px/800, .06em, glow |
| Table | 13px body; 10.5px uppercase mono heading; numeric cells mono/right aligned |

## 2. Shell and navigation

**Observed + delivered:** centered wrap, max-width 1240px including 22px side padding; 16px padding below 640px. Sticky 62px header at z-index 20, translucent black with 10px backdrop blur and a thin bottom border. At the initial 1280×720 capture content starts near x34 because the centered available page excludes the scrollbar. Do not hard-code that screenshot coordinate as a page margin.

Left: geometric mark plus spaced SWARM wordmark. Main navigation: Scan; Live dropdown (Radar, Dump Alarm, Spider Cam); Intel dropdown (Cabals, Replay, Spider); Molt; API. Right: project contract-copy and social link, Holder Pass, Watch count, command shortcut. Product-specific token affiliation, social identity, and Holder Pass are Swarm content, not TraceForge requirements.

Desktop dropdown opens on hover-capable pointer enter or click; ArrowDown enters items, arrows move between items, Escape closes and returns focus to the trigger. Click outside closes. Menus have a white border, 250px minimum width, dark fill, short slide/fade, labels plus a dim explanatory subline (`app.js:135–159`, `app.css:809–845`).

At 860px and below, primary nav items disappear and the hamburger appears. Menu is an overlay below the sticky header, nearly opaque black, grouped LIVE/INTEL/MORE with 20px uppercase links and 24px Scan. Phone capture shows the header controls are crowded and can wrap the CA/Holder Pass labels while the scrollbar is present; this is an observed imperfection, not a requirement to reproduce.

Command palette: Ctrl/Cmd+K or slash outside an input; Watch opens the same palette with `watch` prefilled. White-bordered 640px max dialog at 12vh, backdrop blur 6px; 52vh/440px max results area. Active row inverts to white. Up/down select, Enter executes, Escape/backdrop closes. Results mix page routes, watched tokens, recent tokens, and scan/X-ray actions for a valid address. No-match is a written message. At 560px descriptions disappear and the top offset becomes 8vh. Selection is limited to 14 results in the captured implementation (`app.js:1222–1268`).

## 3. Engine homepage reconstruction

**Observed UI:** the homepage opens directly on the engine, without an oversized marketing hero. Order:

1. Framed engine header: title/subtitle at left, clock/decisions/avoid/escalated/spend and LIVE at right.
2. Address input, native chain picker, white SCAN button in one outlined form, maximum 760px.
3. A horizontal step line: Sources → Gate → Scout → Trace → Link → Audit → Judge → You, with the current step white-inverted. Separate `replay · real scans` qualifier.
4. Large graph stage with DOM node cards above canvas fibers, ring hub, and moving spider overlay.
5. Six dense lower panels: run log, scans/hour, gate percentage ring/wave, 8×8 heat map, spend/latency, ledger/agent states.
6. Explicit animated-replay footnote.
7. Launch radar, latest scan cards, MCP connection panel, footer.

Engine container: margin 18px top; padding 22px 22px 14px; graph desktop design coordinates 1100×700. Cards 220 design pixels wide; layout positions expressed as percentages. The hub is centered around (550,300) with 180px design diameter. Stage content is much taller than one 720px viewport; the panels are below the graph, not squeezed beside it.

### Graph topology, visible cards

| Band | Node cards |
|---|---|
| Sources | GeckoTerminal, DexScreener, chain RPC, user paste |
| Gate | skipped, new launch? |
| Read | scout/holders and tracer/funders at left; linker/swarms and auditor/contract at right of central hub |
| Checks | shared funder?, contract trap? |
| Routing | dropped, swarm memory, frontier LLM |
| Outcome | cabal board, judge, your feed |

Edges are curved multi-strand fibers, with luminous packets carried by procedural spiders. Agent cards are dark; the final judge and feed headers are white, LLM is dashed, log nodes dimmer, current card gets a white glow. Each card has title/type plus two compact label/value rows. Build the role hierarchy, not a random arrangement of generic cards. Full node locations/topology are established by `engine.js:17–44` and layout at `engine.js:110–126`.

Mobile is a distinct graph composition: design 360×1135, card width 165, source/gate rows in two columns, hub between gate and agent rows, then checks and routing, memory and judge centered vertically, final cabal/feed pair. It switches on **engine root width <760**, not viewport width. Thus at a 768px viewport, the graph is already in mobile layout while several CSS styles still use desktop typography. This was observed in the tablet screenshot. On phones type tags are hidden below 480px.

Panel columns: six by default (first 1.15fr); three at <=1100px; two at <=760px with log spanning both; one at <=480px. The title/KPI flex row wraps at <=1180px. Phone KPIs form three columns over two rows.

### Data truth boundary

**Delivered implementation:** the home animation replays scan feed records and falls back to explicitly labeled demonstration items. Some source choices, lags, gate results, probabilities, and counters are randomized or animation-derived. The observed clock, `$0.000`, “free APIs”, and LLM routing text are presentation claims, not independently measured backend telemetry. TraceForge should render its actual scan stages/evidence counts or label an illustrative replay. A visual reconstruction must not fabricate live throughput, cost, model confidence, provider use, or an LLM escalation engine that does not exist.

## 4. Scan progress and result

### Progress

Shared framed header says LIVE CRAWL; address, chain, and six stage labels remain visible. Button disables and becomes CRAWLING…. Below is a 1.7fr / minimum-300px split: large torus/agents stage at left; agent roster and scrollable log at right. Torus/Agents tabs switch canvas visibility without abandoning the job. The canvas is 600px high on desktop, 460px at <=980px; the split stacks there.

The log uses elapsed seconds, actor name, and event text. Client polls events every 350ms, advances stage markers, feeds both visualizations, and eventually exposes View Result. It waits for pending animation then moves to the report after a 2600ms delay. A result error re-enables Scan and places `✕ message` by the form. A polling failure prints an error and stops polling; that branch does not clearly restore all disabled state. This is a reconstruction hazard to improve, not a reason to fake success (`app.js:275–334`).

Navigating the known STREET report triggered an automatic refresh because the client uses a ten-minute cached-report threshold. This audit observed that crawl and completed report; no fresh-scan button was invoked. The refreshed result showed **82/CLEAN, 47 sampled holders → 47 hands**, while the earlier engine audit recorded 81. Both are dated observations, not contradictory fixed design values.

### Report composition

1. Framed VERDICT header: score/hands/verdict KPIs; stage strip; token logo/name/ticker/chain/band, full address and explorer/social links, Watch and Fresh Scan actions.
2. Six-column market strip: price, market cap, liquidity, 24h volume/change, age, total holders. The total holder count is distinct from the analyzed sample.
3. Main split: map 1.55fr; verdict/right stack min 320px/1fr, 16px gap. Map is 560px tall, sticky at 74px; right stack contains score ring/headline, judge output/probability bars/X-ray/receipt, score parts/rules.
4. Council transcript with voice/replay controls, ask field and suggested questions.
5. Conditional historical-holder time machine with square-thumb range control, 64px line canvas and three figures.
6. Swarms and Contract cards side by side.
7. Full-width holder table: rank, wallet, float, entry, transaction count, flags, swarm.
8. Memory and excluded infrastructure; conditional verdict/market replay; deployer history; share-card/actions; prior scans table when multiple records exist.

The table is not the first report block and is not tucked inside a drawer. Numeric data are right aligned; rows separated by near-black rules, no zebra stripes; hover adds faint white. Table container scrolls horizontally; transaction count is hidden below 640px. Groups/checks and main report stack to one column below 980px. Market strip becomes three columns at 980px and two at 640px. Map becomes 420px high at 640px.

### Planet map and wallet interaction

**Observed UI:** grayscale shaded planet nodes, float percentages inside sufficiently large nodes, orbit-like background rings. Hover gives address/share/entry/transaction detail; click opens a right drawer. Dragging is advertised and implemented. This is a force layout, not a manipulable 3D camera. No wheel/pinch zoom control was found in this selected implementation.

**Delivered implementation:** holder radius is proportional to square root of share, clamped for legibility; group forces, collision separation, spring edges and cluster orbits. Creator is a ringed planet; fresh wallet gets a small orbiting moon; funder/distributor is a star; multi-wallet group gets a black hole, accretion disk and dashed elliptical hull. Same-transaction/transfer links are solid, entered-together links dashed, funder links thinner. Clicking a group toggles focus and dims other nodes. Time-machine frames rescale only when the report supplies historic share arrays. A label claiming all holders since launch does not prove complete history.

Drawer: fixed right, below 62px nav, width min(420px,100%), full remaining height, #050505, 1px left border; 250ms horizontal slide. Address, flags, float, entry time/source, transactions, first funder, X-ray/explorer links. No modal dim backdrop in the observed view. The captured close function simply removes its open class; do not assume a focus trap or Escape handler exists. Preserve TraceForge's existing stronger keyboard/focus behavior.

## 5. Remaining public surfaces

All use the same framed title, subtitle, optional right KPIs, and process strip. These are separate product capabilities, not merely reskins of the homepage.

| Route / surface | Design and interactions | Verification |
|---|---|---|
| Radar | Large PPI scope; center sweep/rings/contact glyphs; left echo/load instruments; right contact log/spectrum; lock-on callout; bottom ticker; chain filter buttons and scan cards. Hover synchronizes contact/card highlight; click opens report. | Homepage instance observed; standalone filter/view code read. |
| Dump Alarm | Two-column live alerts and watching list, then four method steps, three alert levels, explanatory text and beta box. DUMP cards have strong white outline/filled badge. Updates every 10s in visible document. | Live page observed with historical alerts and one watched token. |
| Spider Cam | Wide web/spider canvas with 340px thought-stream sidebar; color legend; planet click opens scan. At <=900px stack with 430px canvas and 320px log. | Live idle scene observed; active update branches read. |
| Cabals | Header counters and one long card of crew groups, wallet-count/token-count chips, linked tokens/bands, address list. | Loading state observed; populated branch read, not confirmed in that capture. |
| Replay | Header counts and auto-fill cards min 300px, showing token/chain, outcome tag, warning band/time, peak/now/liquidity. Report replay uses 220px SVG chart and dated events. | Populated archive observed. |
| Wallet Spider | Wallet input/Hatch, square procedural egg/spider scene, adjacent attribute legend/profile; max 1.25fr/1fr split; stack <=860px. Hatch changes route; download uses canvas PNG. | Empty egg/legend observed; profile/trait branch read. |
| Wallet X-ray | Address header, EVM chain buttons; two columns for previously seen tokens and live activity/funder summary. | Delivered branch read; separate full live page not required for map-drawer observation. |
| Molt | Three columns 1.4fr/1fr/1fr for shipped/spinning/next; vertical timeline dots; stack <=860px. | Populated live route observed, including empty spinning column. |
| API | Read-oriented panels/code blocks, route and tool descriptions, scoring explanations. | Live page and delivered branch read; public docs are claims about service contracts, not private source. |
| Holder Pass | Side drawer, perks, requirements, signing status. Teal active state; wallet-sign action. | Code only; no wallet authentication/signing attempted. |
| Badge/share | Right drawer with preview and copyable HTML/Markdown snippets; report share image and download. | Code read; no social post or upload performed. |

Radar is 600px high on home; standalone min600/max760 or80vh. At <=1099px left instrument column hides; <=859px right column and legend hide; <=640px height560, header stacks and stats shrink. Radar deliberately uses CRT scanlines, grain, sweep, white outlined clipped callouts and continuous ticker. Contact shape and label supplement color.

## 6. Motion and state contract

| State or motion | Delivered behavior | Independent reconstruction requirement |
|---|---|---|
| Initial load | Header/footer can render before main view while chain config loads; dashboard starts zeros/dashes. | Avoid presenting placeholder zeros as measured values; use pending labels until actual data exists. |
| Panel arrival | 700ms fade, translateY16px, blur4px; stagger55ms capped at14. | Similar restrained reveal, cancellable and fully static under reduced motion. |
| Numeric arrival | 900ms count-up; title scramble ~800ms. | Never leave scrambled text as accessible final content. |
| Background | Sparse white particles and cursor-near links, about30fps, <=90 particles, DPR capped1.5. | Optional Canvas2D layer; pause offscreen/hidden/reduced-motion. |
| Engine | Curved luminous paths, moving spiders, 24s rotating hub ring; ~250ms node emphasis; 700ms hit. | Tie stage emphasis to actual engine events; distinguish decorative movement from measured progress. |
| Radar | Rolling scanline6s; grain.5s; ticker40s; contact pulses/sweep. | Native canvas/CSS; readable static state when paused. |
| Loading sections | Ellipsis, “reading…” / “convening…”; empty feed awaiting contacts. | Separate loading, empty success, stale data and failure. |
| Missing data | Dash, absent optional section, TOO_EARLY badge, unread holder flag. | Retain TraceForge unavailable/inferred/observed semantics; do not downgrade unavailable into safe/zero. |
| Errors | Inline mono white error text, prefix cross for scan failure; some independent feed errors swallowed. | Report actual blocked provider/action and offer retry where supported. |
| Hover | White outline/glow, cursor-responsive border spotlight; tiny card lift. | Same visual vocabulary with visible keyboard equivalent. |
| Reduced motion | fx.js disables particles/count/scramble/reveal; CSS stops some rings/scan effects. Selected engine/map loops lack a complete common reduced-motion guard. | Implement one shared visibility/reduced-motion policy across every canvas. Do not claim reference motion is fully accessible. |

The prior WETH error (more than150,000 transfers after136.9s) is historical observation from the engine audit, not reproduced here. Empty Council/replay/deployer states and rate-limit/provider failures were not exhaustively induced. Backend readiness, confidence calibration, graph completeness, cross-token memory, alarm ingestion and historical storage remain unknown from this design audit.

### Engine parity is not established by visual parity

| Public evidence | What is established | What remains unavailable or separate work |
|---|---|---|
| Crawl events and refreshed STREET report | UI can display measured transfer/holder progress and a completed server report. | Provider implementation, entitlement, full-history coverage, retries and source correctness are not recovered. |
| Score/rules/judge output | Displayed score parts, verdict, probabilities, receipt and per-result features. | Complete backend normalization/calibration/missing-data policy; TraceForge must retain its independent assessment. |
| Map and group presentation | Client renders supplied nodes/edges/clusters and drawer fields. | Proof of common beneficial ownership, complete funding traces or exhaustive wallet grouping. |
| Time machine | Client consumes historical block/share arrays and resizes planets. | Complete launch ledger and reconstructed historical balances; sampled trades cannot substitute. |
| Radar and alarm | Public contact/alert lists, refresh behavior and UI states. | Continuous ingestion, upstream provider reliability, server alarm scoring and completeness. |
| Cabals/memory/deployer history | Published client output schema and conditional sections. | Persisted cross-token database, deduplication, attribution and first-funder policies. |
| Council | A transcript/ask/voice presentation branch exists. | Private response generation or reasoning provenance; no question or feedback was submitted in this audit. |

This preserves the requested order: complete and verify actual engine capabilities first, use this document as the subsequent design reference, and do not label unsupported features as operational to imitate a screenshot.

## 7. Concrete TraceForge gaps and reconstruction work

Current source (`src/components/workbench.tsx`, holder-workspace.tsx, studio/holder CSS) is a Public Sans, muted-teal, left-rail, holder-table-first desk. That is a different composition from Swarm. Copying only the palette would not fulfill the latest direction.

| Priority | Change | Acceptance condition |
|---|---|---|
| P0 | Replace obsolete visual direction in project context. | New visual spec cites actual Swarm-derived structure; no automatic restoration of the old no-spider/no-gradient limitations. Keep actual data/product boundaries. |
| P0 | Build top navigation and centered framed page shell. | 62px header, coherent desktop dropdowns/phone menu, keyboard operation, body overflow checked. TraceForge identity and actual routes; no copied Swarm token/social/holder-pass identity. |
| P0 | Build independent engine scene for idle/active scan. | Node cards, fiber paths, ring hub, compact stats/log. Actual Resolve/holders/trades/funding/security/report events map to known stages. Every displayed count comes from state or is explicitly illustrative. |
| P0 | Recompose report to map + assessment beside it. | Planet/relationship map and summary both visible on desktop; holder table still present below; drawer opens from map and rows; incomplete samples stated. |
| P0 | Replace type/color/shape primitives. | Loaded Space Grotesk and JetBrains Mono or explicitly agreed licensed equivalents; neutral-black palette, 2–4px corners, mono hierarchy, white selection; semantic text/icon differences retained. |
| P1 | Create procedural visual primitives independently. | Original planet textures, group rings, star funders, creator rings, small fresh markers, spiders only where supported by design. No downloaded Swarm graphics or source copied into production. |
| P1 | Add command palette and coherent watch access. | Ctrl/Cmd+K and slash; grouped local actions/search, arrow navigation, Escape/focus restore, mobile layout. Existing browser-local watch storage retained. |
| P1 | Restyle Discover as feed + scope/list only if appropriate. | Public profiles are not mislabeled automatic launch scans, live monitored contacts, or assessed tokens. Radar display reflects available fields and has stale/empty/error states. |
| P1 | Make motion policy complete. | All loops pause in hidden tab/offscreen and obey reduced motion; disposal on route change; DPR/resizing safe; static readable alternative. |
| P2 | Add report exports and historic views when data exists. | Existing JSON export preserved. Share card uses actual report data. Historical holder playback is unavailable until historic balances/complete ledger exists; existing event replay stays labeled event replay. |
| P2 | Separate new capabilities from cosmetic parity. | Council, persisted verdict history, continuous alarms, cross-token Cabals, wallet-spider profiling require independent data/behavior work. Do not add fake operational pages to fill nav. |

### Libraries and native features

**No new dependency is required for visual parity.** Existing React/Next/TypeScript and authored CSS can implement the shell; Canvas2D/SVG can implement scene/sprites/charts; GSAP is already installed and can handle bounded transitions. Use requestAnimationFrame, ResizeObserver, IntersectionObserver, pointer events/pointer capture, matchMedia and document visibility. Existing Three.js is available but not necessary; do not introduce React Three Fiber, a model download, a graph package or a chart library just because the scene looks dimensional.

For independent rendering: derive stable procedural texture parameters from wallet IDs; maintain a separate graph view model from evidence; preserve all data even if the visible-node cap hides some nodes. Implement spatial hit-testing plus a semantic DOM list/table alternative. Use safe deterministic state for layout and explicit event timestamps, not random claims. Do not port Swarm functions or shader/sprite implementations verbatim.

### Verification gate for the future implementation

Compare screenshot geometry and behavior at 1280×720, 768×1024 and390×844, plus breakpoint edges around860/980 and the engine-root760 transition. Verify loading, partial report, successful report, stale refresh failure, empty discovery/watchlist, selected wallet/group, keyboard-only command/menu/drawer and reduced motion. Use the same dataset for before/after comparisons; changing live values are not visual regressions. Inspect layout without waiting for decorative animation to finish; screenshot settled states as well as deliberate transitions. Run existing engine tests unchanged and integration checks for newly wired scene events.

## 8. Screenshot evidence

Captured by the authorized in-app browser; only temporary viewport overrides were used and reset. Images are stored in the chat's outputs/review folder. Filenames describe the observed state, not inferred capability.

- `swarm-home-desktop.jpg`: 1280×720 initial engine, pending data.
- `swarm-engine-lower-desktop.jpg`: populated graph outcome and six panels.
- `swarm-radar-desktop.jpg`: populated PPI scene and contact log.
- `swarm-command-desktop.jpg`: command palette with selected row.
- `swarm-crawl-desktop.jpg`: observed automatic report refresh/crawl.
- `swarm-report-desktop.jpg`: completed STREET82/CLEAN report.
- `swarm-wallet-drawer-desktop.jpg`: clicked planet and wallet drawer.
- `swarm-report-mobile.jpg`, `swarm-menu-mobile.jpg`:390×844 report/menu.
- `swarm-home-mobile.jpg`, `swarm-engine-mobile.jpg`:390×844 two-column graph.
- `swarm-home-tablet.jpg`:768×1024, graph-root breakpoint distinct from viewport breakpoint.
- `swarm-cam-desktop.jpg`: live camera idle scene.
- `swarm-alarm-desktop.jpg`: live feed of historical alerts.
- `swarm-spider-desktop.jpg`: empty wallet-spider entry state.
- `swarm-cabals-desktop.jpg`: pending cabals data, not evidence of zero crews.
- `swarm-replay-desktop.jpg`: populated replay archive.
- `swarm-molt-desktop.jpg`: populated changelog and empty spinning column.
- `swarm-api-desktop.jpg`: public API/documentation page.

The user-facing copy of this audit is `outputs/traceforge-swarm-design-audit.md`, with clickable image links. Public reference pages and delivered asset URLs are the external sources; captured-file line anchors above are stable only for the hashed version.


## Clickable screenshot index

- [swarm-alarm-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-alarm-desktop.jpg)
- [swarm-api-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-api-desktop.jpg)
- [swarm-cabals-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-cabals-desktop.jpg)
- [swarm-cam-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-cam-desktop.jpg)
- [swarm-command-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-command-desktop.jpg)
- [swarm-crawl-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-crawl-desktop.jpg)
- [swarm-engine-lower-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-engine-lower-desktop.jpg)
- [swarm-engine-mobile](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-engine-mobile.jpg)
- [swarm-home-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-home-desktop.jpg)
- [swarm-home-mobile](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-home-mobile.jpg)
- [swarm-home-tablet](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-home-tablet.jpg)
- [swarm-menu-mobile](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-menu-mobile.jpg)
- [swarm-molt-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-molt-desktop.jpg)
- [swarm-radar-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-radar-desktop.jpg)
- [swarm-replay-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-replay-desktop.jpg)
- [swarm-report-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-report-desktop.jpg)
- [swarm-report-mobile](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-report-mobile.jpg)
- [swarm-spider-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-spider-desktop.jpg)
- [swarm-wallet-drawer-desktop](C:/Users/Cyann/Documents/Codex/2026-11-01/https-github-com-topics-reverse-engineer/outputs/review/swarm-wallet-drawer-desktop.jpg)
