# Audit milestones, scheduled work and independent review

Open **Audit Management → selected audit → Plan and scope → Tasks and milestones**. The existing plan's free-text milestone notes are preserved; they are not parsed into tasks. Create explicit milestones with a title, expected output, active owner, due date and IANA time zone. Saving creates the current-source My Work item immediately. My Work reads the stored task directly. No automatic owner inference is introduced; recurring periods are explicitly created as described below.

## Ownership and lifecycle

Each milestone is planned, in progress, in review, changes requested, completed or cancelled. An Editor can create and update their own work; an Admin can assign or reassign it to any active audit writer. The current owner or an Admin manages preparation, cancellation and reopening. Only the assigned independent reviewer can approve or return submitted work. Both need current audit-write access. Evidence-read permission is not required: these are planning/delivery tasks, not evidence reviews or workpaper approvals.

Start is available for planned or returned work. Unreviewed planned/in-progress work can be completed directly. A task with a reviewer must be submitted and independently approved. Open work can be cancelled with a reason. Reopen restores completed/cancelled work to planned. Editing terminal work requires reopening. Updates and state changes require a reason of 3–2,000 characters; creation may omit the reason. Direct completion records the owner's or Admin's statement. Reviewed completion records the assigned reviewer's decision. Neither is an audit opinion. Cancelling/reopening can recover work whose former owner is disabled; assigning, starting, submitting, approving or repeating requires a currently eligible owner and any assigned reviewer. An eligible reviewer can return work even if the owner has since been disabled; an Admin can then cancel/reopen and reassign it. Editors cannot use reassignment to act for another owner.

Dates must be real calendar dates. The deadline is the end of the selected local day, converted to an instant with DST awareness. The plan panel marks open past-due tasks; My Work receives the same exact deadline. A request reminder calendar does not shift these dates. Opt-in reminders use that calendar for notification timing without changing task deadlines.

## Consistency, limits and history

Migration `0094_audit_milestones.sql`, canonical schema and idempotent runtime initialization provide milestone and event tables. Each mutation checks the exact parent and expected revision, active actor/owner identities, role and policy snapshots at commit. Task change, complete event snapshot and report-source invalidation commit atomically. Concurrent updates return a conflict without overwriting the draft or appending a false event. The browser prevents duplicate submissions and retains the new task ID across an ambiguous failure; reload before retrying a conflicting operation.

An audit allows at most 100 milestones, including cancelled ones. They are retained, not deleted through a UI/API action. The panel shows the latest 100 events for the selected task and discloses truncation; older events remain stored. This is application history, not WORM or tamper-proof database retention. The My Work source returns up to 1,000 milestones and marks larger reads incomplete. Its projection includes identifiers, owner, title, state and dates, not descriptions or change history. Missing parent audits are excluded.

## Reports, closure and navigation

Milestones are a distinct item type in audit status reports and whole-audit closure snapshots. Their expected output, assignment, due date/time zone, state and latest reason are included in the saved report hash and HTML/PDF/CSV/JSON scope. Earlier reports retain their earlier task state. Open milestones block whole-audit closure; complete them or explicitly cancel them with a reason. Closing the request work plan remains a separate operation and does not certify milestone completion.

Closed-audit SQL guards reject milestone insertion, update and deletion. A task change while closure is pending invalidates its source revision, requiring the existing return/withdraw/resubmit flow. Reopening an audit preserves milestone outcomes and history; it does not automatically reopen every task.

My Work opens the exact audit, Plan and scope tab and selected milestone. Completed/cancelled work remains in completed items; reopened work becomes active again. A missing target is reported explicitly. Copy record link resolves the exact task after authenticated access checks, as described below.

## Validation and remaining scope

SQLite-backed tests cover roles, current grants, active assignments, stale/cross-parent writes, commit-time races, event rollback, local/DST deadlines, retained history, source/report integrity, closed-audit locks and bounds. The isolated browser suite exercises creation, duplicate-click prevention, conflict recovery, owner lifecycle, exact My Work navigation, loading failure/retry, accessibility and TR/EN × both themes × desktop/mobile layouts.

Background recurrence scheduling and annual capacity planning remain separate work. Existing narrative notes are not silently converted into invented assignments or dates.

## Exact task links

A saved milestone exposes **Copy record link** outside its edit controls, including for read-only users and completed/cancelled tasks. The link resolves the exact milestone and parent audit after sign-in and opens **Plan and scope** with that task focused. Current audit module grants are checked on every resolution; a wrong parent, deleted audit/task or revoked access returns unavailable. A link grants no write permissions and does not schedule email reminders. Unsaved drafts and failed/unverified loads do not expose a new copy action.

## Reusable draft templates

Open **Templates** in a new or editable milestone. Four bilingual starters cover scope agreement, evidence preparation, fieldwork and closure preparation. Preview the proposed title and expected output beside the current draft. Populated fields start unchecked; select only the fields to replace and choose **Apply selected fields to draft**. Nothing is written until **Save milestone**. The existing owner, due date, time zone, status, revision and reason stay unchanged; terminal tasks must still be reopened before editing.

