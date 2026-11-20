// Exercise only a disposable loopback QA installation with a bootstrapped admin.
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';

const base='http://127.0.0.1:4173', iso='ISO/IEC 27001:2022', soc='SOC 2 Trust Services Criteria', tag=Date.now(), period='Q3 2026 · '+tag;
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const ctx=await browser.newContext({viewport:{width:1500,height:960}}),page=await ctx.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function api(path,body,status=200,context=ctx){
  const r=await context.request.fetch(base+path,{method:body?'POST':'GET',data:body,headers:{origin:base}});
  assert.equal(r.status(),status,(await r.text()).slice(0,350));return r.json();
}
const endpoint='/api/framework-posture';
const matrix=n=>api(endpoint+'?name='+encodeURIComponent(n));
const go=async name=>page.locator('nav button[aria-label="'+name+'"]').evaluate(e=>e.click());
try{
  await api('/api/auth',{action:'login',email:'qa-admin@fornost.test',password:qaPassword()});
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();
  await page.locator('.language-switch:visible').getByRole('button',{name:'EN',exact:true}).click();
  await go('Compliance Management');
  const work=page.locator('.posture-workspace');
  if(!(await api(endpoint)).enrolled.includes(iso)){
    await expect(work.getByRole('button',{name:'ISO 27001 In catalog'})).toBeVisible();
    await work.getByRole('button',{name:'+ Add framework',exact:true}).click();
    await work.getByLabel('Choose from catalog').selectOption(iso);
    await work.getByRole('button',{name:'Add to scope',exact:true}).click();
  }
  await work.getByRole('button',{name:/^ISO 27001.*%/}).click();
  await expect(work.getByRole('button',{name:/^Open requirements/})).toBeVisible();
  const tree=work.getByRole('region',{name:'Requirement outline'});
  await tree.getByRole('searchbox',{name:'Search outline'}).fill('A.5.1');
  await tree.getByRole('button',{name:/^A\.5\.1 /}).click();
  const editor=page.locator('.posture-editor');
  await expect(editor.locator('xpath=ancestor::tr/preceding-sibling::tr[1]')).toContainText('A.5.1');
  await editor.locator('.posture-soa summary').click();
  await editor.getByLabel('Applicability').selectOption('included');
  await editor.getByLabel('Decision rationale').fill('Identity governance is in scope');
  await editor.getByRole('button',{name:'Create new control'}).click();
  for(const [field,value] of [['Control reference','POSTURE-'+tag],['Control title','Quarterly access review '+tag],['Control owner','IAM'],['Frequency','Quarterly']])await editor.getByLabel(field,{exact:true}).fill(value);
  await editor.getByRole('button',{name:'Create draft'}).click();
  await expect(editor.getByRole('status')).toContainText('Draft added');
  await editor.getByRole('button',{name:'Save mapping'}).click();
  await expect.poll(async()=>((await matrix(iso)).requirements.find(r=>r.ref==='A.5.1')).links.length).toBeGreaterThan(0);
  const m=await matrix(iso),control=m.controls.find(c=>c.title==='Quarterly access review '+tag);
  assert.ok(control); assert.equal(m.requirements.length,123);
  await api(endpoint,{action:'enroll',name:soc});
  await api(endpoint,{action:'save',name:soc,ref:'CC1.1',revision:(await matrix(soc)).requirements[0].revision,applicability:'required',links:[{id:control.id,coverage:'partial'}]});
  assert.equal((await api(endpoint+'?controlId='+control.id)).impact.length,2);
  await go('Control Library');
  await page.getByPlaceholder('Search records').fill('Quarterly access review '+tag);
  await page.locator('button[data-record-id="'+control.id+'"]:visible').first().click();
  await expect(page.locator('.record-workspace .posture-impact')).toContainText('CC1.1');
  const file=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=','base64');
  for(const [evidencePeriod,status] of [[period,'Onaylandı'],[period,'İncelemede'],['Q2 2026','Onaylandı']]){
    const r=await ctx.request.post(base+'/api/evidence',{headers:{origin:base},multipart:{evidenceTitle:'Access evidence '+evidencePeriod,owner:'IAM',period:evidencePeriod,controlRef:control.code,status,file:{name:'sample.png',mimeType:'image/png',buffer:file}}});
    assert.equal(r.status(),201,await r.text());
  }
  await go('Audit Management');
  await page.getByRole('button',{name:'+ New Audit',exact:true}).click();
  const form=page.locator('form').filter({has:page.getByLabel('Template / option')});
  await form.getByLabel('Template / option').selectOption(iso);
  await form.getByLabel('Audit name').fill('Framework QA '+tag);
  await form.getByRole('checkbox',{name:'Reuse existing controls and approved period evidence'}).check();
  await form.getByLabel('Evidence period').fill(period);
  await form.getByRole('button',{name:'Preview period'}).click();
  await expect(form).toContainText('1 requirements with approved evidence');
  await form.locator('button.primary').last().click();
  const frozen=page.locator('details').filter({has:page.locator('summary',{hasText:'Controls and evidence at audit start'})}).first();
  await frozen.locator('summary').first().click();
  await expect(frozen).toContainText('A.5.1');
  const audit=(await api('/api/audits')).audits.find(a=>a.name==='Framework QA '+tag);
  await frozen.getByText(/^A\.5\.1 ·/).click();
  await expect(frozen.getByRole('button',{name:'Open audit requirement'})).toBeVisible();
  let cursor='',assessed;
  do{
    const batch=await api('/api/grc'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
    assessed=batch.rows.filter(r=>r.module==='Denetim Yönetimi').map(r=>JSON.parse(r.data_json)).find(r=>r.auditName===audit.name && r.requirementRef==='A.5.1');
    cursor=batch.nextCursor;
  }while(!assessed && cursor);
  assert.ok(assessed);
  assert.equal(assessed.evidenceStatus,'İncelemede');assert.equal(assessed.status,'Başlanmadı');assert.equal(assessed.progress,0);
  const snapshot=(await api(endpoint+'?auditId='+audit.id)).baseline;
  assert.equal(snapshot.withEvidence,1);assert.equal(Object.keys(snapshot.evidence).length,1);
  const before=await api(endpoint+'?name='+encodeURIComponent(iso)+'&period='+encodeURIComponent(period));
  const row=(await matrix(iso)).requirements.find(r=>r.ref==='A.5.1');
  await api(endpoint,{action:'save',name:iso,ref:row.ref,revision:row.revision,reason:'Scope changed after audit start',applicability:'excluded',links:[]});
  await api('/api/audits',{name:'Stale preview '+tag,template:iso,posture:{period,token:before.token}},409);
  assert.deepEqual((await api(endpoint+'?auditId='+audit.id)).baseline,snapshot);
  await go('Compliance Management');
  await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
  await expect(work.getByRole('heading',{name:'Madde ağacı'})).toBeVisible();
  await expect(work.getByRole('button',{name:/^ISO 27001.*%/})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await work.getByRole('button',{name:'Madde ağacı',exact:true}).click();
  const mobileTree=work.getByRole('region',{name:'Madde ağacı'});
  await mobileTree.getByRole('searchbox',{name:'Madde ağacında ara'}).fill('A.5.18');
  await mobileTree.getByRole('button',{name:/^A\.5\.18 /}).click();
  await expect(work.locator('.posture-editor')).toBeVisible();
  const mobileEditor=work.locator('.posture-editor');
  await mobileEditor.getByRole('searchbox',{name:'Kontrol ara'}).fill(control.code);
  await mobileEditor.getByLabel('Mevcut kontrol',{exact:true}).selectOption(control.id);
  await mobileEditor.getByRole('button',{name:'Bağla ve kaydet'}).click();
  await expect.poll(async()=>((await matrix(iso)).requirements.find(r=>r.ref==='A.5.18')).links.map(l=>l.id)).toContain(control.id);
  await expect(work.getByRole('status')).toContainText('Madde güncellendi');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'mobile viewport overflow');
  const toggle=page.locator('.theme-toggle:visible');
  await toggle.click();
  await expect(work.locator('.posture-strip')).toBeVisible();
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'Özel gereksinimler ve mevcut kayıtlar'}).click();
  await expect(page.getByRole('button',{name:'Çerçeve matrisine dön'})).toBeVisible();
  assert.deepEqual(errors,[]);
  console.log('PASS: framework enrollment, control creation and reuse, cross-framework impact, SoA, period/version filtering, frozen audit, stale preview rejection and TR/EN register navigation.');
}finally{await browser.close();}
