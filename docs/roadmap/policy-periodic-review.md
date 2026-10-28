# Published policy periodic review — 28 October 2026

## Product decision

On main `f7a435f0eee4b203a11e499117666c4510200812`, My Work projects published policies using `next_review`, but the policy API offers no way to record a periodic review of still-valid content. Republishing content solely to advance this date obscures the review decision. Complete this source-confirmed gap in the existing Policy Center. Customer adoption and time saved remain unmeasured.

## Journey and bounds

My Work → exact policy → periodic review and history → inspect current published content, hash, mappings, ownership and schedule → assigned independent Admin records why the version remains valid and the next review date. The date must advance beyond today and the existing date, within the configured review frequency measured from today. The original published version and all attestations remain unchanged. If another version is in draft, review or approval, direct the user to its existing controlled workflow instead.

Retain the exact policy and version snapshot, actor, reason and previous/new dates in immutable history. The transaction binds every displayed source field, absence of an ongoing revision, and the live account. Repeated identical requests return the recorded result; stale decisions and failed writes cannot partially advance the date. Refresh preserves drafts and requires explicit adoption and renewed confirmation after a source change. Failed reads disable decisions; history shows explicit bounds and unreadable snapshots.

## Acceptance and delivery

Use existing palette and controls, TR/EN and light/dark. Test actual SQLite route behavior: independence, active accounts, input/date bounds, content integrity, full source and actor races, concurrent new versions, idempotency, rollback and immutable history. Real Chromium verifies My Work navigation/date, actual authorization, review/history, draft retention, dropped responses, keyboard, accessibility and twelve locale/theme/viewport views. Complete repository CI and the full browser workflow before merge; record immutable release identities in the PR.

Add an additive table/index/immutability-trigger migration. Rollback removes the UI/API while retaining review history and the legitimately saved next-review dates. No new menu, palette, notification, policy-content approval shortcut or production deployment. Stage: implemented; 1,691 local tests, typecheck/build and on-prem installer smoke passed. Local Chromium could not start because this execution environment denied its process socket; provider browser acceptance remains required before merge.
