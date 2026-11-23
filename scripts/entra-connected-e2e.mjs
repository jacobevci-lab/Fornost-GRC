import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createQaContext, waitForQaIdle, closeQaContext } from './qa-browser-harness.mjs';
import { monitor, scanViews } from './entra-qa/observe.mjs';
import { clean, title, inventory } from './entra-qa/records.mjs';
import { resumeContext } from './entra-qa/resume.mjs';
import { journey } from './entra-qa/journey.mjs';

const base = process.env.ENTRA_BASE_URL || 'http://127.0.0.1:4173',
  isolated = base === 'http://127.0.0.1:4173';
assert.ok(isolated || base === 'https://app.fornostsecurity.com', 'Unsupported QA destination');
const out = process.env.ENTRA_OUTPUT || 'entra-qa-artifacts';
const report = {
  origin: base,
  started: new Date().toISOString(),
  browser: { headless: false, slowMo: 120, width: 1440, height: 900 },
  steps: [],
  screens: [],
  events: [],
  codes: {},
};
await mkdir(out, { recursive: true });
let current = 'start',
  browser;
async function step(name, fn) {
  current = name;
  try {
    await fn();
    report.steps.push({ name, status: 'passed' });
    console.log('PASS', name);
    return true;
  } catch (e) {
    const reason = String(e.message).split('\n').slice(0, 4).join(' ').slice(0, 390);
    report.steps.push({ name, status: 'failed', reason, check: e.qaCheck });
    console.error('FAIL', name, isolated ? reason : e.qaCheck || 'See stage and status');
    return false;
  }
}
try {
  browser = await chromium.launch({
    headless: false,
    slowMo: 120,
    executablePath: process.env.QA_CHROMIUM_PATH || undefined,
  });
  const headers = {};
  if (!isolated && process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = process.env.CF_ACCESS_CLIENT_ID;
    headers['CF-Access-Client-Secret'] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const ctx = await createQaContext(browser, base, headers, { viewport: { width: 1440, height: 900 } });
  const finishEvents = await monitor(ctx, report, base, () => current);
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.setDefaultNavigationTimeout(90000);
  const api = async (path, { method = 'GET', data, multipart, expected = [200] } = {}) => {
    if (!path.startsWith('/api/') || path.includes('://')) throw Error('Invalid API path');
    const r = await ctx.request.fetch(base + path, {
      method,
      headers: { ...headers, origin: base },
      data,
      multipart,
      maxRedirects: 0,
    });
    if (r.status() >= 400)
      report.events.push({
        step: current,
        kind: 'api',
        path: path.split('?')[0],
        status: r.status(),
        expected: expected.includes(r.status()),
      });
    const b = await r.json().catch(() => ({}));
    assert.ok(
      expected.includes(r.status()),
      method + ' ' + path.split('?')[0] + ' HTTP ' + r.status() + ' ' + (b.code || b.error || ''),
    );
    return b;
  };
  const owner = isolated ? 'qa-admin@fornost.test' : process.env.FORNOST_SMOKE_EMAIL;
  const password = isolated ? process.env.FORNOST_QA_PASSWORD : process.env.FORNOST_SMOKE_PASSWORD;
  if (
    !(await step('Authenticated preflight', async () => {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await waitForQaIdle(page);
      assert.ok(owner && password, 'Dedicated application QA credentials are required');
      await api('/api/auth', { method: 'POST', data: { action: 'login', email: owner, password } });
      const a = await api('/api/auth');
      assert.equal(a.user.role, 'Admin');
      const h = await api('/api/health');
      report.revision = h.revision;
      if (!isolated && process.env.FORNOST_EXPECTED_REVISION)
        assert.equal(
          h.revision,
          process.env.FORNOST_EXPECTED_REVISION,
          'Wait for the selected revision to reach production',
        );
      await page.reload();
      await page.locator('.shell').waitFor();
    }))
  )
    throw Error('Authentication required before reading or changing records');
  let existing = [];
  const listed = await step('Inventory and safe cleanup', async () => {
    let fixture;
    if (isolated) {
      const r = await api('/api/grc', {
        method: 'POST',
        expected: [201],
        data: {
          module: 'Varlık Envanteri',
          data: {
            title: 'QA-CLOUD-Entra-cleanup-check',
            assetType: 'Bulut Servisi',
            owner,
            businessUnit: 'Bilgi Teknolojileri',
            criticality: 'Kritik',
            status: 'Aktif',
          },
        },
      });
      fixture = r.id;
    }
    existing = await clean(api, report, isolated || process.env.ENTRA_CLEAN === 'true', owner);
    if (fixture) {
      assert.ok(report.cleanup.deleted.some((r) => r.title === 'QA-CLOUD-Entra-cleanup-check'));
      assert.ok(!(await api('/api/grc')).rows.some((r) => r.id === fixture));
    }
  });
  const people = { owner };
  const roles = await step('Independent directory identities', async () => {
    const users = (await api('/api/users')).users;
    // Reuse a dedicated test identity of the right role before provisioning one.
    const participant = (explicit, canonical, roles) => {
      if (explicit || users.some((u) => u.email === canonical)) return explicit || canonical;
      return (
        users.find(
          (u) =>
            u.status === 'Active' &&
            roles.includes(u.role) &&
            /^[a-z0-9.+_-]+@fornost\.test$/i.test(u.email) &&
            !Object.values(people).includes(u.email),
        )?.email || canonical
      );
    };
    for (const [key, role, explicit, canonical] of [
      ['reviewer', 'Admin', process.env.ENTRA_REVIEWER_EMAIL, 'entra-qa-reviewer@fornost.test'],
      ['lead', 'Editor', process.env.ENTRA_LEAD_EMAIL, 'entra-qa-lead@fornost.test'],
    ]) {
      const email = participant(explicit, canonical, key === 'lead' ? ['Editor', 'Admin'] : ['Admin']);
      const u = users.find((x) => x.email === email);
      if (u)
        assert.ok(
          u.status === 'Active' && ['Admin', ...(key === 'lead' ? ['Editor'] : [])].includes(u.role),
          'Invalid directory participant ' + key,
        );
      else {
        assert.ok(
          isolated || process.env.ENTRA_WRITE === 'true',
          'Write mode required to provision a participant',
        );
        const synthetic =
          key === 'reviewer' ? 'entra-qa-reviewer@fornost.test' : 'entra-qa-lead@fornost.test';
        assert.equal(email, synthetic, 'Explicit external assignee must already exist');
        const pass = randomBytes(32).toString('base64url') + 'aA9!';
        await api('/api/users', {
          method: 'POST',
          expected: [201],
          data: { name: 'Entra QA ' + key, email, role, password: pass },
        });
      }
      people[key] = email;
    }
    assert.equal(new Set(Object.values(people)).size, 3);
  });
  if (listed && roles && (isolated || process.env.ENTRA_WRITE === 'true')) {
    const matches = existing.filter((r) => Object.values(title).includes(r.name));
    if (matches.length) {
      let resume;
      const ok = await step('Verify existing exercise and connected lineage', async () => {
        resume = await resumeContext(api, existing, owner);
      });
      if (ok) await journey({ api, page, people: resume.people, step, isolated, report, resume });
    } else {
      await journey({ api, page, people, step, isolated, report });
      if (
        isolated &&
        process.env.ENTRA_VERIFY_REPLAY === 'true' &&
        report.steps.every((s) => s.status === 'passed')
      ) {
        let resume;
        const ok = await step('Verify existing exercise and connected lineage', async () => {
          resume = await resumeContext(api, await inventory(api), owner);
        });
        if (ok) await journey({ api, page, people: resume.people, step, isolated, report, resume });
      }
    }
  } else
    report.steps.push({
      name: 'Create scenario',
      status: 'blocked',
      reason: 'Complete inventory, roles and authorized write mode required',
    });
  if (process.env.ENTRA_SCOPE !== 'journey') await scanViews(page, report, step);
  await closeQaContext(ctx);
  finishEvents();
} catch (e) {
  report.steps.push({ name: 'Execution', status: 'blocked', reason: String(e.message).split('\n')[0] });
} finally {
  if (browser) await browser.close();
  report.finished = new Date().toISOString(); // Production artifacts may be visible to repository readers. Keep business record
  // titles, DOM selectors and raw console messages inside the application environment.
  const saved = isolated
    ? report
    : {
        ...report,
        events: report.events.map(({ kind, step, status, expected, path }) => ({
          kind,
          step,
          status,
          expected,
          path,
        })),
        screens: report.screens.map(
          ({ label, lang, theme, rawUuid, translationKey, untranslated, contrast }) => ({
            label,
            lang,
            theme,
            rawUuid,
            translationKey,
            untranslated: Boolean(untranslated),
            contrast: contrast.length,
          }),
        ),
        steps: report.steps.map(({ name, status, check }) => ({ name, status, check })),
        cleanup: report.cleanup && {
          inspected: report.cleanup.inspected,
          candidates: report.cleanup.candidates,
          deleted: report.cleanup.deleted.length,
          cancelled: report.cleanup.cancelled.length,
          retained: report.cleanup.retained.length,
          retainedByModule: report.cleanup.retained.reduce((counts, r) => {
            const key = r.module + ' / ' + r.reason;
            counts[key] = (counts[key] || 0) + 1;
            return counts;
          }, {}),
        },
      };
  const unexpected = report.events.filter((e) => !e.expected);
  console.log(
    'Runtime events:',
    unexpected.length,
    'unexpected;',
    report.events.length - unexpected.length,
    'expected.',
  );
  for (const e of unexpected)
    console.error(
      'EVENT',
      e.step,
      e.kind,
      e.path || '',
      e.status || '',
      isolated ? e.message || '' : '',
    );
  await writeFile(out + '/report.json', JSON.stringify(saved, null, 2));
}
if (report.steps.some((s) => s.status !== 'passed') || report.events.some((e) => !e.expected))
  process.exitCode = 1;
