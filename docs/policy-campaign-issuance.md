# Directory-based policy campaign issuance

## Admin journey

Open **Policy Center → Attestation → + Campaign**. Choose a published policy, name, audience description and due date. Search and explicitly select 1–500 active full-access accounts. Admin, Editor and Viewer accounts may receive policy response tasks. Scoped-only, disabled and invalid-email accounts are excluded. The audience description is descriptive; it does not expand a department, group or “all employees”. Directory pages check up to 50 accounts before eligibility filtering, so an empty page may still have a next page. Search by name/email to narrow results. Selections remain visible across pages and can be removed individually.

**Preview campaign** displays the exact current published version, complete content, summary, mappings, digest, campaign details and selected identities. Preview creates no campaign or tasks. Review and explicitly confirm, then **Create campaign**. **Open campaign** leads directly to existing outcomes, creator/time and the linked version. Each selected subject receives a canonical policy attestation task in **My Work** and uses the existing [read-and-respond workflow](policy-attestation-response.md). Campaign closure remains the existing [reasoned completion workflow](policy-campaign-completion.md).

## Recovery and limits

An unavailable directory or preview retains entered details and selections but prevents issuance until a successful read. If the policy/version, participants or issuer changes, the atomic issue fails without partial assignments. Refresh the preview and reconfirm; ineligible selections are identified and must be corrected. Confirmation resets after a refresh.

If creation may have committed but the response is lost, keep the dialog open and retry **Create campaign**. Its stable campaign ID returns the existing result without creating another campaign. Editing and refresh are disabled while the result is uncertain. This retry identity lasts for that dialog: after closing/reloading it, inspect campaign outcomes before starting a new campaign. The server retains the original identity in its creation event; identical API retries remain safe after responses, closure or retirement, while altered reuse conflicts.

Only an active Admin may browse this directory, preview or issue. Full source snapshots and participant/issuer identity, role, active status and access policy are checked in the same transaction as campaign, attestation and provenance writes. Existing canonical tables and events are reused; no migration is required. Creation provenance is retained in `policy_events` (not a new database-immutable receipt table). Rollback must preserve these events and created assignments.

## API compatibility

- `GET /api/policy-lifecycle?view=campaign-people&q=…&page=0`: bounded eligible directory page, `people`, `hasMore`, `page`.
- `POST` action `preview-campaign`: `policyId`, `name`, `audience`, `dueDate`, unique `subjectIds`; returns normalized request, policy/version, public participant identities and revision.
- `POST` action `create-campaign`: the reviewed request plus `issueMode: directory-reviewed`, `expectedRevision`, `requestId: PAC-<UUID>` and `confirmation: ISSUE POLICY CAMPAIGN`; returns `id`, `replay`.

Requests that include reviewed issuance fields cannot fall back to legacy validation. Existing callers omitting those fields retain the legacy manual-email contract and do not gain directory-validation or idempotency guarantees. The new UI exclusively uses reviewed issuance. No email delivery, reminder scheduling, external recipients, group synchronization, menu or theme changes are included. Production rollout, customer UAT and adoption remain separate from repository/browser validation.
