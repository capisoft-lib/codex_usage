// Public, offline rate history. Evidence and maintenance: docs/pricing-history.md.
// Day-only announcements use 00:00 UTC; their boundary day remains estimated.
export const PRICING_CATALOG_VERSION = "2026-09-05.1";
export const PRICING_VERIFIED_AT = "2026-09-05";
export const PRICING_RESEARCHED_FROM = "2025-08-07";
export const PRICING_REVIEW_AFTER = "2026-10-05";
export const PRICING_SOURCES = Object.freeze({
  api: "https://developers.openai.com/api/docs/pricing",
  credits: "https://learn.chatgpt.com/docs/pricing",
  changelog: "https://developers.openai.com/api/docs/changelog",
  speed: "https://learn.chatgpt.com/docs/agent-configuration/speed",
  gpt5: "https://openai.com/index/introducing-gpt-5-for-developers/",
  gpt51: "https://openai.com/index/gpt-5-1-for-developers/",
  gpt52: "https://openai.com/index/introducing-gpt-5-2/",
  gpt54: "https://openai.com/index/introducing-gpt-5-4/",
  gpt55: "https://openai.com/index/introducing-gpt-5-5/",
  gpt56: "https://openai.com/index/gpt-5-6/",
  julyCut: "https://openai.com/index/advancing-the-price-performance-frontier-with-gpt-5-6/",
  astra: "https://developers.openai.com/api/docs/models/gpt-6-astra",
});

const entries = [];
const price = (values) => ({ input: values[0], cached: values[1], output: values[2] });
function add(billing, model, effectiveFrom, values, options = {}) {
  entries.push({
    id: `${billing}:${model}:${effectiveFrom}`, billing, model, effectiveFrom,
    effectiveTo: null, datePrecision: "day", verifiedAt: PRICING_VERIFIED_AT,
    evidence: "documented", sources: ["api", "changelog"],
    standard: price(values), fastMultiplier: null, fastFrom: null,
    longContextThreshold: null, fastLongContextFrom: null,
    cacheWriteMultiplier: null, ...options,
  });
}
const api = (...args) => add("api", ...args);
const credits = (...args) => add("credits", ...args);
const long = { longContextThreshold: 272_000 };
// Rates whose historical Fast availability was not established are only enabled
// from the date of direct verification. Earlier Fast calls stay visibly unrated.
const currentFast = (multiplier) => ({ fastMultiplier: multiplier, fastFrom: PRICING_VERIFIED_AT });

api("gpt-5", "2025-08-07", [1.25, 0.125, 10], { sources: ["gpt5", "api"], ...currentFast(2) });
api("gpt-5-mini", "2025-08-07", [0.25, 0.025, 2], { sources: ["gpt5", "api"], ...currentFast(1.8) });
api("gpt-5-nano", "2025-08-07", [0.05, 0.005, 0.4], { sources: ["gpt5", "api"] });
api("gpt-5-codex", "2025-09-23", [1.25, 0.125, 10], { evidence: "reconstructed", sources: ["changelog", "https://developers.openai.com/api/docs/models/gpt-5-codex"] });
api("gpt-5-pro", "2025-10-06", [15, null, 120], { sources: ["gpt52", "changelog"] });
api("gpt-5.1", "2025-11-13", [1.25, 0.125, 10], { sources: ["gpt51", "api"], ...currentFast(2) });
api("gpt-5.1-codex", "2025-11-13", [1.25, 0.125, 10], { evidence: "reconstructed", sources: ["gpt51", "https://developers.openai.com/api/docs/models/gpt-5.1-codex"] });
api("gpt-5.1-codex-mini", "2025-11-13", [0.25, 0.025, 2], { evidence: "reconstructed", sources: ["changelog", "https://developers.openai.com/api/docs/models/gpt-5.1-codex-mini"] });
api("gpt-5.1-codex-max", "2025-12-04", [1.25, 0.125, 10], { evidence: "reconstructed", sources: ["changelog", "https://developers.openai.com/api/docs/models/gpt-5.1-codex-max"] });
api("gpt-5.2", "2025-12-11", [1.75, 0.175, 14], { sources: ["gpt52", "api"], ...currentFast(2) });
api("gpt-5.2-pro", "2025-12-11", [21, null, 168], { sources: ["gpt52", "api"] });
api("gpt-5.2-codex", "2026-01-14", [1.75, 0.175, 14], { evidence: "reconstructed", sources: ["changelog", "https://developers.openai.com/api/docs/models/gpt-5.2-codex"] });
api("gpt-5.3-codex", "2026-02-24", [1.75, 0.175, 14], { evidence: "reconstructed", ...currentFast(2) });
api("gpt-5.4", "2026-03-05", [2.5, 0.25, 15], { ...long, sources: ["gpt54", "api"], ...currentFast(2) });
api("gpt-5.4-pro", "2026-03-05", [30, null, 180], { ...long, sources: ["gpt54", "api"] });
api("gpt-5.4-mini", "2026-03-17", [0.75, 0.075, 4.5], { ...currentFast(2) });
api("gpt-5.4-nano", "2026-03-17", [0.2, 0.02, 1.25]);
api("gpt-5.5", "2026-04-24", [5, 0.5, 30], { ...long, sources: ["gpt55", "api"], fastMultiplier: 2.5, fastFrom: "2026-04-24" });
api("gpt-5.5-pro", "2026-04-24", [30, null, 180], { ...long, sources: ["gpt55", "api"] });
const family56 = {
  ...long, fastMultiplier: 2, fastFrom: "2026-07-30", fastLongContextFrom: "2026-08-05",
  cacheWriteMultiplier: 1.25, sources: ["gpt56", "api", "changelog"],
};
api("gpt-5.6-sol", "2026-07-09", [5, 0.5, 30], { ...family56 });
api("gpt-5.6-sol", "2026-08-21", [4, 0.4, 20], { ...family56, reviewAfter: "2026-11-21", promotionMinimumUntil: "2026-11-21" });
api("gpt-5.6-terra", "2026-07-09", [2.5, 0.25, 15], { ...family56, sources: ["gpt56", "julyCut", "api"] });
api("gpt-5.6-terra", "2026-07-30", [2, 0.2, 12], { ...family56, sources: ["julyCut", "api", "changelog"] });
api("gpt-5.6-luna", "2026-07-09", [1, 0.1, 6], { ...family56, sources: ["gpt56", "julyCut", "api"] });
api("gpt-5.6-luna", "2026-07-30", [0.2, 0.02, 1.2], { ...family56, sources: ["julyCut", "api", "changelog"] });
api("gpt-6-astra", "2026-09-03", [10, 1, 50], {
  ...long, fastMultiplier: 2, fastFrom: "2026-09-03", fastLongContextFrom: "2026-09-03",
  cacheWriteMultiplier: 1.25, sources: ["astra", "api", "changelog"],
});

