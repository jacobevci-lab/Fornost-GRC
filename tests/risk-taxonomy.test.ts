import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("risk form supports a listed-company taxonomy and multiple related assets",async()=>{
 const page=await readFile("app/page.tsx","utf8");
 for(const category of [
  "İnsan Kaynakları",
  "Sermaye Piyasaları ve KAP",
  "Kurumsal Yönetim",
  "Finansal Raporlama ve İç Kontrol",
  "Suistimal, Etik ve Yolsuzluk",
  "ESG, Sürdürülebilirlik ve İklim",
 ])assert.match(page,new RegExp(category));
 const editor=await readFile("app/risk-editor-fields.tsx","utf8");
 assert.match(page,/<RiskAssets /);
 assert.match(editor,/aria-pressed=\{selectedRows.has/);
 assert.match(editor,/riskScope:"organization",asset:""/);
});
