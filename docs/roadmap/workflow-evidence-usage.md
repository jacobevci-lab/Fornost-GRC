# Workflow decision evidence usage — 27 October 2026

## Product decision

An evidence owner reviewing a file in Evidence Library needs to explain where it was used and open the responsible workflow. Main `3a55b43f31eef0686cb54e4a2d295783717f3da1` pins canonical evidence in continuity exercise results/gap closure and regulatory submission/verification, and prevents deleting linked evidence. However, the existing usage workspace omits those pins. Its source and the previous delivery brief confirm this gap; task time and customer adoption are unmeasured.

Extend the existing **Usage and change impact** workspace with bounded continuity and regulatory decision history. Show the decision purpose, actor/time, live source state and exact pinned version. Every pin is a retained decision, not an assertion that an old decision remains the current workflow approval. Opening the related record must locate it even outside the default list limit. Preserve theme colors and existing approval/lifecycle rules.

## Scope and journey

Evidence Library → select evidence → review usage/source coverage → inspect retained decisions → open the exact continuity exercise/gap or regulatory impact. Reuse immutable pins and canonical source records; add no background reassessment, new menu, mutation path, email option or migration. Existing evidence review tasks remain request/workpaper-only. Legacy free-text references do not become verified pins. General event/report/closure history and organization/external-auditor scopes remain separate work.

Full-access authenticated readers may inspect these enterprise sources. Scoped accounts receive an explicit restricted source without querying its tables. Missing optional tables are unavailable, read limits and orphaned sources are disclosed, and storage keys/file contents are excluded from usage reports. A changed evidence anchor rejects stale comparison. Focused module reads remain behind their existing server authorization and use validated, parameterized identities.

## Acceptance and validation

- Canonical exercise/gap and regulatory submission/verification decisions appear with distinct purposes, actor/time and current/older/unverified version identity; historical decisions survive later submissions and uploads.
- Legacy references, other evidence and inaccessible workflow data are not incorrectly included. Missing/corrupt source data is not reported as complete empty usage.
- An exact source can be opened beyond normal list bounds; missing source and failed reads have explicit recovery, and no stale response overwrites a later target.
- No approval, pin, evidence or business record is changed by usage/focus reads. Report output preserves access/source-limit context without exposing storage keys or raw digests.
- SQLite tests cover actual source queries, identities, limits, missing parents, access and old/new versions. Chromium covers the connected journey, source failures/retry, TR/EN, both themes, desktop/mobile and accessible controls. Run relevant regression/build/migration checks and required CI before authorized main delivery.

## Delivery and recovery

Implemented the read-only source projection, source/history filtering and report metadata, exact authorized source retrieval, bounded loading/retry and late-response protection. Updated README and user/admin/module guidance. SQLite verification passed for retained decision identities and access boundaries, plus actual GET routes with targets beyond their normal list bounds. Full regression/build and connected Chromium verification are required before main delivery; their exact revision and result receipts are recorded in the delivery PR. Reverting application code leaves all original decisions/pins intact. Production deployment and customer UAT require separate evidence; a merged change does not prove either.
