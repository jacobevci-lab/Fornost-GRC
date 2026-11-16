# Retry-safe continuous control creation

At deployed revision d671fd9, an administrator who loses the response to the
first `save-rule` request can retry the wizard or manual control form and create
another rule. A confirmed-save/lost-run response is already handled separately.
Complete this gap with an actor-scoped creation request ID and an immutable
request receipt committed atomically with the rule. Identical retries, including
concurrent requests, return the original ID without resetting schedules or
assessment history. Different contents under the same key return a conflict and
an exact existing-rule link; deleted results must not be silently recreated.

Retain the key across failed saves in both creation surfaces; reset it after a
confirmed successful manual creation. Preserve Admin authorization, same-origin
checks, canonical control references and unkeyed API compatibility. Do not add
automatic provider calls, change approval rules, deduplicate intentionally new
requests, or extend this change to source creation. Closing/reopening the wizard
starts a new creation attempt; durable client drafts are outside this delivery.

Validate receipt/rule atomicity, same-key concurrency, changed input, actor scope,
deleted results, reference deletion, database rollback and legacy requests with
real SQLite tests. Use a disposable runtime for real browser save/readback with
the first successful response deliberately dropped; verify one saved rule, role
denial and TR/EN recovery. Keep provider discovery/execution intercepted. Extend
the existing live UI fixture with lost-save recovery without changing customer
connector records. Run lint/types/build/regressions and exact-release production
checks. The additive receipt table requires no data backfill; retain it during a
code rollback, which restores the earlier retry limitation.
