# Connected evidence selection — 27 October 2026

## Outcome and evidence

The product research identified manual evidence references/SHA-256 entry and email-only assignment fields in Business Continuity and Regulatory Intelligence. An exercise facilitator or regulatory action owner should select an existing authorized evidence version, see its file and period, and submit it without calculating a digest. An independent reviewer must retain the exact evidence used for each decision. Current baseline is main `46baef4c06b546381c44364934b3a429cc742266`; task time and adoption are not measured.

## Scope and journey

Use the existing modules, evidence library/version chain, local users and lifecycle transactions. Cover continuity exercise results and improvement closure, regulatory impact submission and verification, and assignment selectors for these modules. Preserve independent review, existing lifecycle conditions, legacy API inputs/history and theme colors. The new UI uses canonical version IDs and active eligible users; selected evidence and identity are revalidated on the server and bound to the write transaction. Canonical evidence decisions retain immutable source metadata. A new upload does not replace a historical pin. Missing/changed data, read failures and rejected writes retain drafts and explain recovery.

External-auditor grants, organizational data scopes, generic document ingestion, automated adequacy judgments, new navigation groups and theme changes remain separate packages. Existing legacy reference/hash callers remain explicitly unverified reference paths; they do not receive a canonical library pin. No claim of legal signature, retention certification or customer UAT.

## Acceptance

- Search/select evidence and a specific version, inspect name/period/version, submit and see the pinned source in the resulting record.
- Reject mismatched, deleted, malformed, inaccessible or altered evidence; derive the digest on the server and preserve the actual chosen version.
- No partial state/history/pin writes on conflicts or failed dependent statements. Repeat terminal actions do not duplicate pins.
- Only active eligible accounts appear for new assignments; independent reviewers are eligible Admins where the existing lifecycle requires Admin. Server-side selection checks bind account identity, status and access policy, including races.
- Preserve drafts on selection/revalidation errors; provide cancellation, bounded loading and retry; never silently substitute a new version or person.
- TR/EN and desktop/mobile forms support keyboard interaction without palette changes or manually entered hashes. Existing legacy workflows remain compatible.
- Run meaningful SQLite route/store regressions, typecheck/lint/build and real Chromium interaction checks for affected flows. Record the exact tested and merged revisions; production deployment remains separate.

## Release and recovery

Additive storage only; no rewriting historical reference/hash fields. Reverting application code leaves immutable evidence pins intact. Update user/admin documentation with canonical vs legacy behavior and limits. Use owned synthetic QA data and preserve unrelated worktrees.

## Delivery record

Implementation complete for the bounded package. Initial focused SQLite regressions: 64 passed; additive migration preflight: 101 files passed; production build passed. Full suite, final lint/typecheck and real Chromium interaction checks are in progress. No merge or production-deployment claim yet.
