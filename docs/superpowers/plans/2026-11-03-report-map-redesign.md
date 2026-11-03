# Report and holder-map redesign

Goal: replace the report's oversized introduction and token context with one compact black-studio header, redesign the evidence-backed bubblemap, and return to the full scanner on refresh.

The report is an Operate surface. Keep current data, verdicts, source attribution, navigation and evidence actions. Token identity is the heading; one ruled metric row answers price, liquidity, volume, capitalization, current holders analyzed and addresses traced. Refresh is labeled and prominent. The map is the focal visual: flat data bubbles, share/role markers, real relationship emphasis, bounded entrance and source-driven state. No gradients, 3D models, fabricated links or score changes.

- [x] Root: build compact responsive report header; preserve working copy/export/watch/search actions.
- [x] Root: hide retained report while scanning; refresh navigates to scanner top; cancellation/failure restores last successful report.
- [x] Map worker: redesign map visuals/motion while preserving current-holder membership, shares, qualified edges and accessible selection/pan/zoom.
- [x] Review: verify refresh lifecycle and map data/interaction correctness; fix concrete issues.
- [x] Verify actual refresh, cancellation, completed rescan, map/table evidence selection, desktop/phone layouts and console errors.
- [x] Run existing tests, typecheck, production build; sync port3100 and save proof.


## Additional user steering in this implementation

- Evidence opens over a dark backdrop, with one close button and outside-click/Escape closing. Keep focus trapping/return and mobile bottom-sheet behavior.
- Give the map a clipped plotting-board backdrop and remove native SVG hover titles. The rejected wave contours are removed.
- Discovery has no inner scrollbars. First-load skeletons preserve readout/profile/card tracks; later fetches preserve current data. Contacts light at the sweep and fade gradually; selected contacts stay visible.
- Chain dropdown uses compact44px rows, and Auto resolves supported networks from address format/live market matches or uniquely verified EVM contract presence. Ambiguous addresses require manual choice.
- Remove the provider strip's top/bottom rules.

Final verification and reproduced retrieval fixes are recorded in [the release audit](../../report-release-validation-2026-11-03.md). Publication follows verification; exact private-backend parity and outcome calibration are not claimed.
