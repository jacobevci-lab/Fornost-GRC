# AI assurance in Connected GRC

The existing Connected GRC explorer now includes the native AI model inventory,
assurance alerts and AI findings/CAPA for Admin users. It reads the existing
`/api/ai/models`, `/api/ai/assurance-alerts` and `/api/ai/findings` APIs. No new
write API, permission grant, sidebar module or database migration is introduced.

Relationships use native IDs only:

- Alert → model (`modelId`)
- Alert → AI finding (`findingId`)
- AI finding → model (`modelId`)

Target kinds are constrained so an AI finding cannot stand in for a model.
Display names, public codes, free-text controls, source descriptions and evidence
references do not create inferred edges. Missing and ambiguous targets remain
unresolved. These projections do not change control assurance scores, approval
status, risk acceptance or coverage eligibility. An AI finding is not projected
as a core Findings & CAPA record.

The Admin view reads 11 sources; other roles retain the existing eight-source
view without requesting the additional AI endpoints. Server permissions remain
unchanged. AI projections are hidden immediately when the role is no longer Admin.

Each AI API is bounded to 500 records. Reaching that boundary, duplicate or missing
IDs, malformed collections and transport failures mark the view incomplete. The
loaded valid subset remains explorable; this is not an exhaustive archive or a
transactionally consistent cross-source snapshot. AI record opening currently
opens the existing AI Governance workspace, not an exact record filter.

Validation: native ID graph tests cover the three links, wrong-kind/name/code
rejection, ambiguity, missing sources and completeness bounds. The browser QA
uses controlled API fixtures on the isolated authenticated application, checks
both locales/themes at desktop/mobile sizes, graph traversal, unavailable and
malformed source recovery. Existing production-source QA also probes the three
real AI endpoints with the Admin smoke identity.
