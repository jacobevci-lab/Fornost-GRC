# Incident responsibilities in My Work — 28 October 2026

## Product decision

Incident owners and commanders should find their response work in the existing inbox, and assigned independent reviewers should receive the closure handoff. On main `d8e71316139caa1927950b43a515bef675ee5c9e`, `enterprise-work.ts` defines incident navigation but never reads or projects incidents. The module's complete response lifecycle is therefore absent from My Work. This source-confirmed gap follows connected incident decisions and is smaller and more immediate than external portals or annual planning. Adoption and time saved remain unmeasured.

## Journey and bounds

My Work → incident module/filter → exact incident → existing response/independent closure → refreshed queue. Owners and commanders see active response work; the assigned reviewer joins at review. Owners/commanders then see waiting-for-review. Closed incidents leave active work and use the actual closure timestamp for recent completion; reopening restores response work. No detection date is treated as a deadline, and no new incident mutation, permission, reminder, menu or palette is introduced.

Read only incident metadata through the existing authorized route. Use a 2,000-record limit with lookahead and active-first ordering. Invalid or duplicate rows, failed/denied reads and overflow remain explicitly incomplete; unavailable rows are discarded and CSV is disabled. Full-access Viewer reads and scoped enterprise denial remain unchanged. Sensitive narratives, evidence and decision details are excluded from this queue response.

## Acceptance and verification

- Canonical assignments, status, severity and exact ID drive Mine/Organization, module selection, search, counts, saved views and CSV. Critical/high incidents are visible in Priority without invented due dates.
- All seven lifecycle states project correctly; only review waits for an independent decision. Closed records use `closed_at`, never later edits or creation; reopening clears completion. Invalid states/identities/times and duplicate records cannot masquerade as complete data.
- Actual SQLite route tests verify metadata-only reads, no writes, deterministic active-first bounds and lifecycle timestamps. Existing mutation authorization remains authoritative; browser tests verify anonymous/scoped denial and Viewer read access.
- Real Chromium checks owner/commander/reviewer handoff, exact navigation, closure/reopen, source failure/recovery and CSV. TR/EN, light/dark, desktop/tablet/mobile, keyboard and accessibility are checked. Required CI and full browser workflow must pass before merge.

## Delivery

Update user/admin/module documentation and the research inventory. No migration or data rewrite; rollback removes the queue integration while preserving incidents/history. Use owned synthetic records in disposable loopback. Record tested revisions and release receipts in the delivery PR. Production deployment and customer UAT remain separate. Stage: implemented; 1,681 local tests, typecheck/build and on-prem installer smoke passed. Focused actual-route tests cover assignment, timestamps, access-scoped saved views, bounds and unavailable reads. Local Chromium completed the owner/commander/reviewer journey, closure/reopen, source failures, CSV and twelve locale/theme/viewport views without accessibility/overflow findings. Representative mobile/desktop screenshots were visually inspected. Provider CI and full browser acceptance remain pending; immutable release receipts belong in the PR.
