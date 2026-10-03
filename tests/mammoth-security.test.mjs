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
