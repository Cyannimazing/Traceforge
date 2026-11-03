# TraceForge crypto investigation agent

Gemini reviews an existing independent scan as a read-only crypto analyst. This is a versioned role and evidence workflow, not fine-tuning or a trained safety predictor. It does not execute trades, access wallets, or request additional crawls.

The server selects a bounded public evidence packet: controls, holders, funding relationships, dated trades, findings, market context and coverage. Token descriptions, arbitrary prompts, source URLs, private credentials and competing provider verdicts are excluded. Model output must reference IDs in that exact packet. Critical findings override optimistic output; missing core evidence requires abstention and partial history limits confidence. Evidence citations validate referential integrity, not semantic correctness of every generated sentence.

The reviewer runs after the report loads. Requests bind to the evidence timestamp and full content fingerprint. Changed blockchain evidence invalidates the displayed review. Market-only refreshes retain the dated review with a visible notice that its market observations describe an older snapshot; they do not consume a new model call each minute. Shared requests coalesce and successful reviews cache for ten minutes. Local limits are two new reviews per minute and twenty per UTC day per server process; restart resets these application counters. These are not Google's quota or a guarantee of free billing. Use a free-tier Google project; no paid model fallback is implemented. Google says free-tier content may be used to improve its products.

## Configuration

Set `GEMINI_API_KEY` in the live project's `.env.local`, then restart port 3100. Default model: `gemini-3.5-flash-lite`. No key is exposed to the browser. No key means the existing independent engine remains available, with the analyst clearly marked not connected.

## Analyst responsibilities

- Explain mint/freeze/owner controls, transfer restrictions and their sources.
- Separate current holder balances from historical participants; a wallet absent from the holder list has an unknown balance.
- Separate common funders, direct transfers and services from inferred common ownership.
- Identify early buyers or possible snipers only when the relevant launch window is verified.
- Explain connected selling with transaction timing, amounts, relationship proof and alternative explanations.
- Consider liquidity, activity and concentration without making unsupported price predictions.
- Produce an evidence-backed decision, an explicitly labeled subjective confidence estimate, supporting observations, risks and conditions to watch.

At the user's request, version 2 uses Gemini's decision as the primary verdict and shows its self-reported confidence estimate (integer 1-99). That number describes the model's confidence in its selected conclusion, NOT the probability that the token is safe or profitable. It is not calibrated or measured accuracy, and is not assigned from fixed policy weights. The UI labels it as an AI estimate beside the number. If an evidence override changes the model's decision, its estimate is withheld rather than attached to a different verdict. Missing core evidence also withholds the estimate. The prior policy score is retained only in collapsed diagnostic rule checks.

Calibration still needs independent outcome labels, time-based train/validation/test splits, leakage controls and measured Brier/log-loss/reliability; see `confidence-data-audit.md`. Two local tokens without outcomes cannot train or validate a confidence model. Prompting Gemini as a crypto analyst is not fine-tuning.

Sources: [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [GenerateContent API](https://ai.google.dev/api/generate-content), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
