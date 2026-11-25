# Evidence change follow-up tasks

In **Evidence Library → Usage and change impact**, choose an evidence record and select **Review task** beside a linked request or workpaper. This creates an explicit dated audit milestone for reviewing a newer evidence version against the source's saved pins. It reuses **My Work**, milestone history, optional independent milestone review, status reports and whole-audit closure checks.

## User workflow

1. Inspect the current evidence version, source work, saved pins and source owner/deadline. The source must still be open and have an earlier or unverified pin. A valid current version with a SHA-256 digest is required.
2. Enter a task title, expected outcome, owner, due date, IANA time zone and a reason of at least three characters. The due date is explicit; it is not inferred from the source. Editors assign themselves. Admins can select an active account with audit-write and evidence-read access.
3. **Preview review task** shows the proposed task without writing. **Create review task** saves one planned milestone and its immutable origin/history together. Reminders, recurrence and independent review start disabled; use the existing task details to configure them later.
4. **Open review task** opens the exact milestone. Its origin links back to the source work and evidence record. Compare the evidence and document any resubmission, withdrawal or review decision in the original workflow. Completing the task does not replace pins or approve source evidence.

If the source, evidence, assignment or task list changed, creation fails without partial writes. **Refresh source (keep draft)** preserves the entered text, owner and dates, reloads current context and requires a fresh preview. Failed network requests retain the draft and stable task ID; retrying the identical request returns the existing task. After refreshing, a saved task is shown through **Open existing review task**.

There is one originating task per evidence record/current version/source kind/source ID, including completed or cancelled tasks. Reopen that task through its normal lifecycle if further review is needed. Uploading a new version permits a new explicit follow-up. A manually repeated milestone is a normal successor linked to its predecessor; it does not copy or claim the previous evidence-change origin.

## Eligibility, access and limits

- Requests: assigned, submitted or changes requested, with an open request workplan and audit. Workpapers: draft or submitted, with an open audit. Accepted/approved/cancelled sources and closed audits are not reopened automatically.
- Both preview and creation require evidence-read plus audit access. Creation requires audit-write and an active Admin/Editor. Current actor identity, role, state and module policy are rechecked. Active task edits/actions also require evidence-read access for the actor, owner and configured reviewer; cancel/reopen/return retain the normal recovery rules.
- Audit-only readers can see ordinary milestone fields and history, but the structured evidence origin is omitted. My Work returns its existing minimal projection. Task titles/descriptions supplied by users remain ordinary audit content; the default text does not copy evidence titles or hashes.
- The existing 100-task-per-audit limit applies, including cancelled tasks. Source evidence snapshots are limited to 100 pins. This does not add an unbounded search, background re-evaluation or automatic follow-up service.

The origin retains evidence ID/code/title, current version ID/number/SHA-256, source kind/ID/audit/title/revision/state, original pin identities/states, reason, creator and creation time. It excludes file bytes, storage keys and sample contents. Task edits cannot replace or remove it. New Admin status/closure snapshots include it; previously saved reports remain unchanged.

## API and operations

`GET /api/evidence/followups?evidenceId=<id>&sourceKind=requests|workpapers&sourceId=<id>` provides a transactional source preview and opaque comparison token. It performs no business-data writes. `POST /api/evidence/followups` accepts a stable `AMT-<uuid>` ID, the same source identities, `expectedToken`, normal task fields and a reason. Responses are `private, no-store`; malformed inputs, denied access, missing records, changed/ineligible sources and unavailable data remain distinct failures. The write body is limited to 16,000 UTF-8 bytes.

Commit-time SQL guards bind exact source revision/contents, audit and request-plan state, current evidence record/version/hash, saved pin metadata, live accounts/policies, task graph and capacity. Task and event writes share one transaction. Migration **0096_evidence_change_followups.sql** adds a unique origin-key index and immutable-origin update trigger to existing milestone storage; no new table, external service, email configuration or operational-log menu is added. Runtime schema initialization includes the same guards for hosted and on-prem installations.

`tests/evidence-change-followups.test.ts` runs real SQLite transactions covering eligibility, duplicate/retry behavior, stale reads, commit-time races, rollback, scoped access, origin retention/redaction, recurrence, My Work, reports and closure. `scripts/evidence-change-followup-qa.mjs` exercises creation/recovery/navigation/lifecycle in Chromium, including scoped accounts, TR/EN, light/dark and desktop/mobile accessibility and overflow checks. CI preserves result, screenshots and cleanup receipts as `evidence-change-followup-preview`.

Automatic control re-evaluation, background task creation, historical report/event usage search, external auditor grants and broader module coverage remain separate work.
