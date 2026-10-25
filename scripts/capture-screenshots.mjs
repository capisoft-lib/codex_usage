// Render the real dashboard with deterministic, entirely synthetic usage data.
// Requires the existing desktop development dependencies (npm ci --prefix desktop).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(root, process.argv.includes('--source') ? process.argv[process.argv.indexOf('--source') + 1] : 'public');
const output = path.join(root, 'docs/screenshots');
const require = createRequire(new URL('../desktop/package.json', import.meta.url));
const { chromium } = require('playwright');
const { createPageData } = await import(pathToFileURL(path.join(source, 'page-data.js')));
const { createQuotaDetail, quotaMetadata } = await import(pathToFileURL(path.join(source, 'quota-data.js')));
const now = new Date('2026-10-25T12:00:00Z');
const hour = 3_600_000, day = 24 * hour;
const iso = time => new Date(time).toISOString();
const weekStart = +new Date('2026-10-21T00:00:00Z');
const quota = (start, observedAt, percent) => ({
  startsAt: iso(start), endsAt: iso(start + 7 * day), resetsAt: iso(start + 7 * day),
  observedAt: iso(observedAt), peakObservedAt: iso(observedAt), usedPercent: percent,
  peakUsedPercent: percent, remainingPercent: 100 - percent, windowMinutes: 10080,
  planType: 'pro', planTypes: ['pro'],
  observations: Array.from({ length: 10 }, (_, i) => ({ observedAt: iso(start + (observedAt - start) * i / 9), usedPercent: Math.round(percent * i / 9) })),
});
const data = {
  apiVersion: 1, analyzerVersion: 10, revision: 'synthetic-screenshots-v1', generatedAt: now.toISOString(),
  source: { mode: 'local', sessionsAvailable: true, archivedSessionsAvailable: true, sessionIndexAvailable: true },
  fiveHourQuota: { ...quota(+now - 3 * hour, +now, 32), endsAt: iso(+now + 2 * hour), resetsAt: iso(+now + 2 * hour), windowMinutes: 300 },
  weeklyQuota: quota(weekStart, +now, 42),
  weeklyQuotaHistory: [quota(weekStart - 7 * day, weekStart - hour, 71)], nodes: [], sessions: [], errors: [],
};
const projects = [
  ['Atlas Website', ['Build the analytics overview', 'Add keyboard navigation', 'Polish the checkout flow'], 1.4],
  ['Pocket Planner', ['Sync offline changes', 'Improve calendar performance', 'Add recurring reminders'], 1.1],
  ['Design System', ['Create accessible form controls', 'Document the color tokens', 'Review responsive layouts'], 0.8],
  ['API Toolkit', ['Add pagination helpers', 'Write integration tests', 'Optimize the request cache'], 0.65],
];
for (let date = 0; date < 12; date++) for (let project = 0; project < projects.length; project++) {
  const [projectName, titles, weight] = projects[project];
  const start = +now - (11 - date) * day - (5 - project) * hour;
  const calls = Array.from({ length: 12 + (date * 7 + project * 5) % 19 }, (_, index) => {
    const inputTokens = Math.round((28000 + index * 1300 + date * 1700) * weight);
    const cachedInputTokens = Math.round(inputTokens * (0.61 + (index % 4) * 0.07));
    const outputTokens = Math.round((650 + (index * 83) % 1700) * weight);
    return { timestamp: iso(start + index * 90000), turnId: `turn-${date}-${project}-${index}`,
      model: project === 0 ? 'gpt-6.1-sol' : project === 1 ? 'gpt-6-astra' : 'gpt-6-sol',
      effort: project < 2 ? 'high' : 'medium', serviceTier: index % 9 === 0 ? 'fast' : 'default',
      usage: { inputTokens, cachedInputTokens, cacheWriteInputTokens: 0, outputTokens, reasoningOutputTokens: Math.round(outputTokens * .4), totalTokens: inputTokens + outputTokens } };
  });
  const turns = calls.filter((_, index) => index % 3 === 0).map(call => ({
    id: call.turnId, startedAt: call.timestamp, completedAt: iso(Date.parse(call.timestamp) + 78000),
    durationMs: 78000, model: call.model, effort: call.effort, serviceTier: call.serviceTier, calls: 3, usage: call.usage,
  }));
  const usage = Object.fromEntries(Object.keys(calls[0].usage).map(key => [key, calls.reduce((total, call) => total + call.usage[key], 0)]));
  data.sessions.push({ id: `demo-${date}-${project}`, title: titles[date % titles.length], projectName,
    cwd: `/demo/${projectName.toLowerCase().replaceAll(' ', '-')}`, source: 'cli', startedAt: calls[0].timestamp,
    updatedAt: calls.at(-1).timestamp, models: [...new Set(calls.map(call => call.model))],
    modelCalls: calls.length, exchanges: turns.length, completedExchanges: turns.length,
    durationMs: turns.length * 78000, usage, calls, turns });
}
data.firstSessionAt = data.sessions[0].startedAt;

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      let body;
      if (url.pathname === '/api/capabilities') body = { apiVersion: 1, runtime: 'local', sources: ['local'], defaultSource: 'local', canRefresh: true };
      else if (url.pathname === '/api/page') {
        const builder = createPageData(data, url.searchParams.get('query'));
        for (const session of data.sessions) { builder.add(session); builder.addWeekly?.(session); }
        body = builder.finish();
      } else if (url.pathname === '/api/quota') {
        if (url.searchParams.has('detail')) {
          const builder = createQuotaDetail(data, url.searchParams.get('period'), now);
          for (const session of data.sessions) for (const call of session.calls) builder.add(call);
          body = builder.finish();
        } else body = quotaMetadata(data);
      } else if (url.pathname === '/api/usage') body = data;
      else { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body)); return;
    }
    const file = path.resolve(source, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(source + path.sep)) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) { response.writeHead(500).end(error.message); }
});

