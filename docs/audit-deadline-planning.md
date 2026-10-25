# Working-day deadline planning

In **Audit Management → audit → Plan and scope → Tasks and milestones**, an editable **Workpapers** draft, or **Requests and review → Add request / Edit**, use **Preview working-day dates** after entering the due dates and time zone. A saved business-day reminder profile is required; configure it in **Requests and review** and reload the task/paper screen first.

The planner uses that audit's pinned working weekdays and explicit holidays. Each non-working deadline moves forward to its next working day. Already working dates remain unchanged. Preparation and review are calculated independently: they may converge, and their original day gap is not preserved. The time zone stays unchanged; arithmetic is on calendar dates, including across DST, leap days and year boundaries. It does not assume a Monday–Friday week or a jurisdiction's holidays.

Inspect the old/new dates, enter a reason, and choose **Apply dates to draft**. Preview, close, apply and **Undo proposed dates** make no server writes. Date/time-zone or calendar changes invalidate an open preview. **Save milestone** / **Save draft** / **Save request** persists through the normal lifecycle; manually editing the proposed dates clears their association with the proposal on save. You may still enter dates manually.

The server recalculates the proposed dates from the current saved audit profile. Both the exact profile contents and revision are checked inside the record/history transaction. A conflicting profile change or deletion leaves the record, history, report source token and queued notices unchanged. For a calendar conflict, use **Refresh calendar (keep draft)** on milestones or **Retry (keep draft)** on workpapers, then undo the previous proposal and preview again. Other draft fields remain intact. Ordinary record/assignment conflicts still require the existing reload/review flow.

The successful save's existing revision-history snapshot includes the original/proposed dates, time zone, reason, calendar revision, working weekdays, holiday list and shared calendar origin when present. Current My Work deadlines and new status-report/closure snapshots use the saved dates. Older reports stay unchanged. The adjustment explanation lives in the save event, not as a permanent promise that a date continues to match a later calendar version.

Only existing authorized editors can use the planner. Milestone review dates remain Admin-only: an Editor sees why a proposal requiring a review-date change cannot be applied. Submitted/completed/approved records retain their existing lifecycle locks; there is no alternative write endpoint or approval bypass. Whole-audit closure locks and normal active-account, evidence, graph and revision guards remain enforced.

This is an explicit adjustment of editable milestones, task-pack drafts, workpapers or evidence requests. It does not automatically reschedule existing records when calendars change, change recurring-period rules, move dependent tasks, or enable email. Email transport remains under Settings → Email & Notifications.

Validation: `tests/audit-deadline-adjustment.test.ts`, the calendar scenarios in `tests/audit-milestones.test.ts` and `tests/audit-workpapers.test.ts`, and `scripts/audit-deadline-adjustment-qa.mjs`. Browser QA uses isolated synthetic records and removes its audit/disables its temporary accounts.

## Evidence request dates and independent return

Request creation and editing use the same planner for delivery and review dates. The evidence period, assignments, evidence versions and work-plan time zone are not changed by a proposal. Before launch the displayed context is UTC; the launch confirmation selects the effective work-plan zone. Date-only calendar arithmetic does not depend on that later zone. Active requests always use their saved work-plan zone, and an adjustment cannot override it.

The assigned independent reviewer can also preview and apply **New delivery due / New review due** before **Request changes**. Applying is still a local draft change. The separate decision reason remains required. Acceptance and cancellation never apply proposed return dates. Editing an already submitted request retains the existing behavior: review stops and the owner must resubmit evidence. Accepted/cancelled requests and closed work plans/audits retain their existing restrictions.

On a calendar conflict, use **Refresh calendar (keep draft)**, **Undo proposed dates**, then preview/apply again. This preserves title, acceptance criteria, assignments, evidence period and the review decision reason. Calendar refresh refuses a changed request or work-plan revision instead of silently adopting it over the draft. An ordinary record conflict requires the existing reload/review flow. Manually editing either deadline clears the proposed adjustment association.

Create/edit/return events expose the exact adjustment in **Activity history**. The proof belongs only to that event; subsequent submission, approval, manual edits or launch do not copy it. Draft requests remain silent until launch/activation. Saved active dates feed the existing My Work, reminder reconciliation and future report/closure snapshots. Adjustment commits bind the exact calendar, work-plan revision/state/zone and acting account identity/status/policy; event failure leaves no partial record or reminder cancellation. No migration or additional write endpoint is introduced.

Request verification: the planning cases in `tests/audit-request-workflow.test.ts` and `scripts/audit-request-deadline-qa.mjs` cover create/edit/independent return, silent drafts, stale input, calendar and permission races, immutable event proof, transactional rollback, draft-preserving recovery and bilingual responsive accessibility.

## Task pack dates

In **Plan and scope → Tasks and milestones → Create task pack**, enter dates for the selected tasks and use **Preview pack working-day dates**. The preview lists every selected task's original/proposed date, including unchanged dates, and the saved calendar context. Excluded tasks are untouched. Each deadline moves independently; dates can converge or retain an existing nonchronological order. The planner does not infer task durations, reorder work or reschedule dependencies.

Enter one reason and choose **Apply pack dates to draft**. Titles, descriptions, owner and the optional dependency chain remain editable. Date, time-zone, selection and ordering controls are locked until **Undo proposed pack dates** restores the original dates. Preview/apply/undo never write records. Use **Preview task pack**, inspect the final dates and sequence, then **Save all tasks**. Original task identities remain stable across re-preview and retry.

The server recomputes every selected task's date by exact identity, requires the complete selected set, rejects altered results or a wholly unchanged proposal, and binds the current calendar revision and exact contents inside the existing atomic batch. All tasks and their history commit together. Each task's creation history retains the original/proposed date, common reason and calendar proof, including unchanged dates in a mixed proposal. That proof is not copied into later lifecycle actions. Saved dates feed My Work and future status/closure snapshots.

If the calendar changes, the draft remains. **Refresh calendar and undo proposed dates** fetches only the calendar for local use, restores the original entered dates, and preserves task text, selection, order, owner and prerequisite choice. Preview and apply against the new calendar. A failed refresh preserves the existing proposal. This refresh does not silently update the task list, account permissions or other records; ordinary graph, assignment and audit-state conflicts still require normal review/reload. The exact server guards always apply.

The existing 1–12 task and 100 tasks/audit bounds, Editor self-assignment, Admin eligible-owner assignment, closed-audit protection and history rollback remain in force. New tasks keep review, reminders and recurrence disabled until separately configured. Manual date entry remains available without a saved business calendar. No new schema, endpoint, email settings or scheduled process is added.

Verification: pack scenarios in `tests/audit-milestones.test.ts` and `scripts/audit-task-pack-deadline-qa.mjs` cover selected/unchanged dates, draft recovery, exact identity/zone/calendar guards, atomic rollback, retry identity, My Work and bilingual responsive accessibility.
