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
transactionally consistent cross-source snapshot. AI record opening now selects the matching model, assurance-alert or finding
workspace and filters the loaded list by the native ID. Titles never substitute
for IDs. Creation forms are hidden while focusing a model or finding; draft model
editing still uses its existing form. Show all records clears the focus. Changing
AI sections or leaving the workspace also clears it.

Missing records explicitly remain absent; no first-row fallback is selected.
Transport and malformed collection failures clear loaded action targets and offer
Retry. Focus messages follow the workspace locale. Summary counts and CSV links
still describe the full loaded collection, not only the focused record. Existing
500-record API limits still apply: an older target outside the loaded window is
reported as absent from the loaded list. API authorization and mutation lifecycles
remain unchanged.

Validation: native ID graph tests cover the three links, wrong-kind/name/code
rejection, ambiguity, missing sources and completeness bounds. The browser QA
uses controlled API fixtures on the isolated authenticated application, checks
both locales/themes at desktop/mobile sizes, graph traversal, unavailable and
malformed source recovery. Existing production-source QA also probes the three
real AI endpoints with the Admin smoke identity.

Exact-navigation QA covers all three target kinds, duplicate display names,
Show all records, missing records, 503 and malformed payloads, recovery and eight
locale/theme/viewport combinations on the authenticated isolated application.
