# Versioned independent risk decisions

The existing Connected GRC → Assurance → governance workspace now exposes complete loaded risk/proposal/exception lists with search and eight-row pagination. Pending proposals and decision history have a dedicated list. The reviewer opens a compact dialog showing the ratings at submission, proposed residual ratings, current risk context, rationale, declared evidence reference/hash, submitter and decision history. Keyboard focus is contained in the review dialog and returns to its trigger on close. This adds no module or alternate risk register.

## Decision contract

Governance GET returns the current risk context and a `context.revision`. A new `submit-risk-review` request includes that value as `expectedRiskRevision`. A stale form cannot submit a proposal against a risk the author has not seen. The server resolves canonical IDs/public codes and unambiguous legacy aliases, stores the canonical risk ID, and builds its own baseline from the persisted record. Client-supplied baselines are ignored. The baseline binds the complete risk JSON and update timestamp; even same-timestamp changes invalidate an approval.

Full-workspace Admin/Editor can submit; only a different Admin can decide. Viewer read access and the existing scoped API restrictions are preserved. Concurrent duplicate submissions are guarded in the insertion statement. Approval claims the still-pending proposal and updates the risk in one D1 transaction, guarded by the persisted risk and proposal snapshots. Failure rolls back both writes; a competing decision cannot overwrite the winner. Rejection also requires a still-pending proposal and a reason, and permits a fresh proposal afterwards.

Changed, missing, unreadable or no-longer-reviewable risks cannot be approved from an old proposal. Legacy pending proposals without a server baseline must be rejected and recreated. Existing approved history remains readable. Successful control tests still do not independently approve residual risk. Evidence references and SHA-256 are declarations for the reviewer to inspect; this workflow does not retrieve external files or certify their contents.

Generic risk register creation/import cannot forge approval or assurance metadata. Updates retain server-managed governance fields and, for governed risks, residual ratings. Core register PATCH uses a conditional write to avoid overwriting a decision committed while the update was being processed. This does not implement a version precondition for arbitrary long-lived register forms; it protects the read/write transaction and server-owned decision state.

## Load and completeness contract

The screen exposes loading, retry and incomplete states, hides summary counts while results are unverified and disables decision actions. Selection and language changes do not reload sources. Requests are cancellable with a 20-second timeout and a five-minute refresh interval. GET reads at most 500 proposals, 500 exceptions and 2,000 risks, fetching an extra row to detect truncation. Unavailable operational counts, invalid risk JSON or exceeded bounds make the view explicitly incomplete. This increment makes all loaded rows reachable; it does not add unlimited server-side pagination or change exception lifecycle reconciliation.

## Verification

`tests/risk-review-runtime.test.ts` runs real SQLite transactions for canonical/ambiguous references, stale forms, duplicate submissions, maker/checker decisions, same-timestamp changes, competing decisions, concurrent edits, rollback/retry, invalid/legacy sources and generic register metadata protection.

`scripts/risk-decisions-runtime-qa.mjs` uses only fixed localhost and local D1 fixtures. It verifies the real assessment form and review dialog, roles, pagination, conflicts/rejection/approval/history, protected register changes, bounds and transport recovery, focus restoration, both languages and desktop/mobile themes. Its risk/proposal fixtures are removed before the broader platform QA. Customer-environment acceptance is handled separately by the product owner.
