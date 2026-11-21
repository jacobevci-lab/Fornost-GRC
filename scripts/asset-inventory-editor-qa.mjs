import assert from "node:assert/strict";
import { expect } from "@playwright/test";

export async function verifyAssetInventoryEditor(page,api,open) {
  // Parent QA runs on an isolated loopback installation with canonical sample records.
  const records=(await api("/api/grc")).rows;
  const catalog=module=>records.find(r=>r.module===module && /^[A-Z]{3}-\d+$/.test(r.record_code));
  const dependency=catalog("Varlık Envanteri"),bia=catalog("BIA"),vendor=catalog("Tedarikçiler");
  assert.ok(dependency && bia && vendor);
  const title="QA inventory "+crypto.randomUUID(),email="qa-admin@fornost.test",dialog=page.locator(".record-dialog");
  let assetId,riskId;
  async function save(method){
    const [response]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==="/api/grc" && r.request().method()===method),dialog.locator(".form-actions .primary").click()]);
    assert.ok(response.ok(),await response.text());return response.json();
  }
  async function choose(label,query){
    const input=dialog.getByRole("combobox",{name:label,exact:true});
    await input.fill(query);await expect(dialog.getByRole("listbox",{name:label,exact:true}).getByRole("option",{name:new RegExp(query)})).toBeVisible();
    await input.press("ArrowDown");await input.press("Enter");
  }
  const search=page.locator(".register-search input"),row=page.locator(".smart-table tbody tr").filter({hasText:title});
  try{
    await open("Asset Inventory");
    // A wide inventory table scrolls inside the register in both locales.
    for(const language of ["TR","EN"]){
      await page.locator(".language-switch:visible").getByRole("button",{name:language,exact:true}).click();
      await expect(page.locator(".asset-coverage").first()).toBeVisible();
      for(const width of [1440,1366]){
        await page.setViewportSize({width,height:936});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),language+" asset inventory exceeds "+width+"px");
      }
      await expect(page.locator(".asset-coverage").first().getByRole("img",{name:/EDR · /})).toBeVisible();
    }
    await page.setViewportSize({width:1363,height:936});
    // Existing installations already have a saved v2 layout without the links column.
    await page.evaluate(()=>{
      const columns=JSON.parse(localStorage.getItem("fornost-grc-columns") || "{}");
      columns["Varlık Envanteri"]=["title","coverage","lifecycle","criticality"];
      localStorage.setItem("fornost-grc-columns",JSON.stringify(columns));
      localStorage.setItem("fornost-grc-column-layout","v2");
      localStorage.removeItem("fornost-asset-links-column");
    });
    await page.reload();await open("Asset Inventory");
    await expect(page.locator(".smart-table th").filter({hasText:"Risk / BIA Links"})).toBeVisible();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("fornost-grc-columns"))["Varlık Envanteri"]),["title","assetLinks","coverage","lifecycle","criticality"]);
    await page.locator(".module-head .primary").click();
    await dialog.locator('[name=title]').fill(title);
    for(const key of ["assetType","businessUnit","criticality"])await dialog.locator('select[name='+key+']').selectOption({index:1});
    await choose("Owner · search name or email",email);
    await dialog.locator('[name=status]').selectOption("Planlanan");
    await dialog.getByRole("button",{name:"Show advanced fields"}).click();
    await expect(dialog.locator('[name=status]')).toHaveCount(1);await expect(dialog.locator('[name=criticality]')).toHaveCount(1);
    await dialog.getByRole("button",{name:"KVKK",exact:true}).click();await dialog.getByRole("button",{name:"DORA",exact:true}).click();
    await dialog.getByRole("button",{name:"Infrastructure & lifecycle"}).click();
    await dialog.locator('[name=environment]').selectOption({index:1});
    await dialog.getByRole("button",{name:"Security control posture"}).click();
    await dialog.locator('[name=edrStatus]').selectOption("Kapsamda");await dialog.locator('[name=siemStatus]').selectOption("Kapsam Dışı");
    await dialog.getByRole("button",{name:"Connections & review"}).click();
    await choose("Search manufacturer / vendor",vendor.record_code);
    await choose("Search critical dependencies (asset / BIA)",dependency.record_code);
    await choose("Search critical dependencies (asset / BIA)",bia.record_code);
    const created=await save("POST");assetId=created.id;await expect(dialog).toHaveCount(0);
    const response=await page.request.post("http://127.0.0.1:4173/api/grc",{headers:{origin:"http://127.0.0.1:4173"},data:{module:"Risk Assessment",data:{title:title+" linked risk",owner:"Asset QA",asset:created.code}}});
    assert.ok(response.ok(),await response.text());riskId=(await response.json()).id;
    await page.reload();await open("Asset Inventory");await search.fill(title);
    await expect(row.locator(".title-stack b")).toHaveText(title);
    await expect(row.locator(".asset-coverage [data-state=covered]")).toContainText("EDR");await expect(row.locator(".asset-coverage [data-state=gap]")).toContainText("SIEM");
    await expect(row.locator(".asset-coverage [data-state=unknown]")).toHaveCount(2);
    await row.getByRole("button",{name:"1 Risk",exact:true}).click();
    await expect(page.locator(".risk-table tbody tr")).toHaveCount(1);await expect(page.locator(".risk-table")).toContainText(title+" linked risk");
    await open("Asset Inventory");await search.fill(title);await row.getByRole("button",{name:"1 BIA",exact:true}).click();
    await expect(page.locator(".smart-table tbody tr")).toHaveCount(1);await expect(page.locator(".smart-table")).toContainText(bia.record_code);
    await open("Asset Inventory");await search.fill(title);
    await page.locator(".language-switch:visible").getByRole("button",{name:"TR",exact:true}).click();
    if(await page.locator("html").getAttribute("data-theme")!=="dark")await page.locator(".theme-toggle:visible").click();
    await row.locator(".row-actions button").first().click();
    await dialog.getByRole("button",{name:"Gelişmiş alanları göster"}).click();
    await expect(dialog.getByRole("button",{name:"DORA",exact:true})).toHaveAttribute("aria-pressed","true");
    await dialog.getByRole("button",{name:"Bağlantılar & Gözden Geçirme"}).click();
    await expect(dialog.getByRole("button",{name:new RegExp("Kaldır · .*"+vendor.record_code)})).toBeVisible();
    await page.setViewportSize({width:390,height:900});
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2));
    await dialog.getByRole("button",{name:new RegExp("Kaldır · .*"+bia.record_code)}).click();
    await dialog.getByRole("button",{name:"Kayıtlı olmayan üretici gir"}).click();
    await dialog.locator('[name=externalVendor]').fill("Unregistered QA manufacturer");
    await save("PATCH");await expect(dialog).toHaveCount(0);
    const data=JSON.parse((await api("/api/grc")).rows.find(r=>r.id===assetId).data_json);
    assert.deepEqual(data.dependencyRefs,[dependency.id]);assert.equal(data.externalVendor,"Unregistered QA manufacturer");assert.equal(data.vendor,"");
    assert.equal(data.status,"Planlanan");assert.equal(data.lifecycleStage,undefined);assert.equal(data.ownerEmail,email);
    await expect(row.getByRole("button",{name:"0 BIA",exact:true})).toBeVisible();
    await page.setViewportSize({width:1363,height:936});
    await page.locator(".language-switch:visible").getByRole("button",{name:"EN",exact:true}).click();
    if(await page.locator("html").getAttribute("data-theme")==="dark")await page.locator(".theme-toggle:visible").click();
  }catch(error){
    console.error("Asset inventory QA failed",error.message,await dialog.ariaSnapshot({timeout:1000}).catch(()=>""));
    throw error;
  }finally{
    if(riskId)await api("/api/grc?id="+encodeURIComponent(riskId),"DELETE");
    if(assetId)await api("/api/grc?id="+encodeURIComponent(assetId),"DELETE");
  }
}
