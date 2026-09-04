# Dated OpenAI pricing

Research window: **2025-08-07 to 2026-09-05**, covering more than twelve months.
Catalog: `public/pricing-catalog.js`, version `2026-09-05.1`.
Last source review: 2026-09-05 (Europe/Paris). Next routine review: 2026-10-05.

## What the dashboard measures

The dollar total is the estimated **API equivalent of observed Codex token usage**, not an invoice or the price of a subscription. Codex credits use an independent, dated credit card. Observed quota percentages remain observations; neither pricing simulation changes them.

Both the local application and hosted Site use the same public catalog and calculators. The collector sends model, consumption timestamp, service tier and token counters. It does not send calculated prices. A later import uses the original consumption date, never the import, synchronization or deployment date.

Historical mode selects `effectiveFrom <= call.timestamp < effectiveTo`. A new price period does not rewrite an earlier period. Example: one million Sol output tokens on August 20 costs $30; another million on August 22 costs $20; together they remain $50 after the price cut.

## Research ledger

Standard text-token amounts below are USD per million **input / cached input / output**. Launching a different model is distinguished from changing the price of an existing model. The review covered the API changelog throughout the window and checked the dated announcements against the current rate card and individual model pages.

| Date | Event / model | Amounts or change | Evidence |
| --- | --- | --- | --- |
| 2025-08-07 | GPT-5, mini, nano launch; baseline before the twelve-month window | GPT-5: 1.25 / 0.125 / 10; mini: 0.25 / 0.025 / 2; nano: 0.05 / 0.005 / 0.40 | [Launch](https://openai.com/index/introducing-gpt-5-for-developers/), [API card](https://developers.openai.com/api/docs/pricing) |
| 2025-09-23 | GPT-5-Codex API launch | 1.25 / 0.125 / 10 | [Dated API changelog](https://developers.openai.com/api/docs/changelog), [model card](https://developers.openai.com/api/docs/models/gpt-5-codex); reconstructed historical rate |
| 2025-10-06 | GPT-5 Pro API launch | 15 / unavailable / 120 | [Changelog](https://developers.openai.com/api/docs/changelog), [December price comparison](https://openai.com/index/introducing-gpt-5-2/) |
| 2025-11-13 | GPT-5.1 and Codex variants | GPT-5.1 keeps GPT-5 rates; Codex: 1.25 / 0.125 / 10; Codex mini: 0.25 / 0.025 / 2 | [Announcement](https://openai.com/index/gpt-5-1-for-developers/), [mini card](https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini); variant history reconstructed |
| 2025-12-04 | GPT-5.1-Codex-Max API launch | 1.25 / 0.125 / 10 | [Changelog](https://developers.openai.com/api/docs/changelog), [model card](https://developers.openai.com/api/docs/models/gpt-5.1-codex-max); reconstructed |
| 2025-12-11 | GPT-5.2 and Pro | 1.75 / 0.175 / 14; Pro: 21 / unavailable / 168 | [Dated announcement with price table](https://openai.com/index/introducing-gpt-5-2/) |
| 2026-01-14 | GPT-5.2-Codex API launch | 1.75 / 0.175 / 14 | [Changelog](https://developers.openai.com/api/docs/changelog), [model card](https://developers.openai.com/api/docs/models/gpt-5.2-codex); reconstructed |
| 2026-02-24 | GPT-5.3-Codex API launch | 1.75 / 0.175 / 14 | [Changelog](https://developers.openai.com/api/docs/changelog), [API card](https://developers.openai.com/api/docs/pricing); reconstructed |
| 2026-03-05 | GPT-5.4 and Pro | 2.50 / 0.25 / 15; Pro: 30 / unavailable / 180 | [Announcement and price table](https://openai.com/index/introducing-gpt-5-4/) |
| 2026-03-17 | GPT-5.4 mini and nano | mini: 0.75 / 0.075 / 4.50; nano: 0.20 / 0.02 / 1.25 | [Changelog](https://developers.openai.com/api/docs/changelog), [API card](https://developers.openai.com/api/docs/pricing) |
| 2026-04-24 | GPT-5.5 and Pro API launch | 5 / 0.50 / 30; Pro: 30 / unavailable / 180; GPT-5.5 Priority is 2.5x | [Announcement](https://openai.com/index/introducing-gpt-5-5/), [API launch date](https://developers.openai.com/api/docs/changelog) |
| 2026-07-09 | GPT-5.6 family | Sol: 5 / 0.50 / 30; Terra: 2.50 / 0.25 / 15; Luna: 1 / 0.10 / 6 | [Original launch prices and 90% cache-read discount](https://openai.com/index/gpt-5-6/) |
| 2026-07-30 | **Existing-model price cuts** | Terra becomes 2 / 0.20 / 12 (-20%); Luna becomes 0.20 / 0.02 / 1.20 (-80%); subscription credit consumption also decreases | [Dated announcement](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/) |
| 2026-07-30 | Priority renamed Fast | `priority` remains compatible; GPT-5.6 API Fast is 2x Standard | [Announcement](https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/), [API changelog](https://developers.openai.com/api/docs/changelog) |
| 2026-08-05 | GPT-5.6 Fast long context | Requests above 272K input tokens become supported in Fast | [Dated API changelog](https://developers.openai.com/api/docs/changelog) |
| 2026-08-21 | **Sol promotional price cut** | 4 / 0.40 / 20; credits become 100 / 10 / 500 | [Dated changelog](https://developers.openai.com/api/docs/changelog), [API and credit reduction notice](https://openai.com/index/gpt-5-6/), [credit card](https://learn.chatgpt.com/docs/pricing) |
| 2026-09-03 | GPT-6 Astra | 10 / 1 / 50; API Fast 2x. Credits: 250 / 25 / 1,250; Codex Fast 2.5x | [Launch date](https://developers.openai.com/api/docs/changelog), [Astra rules](https://developers.openai.com/api/docs/models/gpt-6-astra), [API prices](https://developers.openai.com/api/docs/pricing), [credits](https://learn.chatgpt.com/docs/pricing) |

The changelog also covers image, audio, video, tools and storage products. Examples in this window include the December 2025 image-model release, April 2026 image-model release and June 2026 container billing granularity change. Their counters/units are not present in this dashboard's token observations, so they are not silently mixed into text-token estimates. This is a sourced history for supported text/Codex models, not a claim to reconstruct every OpenAI product's invoices or every account-specific contract.

## Evidence, precision and missing history

- `documented`: dated announcement plus published amounts/rules. Base periods continue until the next documented change. This cannot prove the absence of an unannounced/account-specific change.
- `reconstructed`: a dated model launch combined with an individual price card observed later; not a contemporaneous archived invoice. These calls remain visibly estimated. The model-specific source is retained.
- `observed`: a rate card known at a particular observation date. The previous application's credit table was explicitly checked on August 11, 2026; see the [retained source at the baseline commit](https://github.com/capisoft-lib/codex_usage/blob/446565d62e1bebfa7be06f48374bf52115706864/public/usage-pricing.js). We start those credit periods there. We do not backdate today's credit card to a model launch or infer credits from API dollars.
- Earlier credit rates, preview access before API availability, unknown model aliases, missing timestamps and unsupported service tiers stay **unrated**, excluded from monetary sums. Entirely unrated totals display an em dash; partial totals have an asterisk and an excluded-call count. This is not zero-cost usage.
- Published dates rarely specify an exact rollout hour. Day-only periods use **00:00 UTC** as an explicit convention, regardless of browser timezone. Calls on the change day are marked estimated. Global or regional rollout timing can differ.
- Generic prefix matching is forbidden: `gpt-6-astra-private` must not inherit Astra's official price. Explicit aliases and date-suffixed model IDs are supported. The `gpt-5.6` alias maps to Sol as documented in the July 9 changelog. An unrecognized moving alias remains unrated.
- Historical Fast availability is intentionally conservative. Where only the current API Fast card was verified, the catalog does not invent an earlier start date. GPT-5.5 Priority is supported from its API launch announcement; GPT-5.6 Fast and its long-context eligibility have separate dated gates. Fast long context for GPT-5.4/5.5 has no published applicable price in the reviewed current table.
- Sol's promotion is guaranteed **at least through November 21**, not necessarily ending then. `promotionMinimumUntil` / `reviewAfter` are review reminders, not price-expiration dates. No automatic restoration to the old rate occurs.

## Astra and accounting boundaries

For API Astra, prompts **strictly above 272,000 input tokens** apply 2x to input/cache and 1.5x to output for the whole request. Fast applies another 2x. These API factors are not copied into the credit calculator; its independent published Fast factor is 2.5x.

Input includes cached reads and cache writes, so ordinary fresh input is `inputTokens - cachedInputTokens - cacheWriteInputTokens`. The [official cache cost example](https://developers.openai.com/api/docs/guides/prompt-caching) confirms this accounting. Reasoning output is already part of output tokens and is not charged twice. Invalid/nonfinite counters and cache exceeding input are reported rather than coerced into a plausible amount. A missing published cached rate is `null`, not a free cache price.

GPT-5.6 and Astra publish cache-write rates at 1.25x uncached input. Analyzer v8 preserves the optional `cache_write_input_tokens` observation as `cacheWriteInputTokens`. Measured writes are subtracted from ordinary input and charged once at the documented write rate, including API Fast/long-context factors. Older calls without this field remain distinguishable from observed zero writes and carry an unobserved-write count and estimated coverage when uncached input could contain writes. Tool fees, unobserved cache-write surcharges, regional processing uplifts, negotiated rates, Batch/Flex and other unobserved details are excluded or explicitly unsupported. Estimates are not exact invoices.

## UI, migration and reproducibility

- **Historical** is the default and uses each call's timestamp.
- **Current simulation** uses the catalog at the recorded `asOf` time. It does not alter raw calls or historical credit totals.
- **Custom simulation** applies explicit browser-local prices, including optional reasoning overrides. They are not represented as official rates. Untouched effort rows inherit model edits; explicit effort overrides remain independent.
- Old browser settings are preserved for custom simulation but never silently replace dated official rates. Reset restores the official historical mode. Browser storage remains optional.
- The pricing dialog exposes the catalog, effective periods, evidence and official source links. It shows the version/verification date and an overdue-review notice.
- **Export calculation** exports the applied (saved) mode, selection interval, settings, aggregate results, token buckets with applied rates, catalog version and full used rate entries. The buckets reproduce the amount without raw calls, including separate Fast/long-context groups and distinct custom prices for aliases. No raw session, prompt, title or filesystem path is exported. The exported rate entries preserve the evidence even if a later catalog corrects an estimate.

The parser and Mesh envelope are model-agnostic. Astra needs no new model allowlist or re-enrollment. Live inspection found that the previous collector already preserved model/timestamp/tier but discarded the newly observable cache-write counter. Analyzer v8 triggers a reparse of existing source files and transmits the optional counter. Root and hosted validators accept both old and new agents. Deploy the receiving Site first, then restart/update the local reporting agent while preserving its identity. Other machines continue to sync without the optional counter until their agent is updated.

Quota forecasts reject incompletely priced calibration periods. Older unrated calls trim the EMA history to the contiguous priced hours after the latest gap; they do not hide a fully priced selected week. If the selected week contains unrated calls, projection can still use an independently calibrated complete-period capacity and the recent priced history. Only the observed quota point is shown for that incomplete week; the UI explains why the detailed historical curve is unavailable. Partial totals are never used to infer capacity.

## Maintaining the catalog

1. Review the [API changelog](https://developers.openai.com/api/docs/changelog), [API prices](https://developers.openai.com/api/docs/pricing), [Codex credits](https://learn.chatgpt.com/docs/pricing) and dated announcements. Record **effective date and observation date separately**. Check input, cache, output, Fast, long-context thresholds/eligibility and promotions independently.
2. Add a rate period to `public/pricing-catalog.js`; keep older periods. Increment the catalog version and update this ledger, the verification date and next review date. Period ends are derived from the next start to avoid contradictory overlapping edits.
3. For a correction to an old estimate, document the changed period, previous assumption, new evidence and affected results in the PR. Never present a correction as a new price cut. Existing exported reports remain reproducible from their included rate entries.
4. Run pricing boundary/import/migration tests and the full root/hosted checks. Sync the shared dashboard bundle, commit and review the diff. The catalog is public data; private usage and credentials must never be committed.
5. Distribute the validated catalog with the application and deploy the hosted bundle separately. Runtime calculations do not scrape OpenAI or fetch mutable `main` content. They remain available offline.

Useful checks: `node --test test/dated-pricing.test.mjs test/api-pricing.test.mjs test/usage-pricing.test.mjs`, `npm run check`, and `npm test --prefix sites-hub` / `npm run lint --prefix sites-hub`.
