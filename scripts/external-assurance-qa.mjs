import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const origin = "http://127.0.0.1:4184";
const browser = await chromium.launch({
  executablePath: process.env.QA_CHROMIUM_PATH,
  headless: !process.env.DISPLAY,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const staff = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { Origin: origin },
  });
  const auth = await staff.request.post(origin + "/api/auth", {
    data: {
      action: "authorize_bootstrap",
      token: process.env.ENTERPRISE_BOOTSTRAP_KEY,
    },
  });
  assert(auth.ok());
  const setup = await staff.request.post(origin + "/api/auth", {
    data: {
      action: "bootstrap",
      name: "Exchange QA",
      email: "exchange@fornost.test",
      password: randomBytes(24).toString("hex") + "Aa1!",
    },
  });
  assert(setup.ok());
  const user = (await (await staff.request.get(origin + "/api/auth")).json())
    .user;
  const errors = [];
  const watch = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    p.on("response", (r) => {
      if (r.url().startsWith(origin + "/api/") && r.status() >= 400)
        errors.push(r.status() + " " + new URL(r.url()).pathname);
    });
  };
  async function module(key) {
    const p = await staff.newPage();
    watch(p);
    await p.addInitScript(
      ({ id, key }) =>
        sessionStorage.setItem(
          "fornost-grc-page:v1:" + encodeURIComponent(id),
          key,
        ),
      { id: user.id, key },
    );
    await p.goto(origin);
    return p;
  }
  const hub = await module("İş Akışı Entegrasyonları");
  await hub
    .getByRole("heading", { name: "Entegrasyon Merkezi", exact: true })
    .waitFor();
  await hub
    .getByRole("button", { name: "Yapılandır", exact: true })
    .first()
    .click();
  await hub.getByLabel("Tenant ID", { exact: true }).waitFor();
  await hub.close();
  const trust = await module("Trust Center Yönetimi");
  await trust.getByLabel("Güvenlik mimarisi · TR").fill("İzole QA mimarisi");
  await trust
    .getByLabel("Güvenlik mimarisi · EN")
    .fill("Isolated QA architecture");
  await trust.getByRole("button", { name: "Seçimi yayımla" }).click();
  await trust.getByText("Yayın güncellendi.").waitFor();
  const guest = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    portal = await guest.newPage();
  watch(portal);
  const publicRequests = [];
  portal.on("request", (r) => {
    if (r.url().includes("/api/"))
      publicRequests.push(new URL(r.url()).pathname);
  });
  await portal.goto(origin + "/trust-center");
  await portal.getByText("İzole QA mimarisi").waitFor();
  await portal.getByRole("button", { name: "EN", exact: true }).click();
  await portal.getByText("Isolated QA architecture").waitFor();
  await portal.getByRole("button", { name: "Dark mode" }).click();
  assert.equal(await portal.locator("html").getAttribute("data-theme"), "dark");
  assert(publicRequests.every((x) => x === "/api/public-exchange/trust"));
  assert.equal(
    (await guest.request.get(origin + "/api/exchange?area=board")).status(),
    401,
  );
  const invitation = await staff.request.post(origin + "/api/exchange", {
    data: { action: "invite", id: "portal-qa" },
  });
  assert.equal(invitation.status(), 200);
  await portal.goto(new URL((await invitation.json()).url, origin).href);
  await portal.getByRole("heading", { name: "Portal QA supplier" }).waitFor();
  const selectors = portal.locator("select");
  assert.equal(await selectors.count(), 12);
  for (const s of await selectors.all()) await s.selectOption("yes");
  await portal.getByRole("button", { name: "Submit assessment" }).click();
  await portal
    .getByText("Assessment received and submitted for independent review.")
    .waitFor();
  const report = await module("Raporlar");
  await report
    .getByRole("button", { name: "Yönetim Kurulu Paketi Oluştur" })
    .click();
  await report.getByRole("button", { name: "Özeti oluştur" }).click();
  const slide = await staff.newPage();
  watch(slide);
  await slide.goto(
    new URL(
      await report.getByRole("link", { name: /16:9/ }).getAttribute("href"),
      origin,
    ).href,
  );
  await slide
    .getByRole("heading", { name: "Kritik tedarikçi yoğunlaşması" })
    .waitFor();
  for (const name of ["Yönetici özeti PDF indir", "16:9 slaytları indir"]) {
    const [dl] = await Promise.all([
      slide.waitForEvent("download"),
      slide.getByRole("button", { name }).click(),
    ]);
    assert.equal(await dl.failure(), null);
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS · integration cards, publication, anonymous TR/EN and dark mode, vendor submission, PDF and slide downloads",
  );
} finally {
  await browser.close();
}
