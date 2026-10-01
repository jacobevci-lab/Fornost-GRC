# Installation-local module access

Fornost supports optional per-user access to the eight core registers. This is an on-prem authorization feature within one customer installation; it does not introduce SaaS tenants.

## Configure

In **Identity & Access → Local User Accounts**, expand **Module access** for a non-administrator, choose **Selected core modules**, assign **No access**, **Read**, or **Read and edit**, and save the user. The same choices are available when creating an account.

- Existing users without a saved policy retain full workspace access.
- Administrators retain full access. Only administrators can change users and grants.
- Viewer is always read-only, even if a write grant exists. Editor can write only where granted. Deletion remains administrator-only.
- Changing role, status or module grants revokes the affected user's local sessions. The next request needs a new login; the open workspace also rechecks identity on focus and every 60 seconds.
- A mapped trusted-platform identity reads the same policy on each request. Disabled mapped accounts cannot fall back to an unmapped Viewer. Unmapped trusted-platform identities retain the existing full-workspace Viewer behavior; provision a mapped account to restrict one.
- Changes record actor, target, time and before/after access in `user_access_events`. Identity settings show recent changes; the administrator-only users API includes their snapshots.

## Scope and product behavior

The selectable registers are Risk Assessment, BIA, Asset Inventory, Compliance, Vendors, Controls, Evidence Library and Audit Management. A grant covers **all records in that module**. It does not isolate departments, owners, individual records or fields. References and narrative text stored inside an allowed record are visible as part of that record. Shared catalog choices remain readable.

Scoped users get a compact home page and only their permitted modules in navigation and search. Vendors use the core vendor register; extended assessments remain a full-workspace capability. Audit portfolios and requirements remain available with an audit grant. Evidence downloads, uploads and version history follow the evidence grant. Cross-module readiness panels are hidden for scoped users.

Shared enterprise reports, findings, operational assurance, extended workflows and AI governance/agent/draft/knowledge datasets currently require full workspace access. Selecting all eight core modules does **not** enable those shared datasets. This avoids presenting partially filtered enterprise reports or exposing shared records through an alternative endpoint. New API routes are denied to scoped users until explicitly classified.

Ask Fornost chat remains available. Its database query selects only readable core modules before the row limit, then applies AI data-classification rules. Shared knowledge, evidence-lineage summaries and operational-assurance context are omitted for scoped accounts. Citation lookup enforces the same module access. The browser clears cached AI messages when the authenticated identity, role or policy changes. Previously downloaded or already displayed data cannot be recalled by revoking access.

## Storage and verification

Migration `0081_user_module_access.sql` creates the policy and access-event tables. Runtime startup also creates them idempotently for older installations. An absent policy preserves legacy behavior; malformed persisted policy grants no core access to a non-administrator.

`tests/module-access.test.ts` checks role ceilings, malformed policy, closed endpoint access, repeat schema initialization and actual SQLite AI filtering, including more than 400 unauthorized recent records. `scripts/module-access-runtime-qa.mjs` targets only the isolated loopback app. It checks real account creation, persistence, direct API denials, import and forged-module rejection, all eight scoped register screens, revocation, policy restoration, access-event snapshots and both themes on desktop/mobile. Existing general runtime and layout suites still cover full-workspace behavior. No external AI provider or production customer installation is implied by these tests.
