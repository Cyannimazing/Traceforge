# TraceForge black studio

Updated 2026-11-02 after explicit user corrections. Operate mode: investigate tokens, understand the verdict, inspect source-backed wallet evidence.

## Current direction

The home at `/` contains only the investigation workspace and its source strip, with minimum height equal to the viewport below the 62px navigation. Discovery lives at `/discover`, with matching direct-load routes for `/watchlist` and `/methodology`. Native links preserve new-tab behavior, and browser Back/Forward restores the selected page. A compact contract-entry console occupies the center, surrounded by six open source rows, with row-wise keyboard order. The retired oversized search bar, detached marketing heading, boxed source cards and central logo are absent. The scan state replaces entry with a responsive 180-300px aperture, monotonic elapsed timer, actual stage count, plain-language phase labels, and cancellation. The event log labels client receipt times, not chain timestamps. Pending source rows retain their purpose copy while the central status explains the provider request.

Black/charcoal only for the home, with neutral text. A single fixed canvas light field replaces particles, stars and duplicate local backgrounds. Its edge strands share one clock. The central input box has a silent, soft 5.2-second border pulse; no waveform or extra padding. Pointer interaction deforms the ribbons within a bounded region. Source paths animate and respond to focus/selection. No gradients, 3D models, insects or motion toggle. Mobile places the token console first and source rows below in two columns.

Discovery: one full-width instrument followed by up to sixteen tokens in a four-column desktop grid, two columns on tablets and one on narrow phones. Full-card links run real investigations and preserve native modified-click navigation. Filters, keyboard contact selection and pointer/focus selection synchronize the radar, market readouts and cards. Contacts scatter across the full circle, independent of network; distance has no risk or age meaning. A synchronized GSAP beam, expanding rings, bearing-timed contact echoes and selected-contact brackets provide motion. Real network counts, liquidity, price and volume readouts fill the instrument sides; on mobile they sit below the radar. Both side-widget headings align at the top of their shared row.

Reports: token/market context, verdict/reasons alongside the wallet map on desktop and stacked on small screens, holder records, historical tools. Evidence uses the existing drawer. Age is reported launch age at source scan or DEX pair age at retrieval, never guessed token creation.

## Visual system

Solid black/charcoal surfaces, neutral borders, white text/controls. Space Grotesk for interface copy; JetBrains Mono for data. Graphite and silver map data and controls, with no green theme; amber/red remain reserved for findings with text labels. Boxy chrome matches the Ctrl K control: one shared 2px corner token for panels, buttons, inputs, menus, badges and drawers; thin neutral borders. Radar rings, circular data markers and status dots retain their functional geometry. No gradients. Controls 44-52px; dropdown exactly matches trigger width.

The fixed viewport light field responds to pointer without scrolling. The central form uses 14-16px padding, 44px controls and compact gaps. Content scrolls normally. Bounded canvas linework, CSS/GSAP pipeline signals, radar sweep, graph entry, observed-edge flow, selection and drawer transitions. Hidden/offscreen instruments and OS reduced-motion stop decoration. No visible pause switch. Animation never implies a live transaction or successful source response.

## Freshness and evidence

Discovery polls every 30 seconds while visible; shared thirty-second server cache, single-flight requests and provider rate-limit cooldowns bound source traffic. DEX Screener profiles and GeckoTerminal new-pool feeds cover Ethereum, Base, BNB Chain and Solana. All networks shares one list sorted by newest known pool creation time, with unknown dates last. Each network filter uses the same ordering. Preserve original retrieval timestamp through cached/stale responses. Failed refresh preserves eligible previous results. Latest profiles are not necessarily new launches; pair creation dates mean pair age.

Provider reports remain distinct from independent verification. Verdict reasons link to the severity-determining evidence. Partial history never becomes Safe. Source timestamps and missing coverage remain explicit. Missing values are unavailable, not zero.

## Table geometry

Desktop holder ledger uses explicit column widths and an 860px minimum inside its own scroll region. At 700px and below, the same filtered and sorted rows become individual cards with wallet/share, wrapped role labels, observed entry, evidence and group actions, and expandable activity. Card sort buttons remain available when the table is hidden. Touch controls are at least 44px; full addresses wrap within expanded details. The hidden representation is not focusable. Report statistics use a two-column mobile grid; very narrow search forms stack the chain picker and scan action.

## Verification

Desktop/phone renders, real retrieval times, map/card selection, age/source disclosures, holder filters, exact dropdown width, fresh-load console. Regression tests, typecheck, production build. A redesign does not complete independent historical coverage.

## Navigation and holder map - November 4

The 62px sticky navigation uses a black brand rail, framed ForgeMark, silver route icons and one sliding active-route underline. Hover shifts the route icon and opens the brand registration corners. Below 901px, a square Menu control reveals the route panel with a short clipped transition; tablet routes use two columns and phone routes one. Short landscape screens retain two compact columns. Native hrefs, keyboard shortcuts, focus return, Escape and outside-click closing remain functional. Hidden/reduced-motion states stop decorative transitions.

