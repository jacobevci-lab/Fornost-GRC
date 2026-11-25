# Workspace simplicity

The shared layout keeps the accepted compact typography and light/dark theme tokens while reducing the space between a module heading and its working content.

## Implemented

- Register summaries use a compact strip; the risk matrix is an explicit disclosure.
- Audit portfolio cards precede the cross-portfolio readiness analysis. Selected audit detail and readiness calculations are unchanged.
- Evidence Automation starts with sources; the product catalog remains available as a separate view. Loading, connection failure/retry and first-source guidance are distinct states.
- AI Governance is a native shell destination hosting the existing governed AI surface at full width. Specialist navigation is disclosed on demand and closes after selection, restoring keyboard focus. Leaving the module releases the embedded surface; contextual chat remains available from the header.
- Report export formats share a disclosure. Existing export handlers and permissions remain in place.
- Shared module headers and metric strips use consistent spacing and surfaces. The duplicate floating AI launcher no longer obscures table or dialog actions.

## Validation

`scripts/workspace-simplicity-qa.mjs` covers the new navigation and progressive disclosure, source error recovery, retained specialist capabilities, portal teardown, report format access, and bilingual light/dark desktop/mobile layouts. It runs in Workspace Layout QA alongside the existing layout and lifecycle suites.

## Subsequent work

This change establishes the common layout and priority module flows. A unified record detail component, full-page BIA/continuity editors, saved views, and role-specific dashboard defaults require dedicated workflow changes. They are not delivered by CSS or claimed as implemented here.
