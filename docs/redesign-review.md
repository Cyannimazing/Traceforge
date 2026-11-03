# Redesign acceptance review

**Final disposition: accepted within the documented source, screenshot and runtime-smoke scope. See the final acceptance record below; earlier pending/open entries are the historical review loop.**

2026-11-01. Independent manager review for the current table-first redesign. Latest user constraints supersede the former 3D direction in PRODUCT.md / DESIGN.md. This is an acceptance review informed by Impeccable Operate and critique guidance, not a completed standalone Impeccable two-assessor critique. Source checks and rendered verification are recorded separately. No visual approval without current screenshots.

## Required acceptance checks

| Check | Acceptance evidence | Status |
| --- | --- | --- |
| Immediate workspace | Initial screen shows an actual holder table or honestly empty table structure. No opening illustration, hidden tray requirement, modal, or 3D stage. | Pending final source and screenshot |
| Exact exclusions | No rendered 3D model, insect/mascot imagery, gradient, or Motion on/off control in initial, example, or report states. | Pending |
| Professional hierarchy | Restrained dark surfaces; consistent sans-serif labels and controls; tabular numbers; readable table and secondary text; no arbitrary microscopic typography. | Pending screenshots |
| Required categories | Creator, Current owner / authority, Early buyers, Possible snipers, Accumulators, Funders, and Related sellers visible/discoverable with meaningful unavailable states. | Pending |
| Holder scope | Current holder balances remain distinct from role/funder wallets with unknown holdings. Do not imply all traced wallets are current holders. | Pending |
| Verdict | Exactly Danger, Caution, or No red flags found. Missing evidence yields Caution and an understandable reason; critical findings take precedence. No synthetic safety score. | Pending |
| Selection and evidence | Row/filter changes operate; a selected row exposes matching evidence; creator and owner remain distinct; relation inference never claims ownership. | Pending |
| Funders | Funding-source addresses come from observed incoming transfers. Shared-funder recipients are not mislabeled as funders. Transfer data does not claim first-ever funder. | Pending |
| Timing and activity | Early/sniper labels require verified indexed-start evidence. Accumulation and related selling explicitly refer to the observed sample. Related sellers require supported preceding links and separate transactions in the configured five-minute window. | Pending engine review/tests |
| Honest replay | Replay shows observed events only; no reconstructed historical balances, historical verdict series, or full launch history claims. Fixture remains conspicuously illustrative. | Pending |
| Empty / failed scan | No invented rows; clear no-data/unknown explanations; last completed report preserved on failure; retry/cancel functional. | Pending browser evidence |
| Responsive access | At desktop and phone widths, scan controls, verdict, table, and evidence remain usable; horizontal table scroll is contained; no page overflow/clipped primary action. | Pending screenshots |
| Keyboard and motion | Visible focus; keyboard chain selection; rows inspectable by keyboard; close restores sensible focus; system reduced motion respected without a separate Motion control. | Pending source/browser evidence |
| Build and regression | Typecheck, meaningful engine tests, production build, browser smoke checks all succeed on final integrated state. | Pending root/worker results |
| Documentation | Product/design/research describe the current table interface and independent bounded engine. Live provider integration is not claimed validated without a real authorized capture. | Pending |

## Initial risks sent to owners

- Workbench still imports Universe3D and InvestigationPreview and renders Motion on/off; remove these active paths during integration.
- PRODUCT.md / DESIGN.md contain obsolete explicit 3D and beetle requirements; replace conflicting direction.
- Existing styles contain multiple successive overrides and 7-11px text rules. Inspect computed sizes and all states, not only the last CSS block.
- `shared-funder` is assigned to recipient wallets by the engine. A Funders filter must use funding edges' sources.
- Wallet categories include identity/transfer wallets whose current holdings are unknown. Do not render null share as zero or describe every row as a verified holder.
- `getDisplayAssessment` describes every critical cause as token checks; ensure generic/future critical findings receive truthful summaries.
- The audit proves bounded independent behavior, not Swarm backend equivalence, full historical ownership, or a production-validated authenticated adapter.

## Review loop

Workers notify the manager when their source is stable. Manager reviews final source and sends concrete failing checks to the owning worker/root. Root provides screenshots and interaction outcomes at desktop and phone sizes without concurrent viewport control. Manager reviews those images, requests fixes, and rechecks affected acceptance items. A passing build alone does not approve the design.