The holder map, its basis selector and flag details use graphite/silver throughout. A 14-second bounded floating field moves nodes while keeping real connection paths attached and holdings unchanged. Hover, keyboard focus, panning, selection and evidence inspection hold the relevant map still. Packing reserves the drift and selection-outline envelope. On phones the largest bubble labels are enlarged; smaller nodes retain their tooltip and table/card equivalent instead of crowded text. Holder interfaces say Flags, including the filter and evidence summaries.

Home sizing uses a viewport minimum height and compact responsive source rows, ending at the provider trust strip. The separate Verdict explanation notice has been removed. Content can grow for short screens and large text. Discovery and the report feed do not appear below the home scan. The report feed remains available with completed reports, using only completed non-fixture scans stored on this device, with original retrieval times and no synthetic danger alerts. It rotates every seven seconds while visible, pausing on hover, focus, hidden tabs and reduced motion.

On Discovery, the radar and selected-profile area form one bordered panel. Latest pairs uses a separate panel with the same side edges and a 24px gap. Conditional stale-market notices appear above each card's last action row so addresses and Scan actions align at the bottom of each grid row. Card refresh uses opacity only, preserving those baselines throughout the animation. The radar center uses a reticle rather than a numeric profile count, and fixed profile/contact/listing counts are omitted from the display.

Page edges and detached-panel gaps share `--studio-section-gap`: 24px on larger screens, 16px at widths of 760px and below. Discovery has no extra outer margin to double that spacing. Search-only home retains its viewport-height layout.

On desktop viewports at least 1101px wide and 680px high, the Discovery console fits below navigation with equal 24px top and bottom gaps. Up to 800px high, the console uses tighter vertical padding while retaining its shared horizontal gutters. The radar takes the flexible height; the selected-token bar and Investigate action remain inside the frame. Side readouts can scroll and receive keyboard focus. Shorter screens and mobile retain natural document height. Discovery headings, filters, readouts, selection and cards use one shared internal gutter: 24px desktop, 16px mobile.

Selecting a Discovery contact leaves every token at its original position. The selection brackets and dot share the same local origin, with the name centered above. Bracket opacity animates without SVG scale transforms, which previously left a diagonal translation after animation. Selection does not restart the radar sweep. These are decorative discovery positions, not wallet relationships or risk coordinates.

The home footer includes a looping integrated-source strip; unconfigured services such as Bitquery are omitted, and source availability is not implied. Discovery cards show compact rectangular verdict badges only when an assessment exists. Unscanned cards carry no placeholder verdict. Existing reports may be looked up with two concurrent requests and no automatic scan; successful lookups expire after sixty seconds and misses/errors retry after twenty seconds while visible. A transient failure preserves the previous successful assessment. Provider scores retain attribution and source times.

Final polish: all UI chrome shares a 2px corner token. The central form uses a slow border pulse. The single background remains fixed. The source bar alone breaks out edge-to-edge, with locally bundled official provider icons, four identical runs for seamless infinite scrolling, and subtle logo shimmer. It does not pause on hover; hidden/offscreen and reduced-motion preferences still suspend decoration. Core page panels retain the shared page gutters.

## Compact verdict - November 3
The report shows one verdict, one model-confidence percentage when a supported observed-scope calculation is available, and plain-language reasons. No score interval or coverage index appears as confidence. Analysis details is closed by default and contains the factor score, model normalization, conditional assumptions and strict evidence checks. Age and wallet roles remain visible. The observed model uses independently retrieved data, excludes unread wallets from the assessed fresh-wallet denominator, and preserves missing-history limits. Unsupported cases keep a clear unavailable state instead of a fabricated percentage.


## Stationary scan - November 3

Entry and scanning share a fixed center well and identical source-panel tracks. The scanner uses segmented counter-rotating rings, a sharp radar beam, staggered expanding pulses and flashes driven by actual source events. Six square ports reflect the six source panels. Decoration never indicates completion. A bounded dock below the instrument contains the phase, a scrollable long description, cancellation and exactly two recent client-receipt rows. This dock never changes the grid height. The heading and subtitle stay unchanged during retrieval. Mobile places this center well and dock before the six source panels, with an explicit shared track for idle and loading. Starting or cancelling a scan preserves viewport position; report completion can navigate to the report top. Each new request resets elapsed time and receipts even if it supersedes another scan. Hidden/offscreen and reduced-motion guards remain in place.

Live verification at 1280x720: idle, request start, holder verification and cancellation shared center (635, 412.344), with unchanged source-panel positions. At 1440x900: entry and scan shared center (715, 512.469), with 18px between instrument and dock. At 390x844: native keyboard submission and cancellation preserved center y=241.547 and scroll y=84; no horizontal overflow, and the two-row log measured 61px with no clipping. Automated locator clicks can scroll before input, so scroll retention was also checked with native keyboard input.


## ZKBLAST report refinement - November 4

The neutral holder field uses deterministic circular packing with proportional areas, minimum markers and bounded GSAP drift. It has no ranked shelf fallback, green field, gradient or 3D model. A narrow card uses a square camera centered on the existing coordinates, preserving node relationships and improving phone legibility. Phone header actions form two consistent rows with 44px targets. The assessment alone uses semantic green for Clear, amber for Watch and red for High risk, as explicitly requested. Recorded holder totals, analyzed holders and traced addresses remain separate concepts. Six calculated factor rows accompany the overall score and selected model weight; each discloses its measurement basis on expansion.
