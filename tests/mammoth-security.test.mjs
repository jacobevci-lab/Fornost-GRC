import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import mammoth from 'mammoth';

test('DOCX styles cannot enable external file access through Object.prototype', async () => {
  const zip = new JSZip();
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml', `<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Safe document text</w:t></w:r></w:p></w:body></w:document>`);
  zip.file('word/_rels/document.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', `<w:styles xmlns:w="${ns}"><w:style w:type="__proto__" w:styleId="externalFileAccess"><w:name w:val="malicious"/></w:style></w:styles>`);
  const buffer = await zip.generateAsync({type:'nodebuffer'});
  assert.equal(Object.hasOwn(Object.prototype, 'externalFileAccess'), false);
  try {
    const html = await mammoth.convertToHtml({buffer});
    assert.equal(Object.hasOwn(Object.prototype, 'externalFileAccess'), false);
    assert.equal(html.value, '<p>Safe document text</p>');
    const text = await mammoth.extractRawText({buffer});
    assert.equal(text.value.trim(), 'Safe document text');
  } finally {
    delete Object.prototype.externalFileAccess;
  }
});

// The scoped argparse override must preserve Mammoth's legacy CLI as well as
// the library API used by document import. Exercise real files and option parsing.
test('Mammoth CLI retains DOCX conversion and legacy argument compatibility', async () => {
  const {mkdtemp, writeFile, readFile, rm} = await import('node:fs/promises');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const {createRequire} = await import('node:module');
  const {execFileSync} = await import('node:child_process');
  const require = createRequire(import.meta.url);
  const cli = require.resolve('mammoth/bin/mammoth');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], {encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe']});
  const directory = await mkdtemp(join(tmpdir(), 'fornost-docx-'));
  try {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Denetim kanıtı &amp; evidence</w:t></w:r></w:p></w:body></w:document>');
    const input = join(directory, 'evidence.docx');
    const output = join(directory, 'converted.html');
    const styles = join(directory, 'styles.txt');
    await writeFile(input, await zip.generateAsync({type: 'nodebuffer'}));
    await writeFile(styles, 'p => h2:fresh');
    assert.match(run('--help'), /--output-format/);
    assert.equal(run(input), '<p>Denetim kanıtı &amp; evidence</p>');
    run(input, output, '--style-map', styles, '--output-format', 'html');
    assert.equal(await readFile(output, 'utf8'), '<h2>Denetim kanıtı &amp; evidence</h2>');
    run(input, '--output-dir', directory);
    assert.equal(await readFile(join(directory, 'evidence.html'), 'utf8'), '<p>Denetim kanıtı &amp; evidence</p>');
    assert.throws(() => run(input, '--output-format', 'invalid'), error => error.status === 2);
    assert.throws(() => run(input, output, '--output-dir', directory), error => error.status === 2);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
