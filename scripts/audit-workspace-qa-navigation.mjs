// Follow the four-area audit UI through its visible controls. Keep disclosures
// idempotent so revisiting an area also verifies that form drafts are retained.
export async function openAuditWorkspaceSection(page, section) {
  const workspace = page.locator('.fw-audit-workspace');
  await workspace.getByRole('tab', { name: 'Workspace', exact: true }).click();
  const titles = {
    plan: 'Plan, scope and team',
    workpapers: 'All audit workpapers',
    assurance: 'Catalog and assurance checks',
  };
  const disclosure = workspace.locator('.audit-desk-section').filter({
    has: page.locator('summary', { hasText: titles[section] }),
  });
  if (!await disclosure.evaluate(node => node.open)) {
    await disclosure.locator(':scope > summary').click();
  }
}
