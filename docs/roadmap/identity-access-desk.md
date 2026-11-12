# Identity and access desk

## Decision and scope
Implement the selected first identity mockup: a compact horizontal view switcher, user directory and selected-account panel, recent access events, and separate corporate profile settings. Preserve Fornost palette, global navigation and existing server authorization. No sample identities ship.

The account list is the default task surface. Creation/editing is an explicit dialog; role, scope, session termination, suspension and deletion are discoverable from the selected account. Scope is limited to the existing eight core modules, with Admin/Editor/Viewer as the permission ceiling. Native SSO callbacks, MFA, passkeys, SCIM and custom roles are separate capabilities, not claimed by this release. Corporate connection checks only inspect provider metadata or bridge health.

## Acceptance
- Real users and counts; search/role/status filters; separate loading, failure, empty and filtered-empty states.
- List and selected detail remain consistent after filtering, refresh and mutations. Unsaved account/profile changes are not silently discarded. Uncertain mutation results require reconciliation.
- Create, rename, role/module changes, disable/reactivate, session revoke and confirmed delete use existing server endpoints and expected revisions. Own-account deletion and last-active-admin restrictions remain enforced server-side.
- Access history retains deleted account identity and describes its bounded last-20-event scope, not a full sign-in audit.
- Corporate profile is loaded separately; failed reads block writes. Save uses expectedUpdatedAt; changing provider clears draft credentials. Metadata checks use the saved revision and never imply authenticated SSO/MFA or SCIM provisioning.
- TR/EN, keyboard dialog focus/Escape, light/dark and narrow layouts. Local view controls never inherit global navigation/aside layout.
- Browser QA exercises account lifecycle, permission enforcement, history, dirty recovery, failed reads and responsive screenshots in an isolated runtime. Public production health must match merged revision before release claim.

## Research/design basis
Selected “Kimlik ve erişim çalışma masası” visual and the Fornost identity research delivered 12 November 2026. Competitive documentation supports separating directory, role scope and provider setup; inferred user expectations are not customer-interview evidence. Reuse current APIs and scope model instead of introducing a second identity engine.