await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.SCREENSHOT_BROWSER || 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'en-US', timezoneId: 'Europe/Paris', deviceScaleFactor: 1, reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('codex-usage-language', 'en'));
  const page = await context.newPage(), errors = [], captures = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.clock.setFixedTime(now);
  const base = `http://127.0.0.1:${server.address().port}`;
  async function capture(name, selector, fullPage = false) {
    try { await page.locator(selector).first().waitFor({ timeout: 10000 }); }
    catch (error) { await page.screenshot({ path: path.join(output, name) }); console.error(await page.locator('main').innerText(), errors); throw error; }
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(output, name), animations: 'disabled', fullPage });
    const overflow = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1; }).slice(0, 8).map(el => ({ tag: el.tagName, id: el.id, class: el.className, right: el.getBoundingClientRect().right })) }));
    assert.ok(overflow.scrollWidth <= overflow.width, `${name}: horizontal overflow ${JSON.stringify(overflow)}`);
    assert.doesNotMatch(await page.locator('#freshness').innerText(), /error|failed|loading/i);
    captures.push({ file: name, viewport: page.viewportSize(), fullPage });
  }
  await page.goto(`${base}/#overview`);
  await page.locator('#kpis .kpi').first().waitFor();
  await page.locator('[data-period="7d"]').click();
  await capture('overview.png', '#costChart svg');
  assert.equal(await page.locator('#overviewProjects .project-row').count(), 4);
  await page.locator('[data-nav-section="projects"]').first().click();
  await page.locator('#projectList .project-row').first().click();
  await capture('projects.png', '#projectDetail .project-models, #projectDetail .project-stat, #projectDetail h3');
  await page.locator('[data-header-quota="weekly"]').click();
  await capture('weekly-quota.png', '#quotaForecastChart svg', true);
  assert.match(await page.locator('#quotaForecastSummary').innerText(), /project|forecast|pace/i);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#projects`);
  await capture('mobile.png', '#projectList .project-row');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'capture-manifest.json'), JSON.stringify({
    scenarioTime: now.toISOString(), data: 'Deterministic synthetic demo; no Codex files or credentials are read.',
    language: 'en', theme: 'green', captures, checks: { pageErrors: errors, horizontalOverflow: false },
  }, null, 2) + '\n');
  console.log(`Captured and checked ${captures.length} screenshots in ${path.relative(root, output)}.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
