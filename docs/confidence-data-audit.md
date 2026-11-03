# Confidence-model data audit

Audited 2026-11-02. Scope: staging project data and primary public research artifacts. No credentials or `.env` files were inspected. This audit does not authorize training, dataset ingestion, or trading execution.

## Finding

No inspected source establishes a ready-to-train, calibrated Solana forecasting corpus with all three requirements: features actually available at a reproducible pre-event cutoff, independently evidenced outcomes, and comparable non-event controls with complete follow-up. Existing TraceForge and Swarm verdicts are not outcome labels. Gemini can explain supplied evidence; prompting an existing Gemini model is not supervised training or probability calibration.

## Local data

- Nine independent `verification*.json` investigation reports cover only two unique tokens: seven Grokbot snapshots on Solana and two WETH snapshots on Ethereum. The snapshots are operational verification evidence, not independent examples of nine projects.
- The Grokbot observations span 2026-11-01 through 2026-11-02. Their evidence counts differ as retrieval evolved; this is not a timestamped, historically reconstructed training panel.
- No independently adjudicated outcome labels or event dates were found in those reports. Generated assessments, trust ratings, and Swarm comparison files must not become labels.
- Read-only inspection of staging `.data/history.sqlite` and `.data/registry.sqlite` found zero rows in their `history_jobs` and `history_pools` tables. Other machines/deployment data directories were outside this audit.
- Parser fixtures under `tests/fixtures`, including the Alchemy Solana history and PumpSwap reserve examples, are test cases rather than a labeled population.

Potential feature families already represented include token authorities/extensions, holder distribution, timestamped transfers/trades, funding links, selected-pool reserves and provider coverage. Historical values must be reconstructed as of the prediction cutoff; today's holder balance must never be attached to a past snapshot.

## Public sources

### SolRPDS