Questions skipped: the supplied redesign brief and explicit manager/worker workflow are sufficient for this review; no new permission is needed.

## Source review round 1

Reviewed new `holder-workspace.tsx` and CSS after worker readiness. Confirmed semantic holder table, tab keyboard handlers, role combobox via portal, scoped horizontal table overflow, all investigation wallet rows, funding-source derivation, inferred relationship copy, and explicit sample/fixture limits.

- FIXED / rechecked: null share formerly rendered as “Not in snapshot”; now “Share unavailable”, which also fits a known holder with unavailable supply percentage.
- FIXED / rechecked: accumulator filter formerly called only “Net buyer”; now “Accumulator” with an observed-sample explanation.
- OPEN: number formatting rounds positive shares and token amounts below four decimals to zero. Requested nonzero-preserving formatting.
- OPEN / root: reused ActivityTimeline copy still mentions wallet sizes; reduced-motion Play can enter a disabled, nonplaying state. Requested updated copy and functional explicit replay controls.
- Visual/computed-style checks remain pending. Source review is not screenshot verification.

## Source review round 2

- FIXED / rechecked: holder numeric formatting now displays `<0.0001` for tiny positive shares/amounts instead of zero.
- FIXED / typechecked: manager updated `investigation-panels.tsx`. Automatic replay is disabled while reduced-motion/background pause applies, an explanation appears, manual steps and slider remain available, and entering pause ends playing state. Replaced obsolete wallet-size copy. Snapshot evidence labels now match current-owner / related-seller terminology. Tiny positive evidence values display `<0.01` rather than zero. Browser interaction check remains pending.
- New public adapter reviewed statically: token-side trade direction, positive/confirmed incoming funding, bounded requests/pages, contract exclusions and withheld launch classifications are consistent with the documented limits.
- OPEN / engine: BigInt percentage division floors tiny positive holdings to exact zero. Requested a nonzero-preserving ratio and regression.
- OPEN / root: integrated initial no-report screen remains welcome prose without the requested visible table. Requested an honest empty table or explicitly labeled example table.
- OPEN / root: watchlist source has a mojibake separator (`Â·`).
- `npx tsc --noEmit` exited 0 after manager's targeted panel edit. This verifies types, not browser behavior.

## Engine re-review

- FIXED / rechecked: public explorer ratio now converts comparable raw units without integer flooring; tiny positive shares remain positive.
- FIXED / rechecked: authority evidence describes the owner/authority reported at its evidence timestamp, avoiding a current-control claim for retained historical evidence.
- FIXED / rechecked: relationships with the exact timestamp of the first sale do not prove they predate it.
- Independent manager run: `npx tsx --test tests/public-history.test.ts tests/investigation.test.ts tests/report-refresh.test.ts` exited 0, **27 passed / 0 failed**. Covers scan-token trade leg, holder units, confirmed incoming native transfers, bounded fallback, cancellation, snapshot refresh and relationship chronology.
- Root reports live public WETH scan returned 247 investigation addresses, 300 observed pool trades and 87 native transfers; these are root-observed integration outcomes, not manager browser verification. Root retains the raw response for provenance. A later response can differ with provider availability and new activity.
- Initial empty-table implementation reported by root; awaiting rendered verification. Live table was initially too low at desktop and root is compacting vertical chrome before final screenshots.

## First rendered review (intermediate captures)

Manager visually inspected `outputs/review/live-desktop.jpg`, `live-mobile.jpg`, and `live-sniper-coverage.jpg` from the chat workspace. These are intermediate live WETH captures, not final ship approval.

- Desktop table has coherent dark surfaces, readable aligned figures, restrained row separation, clear Caution, and explicit partial coverage. No 3D or mascot is visible.
- Possible-sniper empty state correctly says it was not checked because verified launch history is unavailable; it does not imply zero snipers.
- Desktop image is scrolled with scan header above the frame, so it does not establish table prominence in the first viewport.
- Mobile table contains its wide columns and supports visible wallet rows. Role picker is too compressed ('All...') next to the address count; requested separate count / sufficient picker width. Root reports correction in progress.
- Requested final desktop top, phone top and corrected creator evidence drawer captures before final visual approval.
- Root found a shared-kind label bug during browser review: creator identity records were headed Current owner / authority. Manager corrected only evidence-kind display to 'Identity record'; category names still distinguish Creator versus Current owner / authority. Selected-wallet null share now says 'Share unavailable'.

