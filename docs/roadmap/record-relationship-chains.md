# Record relationship chains

## Delivery brief

Risk, BIA, asset and continuity detail views must expose the real state of linked records without implying assurance from a connection. Reuse the authorized Connected GRC relationship editor and existing record navigation.

- Every mini card shows its record code and translated status; only active/effective/approved states receive positive status emphasis. Expired evidence and a pending replacement never look approved.
- The current record has a brand border/ring, independently of its status. Other cards open the record detail.
- Each sibling list initially shows two records, with an accessible expand/collapse control. Evidence remains under its actual control; a shared risk must not invent control/evidence relationships.
- A verified missing relationship offers the existing link modal, preselected to the appropriate relationship. Readers, denied scopes and incomplete sources do not receive a misleading write action. Linking never approves records.
- The assurance tree uses 16px indentation per level and a thin guide. Compact typography, TR/EN and light/dark remain global contracts.

## Acceptance and validation

Unit coverage: status translation/tone, pending or expired evidence, exact branch membership, target preselection, read/write restrictions. Browser coverage: real control and BCP linking, no status promotion, audit history, disclosure, detail navigation, keyboard focus and Escape, TR/EN × light/dark × 1440/390px. Existing design, type, unit and production build checks remain required. Publish only the validated commit and verify the live deployment SHA.

## Scope

No schema or approval workflow change. Existing entity/module authorization, optimistic concurrency and audit handling remain on `/api/connected-grc/links`. A relationship is context, not proof of control effectiveness.

## Validation result — 2026-11-27

- TypeScript and shared typography contract passed (171 stylesheets / 256 components).
- Full unit suite: 2,130 passed, zero failures.
- Verified production build and Worker/hosting artifact passed.
- Local browser suite passed: 16 TR/EN × light/dark × 1440×900 / 390×900 renders, multi-record disclosure and exact 16px guides; no page errors or horizontal overflow.
- Real API writes: missing control and BCP links, refreshed display and audit events, draft status preserved. BIA → BCP → BIA opens actual record details. Failed continuity reads show unknown state. A separate Viewer browser has no link action and receives HTTP 403 on a direct write.
- Tests use isolated local D1 and synthetic records; no live records are created or modified.
- Existing register navigation/sorting suite: 11 checks passed. Dashboard source and cross-module chain regression passed after updating the old BCP inline-preview expectation to the native plan dossier.
- Native BCP `submitted`, `cancelled` and `retired` states are explicitly localized; none implies positive assurance.
