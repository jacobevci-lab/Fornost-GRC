import { chromium, expect } from "@playwright/test";

export async function checkEditionUi(base, cookies, edition, evidenceId) {
  const browser = await chromium.launch({executablePath:process.env.QA_CHROMIUM_PATH || undefined});
  try {
    const context = await browser.newContext();
    await context.addCookies([...cookies].map(([name,value])=>({name,value,url:base})));
    const page = await context.newPage();
    await page.goto(base);
    await page.locator(".language-switch:visible").getByRole("button",{name:"EN",exact:true}).click();
    if (edition === "Essentials") {
      await expect(page.locator(".shell")).toBeVisible();
      await expect(page.locator(".context-ai-trigger")).toHaveCount(0);
      await expect(page.locator("nav button[aria-label='Ask Fornost']")).toHaveCount(0);
      return;
    }
    if (edition === "Professional") {
      await page.locator(".context-ai-trigger").click();
    } else {
      const library = page.locator("nav button[aria-label='Evidence Library']");
      const group = library.locator("xpath=../preceding-sibling::button");
      if (await group.getAttribute("aria-expanded") !== "true") await group.click();
      await library.click();
      await page.locator(".evidence-details-link[data-record-id='"+evidenceId+"']").click();
      await page.getByRole("region",{name:"Record inspection"}).getByRole("button",{name:"Ask Fornost",exact:true}).click();
    }
    const panel = page.getByRole("region",{name:"Ask Fornost",exact:true});
    const select = panel.getByRole("combobox",{name:"Risk or evidence record"});
    if (edition === "Professional") await select.selectOption(evidenceId);
    await expect(select).toHaveValue(evidenceId);
    const linked = panel.getByRole("button",{name:"Analyze links and suggested controls"});
    if (edition === "Professional") {
      await expect(linked).toHaveCount(0);
      await panel.getByRole("button",{name:"Draft an evidence request"}).click();
    } else {
      await linked.click();
    }
    await expect(panel.getByText("Records cited in the answer")).toBeVisible({timeout:15000});
    await expect(panel.getByRole("button",{name:new RegExp(evidenceId)})).toBeVisible();
    if (edition === "Enterprise") await expect(panel.getByRole("button",{name:/Access review procedure/})).toBeVisible();
  } finally { await browser.close(); }
}
