import axe from 'axe-core';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Inject trusted test instrumentation through Playwright, not a page <script>.
// axe-playwright's script-execution probe hangs in sandbox="" report previews.
// Keep every frame's sandbox/CSP unchanged and audit each document explicitly.
export async function scanAccessibility(page, { timeoutMs = 30_000 } = {}) {
  let timer;
  const scan = async () => {
    const frames = page.frames();
    const violations = [], incomplete = [], coverage = [];
    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      const framePath = [];
      for (let current = frame; current.parentFrame(); current = current.parentFrame()) {
        const element = await current.frameElement();
        try {
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
      await frame.evaluate(axe.source);
      const result = await frame.evaluate(async runTags => window.axe.run(document, {
        runOnly: { type: 'tag', values: runTags },
        // Child documents are scanned below, including opaque sandbox origins.
        iframes: false,
      }), tags);
      const scoped = items => items.map(item => ({ ...item, nodes: item.nodes.map(node => ({
        ...node, target: [...framePath, ...node.target],
      })) }));
      violations.push(...scoped(result.violations));
      incomplete.push(...scoped(result.incomplete));
      coverage.push({ index, framePath, status: 'scanned', violations: result.violations.length, incomplete: result.incomplete.length });
    }
    if (page.frames().length !== frames.length || frames.some(frame => frame.isDetached())) {
      throw new Error('Frame tree changed during accessibility scan; coverage is incomplete');
    }
    return { violations, incomplete, frames: coverage };
  };
  try {
    return await Promise.race([
      scan(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Accessibility scan exceeded ${timeoutMs}ms; coverage is incomplete`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
