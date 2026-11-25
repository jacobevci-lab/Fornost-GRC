# Connected incident decisions — 28 October 2026

## Product decision

Incident owners, commanders and independent reviewers should complete response decisions using existing accounts and actual evidence files. Main `e3053e43ef2df1e71247a6aea470fceac0c44e5f` still requires email/hash text in `incident-center.tsx`, discards drafts on conflicts and lost responses, and exposes only a short cross-incident event list. This is a source-confirmed connected-workflow gap after CAPA, policy and TPRM. Reuse the directory, versioned evidence library and guarded decision infrastructure. Time saved and adoption are unmeasured. External portals, automatic response orchestration, legal notification advice and annual capacity planning are separate scope.

## Journey and scope

Existing Security Incidents → declare with three distinct eligible directory accounts and independent Admin reviewer → inspect current incident, impact, references and response context → triage/contain/eradicate/recover/review → assigned independent close or reasoned reopen → inspect retained event-specific evidence and navigate from Evidence Usage to the exact incident. Containment, eradication, recovery, review and closure each retain their own selected version. Reopening and later uploads cannot rewrite decisions.

Preserve palette, menus, notification settings, legacy API clients and existing maker/checker rules. Do not introduce automatic regulatory notification or a new schema. Source, live identity, evidence and transition/event/pin writes must be guarded atomically; SQL and object storage are not a distributed transaction. Reads must state bounds and support retry instead of showing unavailable data as an empty success. Exact source/history must not depend on the ordinary list's 3,000-record bound.

## Acceptance

- Directory creation rejects invalid, duplicate, self-reviewing, revoked or scoped assignments without partial records; canonical asset/risk/BIA reference validation remains active.
- Every reviewed transition binds the complete source and live actor. Five evidence-bearing decisions retain separate immutable pins, including older deliberately selected versions. Existing text/hash callers remain compatible without acquiring canonical pins.
- Conflicts, failed reads/writes and unknown outcomes preserve notes, root cause, lessons, notification rationale and file choice. Refresh is read-only; changed context requires explicit adoption and a new confirmation. A completed operation cannot repeat after response recovery.
- Read-only Viewers inspect exact incident history/usage. Scoped enterprise access remains restricted. History is paginated and pins belong only to returned events. Missing/bounded sources remain explicit; protected evidence cannot be deleted.
- Actual-route SQLite tests cover roles, full-source/account/file races and atomic rollback. Real Chromium covers declaration through independent closure/reopen, historical evidence, failure recovery, exact links, TR/EN, both themes, desktop/tablet/mobile, keyboard and accessibility. Required CI and the existing full product browser workflow must pass on the release revision.

## Delivery

Update README and user/admin/module/usage guides. Keep immutable events and pins if application code is rolled back. Only owned synthetic data may be used for QA. Record exact tested and merged trees and artifacts in the delivery PR. Production/customer UAT and independent security review remain separate. Stage: implemented; 1,674 local tests, typecheck, build and installation smoke passed. Local Chromium selection/usage and incident acceptance also passed, including 12 locale/theme/viewport combinations, keyboard/accessibility, two response cycles and lost-response recovery. Provider CI and full-product browser acceptance are pending; final receipts belong in the delivery PR.
