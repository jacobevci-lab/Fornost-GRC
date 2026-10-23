import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { createQaContext, closeQaContext, waitForQaIdle, openQaModule } from './qa-browser-harness.mjs';

const seen = [];
const external = http.createServer((req, res) => {
  seen.push({ host: 'external', headers: req.headers });
  res.setHeader('Content-Type', 'text/javascript');
  res.end('window.externalLoaded = true;');
});
await new Promise(resolve => external.listen(0, '127.0.0.1', resolve));
const externalUrl = `http://127.0.0.1:${external.address().port}`;
const app = http.createServer((req, res) => {
  seen.push({ host: 'app', headers: req.headers });
  if (req.url === '/api/delayed') {
    setTimeout(() => { res.setHeader('Content-Type', 'application/json'); res.end('{}'); }, 650);
    return;
  }
  if (req.url === '/api/failure') { req.socket.destroy(); return; }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<html><nav id="fornost-navigation"><div class="nav-group"><button class="nav-group-trigger" aria-expanded="false" style="display:none" onclick="this.setAttribute('aria-expanded','true');this.nextElementSibling.style.display='block'">Group</button><div class="nav-group-items"><button aria-label="Fixtures" onclick="document.querySelector('main>header h1').textContent='Fixtures'">Fixtures</button></div></div></nav><main><header><h1>Start</h1></header><section aria-busy="true">Loading</section></main><script src="${externalUrl}/analytics.js"></script><script>
    setTimeout(async () => {
      await fetch('/api/delayed');
      setTimeout(() => {
        document.querySelector('section').textContent = 'Loaded';
        document.querySelector('section').setAttribute('aria-busy', 'false');
      }, 200);
    }, 280);
  </script></html>`);
});
await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
try {
  const context = await createQaContext(browser, base, {
    'CF-Access-Client-Id': 'qa-fixture-id', 'CF-Access-Client-Secret': 'qa-fixture-secret',
  });
  const page = await context.newPage();
  await page.goto(base);
  await waitForQaIdle(page);
  assert.equal(await page.locator('section').textContent(), 'Loaded');
  assert.equal(await page.evaluate(() => window.externalLoaded), true);
  await openQaModule(page, 'Fixtures');
  assert.equal(await page.locator('main>header h1').textContent(), 'Fixtures', 'Compact menu clicks the visible icon');
  await page.locator('.nav-group-items').evaluate(node => { node.style.display = 'none'; });
  await page.locator('.nav-group-trigger').evaluate(node => { node.style.display = 'block'; });
  await page.locator('main>header h1').evaluate(node => { node.textContent = 'Start'; });
  await openQaModule(page, 'Fixtures');
  assert.equal(await page.locator('main>header h1').textContent(), 'Fixtures', 'Full menu expands the hidden destination');

  assert.ok(seen.some(item => item.host === 'app'));
  assert.ok(seen.some(item => item.host === 'external'));
  for (const item of seen) {
    assert.equal(item.headers['cf-access-client-id'], item.host === 'app' ? 'qa-fixture-id' : undefined);
    assert.equal(item.headers['cf-access-client-secret'], item.host === 'app' ? 'qa-fixture-secret' : undefined);
  }
  await page.locator('section').evaluate(node => node.setAttribute('aria-busy', 'true'));
  await assert.rejects(closeQaContext(context, { timeout: 600 }), /did not finish loading: busy=1/);
  assert.equal(page.isClosed(), false, 'A stalled workspace rejects teardown and remains inspectable');
  await page.locator('section').evaluate(node => node.setAttribute('aria-busy', 'false'));
  const failure = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/failure'));
  await page.evaluate(() => fetch('/api/failure').catch(() => {}));
  assert.ok((await failure).failure(), 'Network errors stay observable by the scanners');
  await waitForQaIdle(page);
  // Reproduce the old teardown race with a read starting after the last idle
  // check, as can happen during a screenshot or an accessibility scan.
  const immediate = await createQaContext(browser, base, {});
  const immediatePage = await immediate.newPage();
  await immediatePage.goto(base);
  await waitForQaIdle(immediatePage);
  const immediateStarted = immediatePage.waitForRequest(request => request.url().endsWith('/api/delayed'));
  const immediateResult = immediatePage.waitForResponse(response => response.url().endsWith('/api/delayed'))
    .then(() => ({ finished: true }), error => ({ finished: false, message: error.message }));
  await immediatePage.evaluate(() => { void fetch('/api/delayed').catch(() => {}); });
  await immediateStarted;
  await immediate.close();
  const interrupted = await immediateResult;
  assert.equal(interrupted.finished, false, 'Immediate teardown prevents observing the late response');
  assert.match(interrupted.message, /closed/, 'The context closes before the delayed response can be inspected');

  const lateFailures = [], finished = [];
  page.on('requestfailed', request => lateFailures.push(request.url()));
  page.on('requestfinished', request => finished.push(request.url()));
  const started = page.waitForRequest(request => request.url().endsWith('/api/delayed'));
  const response = page.waitForResponse(response => response.url().endsWith('/api/delayed'));
  await page.evaluate(() => { void fetch('/api/delayed').catch(() => {}); });
  await started;
  await closeQaContext(context);
  assert.equal((await response).status(), 200);
  assert.ok(finished.some(url => url.endsWith('/api/delayed')), 'A late read finishes before the context closes');
  assert.deepEqual(lateFailures, [], 'Draining causes no artificial request cancellation');
  assert.equal(page.isClosed(), true);
  console.log('QA_CONTEXT_DRAIN_PASS: old immediate close cuts off response observation; late read completes before close; busy timeout stays a failure; transport errors remain observable');
  console.log('QA_BROWSER_HARNESS_PASS: delayed data and React commit, busy timeout, origin-only credentials, external script, observable transport failures');
} finally {
  await browser.close();
  await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => external.close(resolve))]);
}
