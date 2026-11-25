# Supplier finding decisions and feedback

## Product decision — 30 October 2026

An assigned remediation owner returning from My Work needs to understand why a supplier finding was returned; the reviewer needs to compare earlier submissions and closures. Source inspection at `0b7c7f9` shows that `finding-action` retains each transition/reason in `third_party_events`, but the finding UI exposes neither these events nor the latest `actionNote`. The shared evidence widget returns only the latest pin per purpose, so a subsequent submission hides the previous submission's proof in this workspace. Canonical historical pins already exist and must be reused.

Deliver a read-only finding history in the existing Findings & CAPA row and action dialog. Show event-specific reasons, actors, dates, recorded state transitions and retained file-version pins. Expose the last action note in decision context. Use existing My Work exact navigation and enterprise authorization. This completes feedback visibility without changing approval policy, lifecycle transitions, assignment, notifications, schema or palette. Owner transfer, annual planning and external auditor grants remain separate packages. Customer adoption and task-completion time are unmeasured.

## Acceptance

- Owner opens the exact returned finding from My Work, sees the reviewer's reason, and can use the existing resubmission flow. Reviewer and full-access Viewer can read earlier submissions, returns, verification and reopening.
- Each event keeps its own pinned version after resubmission/new uploads; missing or malformed retained pin data is explicit and never replaced with the latest evidence. Legacy events remain readable without invented snapshots or approval claims. File access still uses the authorized evidence endpoint.
- History queries are scoped to the canonical finding/vendor/assessment and use 20-event keyset pages. Other findings, vendors, unrelated events and foreign cursors cannot leak into the result. New events do not shift the next page. No global recent-event cutoff.
- Anonymous/scoped accounts remain denied. Read failure, empty history, loading and older pages are distinguishable; retry preserves action drafts and confirmation. No history read changes data.
- TR/EN, light/dark, desktop/tablet/mobile, keyboard and accessibility are verified in an actual browser. Owned synthetic data is retained only as audit records in isolated QA after supplier exit.

## Delivery

Update README, User Guide and Admin Guide. Test actual route SQL, permissions, event/pin scoping, cursor validation/ties/concurrent insertion, malformed legacy pins and browser recovery. Run required repository CI and browser gates on the candidate, then verify the exact released source tree. Rollback is a code revert; retained events and evidence must not be removed. Final test/release receipts belong in the PR. Production/customer UAT remain separate.
