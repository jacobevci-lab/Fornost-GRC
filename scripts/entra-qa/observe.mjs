import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { openQaModule, waitForQaIdle, switchQaLocale } from '../qa-browser-harness.mjs';

const uuid = /\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b/i;
const untranslated =
  /\b(?:Independent reviewer|Choose File|Save changes|Search records|No records found|Sign out|Record details|Create draft plan|CONTROLLED INCIDENT DECLARATION)\b/i;
const key = /\b(?:i18n|translations|common|modules|actions)\.[a-z][\w.]+\b/;
export async function monitor(ctx, report, origin, step) {
  // Directory searches and evidence assurance abort superseded reads on query,
  // row or navigation changes. Keep those distinct from timeouts and HTTP failures.
  const aborts = [],
    failed = [];
  const startedAt = new WeakMap();
  ctx.on('request', (r) => startedAt.set(r, Date.now()));
  await ctx.exposeBinding('__entraReadAborted', (_, url, started) =>
    aborts.push({ url, started, time: Date.now() }),
  );
  await ctx.addInitScript(() => {
    const original = window.fetch;
    window.fetch = function (input, init) {
      const url = new URL(input instanceof Request ? input.url : input, location.href);
      const signal = init?.signal || (input instanceof Request ? input.signal : null);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const watched = [
        '/api/workflow-choices',
        '/api/grc/risk-owners',
        '/api/search',
        '/api/evidence/assurance',
      ];
      if (
        method === 'GET' &&
        signal &&
        url.origin === location.origin &&
        watched.includes(url.pathname)
      ) {
        const started = Date.now();
        signal.addEventListener(
          'abort',
          () => {
            if (Date.now() - started < 14000)
              window.__entraReadAborted(url.href, started).catch(() => {});
          },
          { once: true },
        );
      }
      return original.call(this, input, init);
    };
  });
  const safe = (text) =>
    String(text)
      .replace(/https?:\/\/[^\s?#]+[?#]\S*/g, '[URL]')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
      .slice(0, 350);
  ctx.on('console', (m) => {
    if (m.type() === 'error')
      report.events.push({ step: step(), kind: 'console.error', message: safe(m.text()) });
  });
  ctx.on('weberror', (e) =>
    report.events.push({ step: step(), kind: 'pageerror', message: safe(e.error().message) }),
  );
  ctx.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === origin && u.pathname.startsWith('/api/') && r.status() >= 400)
      report.events.push({ step: step(), kind: 'http', path: u.pathname, status: r.status() });
  });
  ctx.on('requestfailed', (r) => {
    const u = new URL(r.url());
    if (u.origin === origin && u.pathname.startsWith('/api/')) {
      const event = {
        step: step(),
        kind: 'transport',
        path: u.pathname,
        message: safe(r.failure()?.errorText),
      };
      report.events.push(event);
      if (r.method() === 'GET' && event.message === 'net::ERR_ABORTED')
        failed.push({
          event,
          url: r.url(),
          started: startedAt.get(r) || r.timing().startTime,
          time: Date.now(),
        });
    }
  });
  return () => {
    for (const { event, url, started, time } of failed) {
      const index = aborts.findIndex(
        (a) => a.url === url && Math.abs(a.started - started) < 2000 && Math.abs(a.time - time) < 2000,
      );
      if (index >= 0) {
        aborts.splice(index, 1);
        event.kind = 'cancelled read';
        event.expected = true;
      }
    }
  };
}
export async function inspect(page, report, label, lang, theme) {
  await waitForQaIdle(page);
  const content = await page.locator('main').innerText();
  const rawUuid = uuid.test(content),
    translationKey = key.test(content),
    example = lang === 'tr' ? content.match(untranslated)?.[0] : undefined;
  const result = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const problems = result.violations.flatMap((v) =>
    v.nodes.map((n) => ({ rule: v.id, target: n.target })),
  );
  const sample = {
    label,
    lang,
    theme,
    rawUuid,
    translationKey,
    untranslated: example,
    contrast: problems,
  };
  report.screens.push(sample);
  return sample;
}
export const modules = [
  ['Tedarikçi Yönetimi', 'Vendor Management'],
  ['Varlık Envanteri', 'Asset Inventory'],
  ['İş Etki Analizi (BIA)', 'Business Impact Analysis (BIA)'],
  ['İş Sürekliliği ve Dayanıklılık', 'Business Continuity & Resilience'],
  ['Kontrol Kütüphanesi', 'Control Library'],
  ['Kanıt Kütüphanesi', 'Evidence Library'],
  ['Politika Merkezi', 'Policy Center'],
  ['Risk Değerlendirmesi', 'Risk Assessment'],
  ['Risk İştahı ve KRI', 'Risk Appetite & KRI'],
  ['AI Yönetişimi', 'AI Governance'],
  ['Güvenlik Olayları ve Kriz', 'Security Incidents & Crisis'],
  ['Bulgular ve CAPA', 'Findings & CAPA'],
  ['Denetim Yönetimi', 'Audit Management'],
  ['Regülasyon Merkezi', 'Regulatory Change Center'],
  ['Bağlantılı GRC Haritası', 'Connected GRC Map'],
];
export async function scanViews(page, report, step) {
  for (const lang of ['tr', 'en']) {
    await switchQaLocale(page, lang);
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.locator('.theme-toggle:visible').click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      for (const labels of modules) {
        const name = labels[lang === 'tr' ? 0 : 1];
        await step(name + ' · ' + lang + ' · ' + theme, async () => {
          await openQaModule(page, name);
          const v = await inspect(page, report, name, lang, theme);
          assert.ok(
            !v.rawUuid && !v.translationKey && !v.untranslated && !v.contrast.length,
            'See screen findings',
          );
        });
      }
    }
  }
}