## Second rendered review

Inspected `creator-drawer.jpg`, `empty-mobile.jpg`, and `example-mobile.jpg`.

- PASS: creator's supporting evidence is now headed Identity record and its description identifies a provider-reported deployment/creator, not current control. Fixture is visibly labeled synthetic.
- PASS: compact phone report displays All roles without truncation and begins the actual holder rows within the captured viewport.
- OPEN / root: empty mobile page clips explanation and both calls to action at the right because the empty-state content is inside the horizontally wide table. Move the empty-state message/actions outside the table scroller or constrain their width independently.
- OPEN / root: selected full address in creator drawer remains microscopic. Requested consistent 12-13px minimum for address, current-share caption and evidence metadata. These are meaningful research data, not decorative labels.

## Final scoped visual re-review

Manager directly inspected production captures `final-empty-mobile.jpg`, `final-example-mobile.jpg`, `final-drawer-mobile.jpg`, plus `example-desktop-top.jpg` at true top position.

**Prior visual blockers resolved.** Empty mobile actions and explanation are fully readable. Phone role picker retains its selected label. Example report rows are visible in the captured first viewport. Creator drawer distinguishes the Creator category from the generic Identity record heading and explains deployment/factory limits. Address, share caption and metadata are readable; root measured these at 13px. Desktop shows the scan controls, Caution, coverage, filters and initial rows together. Solid dark surfaces, restrained typography, no models, insects, gradients or Motion toggle are present in these reviewed states.

Root-reported runtime smoke on the integrated interface: Creator role filter produces one example wallet; Escape closes evidence and restores the exact wallet opener; role Home/Enter selects All; keyboard tab-arrow selects Activity; Next changes event position 0 to 1; a new production scan preserves the previous example while loading. DOM checks returned zero native selects, canvas elements and gradient backgrounds. Root reports 68 full tests and two production builds passed.

Boundaries: manager independently ran 27 focused engine tests and typecheck earlier, reviewed current source, and inspected saved rendered captures. Root performed browser interaction checks. Reduced-motion behavior is source-reviewed only because the available browser API did not support emulation. Current-wrapper invalid/retry/cancel paths were source-reviewed and cancellation has engine regression coverage; these exact UI interactions were not rerun during final capture. No authenticated Bitquery request or complete-history validation is claimed.

Current disposition: source and reviewed visual states accepted; final live production desktop capture pending. This supersedes the earlier pending visual/source statuses in the historical checklist above. No unresolved code/design blocker is known from the scoped review.

## Final acceptance record

**Accepted.** Manager directly inspected `outputs/review/final-live-desktop.jpg` after the final production build. The 1280×900 true-top capture shows the complete scan controls, live WETH identity/market snapshot, Caution with a plain-language reason, partial coverage, role/search controls and several table rows. Current share and observed trade quantities remain separate. The rendering is dark, readable and restrained; no model, insect, gradient or Motion toggle appears. Root measured 14px table cells, table top at 571px, no document horizontal overflow in the phone checks, and no console warnings/errors in the final production view.

The production report contains **309 investigation addresses**, not 309 verified holders. This particular deep scan returned 10 numeric shares because the public explorer holder request failed. A separate holder-snapshot probe returned 100 numeric shares across two pages. Both outcomes were recorded by root. Public provider availability varies; neither a permanent 100-holder result nor complete trade/funding coverage is promised.

All concrete manager findings were fixed and re-reviewed: null-share wording, nonzero formatting in UI and explorer parser, accumulator discoverability, snapshot-qualified authority evidence, timeline paused-state behavior/copy, generic identity-record heading, initial empty-table presence, mobile action clipping, role-picker width, and drawer data typography. Current documentation supersedes the prior 3D direction and records withheld launch labels plus bounded public fallback.

Validation limits remain explicit: complete-history/sniper/early-buyer verification is absent in the live path; authenticated Bitquery is unvalidated; reduced-motion emulation and exact final-wrapper invalid/retry/cancel UI steps were not runtime exercised. These are disclosed coverage limits, not silently claimed passes. No unresolved blocker remains from this scoped review.

Final runtime addendum from root: invalid EVM address submission retained all 309 investigation rows and displayed validation. Canceling an expanded scan retained the same 309 rows and cleared loading. These were exercised on the final production server, not inferred from tests.
