# Periodic continuity plan review — 27 October 2026

## Product decision

Main `67c5cedc32f0edd27d99ee19d47e0ac59331a829` exposes active plan review dates in Continuity and My Work but has no operation to record a periodic review or advance its date. The assigned reviewer cannot complete that responsibility. Source inspection confirms this friction; customer adoption and task time are unmeasured. Finish this existing workflow before adding further menus or background scheduling.

## Journey and scope

My Work or Continuity → exact plan → **Plan details and reviews** → inspect the existing approved plan → assigned independent Admin reviewer records a reason and explicit next review date → immutable review history and current queue date update together. Full-access readers can inspect plan details and retained snapshots. Owners/crisis leads and unassigned Admins cannot self-approve a periodic review. This is a confirmation of the existing plan's continued suitability; it does not change its strategy/targets, close gaps, certify recovery effectiveness or replace exercise evidence. Structural plan editing/reapproval and background reminders remain separate work.

The review must bind the exact source revision and acting account/policy at commit. The next date is strictly after today and the existing review date. Repeated identical requests return the original result; stale plans and conflicting retries make no partial changes. A reason, actor/time, previous/next date and the reviewed plan snapshot are retained atomically with the date update and existing event history. Review history is append-only; the latest 20 records are displayed with explicit truncation. No theme or email-setting changes.

## Acceptance and delivery

- Inspect full plan context and past review snapshots through existing module authorization; unauthorized/scoped requests remain denied.
- Only the current assigned independent Admin can record an active plan review. Live role/status/policy and source races fail closed, including retirement and concurrent reviews.
- Invalid dates/reasons, repeated requests and transaction failures preserve source/history integrity. A timed-out response can be retried without a second review.
- Loading and source errors have retry; drafts survive failed writes and source refresh, and applying a new source revision requires explicit acknowledgement.
- My Work assigns active plan reviews to the reviewer as well as retaining owner/crisis-lead responsibility; dates follow the approved periodic review. Existing plan approval, exercises, gaps and evidence remain intact.
- SQLite route/transaction tests and real Chromium cover the journey, permissions, conflicts, retries, TR/EN, both themes, keyboard and narrow layouts. Required build, migration, CI and broad browser checks must pass before authorized main delivery.

Implementation includes the retained review store, source/identity transaction guards, exact-plan workspace, reviewer queue assignment, additive migration and user/admin documentation. Targeted route/transaction tests cover the acceptance criteria; the browser journey exercises real authorization, source conflicts, lost-response retries, read recovery, historical reads and 12 language/theme/viewport combinations. Exact revision and completed results are recorded in the delivery PR rather than inferred from implementation. The additive table preserves existing installations; a code rollback leaves retained review history and current saved dates in place. Main merge, production deployment and customer UAT are separate stages. Use only owned synthetic data in the disposable test environment.
