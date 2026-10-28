# Directory-based policy campaign issuance — 28 October 2026

## Product decision

Main `d8962cd26db23db5b0220cc8e05363357304ab99` now lets assigned subjects read and respond to their exact policy version. The preceding campaign creation step still accepts free-text email addresses, including unknown, disabled or scoped-only users who cannot complete those assignments. Its generic create request also lacks a stable retry identity. Complete this confirmed Admin-to-subject handoff before adding scheduling, external portals or new dashboards. Adoption and time saved remain unmeasured.

## Journey and bounds

Existing Policy Center → Attestation → Campaign → select published policy, campaign details and 1–500 eligible directory accounts (including full-access Viewers) → inspect exact source and participant preview → explicitly create assignments → existing campaign outcomes and subjects' My Work. Search/pagination expose bounded directory results; selected accounts remain visible across search and failures. No implied “all employees” expansion: only explicitly selected accounts receive tasks.

Preview makes no business writes. Issuance checks the full reviewed policy/version, each selected account's identity/role/status/access policy and the acting Admin at the atomic commit. Source or recipient changes require another preview and confirmation. A stable campaign ID and retained creation event return the original result on an identical lost-response retry, including after subsequent responses or closure; changed reuse conflicts. Keep canonical campaign/attestation rows and existing campaign closure and response workflows. Preserve legacy API clients which omit reviewed issuance fields; only the UI's reviewed mode claims directory validation. Do not introduce a new schema, queue, menu, palette, email configuration, notification delivery, recurrence or group synchronization.

## Acceptance and delivery

SQLite route tests cover real source/account changes before and during commit, recipient bounds/duplicates, full-access Viewer inclusion, restricted identity rejection, rollback, strict request identity and replay. Real Chromium covers creation from directory, exact policy/recipient review, participant removal and failed reads, source/account conflicts, dropped response recovery, the subject handoff, keyboard/focus, accessibility and 24 selection/preview TR/EN theme/viewport views. Existing campaign completion and response journeys remain regression gates. Update operational/user/admin docs and research status. Run required CI and browser checks on the final tree before main merge; record release identities in the PR. Rollback retains created canonical campaigns and creation events. Stage: implemented and locally browser-validated (24 issuance views plus existing completion/response journeys). Final acceptance and immutable release identities are recorded in the delivery PR; production deployment and customer UAT remain separate.
