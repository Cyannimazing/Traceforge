# Studio navigation and wallet-flag verification

Validated November 4, 2026, Asia/Singapore. Independent engine; no LLM or copied provider verdict.

## Interface

- Graphite/silver replaces green in the holder map, board, legend, basis controls, flag details and Clear assessment styling. Amber and red retain their finding meanings.
- Black 62px navigation has native route links, route icons, a sliding active indicator, framed brand interaction and a responsive clipped menu reveal.
- Browser checks at 1280, 901, 768, 390 and 320px found no horizontal page overflow. The 568x320 landscape menu settled within its viewport, using two compact columns.
- Phone and tablet menu selection, Escape focus return, outside closing, and Ctrl K search worked. Route changes close the menu and focus the page. Hidden/reduced-motion guards were reviewed in source.
- Bubbles move on a bounded continuous path; actual link paths follow their endpoints. A single live node changed coordinates between frames, stayed fixed during keyboard focus, and resumed after focus left. The evidence dialog also paused the map.
- Geometry tests cover single/dominant holders and 100-node layouts over a full motion cycle, retaining separation and selection-outline clearance. Phone labels are enlarged only where their circles have room; the holder cards and tooltip retain the complete information.
- Holder column/filter/detail wording uses Flags. The assessment distinguishes current flagged holders from all flagged addresses in retrieved history.
- The requested Methodology motion sentence is removed. The conceptual evidence diagram remains.

## Missing Sniper flag

The old recent-range discovery lost a launch that had moved outside its 20,000-block interval. Added a bounded protocol-aware recovery path and a separate SQLite store for verified canonical launch anchors. Store entries are discovery candidates, never stored wallet classifications. Reuse checks live receipts, token transfers, contiguous manager logs and canonical boundary hashes again. Definitive receipt failure or a changed block hash invalidates the hint; temporary unavailability does not promote it to proof.

The exact BNB Chain token `0x07419f180cd9beec21e68477a71f9d92090dffff` was tested against public chain records. A fresh market timestamp located the candidate interval after Helper3 returned zero launchTime. No login, paid archive, new provider key or third-party classifier was used.

Cold adapter run: 5.865 seconds, 25 HTTP requests. After closing and reopening the temporary durable store: 4.078 seconds, 19 HTTP requests. Both reconstructed creation at `2026-11-03T13:41:31Z`, first buy at `13:41:48Z`, and a verified manager window through block 131442942. These adapter measurements are not full application latency promises.

The production browser report independently showed:

- One current external holder, `0x662055e3e1d5171c922653f632ec08450607d86d`.
- Its table entry is Buy and its flag is Sniper, supported by a receipt and first-minute proof.
- Two buyers in retrieved launch history; the other buyer's zero current balance does not enter the current-holder table/map.
- The shared launchpad manager remains outside holder concentration and map membership, with its raw balance inspectable as infrastructure.
- Refresh investigation returned to the actual scan instrument.

## Verification

770 tests passed with zero failures. Production build and TypeScript passed. A separate read-only review checked canonical proof binding, bounded discovery, invalidation, UI focus/motion cleanup and provenance wording. Provider credentials, local databases and diagnostic artifacts remain untracked.

See [wallet flag research](wallet-flags-research.md) for definitions and primary sources. This release verifies the selected-launchpad case and existing source scopes; it does not establish complete cross-venue history, a full holder census or calibrated safety probabilities.
