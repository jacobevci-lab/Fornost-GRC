# Audit milestones and scheduled owner work

Open **Audit Management → selected audit → Plan and scope → Tasks and milestones**. The existing plan's free-text milestone notes are preserved; they are not parsed into tasks. Create explicit milestones with a title, expected output, active owner, due date and IANA time zone. Saving creates the current-source My Work item immediately. No separate task copy, email publisher, recurrence or automatic owner inference is introduced.

## Ownership and lifecycle

Each milestone is planned, in progress, completed or cancelled. An Editor can create and update their own work; an Admin can assign or reassign it to any active audit writer. Only the current owner or an Admin can edit or change state. Both need current audit-write access. Evidence-read permission is not required: these are planning/delivery tasks, not evidence reviews or workpaper approvals.

Start is available for planned work. Complete/cancel is available for planned or in-progress work. Reopen restores completed/cancelled work to planned. Editing terminal work requires reopening. Updates and state changes require a reason of 3–2,000 characters; creation may omit the reason. Completion records the owner's or Admin's statement, not independent review or an audit opinion. Cancelling/reopening can recover work whose former owner is disabled; assigning, starting or completing requires a currently eligible owner. Editors cannot use reassignment to act for another owner.

Dates must be real calendar dates. The deadline is the end of the selected local day, converted to an instant with DST awareness. The plan panel marks open past-due tasks; My Work receives the same exact deadline. A request reminder calendar does not shift these dates. No milestone email reminder or escalation is sent in this increment.

## Consistency, limits and history

Migration `0094_audit_milestones.sql`, canonical schema and idempotent runtime initialization provide milestone and event tables. Each mutation checks the exact parent and expected revision, active actor/owner identities, role and policy snapshots at commit. Task change, complete event snapshot and report-source invalidation commit atomically. Concurrent updates return a conflict without overwriting the draft or appending a false event. The browser prevents duplicate submissions and retains the new task ID across an ambiguous failure; reload before retrying a conflicting operation.

An audit allows at most 100 milestones, including cancelled ones. They are retained, not deleted through a UI/API action. The panel shows the latest 100 events for the selected task and discloses truncation; older events remain stored. This is application history, not WORM or tamper-proof database retention. The My Work source returns up to 1,000 milestones and marks larger reads incomplete. Its projection includes identifiers, owner, title, state and dates, not descriptions or change history. Missing parent audits are excluded.

## Reports, closure and navigation

Milestones are a distinct item type in audit status reports and whole-audit closure snapshots. Their expected output, assignment, due date/time zone, state and latest reason are included in the saved report hash and HTML/PDF/CSV/JSON scope. Earlier reports retain their earlier task state. Open milestones block whole-audit closure; complete them or explicitly cancel them with a reason. Closing the request work plan remains a separate operation and does not certify milestone completion.

Closed-audit SQL guards reject milestone insertion, update and deletion. A task change while closure is pending invalidates its source revision, requiring the existing return/withdraw/resubmit flow. Reopening an audit preserves milestone outcomes and history; it does not automatically reopen every task.

My Work opens the exact audit, Plan and scope tab and selected milestone. Completed/cancelled work remains in completed items; reopened work becomes active again. A missing target is reported explicitly. Shared record-link URLs remain scoped to their existing record/request/workpaper target kinds; milestone navigation in this increment is through the audit workspace and My Work.

## Validation and remaining scope

SQLite-backed tests cover roles, current grants, active assignments, stale/cross-parent writes, commit-time races, event rollback, local/DST deadlines, retained history, source/report integrity, closed-audit locks and bounds. The isolated browser suite exercises creation, duplicate-click prevention, conflict recovery, owner lifecycle, exact My Work navigation, loading failure/retry, accessibility and TR/EN × both themes × desktop/mobile layouts.

Dependencies, recurrence, annual capacity planning, reminder emails and independent milestone sign-off remain separate work. Existing narrative notes are not silently converted into invented assignments or dates.

## Exact task links

A saved milestone exposes **Copy record link** outside its edit controls, including for read-only users and completed/cancelled tasks. The link resolves the exact milestone and parent audit after sign-in and opens **Plan and scope** with that task focused. Current audit module grants are checked on every resolution; a wrong parent, deleted audit/task or revoked access returns unavailable. A link grants no write permissions and does not schedule email reminders. Unsaved drafts and failed/unverified loads do not expose a new copy action.

## Reusable draft templates

Open **Templates** in a new or editable milestone. Four bilingual starters cover scope agreement, evidence preparation, fieldwork and closure preparation. Preview the proposed title and expected output beside the current draft. Populated fields start unchecked; select only the fields to replace and choose **Apply selected fields to draft**. Nothing is written until **Save milestone**. The existing owner, due date, time zone, status, revision and reason stay unchanged; terminal tasks must still be reopened before editing.

Name and download the current draft as a JSON template to reuse customized text. Paste that JSON into another task's Templates panel and preview it. Only title and description are accepted; wrong types/versions, unknown fields and over-limit text are rejected without changing the draft. Templates are portable text, not centrally shared records, task batches, dependencies, scheduled reminders or approvals. Review exported business text before sharing it.
