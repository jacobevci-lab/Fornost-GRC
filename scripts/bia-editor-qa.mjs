import assert from 'node:assert/strict';
import {expect} from '@playwright/test';
import {qaPassword} from './qa-credentials.mjs';

// The caller uses the isolated CI installation and its explicit synthetic records.
export async function verifyBiaEditor(page,api,open){
  const base="http://127.0.0.1:4173",moduleName="Business Impact Analysis (BIA)",dialog=page.locator(".record-dialog");
  const records=(await api("/api/grc")).rows,fixture=m=>records.find(r=>r.module===m && /^[A-Z]{3}-\d+$/.test(r.record_code));
  const asset=fixture("Varlık Envanteri"),vendor=fixture("Tedarikçiler"),other=fixture("BIA");
  const process="QA recovery "+crypto.randomUUID(),owner="qa-admin@fornost.test",approver="bia-"+crypto.randomUUID()+"@fornost.test";
  const row=page.locator(".bia-table tbody tr").filter({hasText:process});
  async function write(path,data,status){
    const response=await page.request.post(base+path,{headers:{origin:base},data});
    assert.equal(response.status(),status,await response.text());return response.json();
  }
  async function choose(label,query){
    const input=dialog.getByRole("combobox",{name:label,exact:true});await input.fill(query);
    await dialog.getByRole("listbox",{name:label,exact:true}).getByRole("option",{name:new RegExp(query)}).click();
  }
  async function save(method){
    const [r]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/grc"&&r.request().method()===method),dialog.locator(".form-actions .primary").click()]);
    assert.ok(r.ok(),await r.text());const result=await r.json();await expect(dialog).toHaveCount(0);return result;
  }
  let userId,biaId,planId;
  try{
    userId=(await write("/api/users",{name:"BIA QA reviewer",email:approver,password:qaPassword(),role:"Editor"},201)).id;
    await open(moduleName);await page.locator(".module-head .primary").click();
    await dialog.locator("[name=process]").fill(process);
    for(const key of ["processCategory","businessUnit","criticality"])await dialog.locator("[name="+key+"]").selectOption({index:1});
    await choose("Owner · search name or email",owner);
    await dialog.locator("select[name=asset]").selectOption(asset.record_code);
    await dialog.locator("[name=rto]").fill("8");await dialog.locator("[name=rpo]").fill("0");await dialog.locator("[name=mtpd]").fill("4");
    await expect(dialog.getByRole("alert")).toContainText("RTO cannot exceed");assert.equal(await dialog.locator("[name=rto]").evaluate(e=>e.checkValidity()),false);
    await dialog.locator("[name=mtpd]").fill("8");await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button",{name:"Show advanced fields"}).click();
    for(const key of ["rto","rpo","mtpd"])await expect(dialog.locator("[name="+key+"]")).toHaveCount(1);
    await expect(dialog.locator(".bia-impact")).toContainText("0/6");await dialog.locator("[name=financial]").selectOption("5");await dialog.locator("[name=operational]").selectOption("2");await expect(dialog.locator(".bia-impact")).toContainText("3.5");
    await dialog.getByRole("tab",{name:"Dependencies",exact:true}).click();await choose("Technology / system dependencies",asset.record_code);await choose("Supplier dependencies",vendor.record_code);
    await dialog.getByRole("tab",{name:"Recovery strategy & resilience"}).click();await dialog.locator("[name=drStatus]").selectOption("Mevcut");await dialog.locator("[name=manualWorkaround]").selectOption("Hayır");
    await dialog.getByRole("tab",{name:"Exercises, testing & BIA approval"}).click();
    const reviewer="BIA approver · search name or email";
    await dialog.getByRole("combobox",{name:reviewer}).fill(owner);
    await expect(dialog.getByRole("listbox",{name:reviewer})).toHaveAttribute("aria-busy","false");await expect(dialog.getByRole("listbox",{name:reviewer}).getByRole("option",{name:new RegExp(owner)})).toHaveCount(0);
    await choose(reviewer,approver);await dialog.locator("[name=testResult]").selectOption("Test Edilmedi");await dialog.locator("[name=nextTestDate]").fill("2020-06-03");
    const created=await save("POST");biaId=created.id;
    await page.locator(".register-search input").fill(process);await expect(row).toContainText("Awaiting first test");await expect(row).not.toContainText("Test Overdue");
    await expect(row.locator(".title-stack small")).toContainText(asset.record_code);await expect(row.getByRole("img",{name:"DR · Active"})).toBeVisible();
    await row.getByRole("button",{name:"+ Create plan"}).click();
    const planForm=page.locator(".continuity-form");await expect(planForm.locator("[name=biaRef]")).toHaveValue(created.code);await expect(planForm.locator("[name=rpoHours]")).toHaveValue("0");await expect(planForm.locator("[name=mtpdHours]")).toHaveValue("8");
    await page.keyboard.press("Escape");await open(moduleName);
    await page.locator(".language-switch:visible").getByRole("button",{name:"TR",exact:true}).click();
    if(await page.locator("html").getAttribute("data-theme")!=="dark")await page.locator(".theme-toggle:visible").click();
    await row.getByRole("button",{name:"Düzenle",exact:true}).click();await dialog.getByRole("button",{name:"Gelişmiş alanları göster"}).click();
    await dialog.getByRole("tab",{name:"Bağımlılıklar",exact:true}).click();await expect(dialog.getByRole("button",{name:new RegExp(vendor.record_code)})).toBeVisible();
    await page.setViewportSize({width:390,height:900});assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+2));
    await dialog.getByRole("tab",{name:"Tatbikat, Test & BIA Onayı"}).click();await dialog.locator("[name=lastTestDate]").fill("2026-01-15");await dialog.locator("[name=testResult]").selectOption("Başarılı");await save("PATCH");await expect(row).toContainText("15.01.2026");
    const data=JSON.parse((await api("/api/grc")).rows.find(r=>r.id===biaId).data_json);
    assert.deepEqual(data.supplierRefs,[vendor.id]);assert.deepEqual(data.technologyRefs,[asset.id]);assert.equal(data.approverEmail,approver);
    await write("/api/grc",{module:"BIA",data:{...data,approver:data.owner,approverEmail:data.ownerEmail}},400);
    await write("/api/grc",{module:"BIA",data:{...data,rto:"9"}},400);
    await page.setViewportSize({width:1363,height:936});await page.locator(".language-switch:visible").getByRole("button",{name:"EN",exact:true}).click();await page.locator(".theme-toggle:visible").click();

    const name="Linked plan "+crypto.randomUUID();
    planId=(await write("/api/continuity",{action:"create-plan",name,process:"Fixture recovery",biaRef:other.record_code,criticality:"high",owner,reviewer:approver,crisisLead:"exercise@example.test",rtoHours:4,rpoHours:0,mtpdHours:8,dependencies:"Primary application",recoveryStrategy:"Recover from the verified backup",communicationPlan:"Contact the recovery team",minimumStaff:2,reviewDate:"2028-11-20"},201)).id;
    await page.reload();await open(moduleName);await page.locator(".register-search input").fill(other.record_code);
    const plan=(await api("/api/continuity")).plans.find(p=>p.id===planId);
    await page.locator(".bia-table").getByRole("button",{name:plan.code,exact:true}).click();
    await expect(page.locator(".cpd-file h3")).toHaveText(name);
  }finally{
    if(planId){const p=(await api("/api/continuity")).plans.find(p=>p.id===planId);if(p?.status==="draft")await api("/api/continuity","POST",{action:"cancel-plan",planId,expectedUpdatedAt:p.updatedAt,confirmation:"PLANI İPTAL ET",note:"Retire the isolated BIA navigation test draft."});}
    if(biaId)await api("/api/grc?id="+encodeURIComponent(biaId),"DELETE");
    if(userId){const users=(await api("/api/users")).users;const u=users.find(p=>p.id===userId);if(u)await api("/api/users","DELETE",{id:userId,email:approver,expectedRevision:u.revision});}
  }
}
