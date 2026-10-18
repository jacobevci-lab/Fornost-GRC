# Product-wide workspace

The October 2026 workspace redesign applies to the authenticated product shell and module entry pages. It is not limited to the audit detail screen.

- Navigation uses a dark rail, localized search and a visible current-page state. Search only includes modules the signed-in user can open. Clear and Escape restore the full authorized menu; choosing a result clears the search.
- The dashboard has a new overview, a source-derived assurance indicator, separated metric cards, and direct access to My Work and reporting. An unavailable score remains unavailable; it is not treated as zero or an audit opinion. Saved widget preferences remain effective.
- Risk, assets, BIA, compliance, controls, audits, vendors, policies, incidents, findings, continuity, automation, reporting and administration use the same page-header, card, table and form surfaces. AI Governance shares the shell and typography.
- Evidence Library retains one quality summary, with clearer metric hierarchy and Turkish copy. Do not add a second summary duplicating these counts above the register.
- `product-workspace.css` owns the current visual tokens and shared hierarchy. Components continue to own workflows and layouts. The historical `theme-integrity.css` uses the shared text-size token instead of imposing 10px on all content.
- Desktop uses a 252px navigation rail; compact, hidden, tablet and mobile navigation remain available. Light and dark palettes and reduced-motion preferences are supported.

## Verification

`product-workspace-qa.mjs` checks navigation search, clearing, empty results, Escape, the dashboard, module entry pages, record dialogs, responsive bounds and dashboard accessibility in both languages and themes. Its screenshots are published early as `product-workspace-preview`.

The existing Workspace Layout QA continues to exercise record creation/edit/delete, roles, audit and evidence lifecycles, all 27 visible menus in both languages/themes at three widths, and the full product accessibility gate. A successful focused screenshot pass does not replace the complete workflow gate.
