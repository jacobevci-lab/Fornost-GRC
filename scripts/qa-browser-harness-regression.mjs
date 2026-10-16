import assert from 'node:assert/strict';
import http from 'node:http';
import { chromium } from '@playwright/test';
import { createQaContext, waitForQaIdle } from './qa-browser-harness.mjs';

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
  res.end(`<html><main><section aria-busy="true">Loading</section></main><script src="${externalUrl}/analytics.js"></script><script>
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
  assert.ok(seen.some(item => item.host === 'app'));
  assert.ok(seen.some(item => item.host === 'external'));
  for (const item of seen) {
    assert.equal(item.headers['cf-access-client-id'], item.host === 'app' ? 'qa-fixture-id' : undefined);
    assert.equal(item.headers['cf-access-client-secret'], item.host === 'app' ? 'qa-fixture-secret' : undefined);
  }
  await page.locator('section').evaluate(node => node.setAttribute('aria-busy', 'true'));
  await assert.rejects(waitForQaIdle(page, { timeout: 600 }), /did not finish loading: busy=1/);
  await page.locator('section').evaluate(node => node.setAttribute('aria-busy', 'false'));
  const failure = page.waitForEvent('requestfailed', request => request.url().endsWith('/api/failure'));
  await page.evaluate(() => fetch('/api/failure').catch(() => {}));
  assert.ok((await failure).failure(), 'Network errors stay observable by the scanners');
  await waitForQaIdle(page);
  await context.close();
  console.log('QA_BROWSER_HARNESS_PASS: delayed data and React commit, busy timeout, origin-only credentials, external script, observable transport failures');
} finally {
  await browser.close();
  await Promise.all([new Promise(resolve => app.close(resolve)), new Promise(resolve => external.close(resolve))]);
}
