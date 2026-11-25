import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { scanAccessibility } from './qa-accessibility.mjs';

const browser = await chromium.launch({ executablePath: process.env.QA_CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage();
  const document = '<!doctype html><html lang="en"><head><title>Report</title><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"></head><body><main><h1>Report</h1><button id="unnamed"></button><script>window.reportScriptRan=true</script></main></body></html>';
  await page.setContent('<!doctype html><html lang="en"><head><title>Host</title></head><body><main><h1>Host</h1><button id="outer-unnamed"></button><iframe id="preview" title="Report preview" sandbox=""></iframe></main></body></html>');
  await page.locator('#preview').evaluate((el, html) => { el.srcdoc = html; }, document);
  await page.frameLocator('#preview').locator('#unnamed').waitFor();
  const started = Date.now();
  const result = await scanAccessibility(page);
  assert.equal(result.frames.length, 2);
  assert.equal(result.frames[1].mode, 'isolated-document-copy');
  assert.ok(result.violations.some(v => v.id === 'button-name' && v.nodes.some(n => n.target.includes('#outer-unnamed'))), 'host violations must not disappear');
  assert.ok(result.violations.some(v => v.id === 'button-name' && v.nodes.some(n => n.target.includes('#preview') && n.target.includes('#unnamed'))), 'sandbox document must be scanned, not skipped');
  assert.equal(await page.locator('#preview').getAttribute('sandbox'), '');
  const frame = page.frames().find(f => f !== page.mainFrame());
  assert.equal(await frame.evaluate(() => window.reportScriptRan), undefined, 'document scripts remain blocked');
  assert.match(await frame.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /default-src 'none'/);
  const blockedPage = { frames: () => [{ parentFrame: () => null, evaluate: () => new Promise(() => {}) }] };
  await assert.rejects(scanAccessibility(blockedPage, { timeoutMs: 30 }), /coverage is incomplete/);
  console.log('QA_ACCESSIBILITY_REGRESSION_PASS', JSON.stringify({ frames: result.frames, durationMs: Date.now() - started, timeoutFailsClosed: true, sandboxUnchanged: true }));
} finally { await browser.close(); }
