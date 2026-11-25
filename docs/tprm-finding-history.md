# Supplier finding feedback and retained decisions

Open **Vendor Management → Findings & CAPA → Decision history**, or open the exact finding from **My Work** and expand **Finding decision history** in its action dialog. Full-access Admin, Editor and Viewer accounts can inspect the history; action permissions stay unchanged. Scoped accounts cannot read the enterprise TPRM source.

The history shows recorded creation, remediation start, submission, return, verification and reopening events, with their original reason, actor and date. Recorded transitions distinguish a return from verification from reopening a closed finding. The current finding status, owner, due date and latest action note are shown separately. The action dialog also exposes the latest note so the owner can understand reviewer feedback before resubmitting.

Each submission or verification displays its own **Retained decision evidence** when a canonical file-version pin exists. A later submission or upload does not replace this earlier proof. The file opens through the existing authenticated evidence endpoint. A retained link is historical evidence of that decision, not a claim that the finding is currently closed. Legacy events without a canonical pin explicitly show that the retained version link is absent. Malformed pin data is reported rather than replaced with a newer version. Historical details never recorded by the old writer are not reconstructed.

History loads 20 events at a time. **Older**, **Newer** and **Latest entries** navigate the same finding; a new decision does not shift the next older page. **Refresh history** retries the current page. A failed read is shown as a failure rather than an empty history and does not clear an open action's note, evidence selection or confirmation. Close/Escape returns focus to the history button.

## API and operations

`GET /api/third-party-risk?view=finding-history&findingId=...` returns the current finding projection, `rows`, `before` and `nextCursor`. Pass the returned cursor as `before` to request the next older page. Cursors must identify an event on the same finding, assessment and supplier. Duplicate or unrecognized parameters, empty identifiers/cursors and identifiers over 100 characters are rejected. No global recent-event cutoff is used. Missing canonical sources return 404; invalid input returns 400; unavailable history returns 503.

This is a read-only projection of existing `third_party_events` and `workflow_evidence_pins`. It does not create events, infer undocumented history, change approval policy, alter tasks, or add notifications. No migration or external configuration is required. Application rollback must retain existing events and immutable evidence pins. Internal automated/browser acceptance is separate from production deployment and customer UAT; adoption and time saved remain unmeasured.
