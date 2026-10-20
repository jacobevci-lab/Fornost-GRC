# Audit workpapers and sampling

Open Audit Management → audit → Workpapers. The existing theme is retained.

A workpaper records its objective, test procedure, population/source and count, selection method and rationale, owner, independent reviewer and conclusion. Up to 100 manually selected units have unique references, a pending/pass/exception result, test note and one pinned evidence version each. Judgmental selection makes no statistical confidence claim. Census submission requires every population unit to be represented; populations over 100 require another approach and cannot be labelled a completed census here.

Save drafts, then submit as the assigned owner. Submission requires a conclusion and completed, evidenced samples. Only the assigned reviewer can approve or return. Owners and reviewers must differ; a reviewer who previously saved content cannot approve that workpaper, including after reassignment. Return makes the draft editable. Owners or administrators can withdraw a submitted paper with a reason; recovery actions remain possible when other assignees become inactive or evidence disappears, retaining the original evidence snapshot. Approved workpapers require a reasoned reopen before changes; draft cancellation retains the record and its history. Every mutation stores a complete revision snapshot atomically. The UI exposes the latest 100 history events with an explicit truncation notice.

Workpapers require both audit and evidence read access; changes also require audit write access and an active Admin/Editor account. Current actor/assignee policies, evidence identity and metadata, parent existence and expected workpaper revision are checked inside the committing transaction. Conflicting writes preserve the browser draft. SQL triggers prevent writes to closed audits. Evidence versions remain pinned when newer library versions appear; changed pinned metadata blocks submission/approval rather than silently replacing the review basis.

Status-report and closure snapshots include workpapers and their sample/evidence metadata. Workpaper edits change the source token; any workpaper still in draft or review blocks whole-audit closure. Approved and reason-cancelled records are retained in reports. Closed-audit changes require the existing whole-audit reopen flow. Saved report hashes cover these records; file bytes are not bundled.

Limits: 100 workpapers per audit (including cancelled records), 100 samples per paper, 500 current evidence choices plus the selected paper's pinned versions, and the existing 8 MB report package limit. Limits are explicit. Exceptions do not automatically create findings or clear CAPA. Per-sample decisions are recorded as content of the whole workpaper review, not separate approvals. Statistical selection and workpaper email reminders are not implemented. Current owner/reviewer tasks are available in My Work as described below.

Validation: `tests/audit-workpapers.test.ts` exercises real SQLite transactions, role/ownership boundaries, pinned evidence, stale writes, commit-time races, rollback, report snapshot integrity and closed-audit guards. `scripts/audit-workpapers-qa.mjs` exercises browser creation, double-click prevention, draft preservation, review lifecycle, history, accessibility and TR/EN light/dark desktop/mobile views in an isolated runtime.

## My Work handoff

Workpapers appear in My Work from their authoritative current state. Drafts belong to the owner; submitted work also appears for the assigned independent reviewer and waits for review in the owner's queue. Returned or withdrawn papers become owner preparation work again. Approved and cancelled papers are completed work; reopening restores the owner task. The task opens the exact audit, Workpapers tab and paper, including history. A removed target produces an explicit unavailable message.

The inbox query returns only identifiers, title, state, assignments and timestamps, never sample content or evidence metadata. Both audit and evidence read grants are required. Orphaned audit records are excluded and reads above 1,000 papers explicitly mark the inbox incomplete. No duplicate task records, new deadlines, email reminders or automatic CAPA are created by this projection.

## Bulk sample entry

In an editable draft, open **Import samples from CSV**. Download the template or paste/upload UTF-8 CSV with exactly `reference,note` headers. Comma, semicolon and tab delimiters, a UTF-8 BOM, quoted delimiters, escaped quotes and multiline notes are supported. Preview all rows before adding them to the draft.

The entire import is rejected on malformed rows, missing/oversized references or notes, duplicate references (including the current draft, ignoring case and outer whitespace), more than 100 combined samples, or a sample count above the current population. Files are limited to 1 MB. Changing population or current samples revalidates the preview. No rows are silently skipped or replaced. Clearing the import does not delete existing draft samples.

Imports append references and notes only. Every new sample is Pending with no evidence version; choose results and pinned evidence manually. Preview and append are local and do not save a workpaper. **Save draft** uses the existing authorized, revision-checked transaction and history; submission and independent review requirements remain unchanged. This is bulk entry of a human-selected sample, not statistical selection or automatic testing.
