# Connected GRC increment — 2026-10-07

## Implemented

- Unified Reporting includes canonical Findings/CAPA for Admins, preserving the existing findings export permission. The dedicated `GET /api/findings?format=report` endpoint authorizes server-side and audits snapshot access.
- Explicit projection preserves source, risk/control references, root cause, corrective/preventive actions, original and verification evidence hashes. Internal columns are excluded. Identifiers are namespaced to prevent collisions with core GRC rows.
- Module/owner/status filters, preview and HTML/PDF/CSV/Excel use the same normalized records. CAPA metrics distinguish active and closed findings and show risk/control linkage. Detailed templates contain the references and evidence hashes.
- Loading, failure, invalid responses and the existing 3,000-record bound cannot silently produce a partial All Modules/CAPA export. Core-only module exports remain available. A retry refreshes CAPA. AI and other independent workflow stores remain explicitly excluded. The separate Global Assurance Pack retains core-only scope.
- The failed production mobile-TR screenshot from run 37461416426 showed an identity-probe timeout, not layout overflow. Session reads now allocate the existing 12-second budget across at most two attempts, including stalled response bodies. Cancellation/supersession prevents retry. Login/bootstrap writes are unchanged. A repeated service failure remains an error; the production QA gate is not relaxed.

## Verification

- Unit coverage: CAPA projection, duplicate/invalid/incomplete source rejection, link/hash preservation, metrics, safe HTML/CSV and bounded session timeout recovery.
- `scripts/session-startup-qa.mjs`: mobile recovery after a stalled first probe, gateway retry, persistent failure, manual recovery and stale-response protection.
- `scripts/reporting-export-qa.mjs`: real report endpoint, unauthenticated/Editor denial, normalized CAPA fixtures in exports, common scope counts, failure gating and recovery, existing PDF/CSV/HTML and responsive contracts.

## Remaining boundaries

- This increment does not claim to fix the underlying cause of production identity-service latency; it recovers a single stalled read. A new production QA run is needed after deployment.
- CAPA above 3,000 records fails explicitly. Server-side pagination/export jobs are still a separate backlog item.
- CAPA references are preserved, not inferred. Missing business-unit fields are not guessed from linked records.
- AI workflow reporting and an atomic cross-module historical snapshot remain follow-up work.
