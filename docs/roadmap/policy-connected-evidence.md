# Connected policy evidence and assignments — 27 October 2026

## Product decision

On main `3c493f9d76e59d30b81d1e1dabaa7affc6076de2`, Policy Center still requires manually entered evidence references/digests for version and exception decisions, and email strings for internal ownership/review. A source-confirmed friction remains after campaign completion. Extend the existing library and directory workflow to policies so operators can complete drafting, independent review, publication, exceptions and retirement with inspectable canonical evidence. This reuses Connected GRC capabilities already delivered for continuity, regulation and TPRM. Customer adoption and task-time baselines remain unmeasured. External portals, automatic scheduling and annual capacity planning remain separate, larger packages.

## Journey and acceptance

- Existing Policy Center → policy/exception form → active eligible owner and independent Admin reviewer → decision dialog with actual policy content and source context → explicit file-version selection → atomic lifecycle/event/pin → latest decision evidence and historical Evidence Usage → exact source navigation.
- Preserve manual API compatibility without assigning canonical pins to legacy text/hash inputs. No new business schema, palette, menu or email setting.
- Bind the entire reviewed policy/version/exception context, live actor, selected accounts and selected evidence metadata/bytes to the committing transaction. Reject stale context, revoked accounts, wrong versions, changed bytes and incomplete sources without partial updates.
- Preserve independent reviewer, expiration and retirement blockers. The UI must not imply that an unavailable lifecycle action can succeed.
- Preserve note and evidence choices across source errors, conflicts and uncertain writes. Refresh is read-only; adoption of a new source revision is explicit and resets confirmation. Repeated terminal decisions cannot create duplicate pins. Unsaved drafts are not durable after leaving the dialog.
- Keep submission, approval, publication, exception approval/closure and retirement pins distinct; newer uploads do not rewrite old decisions. Usage is historical, bounded, access checked and never an assertion of current approval. Missing sources and failed reads remain explicit.
- Test transaction failures, permissions, stale source/actor/file races, legacy compatibility, old selected versions, usage and exact navigation, plus actual Chromium journeys in TR/EN, both themes, three viewport widths and keyboard/accessibility behavior.

## Release

Update user/admin/module guidance and the research delivery inventory. Required local checks and the existing full browser/CI suite run on the release revision; record exact receipts in the PR. Rollback of application code retains immutable evidence pins. Object-storage bytes are verified before the SQL transaction, not by a distributed transaction. Customer UAT and production deployment remain separate.

Stage: implemented. Local typecheck/build, all 1,658 tests, installer smoke, lint, migration preflight and artifact validation passed. Actual Chromium journeys and provider CI are pending; exact final revision receipts belong in the delivery PR. Planned checks are not passes. Owned synthetic data is created only in disposable QA and completed/retired where supported.
