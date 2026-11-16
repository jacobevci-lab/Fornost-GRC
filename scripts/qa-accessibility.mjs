import axe from 'axe-core';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Keep every frame's sandbox/CSP unchanged and audit each document explicitly.
// Sandboxed documents cannot run axe's timers either: audit an inert DOM copy
// in a separate, unauthenticated, network-blocked context, not a relaxed preview.
export async function scanAccessibility(page, { timeoutMs = 30_000 } = {}) {
  let timer;
  let phase = 'frame inventory';
  const copies = [];
  const scan = async () => {
    const frames = page.frames();
    const violations = [], incomplete = [], coverage = [];
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      phase = `frame ${index}: preparation`;
      const framePath = [];
      let scriptBlocked = false;
      for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
        const element = await current.frameElement();
        try {
          const sandbox = await element.getAttribute('sandbox');
          if (sandbox !== null && !sandbox.split(/\s+/).includes('allow-scripts')) scriptBlocked = true;
          framePath.unshift(await element.evaluate(el => {
            const parts = [];
            for (let node = el; node?.nodeType === 1; node = node.parentElement) {
              if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
              const same = [...(node.parentElement?.children || [])].filter(sibling => sibling.tagName === node.tagName);
              parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${same.indexOf(node) + 1})`);
            }
            return parts.join(' > ');
          }));
        } finally { await element.dispose(); }
      }
      let target = frame;
      if (scriptBlocked) {
        const snapshot = await frame.evaluate(() => {
          const root = document.documentElement.cloneNode(true);
          root.querySelectorAll('script').forEach(el => el.remove());
          root.querySelectorAll('*').forEach(el => {
            for (const attribute of [...el.attributes]) if (/^on/i.test(attribute.name)) el.removeAttribute(attribute.name);
          });
          // Child documents get their own scan from the original frame tree.
          root.querySelectorAll('iframe,frame').forEach(el => { el.removeAttribute('src'); el.removeAttribute('srcdoc'); });
          const csp = document.createElement('meta');
          csp.httpEquiv = 'Content-Security-Policy';
          csp.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
          root.querySelector('head').prepend(csp);
          return { html: '<!doctype html>' + root.outerHTML, width: innerWidth, height: innerHeight };
        });
        const copy = await page.context().browser().newContext({
          viewport: { width: Math.max(1, snapshot.width), height: Math.max(1, snapshot.height) },
          serviceWorkers: 'block',
        });
        copies.push(copy);
        await copy.route('**/*', route => route.abort());
        target = await copy.newPage();
        await target.setContent(snapshot.html, { waitUntil: 'domcontentloaded' });
      }
      phase = `frame ${index}: axe injection`;
      await target.evaluate(axe.source);
      phase = `frame ${index}: axe analysis`;
      const result = await target.evaluate(async runTags => window.axe.run(document, {
        runOnly: { type: 'tag', values: runTags },
        // Child documents are scanned below, including opaque sandbox origins.
        iframes: false,
      }), tags);
      const scoped = items => items.map(item => ({ ...item, nodes: item.nodes.map(node => ({
        ...node, target: [...framePath, ...node.target],
      })) }));
      violations.push(...scoped(result.violations));
      incomplete.push(...scoped(result.incomplete));
      coverage.push({ index, framePath, status: 'scanned', mode: scriptBlocked ? 'isolated-document-copy' : 'live-document', violations: result.violations.length, incomplete: result.incomplete.length });
    }
    if (page.frames().length !== frames.length || frames.some(frame => frame.isDetached())) {
      throw new Error('Frame tree changed during accessibility scan; coverage is incomplete');
    }
    return { violations, incomplete, frames: coverage };
  };
  try {
    return await Promise.race([
      scan(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Accessibility scan exceeded ${timeoutMs}ms at ${phase}; coverage is incomplete`)), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
    await Promise.all(copies.map(context => context.close()));
  }
}
