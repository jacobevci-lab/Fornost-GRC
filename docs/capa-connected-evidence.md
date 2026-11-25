# Connected CAPA decisions

The existing Findings and CAPA workspace uses directory accounts for intake and actual Evidence Library file versions for remediation submission, independent closure and risk acceptance. It keeps the current menu, palette and governance rules.

## Complete the workflow

1. Create a finding with source details, root cause, corrective/preventive actions and due date. Select an active full-access owner and an active Admin reviewer distinct from both creator and owner. Risk/control references must resolve to the correct canonical register.
2. The owner or authorized Admin starts CAPA. Every decision opens the current source, with finding description, root cause, action plan, assignments, status, due date and source/risk/control references available for review.
3. Submit completed corrective work by selecting an evidence record and its actual file version. The server derives and checks the reference/digest; the user supplies a note and exact confirmation.
4. The assigned independent Admin selects verification evidence and closes an eligible finding. The detector, owner and submitter cannot close their own work. Existing risk/control mapping and governance gates still apply.
5. Alternatively, the assigned independent Admin can accept an open/in-progress risk with separate evidence, a reason of at least 20 characters and expiry no more than 180 days ahead. Acceptance is distinct from closure.
6. An Admin can reopen verification, accepted or closed findings. Previous decisions remain in the event history with their own immutable file-version evidence.

Source audit/workpaper/continuous-assurance evidence documents detection. It does not automatically satisfy corrective-action submission or independent verification. Evidence adequacy remains a human judgment.

## Recover without losing the decision draft

The context read has a 10-second deadline; decision writes have a 15-second deadline, including JSON parsing. A failed read or rejected decision retains notes, evidence choices, expiry and rationale while the dialog stays open. Conflicts and uncertain writes block resubmission until **Refresh decision context** succeeds. If the source changed, inspect the updated plan, choose **Use current context** and enter confirmation again. Refresh itself does not write.

A decision already completed by a lost response or another actor is unavailable in the refreshed context. Closing after detecting a changed source refreshes the register and its history. In-flight writes block duplicate submission and dismissal. Closing the dialog or navigating away discards unsaved draft fields. Creation retains its existing separate uncertain-outcome reconciliation behavior.

## History, usage and permissions

Each decision event shows **Retained decision evidence** with file/version identity, actor/time and an authenticated file link. Its retained snapshot also includes the verified hash. Remediation submission, independent closure and risk acceptance are three separate purposes. New uploads never replace a historical selected version, and reopening does not erase it. Legacy text/hash events remain visibly unpinned.

**Evidence Library → Evidence Usage → Findings and CAPA** shows these historical decisions with exact navigation to the finding. Mutable finding reference rows are separate; a retained decision does not claim current approval. Missing source records, read failures, restricted scope and bounded coverage remain explicit. Referenced canonical evidence cannot be deleted.

Full-access Admin/Editor accounts can use intake and selection under existing workflow permissions. Start/submission requires the owner or authorized Admin; closure/risk acceptance requires the assigned independent Admin. Full-access Viewers can inspect findings, history and usage, but cannot decide. Scoped core-module access does not grant enterprise CAPA access. The server checks these boundaries independently of the UI.

## API and operating limits

- Directory intake adds `assignmentMode: directory` to `POST /api/findings` with `action: create`. Eligible assignees and the acting identity/access are rechecked in the committing SQL claim.
- New decisions read `GET /api/findings?view=decision&findingId=…`, then submit `decisionMode: reviewed` and the exact `expectedRevision`. The claim binds the complete source row, including plan content and assignments, rather than relying only on `updated_at`.
- The three evidence-bearing transitions also send `evidenceMode: library` and `evidenceSelection: { evidenceId, versionId }`. The server validates chain, identity and bytes. Lifecycle update, event and pin are one SQL transaction; report revision trigger writes do not create a false conflict. Source/access races and event/pin failures cannot partially advance a finding.
- Object-store validation happens before SQL and is not a distributed transaction. SQL-backed selected bytes are included in the committing evidence guard.
- Legacy callers omitting the new modes keep their reference/hash contract and do not acquire canonical pins. Existing risk/control, independent-review and acceptance-date rules remain authoritative.
- History pages contain at most 50 events; only those events' evidence pins are returned. Older pages retain their own decisions. The register remains server-paged with exact source navigation.
- Evidence Usage scans up to 1,000 recent mutable finding references plus up to 200 matching retained CAPA decisions, a combined source bound of 1,200. Either scan exceeding its limit or a missing decision parent marks coverage limited; an error never appears as complete. This is not an archive-wide scan.
- Shared selectors page through 50 evidence records, inspect up to 1,000 versions per record and expose up to 1,000 account search results with incomplete-list hints. Selection does not silently substitute another version.

No business-schema migration, automatic reassessment, new email option or external portal is introduced. Application rollback must retain events and canonical pins. `tests/capa-connected-evidence.test.ts` covers actual route/SQLite transactions and races; `tests/workflow-evidence-usage.test.ts` covers history, exact targets and source bounds. `scripts/capa-connected-evidence-qa.mjs` exercises the actual Chromium journey, roles, concurrent decisions, recovery, TR/EN, both themes and desktop/tablet/mobile accessibility. The delivery PR records exact run/artifact/revision receipts. Production rollout and customer UAT are separate from isolated browser acceptance.
