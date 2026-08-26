import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");
const settings = readFileSync("app/settings.tsx", "utf8");
const integrations = readFileSync("app/integration-settings.tsx", "utf8");
const ui = readFileSync("app/ui-accessibility.css", "utf8");

test("admin configuration is split into focused navigation pages", () => {
  for (const label of [
    "Sistem Ayarları",
    "Ana Veri Yönetimi",
    "İş Akışı Entegrasyonları",
    "E-posta ve Bildirimler",
    "Kimlik ve Erişim",
  ]) assert.match(page, new RegExp(`"${label}"`));
  assert.match(settings, /page==="workflow"/);
  assert.match(settings, /page==="email"/);
  assert.match(settings, /page==="identity"/);
  assert.match(integrations, /kind:\s*Kind/);
});

test("navigation uses scalable icons and the final UI layer restores readable type", () => {
  assert.match(page, /function NavIcon/);
  assert.match(page, /<svg viewBox="0 0 24 24"/);
  assert.match(ui, /\.nav-group button\{[^}]*font-size:12px!important/);
  assert.match(ui, /table\{font-size:12px!important/);
  assert.match(ui, /\.evidence-stage img\{[^}]*object-fit:contain/);
});
