# Swarm verdict reconstruction: recovered interface versus unrecovered model

Recorded 2026-11-02. This is a focused read-only follow-up on captured public assets and saved public responses. It does not claim access to Swarm's private application code. No private endpoints, access controls or credentials were bypassed. No TraceForge scoring or UI code was changed in this follow-up.

## Method and retained evidence

Applied the user-selected [REA skill](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/SKILL.md) and its [JavaScript application guide](https://github.com/morluto/rea/blob/main/.agents/skills/reverse-engineer-anything/references/javascript-applications.md): reuse existing artifact evidence, follow the specific feature through shipped source, and preserve the distinction between observations and unresolved behavior. The connected tool inventory does not expose REA follow-up methods in this session. Existing portable records and the corresponding captured files were inspected directly; no broad analysis rerun was performed.

Retained application evidence:

- `../swarm-rea-evidence.json`: `ev_2aec5c2892a89a4fd54739c6e025fdcd759370d96a99f88341a25f16ca6cb7a1`, selected source `app.js`, 119602 text bytes, no parse failure.
- `../swarm-engine-dashboard-rea-evidence.json`: `ev_726041963b437891897b6fc72ce05afb99726699132343f44ed13ac97c45cc4d`, selected source `engine.js`, 34290 text bytes, no parse failure.
- Both report directory artifact SHA256 `ad97ce0b6841330a19e2c528d733f54c3325ebb54ec450b8feb5240ecd1640a5`.

Each retained REA record explicitly leaves eight inventoried files outside its selected analysis and reports incomplete graph coverage. It would be incorrect to describe either record alone as a complete semantic analysis. This follow-up additionally searched all eight captured JavaScript files named by `../swarm-evidence/index.html:67`: `fx.js`, `torus.js`, `agents.js`, `planets.js`, `radar-scope.js`, `engine.js`, `spidercam.js`, `app.js`. Targeted source inspection covered every returned scoring, confidence, probability and escalation occurrence. No captured JavaScript reference to a source map, worker, WASM module or dynamic import was found by that search. This is a statement about these saved assets, not proof that all possible server assets or deployments have been recovered.

Primary source identity: `app.js` SHA256 `f3a80ad560e0e79f92145ecedfae490fb13d29f231daaff94ca77d186e966380`; `engine.js` SHA256 `bbe1c83f6179b8d26ccbaf7922549f5f558d1cc8b8f8c3fe2dd1c35285160226`.

## The observable request boundary

The function `api` (`app.js:64`) calls `fetch`, decodes JSON and returns that object. It does not compute token risk.

1. `startScan`, line255: POST `/api/scan` with token, chain and fresh flag obtains a job identifier.
2. `crawlView`, lines303-308: polls `/api/events?job=...&after=...`; after completion, fetches `/api/result?job=...`.
3. Lines312-313 and300: `r.result` is stored and passed to `resultView`. The alternative cached route (`tokenView`, line269) passes `/api/token/<chain>/<token>`'s `d.result` to the same renderer.
4. `resultView`, lines383-415: renders returned score, band, metrics, parts, gates and judge. Score controls an SVG circumference; it is not recomputed from chain evidence.
5. `judgeCard`, lines336-350: renders `j.decision`, `j.p`, `j.confidence`, `j.bar`, `j.escalate`, receipt and feature values. Probability bars multiply the returned probabilities by100. They do not run an inference model.

Other shipped views consume the same upstream results: `agents.js:255` copies judge events; `torus.js:244` copies decision/confidence/escalation into animation state. `engine.js:335` fetches `/api/agent/feed`, stats, recent results and cabals; lines420-427 replay their decisions. `spidercam.js:56` also reads the agent feed. These animations are not independent risk calculators.

Therefore the captured production browser path receives completed verdict fields across an HTTP boundary. The feature-to-score and feature-to-judge functions are not recovered from these shipped files. This supports a backend responsibility boundary, not a claim to know its implementation language, hosting, model family or training data.

## Exactly what is recoverable

`app.js:387` contains display maxima: swarm30, fresh20, insiders15, concentration15, snipers10, dev10. Line413 divides each **returned** component by its maximum to size the component bar. The client does not calculate these component values from raw metrics.

The public explanation in `app.js:1154-1155` associates those dimensions with largest-hand pool impact, lifetime wallet activity, early or creator-origin inflows, top-ten concentration, first-minute acquisitions and creator-related exposure. It describes hard stops for impact of at least50%, fresh prevalence of at least80%, honeypot, balance seizure and freeze authority. It describes soft caps at59 for certain grouping, creator, liquidity, contract-control and cross-token-memory findings. These are disclosed policy descriptions. Some numeric thresholds, ordering, exceptions, feature normalization and missing-data rules are absent. `TOO_EARLY` is a display label at line53, without its decision rule.

One actual arithmetic function is recovered: `evidenceHtml` (`app.js:353-361`) initializes avoid mass from the first returned evidence record, adds the later returned avoid masses, and divides this sum by itself plus the first record's caution and OK masses. It draws an explanatory waterfall. It neither generates those masses from features nor overwrites `j.p` or `j.decision`.

The torus supplies display thresholds of AVOID0.70, CAUTION0.60 and OK0.90 (`torus.js:245`). `engine.js:47-54` contains fixed demo decisions/confidences and compares them with those thresholds. That function is explicitly demo-only and is selected only when no feed items exist (`engine.js:339`). Its ternary is not proof of the production model's complete escalation algorithm.

## Saved token91 example

Reference: `verification-comparison-swarm.json`, `result`, token `6NaM98xdfCkTTjqTvjq4t8TdSQ2374VGkGEXCzCPpump`.

| Returned field | Observed value |
| --- | --- |
| score / band | 91 / CLEAN |
| parts | swarm22.5, fresh20, insiders15, concentration14.8, snipers10, dev8.7 |
| parts sum | 91 |
| gates | empty array |
| judge model / decision | swarm-judge-1 / OK |
| judge confidence | 0.843 |
| judge probabilities | avoid0.002, caution0.155, OK0.843 |
| threshold / escalation | bar0.9; escalate=true |
| route | escalate: needs words (LLM / human) |
| exposed evidence masses | avoid0.002, caution0.173, OK0.944 |

The observed decision and numeric band are different output layers. This example is displayed as CLEAN91 and judgeOK, while its judge explicitly requests escalation because its reported confidence is below its reported threshold. It is not an observed unqualified high-confidence acceptance.

The disclosed evidence masses total1.119. Applying the recovered waterfall normalization gives avoid0.00178731, caution0.15460232 and OK0.84361037. Normal rounding of the last quantity to three decimals yields0.844, while the server returns0.843. Consequently the displayed rounded evidence masses are insufficient for bit-for-bit recovery of the reported probabilities. Unrounded masses or another server-side detail could explain it; this capture does not establish which explanation is correct.

The returned features include score, hands ratio, largest swarm, impact, fresh/insider/sniper/dev fractions, security, memory hits, USD liquidity and age. Their presence establishes the exposed feature schema. It does not establish which features actually influence inference, coefficients, transformations, interactions or calibration.

## What cannot honestly be called recovered

- Feature-to-component formulas, saturation/clipping, precision and rounding order.
- Complete hard/soft gate ordering, score-band cutoffs and readiness decisions.
- Feature-to-evidence-mass mapping and the production decision-selection procedure.
- Model parameters, training labels, calibration dataset, validation accuracy or meaning of a reported probability.
- Complete wallet grouping, lifetime counts, creator-funded exposure or venue-specific execution models.
- Whether this saved build is identical to every current deployment or chain-specific backend path.

Many different formulas can fit the single recorded parts vector and judge response. Inventing one would be a new model, not reverse engineering. Public API observations can support a separately labeled behavioral approximation, with a broad held-out dataset and documented disagreement rates. They cannot establish exact equivalence or calibration by themselves.

The defensible independent implementation is to reproduce supported measurements from transaction/account evidence, make scope explicit, and avoid presenting arbitrary deductions or an imported verdict as TraceForge's recovered model. Exact backend parity remains unproven until actual implementation or substantially stronger behavioral evidence is available.