Name and download the current draft as a JSON template to reuse customized text. Paste that JSON into another task's Templates panel and preview it. Only title and description are accepted; wrong types/versions, unknown fields and over-limit text are rejected without changing the draft. Portable JSON transfers text; the separate shared library provides central definitions and task packs. Neither grants approval nor schedules reminders. Review exported business text before sharing it.

## Prerequisite milestones

An editable task can select up to 20 distinct prerequisites from the same audit. Save the selection with the usual reason. A prerequisite must be **completed** before the dependent task can start, submit for review or complete; cancelled tasks do not satisfy it. Self-links, cycles and links to another audit are rejected. Dates are not automatically shifted.

A completed prerequisite cannot be reopened while a dependent is in progress, in review, returned for changes or completed. First reopen the completed dependent to planned, or explicitly cancel active dependent work with a reason; then reopen its prerequisite. Editing an in-progress task cannot add an incomplete prerequisite. Removing prerequisites is an explicit saved edit recorded in history.

The server checks the full bounded audit graph and guards every task revision in the atomic write. Concurrent dependency or prerequisite-state changes return a conflict without a partial task or history write. Older clients that omit the dependency field preserve saved links. No schema migration is required; older tasks have no prerequisites.

My Work displays the number of incomplete prerequisites and includes owned blocked tasks in Waiting. Open the exact task for prerequisite titles and current states; refresh after prerequisite changes. Status/closure snapshots preserve the prerequisite IDs, including historical exports. Pending independent review does not satisfy a prerequisite. Evidence acceptance remains its own workflow.


## Explicit recurring milestones

Choose One-off, Weekly, Monthly, Quarterly, or Yearly in the task editor and save it. Once the task is completed, enter an action reason and select **Create next occurrence**. The button previews the next due date. Completion itself does not create another task; there is no automatic creation scheduler. Email reminders follow the copied task setting.

The successor copies the title, description, active owner, IANA time zone, and recurrence. It starts as Planned with a new ID and history. Its sole initial prerequisite is the previous occurrence; other prerequisite links must be selected again for the new period. Previous/next occurrence buttons navigate the chain. The completed original remains unchanged. If its planned successor exists, reopening the original blocks that successor until the original is completed again; an active/completed successor prevents reopening the original under the ordinary dependency rules.

Dates advance from the saved due date, not the date the button is clicked. Weekly means seven calendar days; monthly/quarterly/yearly mean one/three/twelve calendar months. The day-of-month anchor survives short months (31 January → 28 February → 31 March) and leap years. Editing a successor's due date or cadence establishes a new anchor. Old dates are not silently skipped. Switching to One-off stops creation of further successors.

Only the owner or an administrator can create the next occurrence. Actor and copied owner must still be active audit writers. The original must remain completed at the supplied revision; the entire audit graph is revision guarded at commit. Each original can have only one successor, including cancelled successors. Reload after an uncertain response and navigate to the existing successor; reopen that task if needed. The 100-task audit limit includes every occurrence. Closed audits reject creation, and task/event writes roll back together. Recurrence, anchor, and previous-occurrence identity appear in history and immutable status reports. Portable narrative templates deliberately exclude scheduling and lineage.


## Opt-in email reminders

Enable **Email reminders** on an editable task and save. Existing tasks default to disabled. The preview lists advance, due-day, overdue and optional escalation dates from the audit's **Requests and review → Reminder calendar and escalation** profile; each milestone uses its own IANA time zone. Default timing is one day before, due day, and three days overdue. There is no assignment email. Non-working days/holidays pause reminders, and overdue tasks remain overdue in My Work even when their reminder is deferred.

The latest applicable phase is queued, with at most one current owner/reviewer notice and one distinct escalation notice per task revision/profile revision/phase. Editing the task or profile can produce a new notice. Existing delivery history, retries, leases and recipient rate limits suppress duplicate attempts after transport acceptance. The 15-minute hosted scheduler (or configured on-prem scheduler) reconciles pending tasks; save also attempts to refresh the queue. If that queue step fails, the task remains saved and the UI says the scheduler will retry. The scan is bounded to 5,000 enabled open tasks and fails explicitly if exceeded.

Email transport and application HTTPS address remain in **Settings → Email & Notifications**. No new notification log screen is added. Messages contain audit/task IDs, date/time zone and an authenticated exact task link, never the title, narrative or evidence. Final delivery rechecks the live task, phase, profile, open audit and active recipient's audit-write access. Completion, cancellation, disabling reminders and reassignment withdraw superseded queued entries; already accepted mail cannot be recalled. A created next occurrence inherits opt-in but does not notify until its own reminder threshold. Real customer SMTP/Graph delivery remains installation/UAT validation; automated tests use mocked transport and do not send external mail.


## Create a task pack

