# Supplier finding deadline planning

The assigned independent Admin reviewer can revise an open or in-progress finding from **Vendor Management → Findings & CAPA → Change deadline**. Inspect the current finding, owner, cycle, reviewer, deadline and latest feedback; enter a different valid date today or later, a 20–1,200 character reason, and `BULGU TERMİNİNİ DEĞİŞTİR`. Contract expiry is context rather than a maximum remediation date. Earlier-cycle open findings remain eligible.

The date updates the existing finding and therefore its My Work task and current overdue count. It does not change lifecycle state, owner, return feedback, submission/verification identities, evidence or the supplier's assessment. The reviewer cannot be the finding owner, creator or submitter, or the supplier creator/business/risk owner. Unrelated Admins cannot override the assignment. Verification and closed findings require an explicit return/reopen through their existing lifecycle before replanning. Rejected/offboarded suppliers cannot be replanned.

## Recovery and history

Read errors disable saving while retaining the date and reason. **Refresh finding** retries. If the finding, supplier or assessment changes, compare the current context and select **Use current version**, then re-enter confirmation. A failed history read can be retried independently. Closing the dialog discards an unsaved draft.

If a write response is lost, inspect the refreshed current deadline and **Finding decision history** before any new intent. The original token cannot replay a committed change. An already saved date cannot be saved again unchanged. Every successful plan retains the old/new dates, reason, actor/time, finding owner/status/severity, assessment cycle and whether the prior deadline was overdue at that time. Later planning does not erase that prior lateness. Full-access Viewers can read these facts alongside earlier event-specific evidence. Malformed historical details are explicitly unreadable, not reconstructed. Existing 20-event cursor pagination applies.

## API and operation

- `GET /api/third-party-risk?view=finding-deadline-context&findingId=…` returns the canonical context, source token, permission and server UTC day.
- `POST /api/third-party-risk` with `action: "reschedule-finding"`, `findingId`, `contextToken`, `nextDate`, `note`, `confirmation` updates only the date/update identity and appends `finding-deadline-changed` atomically. Unknown fields are rejected.
- The complete finding/profile/assessment snapshots and live actor account/access are guarded at commit. No partial event is emitted after a race. A failed event insert rolls back the date. Rapid lifecycle events use the same monotonic record timestamp so their retained sequence is stable.
- Existing enterprise authentication and access policies apply. No migration, task copy, new menu, notification or transport setting is required. Keep revised dates, events and immutable evidence pins during rollback; older application versions cannot render structured deadline events fully.

Route tests cover authorization, field validation, overdue retention, canonical My Work dates, old cycles, replay, full-row changes, live-account races and rollback. The real browser scenario covers actual roles, context/history retries, explicit adoption, a committed response loss, retained drafts, resubmission/closure and 12 language/theme/viewport combinations. CI retains the focused browser artifact. Deployment and customer UAT require separate evidence; adoption and task-completion baseline remain unmeasured.
