# Reliable register import — 26 October 2026

## Product decision

An operator migrating a risk, asset, BIA, compliance, vendor, control, evidence or audit-requirement workbook needs to inspect the exact proposed records before committing. At main `32b8e56313c6a79d216f401e4670cb65421c8d71`, `ImportModal` filters blank headers before indexing cells, silently slices rows/columns/text, calls unvalidated rows valid, and permits duplicate submissions. This confirmed cross-module data-integrity issue takes priority over unattended recurrence, delegation and external engagement grants. Task-time and customer adoption baselines are unmeasured.

## Scope and journey

Select an XLSX workbook → retain physical column/row positions → map supported fields → inspect row errors and a bounded data preview → request server validation → explicitly import the approved rows. File/mapping changes invalidate approval. Over-limit or ambiguous workbook structure is rejected rather than truncated. Import creates records; it does not update, merge, or deduplicate existing business records.

Use the existing module permissions, canonical validation, risk governance normalization and atomic reference-guarded import. A per-actor request token and payload digest retain an atomic receipt in existing metadata storage; retries of the same operation return its receipt rather than inserting again. Changed payloads cannot reuse a token. An uncertain response retains the approved operation for safe retry. No schema migration, new menu, third-party file transfer, theme redesign or automatic notification is needed. Existing clients without a token remain compatible but do not gain retry deduplication.

## Acceptance and validation

- Blank/intermediate headers never shift values; populated unnamed columns, duplicate headers/mappings, more than 100 columns/1,000 data rows, oversized cells and invalid dates fail explicitly. Blank rows retain meaningful source row numbering. No silent truncation.
- Users see normalized records, actual validation errors, excluded/unmapped columns, and the bounded preview size. No records are written by preview. File failures and stale asynchronous reads cannot leave another file eligible for import.
- Server preview and commit share validation. Current module access, closed-audit/reference guards and atomic all-or-nothing writes remain authoritative. A live identity/grant change, reference deletion or receipt failure cannot leave partial rows/codes/receipts.
- A double click or identical retry creates one batch; token reuse with changed input fails, and different users cannot replay another user's receipt. Lost responses are recoverable without a second insertion.
- Real Chromium tests cover XLSX selection/mapping, bad files, preview, actual import, lost-response retry, read-only rejection, TR/EN, both themes, desktop/mobile, keyboard and accessibility. Focused SQLite/unit tests cover bounds, rollback and concurrency; required CI and shared browser gates run on the delivered revision.

## Delivery and limits

Update user/admin guidance and product/delivery descriptions. No production/customer UAT claim follows from isolated CI. Rollback is a code revert; retained receipts contain digest/count/actor/module metadata, not workbook contents. Older clients/builds must not retry an uncertain tokenized operation because they cannot interpret receipts. Import is not an upsert, record reconciliation, spreadsheet formula execution, or multi-sheet merge; the first worksheet is used.

Implementation, test, merge and deployment evidence is recorded in the delivery PR. Owned test data is isolated to the QA database.
