# Integration connection desk

Date: 2026-11-11. Baseline: 9bf20aa. Stage: implementation.

Administrators need to understand whether an integration is configured, verified and enabled before sending GRC work to it. The current workflow page stacks a cross-product summary, assurance queue and credential form; its empty assurance queue can report healthy without monitored sources. The selected design is the Connection Desk, with guided setup and a separate activity view, preserving existing theme tokens and TR/EN.

## Delivery scope

- One existing ticketing profile, shown as a connection list with details; no invented multi-profile capability.
- Four-step provider/access/target/verification setup, saved drafts, explicit activation, pause and disconnect. Read failures must not become an empty profile or allow overwrite.
- Existing SSO, email and evidence modules remain the owners of their settings and are reached from the application menu. Assurance remains available in its own tab.
- Admin-only configuration/history/disconnect; existing Editor ticket creation remains unchanged. Secret values never return to the client. Historical events and linked external work remain after disconnect.
- Jira Cloud/Data Center have distinct provider identities and requests. Connection tests perform read-only account/project/permission checks where available, without creating tickets. A limited test must say what it did not prove.
- Show current configuration test status, explicit stale/unknown/paused states, and bounded activity history. No automatic retry of ticket creation or automatic closure of a GRC finding.
- Multi-profile storage, inbound status synchronization, OAuth onboarding, scheduled retries and rules are later deliveries; do not render pretend controls for them.

## Acceptance and validation

1. Empty or unavailable data never displays healthy or permits accidental overwriting of unknown configuration.
2. An administrator can save a draft, test it, activate, edit, pause, and disconnect. Concurrent changes reject stale writes. Incomplete active profiles are rejected server-side.
3. Changing provider/configuration invalidates prior test status. Authentication success is distinguished from checked target permissions.
4. Non-admin API requests cannot read secrets/configuration/history, change or remove profiles. Disconnect retains events and external records.
5. Desktop/mobile, TR/EN, light/dark, keyboard navigation and visible errors work. A dirty form and timeout have recoverable outcomes.
6. Focused unit/API and browser tests cover those risks. Real vendor credentials are not available; mocked HTTP contract checks are not live certification.

No schema migration is intended. Existing profiles are reused. Rollback is the code revision; a newly selected Data Center provider should be paused or restored to its prior configuration before rolling back to a version that does not support it. Do not erase audit events.

Research reused: Vanta Jira integration guide, Drata Connections and Jira guides, ServiceNow Connections dashboard, Atlassian Jira Cloud/Data Center REST references (reviewed 2026-11-11). No new competitor research is needed for this implementation.

## Compact header correction — 2026-11-12

The administrator's production screenshot shows duplicate category navigation and vertically stacked view controls pushing the connection list below the fold. Remove the four category shortcuts and keep Connections, Connection history and Continuous assurance in one scoped horizontal button group, with Refresh and Edit on the right. Narrow screens may scroll that group and wrap the actions without overflowing the page. Preserve theme tokens, TR/EN, focus indicators and every connection action. Acceptance: no category block, horizontal view choices, accessible selected state and an earlier connection list. Validate with focused existing tests, TypeScript, lint and build; verify the deployed revision and record any browser limitation. This is a UI-only change with no data migration; revert its commit to roll back.
