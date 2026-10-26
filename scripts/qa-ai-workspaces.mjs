/** Follow the same progressive disclosure as a user; never force-click hidden tabs. */
export async function revealAiWorkspace(scope, name) {
  const picker = scope.locator('.ai-section-picker');
  if (await picker.getAttribute('open') === null && await picker.locator(':scope>summary').count()) await picker.locator(':scope>summary').click();
  for (const group of await scope.locator('.ai-workspace-group').all()) {
    if (await group.getByRole('button', { name, exact: true, includeHidden: true }).count()) {
      if (await group.getAttribute('open') === null) await group.locator(':scope>summary').click();
      return;
    }
  }
  throw new Error(`AI workspace not found: ${name}`);
}
