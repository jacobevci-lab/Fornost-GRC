# Control test context in Findings & CAPA

Continuous-control CAPA records now show the test used for promotion alongside the latest run of the same rule. Each test retains its own timestamp, outcome, counts and optional affected-record diagnostics. The panel is compact by default and expands diagnostics on demand. Both Turkish and English, light/dark themes and mobile layouts are supported.

A passing latest test never closes a CAPA. Existing owner, submission, evidence integrity and independent reviewer gates remain authoritative. A collection/assessment error is unverified, not evidence of compliance. Freshness applies to the latest run's evidence; an older passing run is never substituted for a failed collection. Paused rules are identified separately. The latest run may belong to a subsequent monitoring cycle; the original automation finding reference stays bound to the promotion.

## Provenance and access

`GET /api/findings/control-context?findingId=...` requires an authenticated full-workspace Admin, Editor or Viewer. Existing scoped module policies deny this endpoint. It returns `Cache-Control: no-store` and no connector configuration, secret or raw provider snapshot.

The baseline is resolved from the immutable `continuous-assurance-promotion` event, its evidence reference/hash, and a completed CAPA promotion work item whose result points to the selected enterprise finding. Work-item rule, automation finding, target control and original evidence must agree. The resolver does not join the newest finding on a rule. Ambiguous/missing lineage and deleted source records are explicit unavailable states. The mutable submission evidence on the enterprise finding does not replace the promotion baseline. A missing or mismatched baseline run remains unavailable; latest run ordering uses timestamp then SQLite row insertion order to break ties.

Legacy scalar checks remain supported without per-record diagnostics. Stored assessment JSON is validated and projected into bounded public fields; malformed diagnostics are withheld without hiding the run summary. Maximum 100 affected records are displayed. No migration is needed; the existing compatibility schema initialization is reused.

## Atomic monitoring persistence

A control execution stores run, optional evidence, rule state and (when the configured failure threshold is reached) automation finding plus risk projection in one database batch transaction. The existing partial unique index allows only one non-closed automation finding per rule; the upsert increments occurrences instead of opening duplicates. Database write failure rolls the batch back.

On repeat failure, the linked risk's **system-owned `evidenceRef` and `monitoring` fields** refresh. `monitoring` records the last qualifying failure/error run, status, error code, detail, observation timestamp and occurrence count. It is not a live latest-success indicator. Collection error clears the automatic evidence reference rather than reusing old evidence. Human title, description, owner, treatment, status, due date and risk ratings are preserved. A missing risk projection is reconstructed on the next qualifying failure. A successful run still leaves the finding and risk disposition unchanged for governed reassessment. This change does not implement scheduler leases or serialize overlapping collector requests.

## Verification

- SQLite integration tests run real collection orchestration with substituted vendor HTTP, canonical CAPA promotion and the production context resolver.
- Tests cover immutable baseline, equal-time latest selection, separate finding cycles, missing/mismatched lineage, stale/error states, safe diagnostic projection, repeat-risk updates, human field preservation, projection repair and transactional rollback.
- `scripts/capa-control-context-qa.mjs` targets fixed localhost and explicit local D1 only. Synthetic QA provenance exercises the real HTTP endpoint and UI, Viewer/scoped access, selection, diagnostics, refresh/retry, missing lineage and successful-test closure protection. It captures both themes at desktop/mobile widths.
- Existing full layout, core lifecycle, localization/accessibility and on-prem container gates continue to run. These tests do not claim live customer deployment or real vendor credential verification.
