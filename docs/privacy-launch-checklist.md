# Privacy and legal launch follow-up

Reviewed against the current application on 4 November 2026. This is an implementation and review record, not a legal opinion, registration certificate or promise of legal immunity.

## Confirmed scope

- Public operator display name: Cyril AI. Country: Philippines. Contact authorized for publication: cyril@izee.ai. No registered corporation, government approval or legal-review status has been asserted.
- `/privacy`, `/cookies` and `/terms` describe public-evidence research. The footer links all three notices and contact, with “Built by Cyril AI”.
- No application cookies, advertising SDK or analytics SDK were found in the current source. LLM analysis is disabled. These facts must be rechecked before adding an account, telemetry, chat, payment, advertising or new provider feature.
- The watchlist is saved only after a user action. Optional report history defaults off; both reads and writes are gated by explicit opt-in. Up to 12 current-format summaries are kept. Enabling history can reveal older current-format summaries; the controls explain this. Legacy data is preserved until an explicit clear/withdrawal action.
- Withdrawal removes the opt-in and every `traceforge.report-feed.v*` history key. “Clear TraceForge browser data” removes app-prefixed localStorage, including watchlists. These actions affect the current browser/origin, not downloaded exports, blockchain records, server evidence or third-party logs.
- Reports have a 10-minute freshness/reuse window. This is not a verified deletion schedule. Expired persistent report rows are pruned on subsequent writes; public-chain evidence archives and launch verification records are separate stores.

## Open operational decisions

1. **Retention and deletion:** inventory `.data` stores, backups, server caches, access/error logs, email correspondence and hosting/CDN logs. Set a purpose-based retention schedule, implement pruning and deletion where appropriate, test it, and update the notice with the actual periods or criteria. Do not describe the 10-minute cache freshness as universal deletion.
2. **Provider arrangements:** list the deployed hosting/CDN, RPC/index, market/security, image and email services; confirm processing roles, countries, terms, retention, log fields, onward recipients and relevant contractual safeguards. Current reports name evidence sources; this does not verify a provider's privacy contract. Confirm that the host does not inject analytics or nonessential cookies.
3. **Request handling:** assign ownership of cyril@izee.ai, test delivery, establish a proportionate verification and response process, and record correction/deletion outcomes. Document what can be removed from controlled stores, what is public-chain data and what must be referred to an independent provider. Do not request keys or recovery phrases as identity proof.
4. **Request minimization:** review query-string/access-log handling so a scan token, IP address or full URL is not retained unnecessarily. Verify external logo requests retain `no-referrer`; recheck headers and deployed browser network traffic. Keep the scan APIs and credentials server-side.
5. **Change control:** revisit notices and storage choices before introducing user accounts, LLM processing, advertising, analytics, subscriptions, wallet integration or new data recipients. A blanket “accept cookies” banner would not substitute for identifying the actual processing.

## Conditional Philippine professional review

These items require review against the real operator, business model, audience and deployment. They are not a declaration that every registration applies, nor that a free research tool is automatically exempt.

- **Operator and business registration:** have Philippine counsel/accounting support determine the appropriate legal identity, business/trade-name, tax and local registrations for the actual activity. Publish verified identifying details when settled. The government's [business registration guidance](https://ecommerce.dti.gov.ph/faqs/) distinguishes possible entity routes; a public brand name alone does not establish corporate status.
- **Privacy applicability and basis:** have counsel assess which processed wallet-linked and traffic records are personal information, the operator's controller/processor roles, any applicable exclusions, and an actual lawful basis for each purpose. The notice intentionally does not invent a legal basis for unreviewed processing. Philippine [Data Privacy Act sections 11 and 12](https://privacy.gov.ph/data-privacy-act/) address processing principles, retention and lawful-processing criteria.
- **DPO and NPC registration:** assess DPO designation, data-processing-system registration, automated-analysis/profiling notification and any exemption filing under the current rules. The [NPC registration circular](https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf) includes risk and profiling criteria; headcount alone does not settle applicability. Do not publish an NPC seal or claim registration without confirmation.
- **Privacy impact assessment and safeguards:** document the public-address analysis, false-positive and identity-linkage risks, recipients, storage and request handling using the [NPC PIA guide](https://privacy.gov.ph/wp-content/uploads/2022/01/NPC_PIA_0618.pdf). Have the responsible reviewer determine the required PIA, privacy-management, security and incident-response steps for this deployment.
- **Notice and rights review:** check the final operator details, recipient information, confirmed retention and request process against the [Data Privacy Act implementing rules](https://privacy.gov.ph/implementing-rules-regulations-data-privacy-act-2012/) and [NPC data-subject-rights guidance](https://privacy.gov.ph/data-subject-rights/). The remaining unknown retention arrangements are an unresolved launch issue, not evidence of compliance.
- **Financial regulatory and terms review:** ask Philippine financial-regulatory counsel whether the actual research, scoring, marketing and any future paid/personalized or transaction features trigger SEC/BSP or other requirements. The [SEC's published crypto-asset service provider material](https://www.sec.gov.ph/notices/sec-notice-of-the-opening-of-the-thematic-sandbox-for-casps/) is a review starting point, not proof that this app is licensed, exempt or subject to that specific program. A “research only” label does not decide regulatory scope. Review the terms and evidence/defamation risks without replacing them with an arbitrary liability waiver.

## Release verification

- Run storage/helper and legal-route tests, full tests, TypeScript and a production build.
- On a fresh browser origin, complete a real scan and confirm that no report-feed key is written. The watchlist should appear only after Watch.
- Seed a legacy summary: with consent absent, confirm it is hidden and untouched. Enable history, complete a scan, inspect the bounded saved summaries, then withdraw and confirm every history version is removed and no later scan rewrites it.
- Clear app data and confirm watchlists/history update in open tabs while unrelated origin storage is retained. Repeat with storage blocked.
- Check `/privacy`, `/cookies`, `/terms`, their canonical metadata and sitemap, footer links, keyboard focus, status announcements, 320px/mobile layout and the unchanged scanner geometry between idle and scanning.
- Inspect deployed response headers, cookies and network traffic; verify the contact destination. Record provider/hosting retention findings and professional review separately from passing software checks.
