# Connected policy decisions

Policy Center now reuses the account directory and versioned Evidence Library. Policy/exception owners and independent reviewers are selected from active eligible accounts. Version submission, approval and publication, exception approval/closure and policy retirement select an actual library file version; users do not enter its digest.

## Complete the workflow

1. Create a policy with an active owner and a different Admin reviewer. The creator cannot appoint themselves as the independent reviewer. Existing metadata can be maintained by its assigned reviewer; original creator independence remains enforced.
2. Create a controlled version. At least one control, regulation or risk mapping is required; all three groups need not be populated.
3. Open **Submit**, inspect the policy content and current context, select evidence and a specific file version, enter the decision note and exact confirmation, then apply.
4. The assigned independent Admin reviews and approves/rejects the submitted version, then publishes an approved version. A creator/submitter cannot approve their own version. Rejection needs a note but does not create an evidence pin.
5. Create and submit a timed exception using directory ownership/review. Independent approval and closure each retain their own selected evidence. Active exceptions and open attestation campaigns still block retirement.
6. The assigned reviewer can retire an eligible policy with selected evidence. This preserves version/exception decisions and their immutable evidence history.

The decision dialog displays the actual source policy version, status, owner/reviewer, audience/classification and, for exceptions, scope/rationale/compensating control/expiry. **Refresh decision context** reads without writing. If it changed, inspect it, choose **Use current context**, and enter confirmation again. Notes and evidence selections survive failed reads, rejected writes and source conflicts. If a response is lost, refresh before another attempt; a completed transition is no longer available and cannot produce duplicate decision pins. Unsaved drafts do not survive closing the dialog or navigation.

## Evidence and access

Latest decision evidence is visible in version/exception rows and policy details. Submission, approval, publication, exception approval/closure and retirement remain separate purposes. A later upload never silently replaces the selected file version. File links use the existing authenticated evidence download path. The **Evidence Library → Evidence Usage → Policy decisions** source shows retained historical decisions with actor/time and exact policy, version or exception navigation. A historical pin does not assert that the source is currently approved or that a later legacy decision used the same evidence.

The server checks the selected version's chain and bytes, rechecks the current acting account and preserves the complete reviewed source in the SQL claim. Source changes, account revocation, altered SQL-backed file bytes and event/pin failures prevent partial lifecycle/history changes. Object-storage bytes are verified immediately before SQL commit; there is no distributed object-store/SQL transaction. Evidence adequacy remains a human judgment. Canonical pins prevent deletion of their referenced evidence.

Editors/Admins with full access can select library evidence and eligible owners. Reviewers must be active Admins and obey existing independent-decision rules. Full-access Viewers may inspect policy/history/usage but cannot mutate them. Scoped core-module permissions do not grant access to enterprise policy sources or selection endpoints.

## API compatibility and bounds

- New library decisions use `decisionMode: reviewed`, the exact `expectedRevision` from `GET /api/policy-lifecycle?view=decision&kind=version|exception|retire&id=…`, and `evidenceMode: library` with `evidenceSelection: { evidenceId, versionId }` where evidence is required. Hash/reference fields are derived server-side.
- Directory policy/exception intake uses `assignmentMode: directory`. Eligible accounts and their current access policy are revalidated at commit.
- Legacy callers without these modes retain the text-reference/hash contract and do not gain a canonical pin. Attestation and campaign closure contracts are unchanged.
- Policy lists remain bounded to 1,000 documents, 3,000 versions and 2,000 exceptions; exact navigation prioritizes the target and its parent records within these bounds. Latest evidence shows at most 6,000 pins, explicitly disclosing overflow. This is the latest pin per entity/purpose, not a complete audit archive.
- Evidence Usage shows up to 200 matching policy decisions. Missing parent/version records, source errors, inaccessible sources and overflow never appear as complete coverage. Usage exports retain historical/source state and safe text handling.

No new schema, menu, theme palette, reminder or email setting is required. No automatic policy re-evaluation, external auditor portal, electronic signature certification or customer acceptance is implied. Reverting application code must retain existing events and pins. Exact validation and release receipts are recorded in the delivery PR; production deployment and customer UAT are separate.

Published versions can also receive an independent [periodic suitability review](policy-periodic-review.md). That separate decision retains the reviewed policy/version snapshot and advances its review date within the configured frequency; it does not publish content or replace existing decision evidence.
