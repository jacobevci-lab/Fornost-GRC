# Executive audit readiness

The executive dashboard and Global Assurance Pack evaluate persisted `simple_audits` engagements through the same `buildAuditReadiness` evaluator as audit detail. Each engagement counts once. Requirement rows and saved completion or evidence labels are not audit counts or proof of readiness.

`GET /api/executive-assurance` supplies canonical evidence and an audit portfolio with a shared evaluation time. Only verified `ready` engagements enter the numerator. `attention`, `not-ready`, `empty` and `unverified` do not. Empty, unavailable or incomplete portfolios have no audit percentage or composite score. The existing full-access Viewer read permission and scoped-actor denial apply.

The shared context reads bounded core records, canonical evidence, automation rules, findings and governed work once, then reuses the complete priority projection for every engagement. Audit detail now also checks canonical manual evidence version chains, including broken chains when no automation rule exists. Current-test settings changes and unresolved re-test failures remain effective. Historical evidence and work records are preserved.

The portfolio allows at most 500 engagements. Existing limits remain: 10,000 combined audit/evidence records, 10,000 evidence rows, 5,000 versions and the continuous-assurance source limits. Truncation, unreadable records, missing sources, unmatched requirements and normalized duplicate engagement names prevent a verified portfolio. Name matching follows existing NFKC, trimmed, Turkish case-insensitive scope matching. Demo or historical requirements without persisted engagements remain explicitly incomplete; reads do not invent engagements.

The dashboard provides a paged, bilingual audit list and exact-ID navigation to audit detail. The HTML pack includes all evaluated audits, their gate, current requirement count and blocker count, with the same snapshot timestamp. Downloading does not refresh that snapshot. Both consumers retain timeout, cancellation, focus refresh and latest-response protection; export remains disabled during unavailable or partial evaluations.

Evidence metadata and version history use the existing batch read. Other sources are separate bounded reads, not a transaction-wide historical snapshot. Control/traceability metrics still cover loaded core records; the audit denominator covers persisted engagements. Readiness is operational decision support, not an audit opinion or closure approval.

Validation covers real SQLite projection, engagement counts, empty and incomplete portfolios, manual tampering, source-change recovery, active blockers, parser consistency, fixed query counts and scoped access. The current-assessment browser scenario additionally checks bilingual desktop/mobile views, exact audit navigation, report exports, incomplete-source recovery and superseded responses.