In **Plan and scope → Tasks and milestones → Create task pack**, prepare the audit starter pack. Select any of the four scope, evidence preparation, fieldwork and closure tasks; edit the title and expected output, choose an eligible owner and IANA time zone, and enter each selected task’s due date. Dates are not inferred. The optional working-day planner previews and explicitly adjusts entered dates for all selected tasks using the saved audit calendar; see [task-pack date planning](audit-deadline-planning.md#task-pack-dates). The optional sequence links each selected task to the preceding selected task, including when intermediate starters are deselected.

**Preview task pack** shows the exact titles, descriptions, owners, dates and prerequisites without writing records. Editing invalidates the preview. **Save all tasks** creates the selected planned tasks and their individual history entries in one transaction. A conflict, closed audit, changed permission or event-write failure creates none of the pack. Stable client-generated IDs prevent an uncertain-response retry from creating duplicates. If a response cannot be confirmed, reload the list and inspect it before preparing another pack.

The customizable starter UI and API accept 1–12 tasks within the existing 100-task audit cap, including cancelled tasks. Editors assign themselves; admins may choose active audit writers. All tasks start with recurrence and email reminders disabled. Existing work is never overwritten. Created tasks use the same My Work links, dependency blocking, history, reports and closure checks as individually created tasks. This is explicit creation. Reusable definitions are managed in the separate shared library; recurring scheduling remains separate. Packs start without independent review; an Admin can configure each saved task before submission. Save or discard any individual milestone edits before using the pack.


## Shared definitions and custom packs

The [shared template library](audit-template-library.md) supports Admin-managed, versioned milestone text and task packs. Use it from Templates or Create task pack. Packs now allow adding, reordering and removing draft tasks, up to 12. Reordering preserves the task text/date and changes the optional prerequisite sequence at the next preview. Instantiating a shared pack resets all dates and preserves the target owner/time zone; review and save explicitly.


## Independent milestone review

An Admin can choose **Milestone reviewer** and **Milestone review due date** on a new or editable task. The reviewer must be a different active audit writer from the owner; the review date must be on or after the owner due date and uses the task's IANA time zone. Existing tasks and newly created task packs remain unreviewed until explicitly configured. Only an Admin can change/remove this assignment and date, with the ordinary change reason. Editors cannot bypass an assigned review by clearing these fields; older clients omitting both preserve them.

1. The owner or an Admin enters a preparation reason and chooses **Submit for review**. A designated reviewer cannot also submit the work, including when they are an Admin.
2. Submitted content and assignment are locked. The assigned reviewer reads the expected output and submission reason, then enters a decision reason and chooses **Approve and complete** or **Return for changes**. There is no administrator override for approval. The owner and actual submitter cannot approve their own work.
3. Returned work belongs to the owner again. Edit/save and resubmit as needed. Approved work is completed. Reopening clears the current approval and retains the reviewer requirement; another independent approval is needed.

My Work includes submitted tasks for their assigned reviewer and retains the owner's waiting item. It uses the review deadline while submitted, and the owner deadline while planned, in progress or returned. Pending/returned review remains open for audit closure and cannot satisfy downstream prerequisites. Reports and change history retain the reviewer, both dates, actual submitter/decision-maker and timestamps. Earlier snapshots do not change after a later decision. Saving revised returned content clears its prior current-decision metadata; the immutable application event snapshot retains that prior decision.

Opt-in email reminders switch to the reviewer and review date on submission, with `review-due-soon`, `review-due`, `review-overdue` and optional `review-escalation` phases. Return switches back to the owner and original owner deadline, which may already be overdue. Each transition cancels superseded queued reminders atomically; the final delivery guard rejects stale phases, assignments, revisions and revoked recipients. This adds no submission notification or new email settings/log page.

A recurring successor copies the reviewer and shifts the review date by the original calendar-day gap after its new owner date. It contains no submission or approval and needs a fresh review. Dates do not automatically follow business-day calendars. Cancelled work is explicitly excluded from closure blockers but remains distinguishable from approved completion. Independent milestone sign-off is a single task decision, not multi-level approval, an electronic signature certification or an evidence/workpaper approval.

The review regression covers same-person and unassigned-Admin denial, locked submissions, owner bypass attempts, live reviewer role/policy/revision races, atomic rollback, deadline/recipient handoff, return/resubmit, dependency and closure blockers, retained report snapshots and fresh review on recurrence. The browser regression uses distinct owner/reviewer accounts, real My Work navigation, duplicate-decision prevention, conflict recovery and TR/EN desktop/mobile accessibility checks.


## Working-day date proposals

Editable tasks offer a reasoned next-working-day preview based on the audit calendar. Apply to the draft, inspect the dates, then save. Review-date changes remain Admin-only; no lifecycle or independent review rule is bypassed. Calendar conflicts preserve the draft, with calendar-only refresh and undo/re-preview recovery. See [deadline planning](audit-deadline-planning.md).
