// Shared by the production scanners. Never put Access credentials on a whole
// browser context: that also sends them to analytics and other external hosts.
const pageStates = new WeakMap();

function observeReads(page, baseUrl) {
  const origin = new URL(baseUrl).origin;
  const state = { pending: new Set(), changedAt: Date.now() };
  pageStates.set(page, state);
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.origin === origin && url.pathname.startsWith('/api/')) {
      state.pending.add(request);
      state.changedAt = Date.now();
    }
  });
  const finish = request => {
    if (state.pending.delete(request)) state.changedAt = Date.now();
  };
  page.on('requestfinished', finish);
  page.on('requestfailed', finish);
}

export async function createQaContext(browser, baseUrl, accessHeaders, options = {}) {
  if (options.extraHTTPHeaders) throw new Error('Use per-request headers, not context-wide QA credentials');
  const origin = new URL(baseUrl).origin;
  const context = await browser.newContext(options);
  if (Object.keys(accessHeaders).length) {
    await context.route(url => url.origin === origin, route => route.continue({
      headers: { ...route.request().headers(), ...accessHeaders },
    }));
  }
  context.on('page', page => observeReads(page, baseUrl));
  return context;
}

export async function waitForQaIdle(page, { timeout = 20000 } = {}) {
  const state = pageStates.get(page);
  if (!state) throw new Error('QA page must be created by createQaContext before navigation');
  const startedAt = Date.now();
  // Workspaces debounce their initial fetch for up to 300ms. An empty request
  // set immediately after navigation is not evidence of a loaded destination.
  await page.waitForTimeout(350);
  let busy = 0;
  while (Date.now() - startedAt < timeout) {
    busy = await page.locator('main [aria-busy="true"]:visible, #fornost-ai-panel[aria-busy="true"]:visible').count();
    if (!state.pending.size && !busy && Date.now() - state.changedAt >= 200) {
      await page.evaluate(() => document.fonts.ready);
      // Allow the final response-driven React commit, then re-check both signals.
      await page.waitForTimeout(120);
      if (!state.pending.size && !(await page.locator('main [aria-busy="true"]:visible').count())) return;
    }
    await page.waitForTimeout(50);
  }
  const pending = [...state.pending].map(request => new URL(request.url()).pathname);
  throw new Error(`Workspace did not finish loading: busy=${busy}, pending=${JSON.stringify(pending)}`);
}

export async function switchQaLocale(page, locale) {
  if ((await page.locator('html').getAttribute('lang')) !== locale) {
    await page.locator('.language-switch:visible').getByRole('button', { name: locale.toUpperCase(), exact: true }).click();
    await page.waitForFunction(expected => document.documentElement.lang === expected, locale, { timeout: 5000 });
  }
  await waitForQaIdle(page);
}

export async function openQaModule(page, label) {
  const closeAssistant = page.locator('#fornost-ai-panel .fornost-ai-head button[data-escape-close]');
  if (await closeAssistant.isVisible()) await closeAssistant.click();
  const mobile = page.locator('.mobile-nav-toggle');
  if (await mobile.isVisible() && await mobile.getAttribute('aria-expanded') !== 'true') await mobile.click();
  const group = page.locator('#fornost-navigation .nav-group').filter({
    has: page.getByRole('button', { name: label, exact: true, includeHidden: true }),
  });
  const trigger = group.locator('.nav-group-trigger');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await group.locator('.nav-group-items').getByRole('button', { name: label, exact: true }).click();
  if (label === 'Ask Fornost') await page.locator('#fornost-ai-panel').waitFor({ state: 'visible' });
  else await page.waitForFunction(expected => document.querySelector('main>header h1')?.textContent?.trim() === expected, label);
  await waitForQaIdle(page);
}
