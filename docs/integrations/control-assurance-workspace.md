# Unified control assurance workspace

Control Library now owns its assurance view and impact summary as native React children. A single read-only `/api/controls/assurance` evaluation supplies both; the previous DOM observer, portal, independent selection and duplicate client-side source loads are removed. No module, schema or alternate mutation path is introduced.

## Daily workflow

The default list contains controls needing attention. Search by reference, title or owner; switch to All controls to inspect healthy records. Eight-row pagination reaches the complete evaluated list. Select Review to see evidence, automation, frameworks, audit requirements, findings/CAPA and linked risks. Relationship sections show all loaded records in bounded scrolling containers. Record actions use canonical IDs/public codes and existing focused navigation and permissions.

Five compact summary metrics replace seven. The same selected control drives its impact summary and detail, preserving the existing theme and compact type scale. A refresh button, record-content change and five-minute timer reevaluate sources. Request cancellation and sequence guards prevent stale responses from winning. A 20-second timeout, incomplete-source notice and explicit unverified states distinguish failure from an empty successful portfolio. A failed refresh preserves the old timestamp and data for reference while withholding current scores.

## Evidence and re-test semantics

Audit and control views share evidence eligibility: explicit approval, both expiry fields, failed validation, rejection/pending review and integrity status are evaluated together. Date-only expiry includes the UTC day; timestamps expire exactly. Invalid supplied dates cannot establish eligibility. Approved legacy/manual evidence can still be usable, but its integrity is explicitly unverified and the existing legacy penalty remains. Unavailable integrity cannot certify a healthy control. A declared tracked version with a missing/incomplete chain is broken, not legacy.

The server verifies metadata chains against the stored head. This does not retrieve the file bytes or certify an upstream system. Automation requires a recorded passing result as well as current health to establish healthy automated assurance. All rule control mappings are projected. Current failed/error re-tests affect the relevant control; only a later matching verified pass clears the historical signal, using the existing recovery rules. Work history and human risk decisions remain untouched.

## Completeness and access

Read bounds: 10,000 core records; 3,000 enterprise findings; 5,000 evidence version rows; existing continuous-assurance limits of 10,000 rules and 1,000 findings/work items. Each read fetches one extra row to detect truncation. Missing sources, malformed core records or exceeded bounds make the evaluation explicitly incomplete. This increment does not implement unbounded paging for large installations. The shared report is available to full-workspace Admin/Editor/Viewer; scoped users remain denied by the existing closed API allowlist.

The snapshot is a read-time projection of the sources, not an immutable audit opinion or a cross-source database snapshot transaction.

## Verification

`tests/control-assurance-runtime.test.ts` exercises real SQLite storage, shared audit/control eligibility, missing tracked evidence, source failure, malformed records, truncation, multiple mappings, verified recovery, full relationship navigation and access boundaries.

`scripts/control-assurance-runtime-qa.mjs` uses fixed localhost and explicit local D1 fixtures for API roles, list pagination, complete evidence lists, exact record navigation, shared selection/language state, transport and persisted-record recovery, both themes and desktop/mobile layouts. Its records are removed before broader layout/CRUD/accessibility suites. Real external integrations and customer deployment are outside this isolated QA.
