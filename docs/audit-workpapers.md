# Audit workpapers and sampling

Open Audit Management → audit → Workpapers. The existing theme is retained.

A workpaper records its objective, test procedure, population/source and count, selection method and rationale, owner, independent reviewer and conclusion. Up to 100 manually selected units have unique references, a pending/pass/exception result, test note and one pinned evidence version each. Judgmental selection makes no statistical confidence claim. Census submission requires every population unit to be represented; populations over 100 require another approach and cannot be labelled a completed census here.

Save drafts, then submit as the assigned owner. Submission requires a conclusion and completed, evidenced samples. Only the assigned reviewer can approve or return. Owners and reviewers must differ; a reviewer who previously saved content cannot approve that workpaper, including after reassignment. Return makes the draft editable. Owners or administrators can withdraw a submitted paper with a reason; recovery actions remain possible when other assignees become inactive or evidence disappears, retaining the original evidence snapshot. Approved workpapers require a reasoned reopen before changes; draft cancellation retains the record and its history. Every mutation stores a complete revision snapshot atomically. The UI exposes the latest 100 history events with an explicit truncation notice.

Workpapers require both audit and evidence read access; changes also require audit write access and an active Admin/Editor account. Current actor/assignee policies, evidence identity and metadata, parent existence and expected workpaper revision are checked inside the committing transaction. Conflicting writes preserve the browser draft. SQL triggers prevent writes to closed audits. Evidence versions remain pinned when newer library versions appear; changed pinned metadata blocks submission/approval rather than silently replacing the review basis.

Status-report and closure snapshots include workpapers and their sample/evidence metadata. Workpaper edits change the source token; any workpaper still in draft or review blocks whole-audit closure. Approved and reason-cancelled records are retained in reports. Closed-audit changes require the existing whole-audit reopen flow. Saved report hashes cover these records; file bytes are not bundled.

Limits: 100 workpapers per audit (including cancelled records), 100 samples per paper, 500 current evidence choices plus the selected paper's pinned versions, and the existing 8 MB report package limit. Limits are explicit. Exceptions do not automatically create findings or clear CAPA. Per-sample decisions are recorded as content of the whole workpaper review, not separate approvals. Statistical selection is not implemented. Current owner/reviewer tasks are available in My Work as described below.

Validation: `tests/audit-workpapers.test.ts` exercises real SQLite transactions, role/ownership boundaries, pinned evidence, stale writes, commit-time races, rollback, report snapshot integrity and closed-audit guards. `scripts/audit-workpapers-qa.mjs` exercises browser creation, double-click prevention, draft preservation, review lifecycle, history, accessibility and TR/EN light/dark desktop/mobile views in an isolated runtime.

## My Work handoff

Workpapers appear in My Work from their authoritative current state. Drafts belong to the owner; submitted work also appears for the assigned independent reviewer and waits for review in the owner's queue. Returned or withdrawn papers become owner preparation work again. Approved and cancelled papers are completed work; reopening restores the owner task. The task opens the exact audit, Workpapers tab and paper, including history. A removed target produces an explicit unavailable message.

The inbox query returns only identifiers, title, state, assignments, planned deadlines/time zone, the current deadline instant and timestamps, never sample content or evidence metadata. Both audit and evidence read grants are required. Orphaned audit records are excluded and reads above 1,000 papers explicitly mark the inbox incomplete. The projection uses saved deadlines only; it creates no duplicate task records, automatic CAPA.

## Bulk sample entry

In an editable draft, open **Import samples from CSV**. Download the template or paste/upload UTF-8 CSV with exactly `reference,note` headers. Comma, semicolon and tab delimiters, a UTF-8 BOM, quoted delimiters, escaped quotes and multiline notes are supported. Preview all rows before adding them to the draft.

The entire import is rejected on malformed rows, missing/oversized references or notes, duplicate references (including the current draft, ignoring case and outer whitespace), more than 100 combined samples, or a sample count above the current population. Files are limited to 1 MB. Changing population or current samples revalidates the preview. No rows are silently skipped or replaced. Clearing the import does not delete existing draft samples.

Imports append references and notes only. Every new sample is Pending with no evidence version; choose results and pinned evidence manually. Preview and append are local and do not save a workpaper. **Save draft** uses the existing authorized, revision-checked transaction and history; submission and independent review requirements remain unchanged. This is bulk entry of a human-selected sample, not statistical selection or automatic testing.

## Preparation and review deadlines

Drafts may have a preparation due date and a review due date, entered together with an IANA time zone. Both dates may be empty; existing undated records remain valid. Review cannot be due before preparation. Deadlines mean the end of the selected local calendar day, including daylight-saving transitions.

My Work uses preparation for drafts (including returned, withdrawn and reopened papers), switches to review on submission, and removes the active deadline on approval or cancellation. Its overdue filters, sorting and exports use the server-computed instant. Both planned dates remain visible in details, revision history and immutable report/closure snapshots. Dates never create duplicate tasks or send email.

Only existing authorized draft editors can change the dates. Submitted papers must be withdrawn/returned, and approved papers reopened with a reason before edits. Existing revision conflicts, atomic history and closed-audit guards apply. Saves from older clients that omit the new fields preserve the current schedule; explicitly emptying both dates removes it. No automatic rescheduling occurs after return or reopening. Business-day adjustment of saved deadlines remains separate work.

## Optional email reminders

Enable **Email reminders** on a draft with both deadlines. Existing workpapers default to disabled. Preparation reminders go to the owner; submitted review reminders go to the independent reviewer. Return, withdrawal and reopening restore preparation reminders. Approval and cancellation stop them. The audit reminder profile supplies advance, due, overdue, business-day/holiday and escalation rules; dates are evaluated in the workpaper time zone. The calendar controls notification dates, not saved deadlines.

Only the latest due phase and a distinct configured escalation recipient are queued. Identity includes workpaper revision, phase and profile revision; repeated scheduler runs do not send the same notice again. Edits and profile changes can create a new notice. Queue withdrawal is atomic with workpaper/history updates. Legacy clients omitting the preference preserve it; explicitly false disables it. Clearing dates requires disabling reminders.

Before dispatch, the service checks the current workpaper, open audit, revision, profile, phase, active recipient, audit write access and evidence read access. Email contains identifiers and deadline only, with an authenticated exact workpaper link when the application URL is configured. Sample content, narratives and evidence metadata are excluded. Existing transport settings, retries and rate limits apply; no new log screen is added. A saved action whose queue synchronization fails reports that the scheduler will retry. Source reads exceeding 5,000 active opted-in workpapers fail explicitly. Real customer mail transport UAT remains required.
