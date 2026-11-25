# Supplier reviewer handoff

An Admin can transfer independent review responsibility from **Vendor Management → Third-party inventory → Open → Change reviewer**. This also recovers work assigned to a disabled or downgraded reviewer. The old reviewer need not be active. The supplier must be in onboarding, review, reassessment, approved or conditional status.

1. Inspect the current reviewer and the counts of active assessments/open findings, including those awaiting review or verification.
2. Select an active independent Admin from the directory. The assigning Admin, existing reviewer, supplier creator, business/risk owners, active assessment creators/submitters and open finding owners/creators/submitters cannot be chosen. Closed historical work does not exclude a candidate.
3. Explain the transfer in 20–1,200 characters, type `İNCELEMECİYİ DEĞİŞTİR`, and save.
4. The new reviewer uses **My Work** to open pending assessments and findings and decides with their existing evidence and approval requirements. Assignment itself approves nothing.

Existing dates, statuses, owners, assessments, findings and evidence stay intact. Pending reviewer responsibility derives from the canonical supplier profile; no task copies are created. Completed work continues to belong to the actual deciding/verifying person. Full-access readers, including Viewer, can open **Reviewer handoff history** for the previous/new reviewer, assigning actor, time, reason and workload counts. History loads in pages of 50. An empty legacy history means no retained handoff events, not a reconstructed assignment history. Scoped accounts remain outside the enterprise TPRM source.

## Recovery

A changed assignment or active-work snapshot blocks submission with a conflict. Refresh, inspect the current context, and explicitly choose **Use current version**. Selection and reason survive; confirmation clears. A failed context read blocks saving and preserves the draft. Retry directory/history reads in place. A rejected directory selection must be replaced with an eligible person.

If the response is lost, the screen reloads the canonical assignment. Inspect the current reviewer and retained history before another transfer. Retrying the old snapshot cannot create a duplicate event. A history or context read failure is not evidence that the operation did not commit.

## Operations and API

- `GET /api/third-party-risk?view=reviewer-context&vendorId=...` is Admin-only. It returns the profile revision, opaque work-context token, exclusions and workload counts. Each active-work collection is limited to 2,000 rows; exceeding either limit explicitly blocks handoff instead of assigning from partial context.
- `POST /api/third-party-risk` with `action: "reassign-reviewer"` requires `vendorId`, `assignmentMode: "directory"`, `reviewer`, `expectedRevision`, `previousReviewer`, `contextToken`, `note`, and the exact confirmation above. Other fields are rejected.
- `GET /api/third-party-risk?view=reviewer-history&vendorId=...&page=0` returns 50 events and `hasMore`. Page numbers are 0–9,999; duplicate/unrecognized selectors are rejected.

The profile update and `vendor-reviewer-reassigned` event commit in one transaction. The write compares the full server-read profile, active-work membership and inspected fields, and live assigning/selected accounts. The event retains the reason, old/new identities and work counts; no evidence pin is created for this administrative assignment. Approval evidence remains on actual decisions.

No migration, new menu, transport configuration or external notification is required. Existing installations use the current profile/events schema. Rolling back application code must retain the canonical reviewer and events; do not revert assignments by deleting history. Owner transfer, temporary delegation, bulk/automatic assignment, external supplier engagement and other modules are separate scope. Internal validation and production/customer UAT are distinct; adoption and time saved are unmeasured.
