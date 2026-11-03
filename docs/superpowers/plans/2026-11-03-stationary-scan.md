# Stationary scan redesign implementation plan

> For agentic workers: use executing-plans or subagent-driven-development to implement each task with browser verification.

**Goal:** Make searching visually dramatic while keeping the scanner, source panels and page position stable as source responses arrive.

**Architecture:** Preserve the black studio home and its six source panels. The form and aperture occupy one persistent center well; a bounded, absolutely positioned scan dock holds status, cancellation and two recent activity rows without contributing to the parent grid's height. Actual stage events drive source ports and response flashes. Existing CSS animation handles the bounded instrument; no new runtime dependency is required.

**Tech stack:** Next.js, React, TypeScript, existing CSS/GSAP motion system.

**Spec:** The home and motion constraints in DESIGN.md, plus the user's request to redesign the searching state and prevent upward movement or repositioning.

## Global constraints

- Keep solid black/charcoal, boxy controls, existing typefaces, six source panels and provider strip.
- No gradients, mascot, 3D models, sound, motion toggle or fabricated findings/progress.
- Starting a scan preserves scroll position. Completing navigation to the report may intentionally scroll to its top.
- Stop decorative work when hidden/offscreen and honor reduced motion.
- Preserve independent scan requests, stages, cancellation and verdict logic.

## Review focus

- Entry-to-scan center continuity at desktop and phone widths.
- No movement as an empty log becomes one/two rows or a long stage description arrives.
- Short desktop heights and narrow phones: dock, controls and source panels must not overlap.
- Repeated scans and cancellation reset the elapsed time without shifting the well.
- Responsive geometry, keyboard cancellation and bounded motion lifecycle.

### Task 1: Build the scan instrument

- [x] Add scan-aperture.tsx/css with a fixed center anchor, elapsed display, six source ports and event-triggered response flashes.
- [x] Use segmented rotors, a radar sweep and expanding rings with explicit SVG center origins.
- [x] Verify TypeScript and reduced-motion/visibility guards.

### Task 2: Stabilize the searching composition

- [x] Integrate the aperture in engine-console.tsx; remove the old radar and external expanding log/footer.
- [x] Put caption, cancellation and two fixed activity slots into a bounded scan dock.
- [x] Keep the same center well and panel tracks for idle/loading; use explicit mobile tracks.
- [x] Remove loading-triggered scrollTo from workbench.tsx; retain focus with preventScroll.
- [x] Add friendly holder-RPC and reserve stage names and route their actual statuses to source panels.

### Task 3: Verify and ship

- [x] Run existing tests and production build.
- [x] In the live browser, record the form/scanner center and scroll position before and during multiple real scan stages; compare coordinates.
- [x] Check phone, short desktop, cancellation, evidence completion and console errors.
- [x] Save a real scanning screenshot, update DESIGN.md and push the verified changes.


## Verification results

- Existing suite: 652 passing tests. TypeScript and production build pass.
- Real BNB Chain retrieval used the configured engine; no simulated scan stages. Form, radar and panels remained at identical coordinates through market response, holder verification and cancellation.
- 390x844 and 1440x900 checks confirmed bounded activity rows and no horizontal overflow. Native keyboard input isolated application scroll behavior from browser automation's pre-click scrolling.
- Browser errors: none observed. Motion follows visibility, intersection and reduced-motion guards.
- Design source checks: Impeccable returned no regex findings; parsed-page rules were verified visually/through DOM measurements. Taste lint: zero failures, four expected clock/data typography warnings.
- Independent reviewer rechecked fixed dock spacing, clipping, request identity and cancellation focus; no remaining concrete blockers.
- Screenshots: validation/stationary-scan-live.jpg, validation/stationary-scan-desktop.jpg, validation/stationary-scan-phone.jpg.