// Codex credits are independent of API USD. Before our dated observation on
// August 11 the older token rate cards are not recoverable from these sources.
const creditOptions = (multiplier, sources = ["credits", "speed"]) => ({ fastMultiplier: multiplier, fastFrom: "2026-08-11", sources, evidence: "observed" });
for (const [model, values, multiplier] of [
  ["gpt-5.2", [43.75, 4.375, 350], null],
  ["gpt-5.3-codex", [43.75, 4.375, 350], null],
  ["gpt-5.4", [62.5, 6.25, 375], 2],
  ["gpt-5.4-mini", [18.75, 1.875, 113], 2],
  ["gpt-5.5", [125, 12.5, 750], 2.5],
  ["gpt-5.6-terra", [50, 5, 300], 2.5],
  ["gpt-5.6-luna", [5, 0.5, 30], 2.5],
]) credits(model, "2026-08-11", values, creditOptions(multiplier));
credits("gpt-5.6-sol", "2026-08-11", [125, 12.5, 750], creditOptions(2.5));
credits("gpt-5.6-sol", "2026-08-21", [100, 10, 500], { ...creditOptions(2.5), evidence: "documented", sources: ["credits", "gpt56", "speed"], promotionMinimumUntil: "2026-11-21", reviewAfter: "2026-11-21" });
credits("gpt-6-astra", "2026-09-03", [250, 25, 1250], { fastMultiplier: 2.5, fastFrom: "2026-09-03", sources: ["credits", "speed", "changelog"] });

for (const entry of entries) {
  const next = entries.filter((candidate) => candidate.billing === entry.billing && candidate.model === entry.model && candidate.effectiveFrom > entry.effectiveFrom).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  entry.effectiveTo = next?.effectiveFrom || null;
  Object.freeze(entry.standard);
  Object.freeze(entry.sources);
  Object.freeze(entry);
}
export const PRICING_CATALOG = Object.freeze(entries);
export const MODEL_ALIASES = Object.freeze({ "gpt-5.6": "gpt-5.6-sol" });
const index = new Map();
for (const entry of PRICING_CATALOG) {
  const key = `${entry.billing}:${entry.model}`;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(entry);
}

export function canonicalPricingModel(model) {
  const value = String(model || "").trim().toLowerCase();
  const undated = value.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return MODEL_ALIASES[value] || MODEL_ALIASES[undated] || undated;
}

export function resolveRate(billing, model, timestamp, { mode = "historical", asOf = PRICING_VERIFIED_AT } = {}) {
  const key = canonicalPricingModel(model);
  const at = mode === "current" ? Date.parse(asOf) : typeof timestamp === "string" && timestamp.trim() ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(at)) return { rate: null, reason: "missing-timestamp", key };
  const candidates = index.get(`${billing}:${key}`) || [];
  const rate = candidates.find((entry) => at >= Date.parse(entry.effectiveFrom) && (!entry.effectiveTo || at < Date.parse(entry.effectiveTo))) || null;
  const day = new Date(at).toISOString().slice(0, 10);
  return {
    rate, key, day, reason: rate ? null : candidates.length ? "uncovered-date" : "unknown-model",
    boundaryDay: Boolean(rate && rate.datePrecision === "day" && day === rate.effectiveFrom),
  };
}

export function sourceUrl(source) { return PRICING_SOURCES[source] || source; }

export function catalogStatus(asOf = new Date().toISOString()) {
  return { version: PRICING_CATALOG_VERSION, verifiedAt: PRICING_VERIFIED_AT, researchedFrom: PRICING_RESEARCHED_FROM, reviewAfter: PRICING_REVIEW_AFTER, reviewDue: Date.parse(asOf) >= Date.parse(PRICING_REVIEW_AFTER) };
}
