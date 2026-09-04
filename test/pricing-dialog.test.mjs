import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { mergeApiPricing, apiPriceFor } from "../public/api-pricing.js";
import { PRICING_CATALOG } from "../public/pricing-catalog.js";
import { PRICING_I18N, pricingHistoryMarkup, pricingCatalogLabel } from "../public/pricing-ui.js";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const source = app.slice(app.indexOf("function openPricing("), app.indexOf("function applyUsageData("));

test("pricing dialog preserves legacy custom values and switches saved modes without rewriting them", () => {
  const elements = new Map();
  const $ = (key) => {
    if (!elements.has(key)) elements.set(key, { showModal() { this.open = true; } });
    return elements.get(key);
  };
  const legacy = { models: { "gpt-6-astra": { input: 3, cached: 0.3, output: 9 } } };
  const state = { pricing: mergeApiPricing(legacy), data: { sessions: [{ models: ["gpt-6-astra"], calls: [] }] } };
  let renders = 0;
  const context = vm.createContext({
    state, $, $$: () => [{ dataset: { priceType: "model", priceKey: "gpt-6-astra" }, querySelectorAll: () => ["4", "0.4", "12"].map((value) => ({ value })) }],
    apiPriceFor, PRICING_CATALOG, pricingHistoryMarkup, pricingCatalogLabel,
    structuredClone, escapeHtml: String, t: (key) => PRICING_I18N.en[key] || key,
    render: () => { renders++; }, toast() {},
    localStorage: { setItem() { throw new Error("storage disabled"); } },
  });
  vm.runInContext(source, context);
  context.openPricing();
  assert.equal($("#pricingMode").value, "historical");
  assert.equal($("#pricingRows").hidden, true);
  assert.equal($("#pricingLegacy").hidden, false);
  assert.match($("#pricingHistory").innerHTML, /10 \/ 1 \/ 50/);
  $("#pricingMode").value = "current";
  context.savePricing();
  assert.equal(state.pricing.mode, "current");
  assert.equal(state.pricing.models["gpt-6-astra"].output, 9);
  $("#pricingMode").value = "custom";
  context.savePricing();
  assert.equal(state.pricing.models["gpt-6-astra"].output, 12);
  context.openPricing();
  assert.equal($("#pricingRows").hidden, false);
  assert.equal(renders, 2);
});

test("editing a model price keeps untouched effort rows inherited and preserves explicit overrides", () => {
  const state = { pricing: mergeApiPricing(), data: { sessions: [] } };
  const modelFields = ['4', '0.4', '12'];
  const effortFields = ['10', '1', '50'];
  const rows = [
    { dataset: { priceType: 'model', priceKey: 'gpt-6-astra' }, querySelectorAll: () => modelFields.map(value => ({ value })) },
    { dataset: { priceType: 'effort', priceKey: 'gpt-6-astra::high', originalPrice: '[10,1,50]' }, querySelectorAll: () => effortFields.map(value => ({ value })) },
  ];
  const context = vm.createContext({ state, $: () => ({ value: 'custom' }), $$: () => rows, structuredClone, render() {}, toast() {}, t: String, localStorage: { setItem() {} } });
  vm.runInContext(source, context);
  context.savePricing();
  assert.equal(Object.hasOwn(state.pricing.effortOverrides, 'gpt-6-astra::high'), false);
  assert.equal(apiPriceFor(state.pricing, 'gpt-6-astra', 'high').output, 12);
  effortFields[2] = '19';
  context.savePricing();
  assert.equal(apiPriceFor(state.pricing, 'gpt-6-astra', 'high').output, 19);
  rows[1].dataset.originalPrice = '[10,1,19]';
  modelFields[2] = '24';
  context.savePricing();
  assert.equal(apiPriceFor(state.pricing, 'gpt-6-astra', 'high').output, 19);
});
