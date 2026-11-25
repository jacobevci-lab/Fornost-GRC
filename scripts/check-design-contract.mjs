// Prevent competing per-module typography from returning after source cleanup.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import ts from 'typescript';

const walk = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const failures = [];
const properties = new Set(['font', 'font-family', 'font-size', 'font-weight', 'line-height']);
const inline = new Set(['font', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight']);
const owners = new Set(['app/compact-typography.css', 'app/compact-density.css']);
let styles = 0, components = 0;
for (const file of walk('app')) {
  if (file.endsWith('.css')) {
    styles++;
    if (owners.has(file)) continue;
    postcss.parse(readFileSync(file, 'utf8'), { from: file }).walkDecls(declaration => {
      if (!properties.has(declaration.prop)) return;
      let parent = declaration.parent;
      while (parent && parent.type !== 'rule') parent = parent.parent;
      // Generated icons and native file buttons are explicit non-text geometry.
      if (parent && /::(?:before|after|marker|placeholder|file-selector-button)|:(?:before|after)\b/.test(parent.selector)) return;
      failures.push(`${file}:${declaration.source.start.line}: ${declaration.prop} belongs to the shared typography contract`);
    });
  } else if (file.endsWith('.tsx')) {
    components++;
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isJsxAttribute(node) && node.name.text === 'style' && node.initializer &&
          ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
        for (const property of node.initializer.expression.properties) {
          if (property.name && inline.has(property.name.getText(source).replace(/["']/g, '')))
            failures.push(`${file}:${source.getLineAndCharacterOfPosition(property.pos).line + 1}: inline typography`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log(`DESIGN_CONTRACT_PASS: ${styles} stylesheets, ${components} components; shared typography ownership`);
