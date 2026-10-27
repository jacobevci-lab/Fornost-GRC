# Policy campaign completion — 27 October 2026

## Product decision

Policy administrators can create attestation campaigns but cannot inspect a campaign's complete outcome or close it through the product. The existing schema has closed state/actor/time, and retirement intentionally refuses open campaigns. This leaves a real lifecycle without its completion path. Source evidence: `app/api/policy-lifecycle/route.ts`, `app/policy-lifecycle.tsx`, base main `fbcb404ab60d7e95880e700bb3a003a908e8ca4e`.

Complete that path in Policy Center → Attestation: administrators inspect campaign recipients, the pinned policy version, accepted/declined/unanswered counts, then explicitly close with a reason. Closing ends collection; it never changes a participant's decision or implies universal acceptance. Unanswered requests remain historical, disappear from active work and no longer offer impossible response buttons. Closed campaigns cease to block policy retirement, subject to all other existing blockers.

This is prioritized over additional menus, automatic reminders and a full policy evidence-selector expansion because it removes a confirmed dead end. Customer adoption and completion-time baselines are unmeasured.

## Scope and acceptance

- Reuse campaign, attestation and event records; no schema migration, theme palette or email configuration changes.
- Admin-only campaign outcome/detail and closure; existing subject/Editor/Viewer and scoped access boundaries remain authoritative.
- Show exact counts and pinned content. Inspect up to 500 recipients with explicit incomplete coverage; do not close an incomplete or malformed campaign.
- Require current outcome revision, reason and explicit acknowledgement when pending or declined responses exist. Save source state, closing identity/time and retained outcome/reason atomically. Repeated identical closure requests return the existing result without a duplicate event.
- A concurrent response, changed campaign/version, or revoked administrator must prevent stale closure. Event failure rolls back the state change. No participant response is rewritten.
- Failed/conflicting/uncertain writes and failed detail reads preserve the closure draft; current results require explicit adoption before retry. Closing/navigating away does not provide durable draft storage.
- Closed history stays visible, while pending counts, response buttons and My Work reflect collection state. Existing accepted/declined evidence remains intact.
- Exercise actual browser paths, negative permissions, concurrency and recovery, TR/EN, both themes, desktop/tablet/mobile and keyboard/focus. Expand through the existing full browser suite; retain precise revision/environment receipts.

## Release and limits

Update README/user/admin/module guidance. Rollback restores the previous UI/API without deleting campaign history; closed campaigns remain closed. No reopening, automatic closure, bulk reminders, reassignment, external portal, mail delivery guarantee or customer UAT is included. Production verification is separate from isolated CI browser QA.

Stage: implemented; local 1,649-test suite, typecheck/build/install smoke, lint, migration preflight and artifact validation passed. Focused transaction tests were repeated after outcome validation changes. Actual Chromium and provider CI are pending; exact final revision receipts belong in the delivery PR. Planned checks are not passes.
