import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='https://app.fornostsecurity.com', prefix='QA-BROWSER-20261016';
const out='browser-cleanup-evidence'; await fs.mkdir(out,{recursive:true});
const access={};
if(process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){access['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;access['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;}
assert.ok(process.env.FORNOST_SMOKE_EMAIL&&process.env.FORNOST_SMOKE_PASSWORD,'Existing authorized QA credentials are required');
const browser=await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH||undefined});
const context=await browser.newContext({viewport:{width:1536,height:960}}),page=await context.newPage();
await context.route(`${base}/**`,route=>route.continue({headers:{...route.request().headers(),...access}}));
page.setDefaultTimeout(20000);
async function records(){let rows=[],cursor=null;do{const r=await context.request.get(`${base}/api/grc${cursor?'?cursor='+encodeURIComponent(cursor):''}`,{headers:access});assert.equal(r.status(),200);const b=await r.json();rows.push(...b.rows);cursor=b.nextCursor;}while(cursor);return rows.map(r=>({...r,data:JSON.parse(r.data_json)}));}
const manifest=[
 {module:'Kanıtlar',nav:'Kanıt Kütüphanesi',key:'evidenceTitle',title:`${prefix} Kanıt`,code:null},
 {module:'Kontroller',nav:'Kontrol Kütüphanesi',key:'controlTitle',title:`${prefix} Kontrol`,code:'CTL-005'},
 {module:'Uyum',nav:'Uyum Yönetimi',key:'controlTitle',title:`${prefix} Uyum Güncellendi`,code:'CMP-005'},
 {module:'BIA',nav:'İş Etki Analizi (BIA)',key:'process',title:`${prefix} BIA`,code:'BIA-006'},
 {module:'Risk Assessment',nav:'Risk Değerlendirmesi',key:'title',title:`${prefix} Risk Güncellendi`,code:'RSK-437'},
];
const results=[];
try{
 const login=await context.request.post(`${base}/api/auth`,{headers:{...access,origin:base},data:{action:'login',email:process.env.FORNOST_SMOKE_EMAIL,password:process.env.FORNOST_SMOKE_PASSWORD}});assert.equal(login.status(),200);
 const initial=await records();
 const candidates=manifest.map(item=>{const matches=initial.filter(r=>r.module===item.module&&(r.data[item.key]===item.title||(item.code==='CMP-005'&&r.data[item.key]===`${prefix} Uyum`)));assert.ok(matches.length<=1,'Ambiguous QA record');const record=matches[0];if(record){assert.equal(record.data.owner,'QA doğrulama');assert.ok(String(record.created_at).startsWith('2026-10-16'));if(item.code)assert.equal(record.record_code,item.code);else{assert.equal(record.data.controlRef,prefix);assert.ok(['2026 QA','2026QA'].includes(record.data.period));}}return{item:record?{...item,title:record.data[item.key]}:item,record};});
 const protectedIds=initial.filter(r=>!candidates.some(c=>c.record?.id===r.id)).map(r=>r.id);
 for(const {item,record} of candidates){
  if(!record){results.push({title:item.title,status:'already-absent'});continue;}
  await page.goto(base);await expect(page.locator('.shell')).toBeVisible();await page.locator('.language-switch:visible').getByRole('button',{name:'TR',exact:true}).click();
  const group=page.locator('#fornost-navigation .nav-group').filter({has:page.getByRole('button',{name:item.nav,exact:true,includeHidden:true})});
  if(await group.locator('.nav-group-trigger').getAttribute('aria-expanded')!=='true')await group.locator('.nav-group-trigger').click();
  await group.getByRole('button',{name:item.nav,exact:true}).click();
  const row=page.getByRole('row').filter({hasText:item.title});await expect(row).toHaveCount(1);await expect(row).toContainText(record.record_code);
  const dialog=page.waitForEvent('dialog');const response=page.waitForResponse(r=>r.request().method()==='DELETE'&&new URL(r.url()).pathname==='/api/grc'&&new URL(r.url()).searchParams.get('id')===record.id);
  const click=row.getByRole('button',{name:'Sil',exact:true}).click();
  const confirmation=await dialog;
  if(!confirmation.message().includes(prefix)||!confirmation.message().includes(record.record_code)){await confirmation.dismiss();throw Error('Unexpected deletion confirmation');}
  await confirmation.accept();await click;assert.equal((await response).status(),200);await expect(row).toHaveCount(0);
  results.push({code:record.record_code,title:item.title,status:'deleted-via-browser'});
  await page.screenshot({path:`${out}/${record.record_code}-removed.png`});
 }
 const final=await records();for(const id of protectedIds)assert.ok(final.some(r=>r.id===id),'An unrelated record must remain present');
 for(const {record} of candidates)if(record)assert.ok(!final.some(r=>r.id===record.id));
 assert.ok(!final.some(r=>['title','process','controlTitle','evidenceTitle'].some(key=>String(r.data[key]||'').startsWith(prefix))),'All session QA records must be absent');
 assert.ok(!final.some(r=>r.id==='AST-1f841389-dcae-4b7d-9af8-262d098b346e'),'Previously deleted QA asset stays absent');
 await fs.writeFile(`${out}/summary.json`,JSON.stringify({results,unrelatedRecordsPreserved:protectedIds.length,remainingQaRecords:0},null,2));
 console.log('BROWSER_QA_CLEANUP_PASS',JSON.stringify(results));
}catch(error){await fs.writeFile(`${out}/failure.json`,JSON.stringify({message:error.message,results},null,2));await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});throw error;}
finally{await browser.close();}
