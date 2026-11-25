# Direct requirement assurance

## Outcome and scope
GRC operators can record implementation and attach canonical EVD/POL records to a framework requirement without creating a CTL. The existing shared-control route remains available. Source: the requested ISO 27001 4.1 workflow; current posture derives exclusively from control mappings. Usage baseline is not measured.

Implementation is an owner declaration, distinct from calculated compliance. Implemented requirements without eligible sources remain self-declared / awaiting evidence. Approved current evidence or a published current policy must be independently reviewed for relevance to the requirement before the direct route becomes compliant. No document status is changed by linking or requirement verification. Changes to implementation, links, source versions, approval, validity or content invalidate the direct receipt.

ISO 27001 clauses 4–10 are mandatory and cannot be excluded; Annex A exclusions require a reason. Source: https://webstore.iec.ch/en/publication/79694 (checked 2026-11-25). Valid exclusions leave both the open count and compliance denominator. Legacy invalid mandatory exclusions are projected as required, retaining their rationale for correction.

## Journey and boundaries
Compliance Management → requirement implementation selector → direct evidence/policy picker → save → independent reviewer verifies relevance → live matrix and portfolio recalculate. A single searchable entity combobox replaces the control search/dropdown pair. Optional CTL draft creation keeps canonical allocation and the existing mapping workflow.

Existing consolidated-workspace write authorization is retained. Direct requirement work belongs to the root organization, like the existing framework program. Scoped readers only receive direct work and document references visible in their scope; module access is checked separately for policies. This change does not enable legacy framework mutations for restricted entities.

New additive tables use the existing runtime schema compatibility pattern and a matching migration. Writes use compare-and-swap revisions, current actor authority and atomic audit receipts. Existing control mappings and audit baselines remain readable.

## Acceptance and verification
- ISO 4.1 reaches compliant with no control mapping after implemented + approved evidence/published policy + independent relevance verification; ratio increases.
- Missing, unapproved, expired, changed, tampered or deleted sources never establish full compliance. Self-review, unauthorized access and stale writes fail.
- Reasonless exclusions and ISO 4–10 exclusions fail; Annex A exclusions update scope and open counts.
- Evidence/policy links retain canonical codes; source changes invalidate old receipts. Existing control-based coverage remains functional.
- Real browser journey, keyboard combobox selection and TR/EN × light/dark × desktop/mobile layouts are checked on the candidate revision.

Implementation is complete. Local validation: 24 direct/shared-control regression checks, TypeScript and targeted lint pass; migration validation passes. The candidate pull request runs the full CI suite and `Direct requirement assurance QA`, which saves its per-revision JSON result and TR/EN light/dark desktop/mobile screenshots. Merge and production verification are tracked separately in the pull request and deployment checks.

For an existing installation, `0125_direct_requirement_assurance.sql` is additive and the runtime initializes the same tables idempotently. Rollback can leave these tables intact without affecting the preceding application revision; do not delete recorded review history.

Audit snapshots retain direct approved evidence for the selected period and published policy references. Linking does not mark audit work completed. A source approval, version/content or validity change automatically withdraws the previous direct verification and requires review again. Customer UAT and adoption have not been measured.
