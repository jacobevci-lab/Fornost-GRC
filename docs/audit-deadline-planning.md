# Working-day deadline planning

In **Audit Management → audit → Plan and scope → Tasks and milestones**, or an editable **Workpapers** draft, use **Preview working-day dates** after entering the due dates and time zone. A saved business-day reminder profile is required; configure it in **Requests and review** and reload the task/paper screen first.

The planner uses that audit's pinned working weekdays and explicit holidays. Each non-working deadline moves forward to its next working day. Already working dates remain unchanged. Preparation and review are calculated independently: they may converge, and their original day gap is not preserved. The time zone stays unchanged; arithmetic is on calendar dates, including across DST, leap days and year boundaries. It does not assume a Monday–Friday week or a jurisdiction's holidays.

Inspect the old/new dates, enter a reason, and choose **Apply dates to draft**. Preview, close, apply and **Undo proposed dates** make no server writes. Date/time-zone or calendar changes invalidate an open preview. **Save milestone** / **Save draft** persists through the normal lifecycle; manually editing the proposed dates clears their association with the proposal on save. You may still enter dates manually.

The server recalculates the proposed dates from the current saved audit profile. Both the exact profile contents and revision are checked inside the record/history transaction. A conflicting profile change or deletion leaves the record, history, report source token and queued notices unchanged. For a calendar conflict, use **Refresh calendar (keep draft)** on milestones or **Retry (keep draft)** on workpapers, then undo the previous proposal and preview again. Other draft fields remain intact. Ordinary record/assignment conflicts still require the existing reload/review flow.

The successful save's existing revision-history snapshot includes the original/proposed dates, time zone, reason, calendar revision, working weekdays, holiday list and shared calendar origin when present. Current My Work deadlines and new status-report/closure snapshots use the saved dates. Older reports stay unchanged. The adjustment explanation lives in the save event, not as a permanent promise that a date continues to match a later calendar version.

Only existing authorized editors can use the planner. Milestone review dates remain Admin-only: an Editor sees why a proposal requiring a review-date change cannot be applied. Submitted/completed/approved records retain their existing lifecycle locks; there is no alternative write endpoint or approval bypass. Whole-audit closure locks and normal active-account, evidence, graph and revision guards remain enforced.

This is an explicit adjustment of one editable milestone or workpaper. It does not automatically reschedule existing records when calendars change, adjust request deadlines or task packs, change recurring-period rules, move dependent tasks, or enable email. Email transport remains under Settings → Email & Notifications.

Validation: `tests/audit-deadline-adjustment.test.ts`, the calendar scenarios in `tests/audit-milestones.test.ts` and `tests/audit-workpapers.test.ts`, and `scripts/audit-deadline-adjustment-qa.mjs`. Browser QA uses isolated synthetic records and removes its audit/disables its temporary accounts.