The paper reports 62,895 suspicious pools and 22,195 tokens exhibiting rug patterns, covering February 2021 to November 2024. Public CSV/JSON exports include pool and mint addresses, total added/removed liquidity, action counts, add/remove ratio, first/last activity, last swap timestamp/signature and inactivity status. These are lifecycle aggregates and endpoints, not pre-event feature snapshots. Suspicion/confirmation depends on withdrawal and inactivity; independent incident adjudication and comparable negative controls are not supplied by that distinction. [Paper](https://arxiv.org/abs/2504.07132)

The repository states CC BY 4.0. Four CSV files are publicly listed: `2021.csv` (518,917 bytes), `2022.csv` (1,122,786), `2023.csv` (4,676,490), and `Jan_2024-Nov_2024.csv` (28,872,407), totaling 35,190,600 bytes; JSON equivalents are also listed. [Dataset repository](https://github.com/DeFiLabX/SolRPDS)

Usable now: address/signature seeds for independent historical reconstruction and outcome verification. Do not use full-life totals, last activity, last swap, or inactivity as features for a forecast made before those events. Active-but-suspicious pools are not established benign controls.

### CRPWarner / RugPull

The paper analyzes 103 incidents, with 69 relevant open-source contracts, and a larger corpus of 13,484 Ethereum contracts. Its task is recognizing malicious Solidity contract functionality, rather than forecasting a future Solana event. [Paper](https://arxiv.org/abs/2403.01425)

Public inputs include `dataset/rugpullevents/rugpullevents.xlsx` (18,197 bytes: project, classification, pattern, source, loss, information availability), `dataset/groundtruth/groundTruth.xlsx` (12,544 bytes), and contract bytecodes in `dataset/groundtruth` and `dataset/large`. The complete recursive repository tree has no dataset/root license; the only license found is under `gigahorse/`, which does not establish dataset reuse rights. [Repository and schema](https://github.com/CRPWarner/RugPull)

Usable now: incident-source leads and a labeling taxonomy. Solidity/EVM bytecode is incompatible with TraceForge's Solana authorities, account state and transfer observations. A detector flag is neither an independently verified future event nor a non-event control. Dataset licensing requires clarification before reuse.

### TM-RugPull / TS-RugPull / RugPull1K

The paper claims 1,028 projects on Ethereum, BSC, Polygon, Arbitrum and Fantom, with features from the first half of each eventual project lifetime. It describes independently corroborated scam labels and long-lived non-scams, and advertises CC BY 4.0 and a project-level CSV. Its midpoint requires the eventual termination/last-observed date; that cutoff cannot be known at a live decision time. Year-long surviving controls and exclusion of ambiguous projects also differ from the live new-token population. There are no Solana projects in the stated chain list. [Paper](https://arxiv.org/html/2602.21529v1)

The linked Hugging Face page instead displays 935,845 rows of EVM opcode text, one `text` column and total file size 6.59 MB. Its card and license metadata say **CC BY-NC 4.0**, not CC BY 4.0. Therefore the claimed project-level release and permission cannot be assumed from the paper. [Published artifact](https://huggingface.co/datasets/fati-80-Sho/RugPull1K)

The related GitHub tree does contain `src/DataSet/dataset.xlsx` (558,939 bytes) and EVM bytecode metadata. Its `Licence` also specifies CC BY-NC 4.0. Workbook contents were not verified in this audit; existence is not proof of the paper's claimed temporal/provenance schema. [Workbook](https://github.com/mohamadpishdar/RugPull-Defender/blob/main/src/DataSet/dataset.xlsx), [license](https://github.com/mohamadpishdar/RugPull-Defender/blob/main/Licence)

Usable now: candidate research artifact requiring schema/provenance verification and license clarification. It does not establish deployment-compatible Solana training data.

### Additional Solana lead

The newer *From Hype to Collapse* paper describes 117 tokens verified from 68 incident reports, plus 76,469 behavior-labeled candidates from 100,063 tokens. Entries are described as token addresses, behavioral category and event summary. This is a useful lead for independently checking positives, not a verified ready-made forecast table. The paper acknowledges missed slow events outside its 24-hour observation window. A downloadable artifact, reuse license, pre-event feature schema and complete negative cohort were not established in this audit. [Paper, sections III-A and IV](https://arxiv.org/html/2603.24625v2)

## Recommended first supervised target

Use a narrow observable target: **a verified severe quote-liquidity withdrawal within the next 24 hours for a supported Solana pool, conditional on a fixed, predeclared prediction time**. A fixed age such as one hour after pool creation is an initial experimental design, not a claim that this horizon is validated or appropriate for every token. This estimates a defined event rather than malicious intent, investment quality or trading profitability.

Before collecting examples, preregister withdrawal magnitude, reserve baseline, persistence interval, supported programs and exclusions. Verify outcomes using decoded withdrawal instructions and reserve changes; distinguish migrations, swaps and ordinary LP exits. Independently review disputed outcomes. Count a negative only after the entire follow-up window is observed with adequate coverage; otherwise censor it. Sample both events and non-events from the same eligible launch population.

Build features only from information available before the cutoff, including missingness and source coverage. Keep label evidence separate from prediction evidence. Split chronologically and group repeated tokens/related deployers to limit leakage. Hold out later data for calibration and report Brier score, log loss, reliability and coverage; compare against prevalence and a simple baseline. Only then consider a displayed event probability. Out-of-domain or insufficient evidence should abstain. None of these steps is replaced by an LLM's self-reported confidence.

## Gemini evidence analyst: design review

The proposed server-owned evidence packet and asynchronous cached-report review are appropriate for an explanatory analyst. They do not constitute fine-tuning or a calibrated confidence model.

Required correctness checks:

1. Bind each response to chain, canonical token, report fingerprint/version, source timestamps, model and prompt version. A late response must not attach to a different or refreshed report. Cache-only means a missing report returns an explicit unavailable result, without triggering a scan.
2. Build a bounded packet while preserving all eligible critical findings, their supporting evidence and coverage caveats. Include sampled/omitted counts. A truncated packet is not proof that other risks are absent. Reject fixture/provider-reported content as independent evidence.
3. Validate structured output, lengths, enum values and every cited ID against the exact packet. Resolve links on the server from known evidence; do not trust generated URLs or assert that a valid ID proves the accompanying claim.
4. Treat token names, labels, provider descriptions and arbitrary text as untrusted data. They must not change instructions or grant tool access. The analyst needs no execution tools or wallet authority.
5. Describe qualitative confidence as confidence in the supplied evidence/analysis, never a win rate or probability of safety. Missing or stale sources must remain explicit and prevent an unsupported clear conclusion. Current-holder absence means unknown balance, not zero.
6. Apply deterministic critical overrides only to verified, eligible findings with their proper temporal scope and provenance. Do not blindly promote historical, inferred or provider-only flags. The model cannot erase an applicable verified critical finding.
7. Bound output, runtime and retries; deduplicate concurrent reviews and handle quota/provider failures as unavailable. Keep the API key server-only and redact it from errors/logs. Record review provenance without secrets.

Focused acceptance cases: fabricated citations; mismatched report fingerprint; stale coverage; historical-only warning; malicious token metadata; oversized/truncated packet; quota/timeout/malformed JSON; verified critical finding contradicted by the model; no cached report. Verify each case without requiring a live paid API call.
