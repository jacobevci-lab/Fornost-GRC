# Cloud browser QA remediation — 12 November 2026

## Problem and scope

The authenticated browser QA identified an audit deletion that orphaned CAPA, a valid DOCX rejected during import, incomplete continuity draft actions, misleading work-queue statuses, missing draft correction/cancellation actions, and deletion errors styled as success. Connected GRC also needs to distinguish audit parents and framework names from individual requirements. Preserve the existing theme, bilingual UI, evidence history, authorization and independent approvals.

## Acceptance criteria

- Audit deletion cannot remove a source or requirement referenced by another record, including historical records or a reference inserted concurrently. Unlinked audit deletion archives its exact snapshot atomically.
- Valid macro-free DOCX files can be previewed and imported; malicious, encrypted, oversized and invalid archives remain rejected. Errors distinguish validation from text extraction.
- Continuity owners can edit and cancel drafts, explicitly submit for independent review, and see accurate draft/review states. Approval, activation and exercise scheduling retain their authorization and concurrency guards.
- Draft correction/cancellation in other affected modules is explicit, reasoned and auditable. Cancellation must not masquerade as verified remediation or erase linked history.
- Rejected deletion is an accessible error, not a success banner.
- Connected GRC resolves canonical audit parents without matching a framework label to several unrelated requirement records.

## Validation and delivery

Add focused regressions for dependency races, permissions and lifecycle transitions, document extraction, and graph resolution. Run typecheck, lint, build, applicable repository tests and the changed browser journeys. Record any live browser or external-provider checks that cannot be completed. Publish through the existing authorized repository/release flow, verify the deployed revision, and report actual stages separately.

## Risks and rollback

Existing drafts remain drafts until explicitly submitted; existing approved/active records retain their states. Preserve history rather than deleting active or linked workflow records. Roll back code via a revert; do not remove audit events or test evidence to make a check pass. Production cleanup is restricted to QA-owned records identified by `QA-CLOUD-202611121212` and their known children.

## Verification checkpoint

- Local typecheck, lint (zero warnings), migration validation, verified production build and on-prem installer smoke test passed.
- Full Node suite: **1,890 passed, zero failed/skipped**; 20 new focused tests cover the actual route/store logic, races, history rollback and the original DOCX fixture.
- Managed preview startup was rejected by automatic approval review because its Cloudflare upload destination lacked authorization evidence in that step. No browser result is claimed from that preview.
- The repository CI browser job uses local-only Worker/D1/R2 emulation and synthetic accounts. It does not deploy a preview or use production credentials. Its result is tracked separately.
- Existing production records, including the previously orphaned audit/CAPA source, were not rewritten. The deletion guard prevents recurrence; it does not retroactively recreate deleted records.

### Worker-specific DOCX cause

The isolated browser run reproduced a server-side rejection before text extraction. A local, disposable Worker unit reproduced `RangeError: Memory limit exceeded` from native `inflateRawSync` on the original python-docx styles part; Node accepted the same input. Workerd can account for buffer growth against `maxOutputLength` (related upstream issue: https://github.com/cloudflare/workerd/issues/6286). Bounded headroom of twice the already-limited declared part size fixes this runtime mismatch. Exact decompressed byte length, CRC, total/part/ratio limits, encryption and macro rejection remain unchanged. A real Worker regression accepts the original file and rejects understated size, altered CRC and truncated content.

### Resume checkpoint — 13 November 2026

The final-head focused browser workflows and CI passed, but Workspace Layout QA run `43306057315` failed in `live-product-fixes-qa.mjs` while looking for the retired `Find a record` map input. Later scenarios were skipped. Five regression scripts still used the previous map layout; they now use the current workbench's accessible search, module filter, record selection and source navigation while retaining exact-record, reload and return-state assertions. The live-product regression now runs immediately after core fixture setup so future failures surface before unrelated long suites.

Local script lint and syntax validation pass. Local Worker startup and synthetic database setup work, but the managed environment prevents Chromium's process socket from opening; browser acceptance must come from the repository's isolated CI runner. No new production verification or deployment is claimed at this checkpoint. The broad suite remains a release gate.
