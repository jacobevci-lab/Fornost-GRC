import {chromium,expect} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createQaContext,waitForQaIdle} from './qa-browser-harness.mjs';
import {qaPassword} from './qa-credentials.mjs';

const base='http://127.0.0.1:4173',tag=Date.now(),owner='qa-admin@fornost.test';
const f=JSON.parse(await readFile('workflow-evidence-selection-qa-artifacts/fixture.json','utf8'));
const statement='Access permissions must be reviewed by the policy owner every quarter and evidence of the independent review must be retained.';
const zip=new JSZip();
const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml',`<w:document xmlns:w="${ns}"><w:body><w:p><w:r><w:t>Türkçe erişim ilkeleri</w:t></w:r></w:p><w:p><w:r><w:t>${statement}</w:t></w:r></w:p></w:body></w:document>`);
const docx=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
const pdf=await PDFDocument.create(),p=pdf.addPage();
p.drawText('Policy PDF source.',{x:20,y:700});p.drawText(statement,{size:9,x:20,y:680});
const pdfBytes=Buffer.from(await pdf.save());
const scan=await PDFDocument.create();scan.addPage();
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await createQaContext(browser,base,{}, {viewport:{width:1440,height:960}});
const viewer=await createQaContext(browser,base,{},{}),anonymous=await createQaContext(browser,base,{},{});
const page=await context.newPage();page.setDefaultTimeout(20000);
const docxType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
async function login(ctx,email){const r=await ctx.request.post(base+'/api/auth',{headers:{origin:base},data:{action:'login',email,password:qaPassword()}});assert.equal(r.status(),200);}
async function open(){
 await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
 await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
 await page.locator('nav button[aria-label="Policy Center"]').evaluate(b=>b.click());
 await page.getByRole('button',{name:'Import Word / PDF',exact:true}).click();
 return page.getByRole('dialog',{name:'Import a policy document'});
}
try{
 await login(context,owner);await login(viewer,f.viewerEmail);
 const existingTitle='Existing import destination '+tag;
 const record=await context.request.post(base+'/api/policy-lifecycle',{headers:{origin:base},data:{action:'save-policy',assignmentMode:'directory',code:'POL-OLD-'+tag,title:existingTitle,owner,reviewer:f.reviewerEmail,classification:'internal',category:'security',audience:'Security team',reviewFrequencyDays:365}});
 assert.equal(record.status(),200,await record.text());const existing=(await record.json()).id;
 const first=await open();
 await first.getByLabel('Policy file').setInputFiles({name:'archived.doc',mimeType:'application/msword',buffer:Buffer.from('old format')});
 await expect(first.getByRole('alert')).toContainText('.docx');
 await first.getByLabel('Policy file').setInputFiles({name:'scan.pdf',mimeType:'application/pdf',buffer:Buffer.from(await scan.save())});
 await expect(first.getByRole('alert')).toContainText('OCR');
 for(const [i,filename,mime,buffer] of [[0,'Erişim politikası.docx',docxType,docx],[1,'Access policy.pdf','application/pdf',pdfBytes]]){
  const dialog=i?await open():first;
  await dialog.getByLabel('Policy file').setInputFiles({name:filename,mimeType:mime,buffer});
  const content=dialog.getByLabel('Policy text',{exact:true});await expect(content).toHaveValue(new RegExp(i?'Policy PDF source':'Türkçe erişim'));
  await expect(content).toHaveValue(new RegExp('Access permissions must be reviewed'));
  const edited=(await content.inputValue())+'\nReviewed import text.';await content.fill(edited);
  if(i){await dialog.getByLabel('Import destination').selectOption('existing');await dialog.getByLabel('Policy',{exact:true}).selectOption(existing);}
  else{
   await dialog.getByLabel('Policy code',{exact:true}).fill('POL-NEW-'+tag);
   await dialog.getByLabel('Title',{exact:true}).fill('Imported document '+tag);
   await dialog.getByLabel('Policy owner',{exact:true}).selectOption(owner);
   await dialog.getByLabel('Independent reviewer',{exact:true}).selectOption(f.reviewerEmail);
  }
  await dialog.getByLabel('Planned effective date',{exact:true}).fill('2026-11-11');await dialog.getByLabel('Regulation references').fill('ISO 27001');
  await page.setViewportSize({width:i?1440:390,height:900});
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
  const save=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/policy-lifecycle');
  await dialog.getByRole('button',{name:'Import as draft',exact:true}).click();
  const result=await save;assert.equal(result.status(),200,await result.text());const payload=await result.json();
  if(i)assert.equal(payload.policyId,existing);
  const version=page.getByRole('dialog',{name:'Version comparison'});await expect(version).toContainText(edited.trim().split('\n').at(-1));await expect(version).toContainText('v1 · Draft');
  const link=version.getByRole('link',{name:/Download original file/}),url=new URL(await link.getAttribute('href'),base).href;
  const original=await context.request.get(url);assert.equal(original.status(),200);assert.deepEqual(await original.body(),buffer);
  assert.match(original.headers()['content-disposition'],/attachment/);
  assert.equal((await anonymous.request.get(url)).status(),401);
  assert.equal(await version.locator('.pim-original small').textContent(),'SHA-256 · '+createHash('sha256').update(buffer).digest('hex'));
  await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:960});await waitForQaIdle(page);
 }
 const denied=await viewer.request.post(base+'/api/policy-lifecycle',{headers:{origin:base},multipart:{operation:'preview',file:{name:'policy.pdf',mimeType:'application/pdf',buffer:pdfBytes}}});assert.equal(denied.status(),403);
 console.log('POLICY_DOCUMENT_IMPORT_QA_PASS');
}finally{await browser.close();}
