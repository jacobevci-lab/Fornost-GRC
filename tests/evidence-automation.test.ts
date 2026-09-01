import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui=readFileSync("app/evidence-automation.tsx","utf8");
const route=readFileSync("app/api/evidence-automation/route.ts","utf8");
const premiumCss=readFileSync("app/fornost-premium.css","utf8");
const refreshCss=readFileSync("app/fornost-refresh.css","utf8");
const finalCss=readFileSync("app/final-polish.css","utf8");

test("evidence automation is vendor neutral and maps results to controls",()=>{
  for(const vendor of ["Fortinet","Palo Alto","CrowdStrike","Cortex XDR","CyberArk","Purview DLP","Guardium","Generic REST"])
    assert.match(ui,new RegExp(vendor.replace(" / ",".*")));
  assert.match(route,/control_refs/);
  assert.match(route,/simple_grc_records/);
  assert.match(route,/response_hash/);
});

test("collector enforces outbound and payload safety boundaries",()=>{
  assert.match(route,/safeHttpUrl/);
  assert.match(route,/redirect:"error"/);
  assert.match(route,/AbortSignal\.timeout/);
  assert.match(route,/1_000_000/);
  assert.match(route,/encryptSecret/);
});

test("evidence automation keeps Turkish and English UI states consistent",()=>{
  assert.match(ui,/lang:Lang/);
  assert.match(ui,/tr\?"Uygun":"Passed"/);
  assert.match(ui,/tr\?"Saatlik":"Hourly"/);
  assert.match(ui,/"Cloud & SaaS":"Bulut ve SaaS"/);
  assert.match(ui,/new Intl\.DateTimeFormat\(tr\?"tr-TR":"en-GB"/);
  assert.match(ui,/aria-modal="true"/);
  assert.match(ui,/aria-label=\{closeLabel\}/);
});

test("nested evidence catalog headers do not inherit the application header offset",()=>{
  assert.doesNotMatch(premiumCss, /(?:^|\})header\{/);
  assert.doesNotMatch(refreshCss, /(?:^|\})header\{/);
  assert.match(premiumCss,/\.shell>main>header\{/);
  assert.match(refreshCss,/\.shell>main>header\{/);
  assert.match(finalCss,/\.ea-catalog article>header\{[^}]*position:static!important[^}]*width:100%!important[^}]*margin:0!important[^}]*padding:15px 18px!important/);
});
