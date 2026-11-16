# Retry-safe evidence source creation

At revision 6b4abe3, an administrator whose initial `save-source` acknowledgement
is lost can retry the connector wizard or manual source form and create a second
source. Apply the existing continuous-control creation contract to sources:
retain a UUID per open creation attempt, atomically commit an actor-scoped receipt
and source, and return the original ID for an identical retry without changing
credentials, enablement, test results or linked assessment history. Changed input
or a removed result must conflict, with a link to the exact existing source when
available. Confirmed updates continue through the existing concurrency guard.

Fingerprint normalized configuration and credentials using a domain-separated
HMAC with the configured settings encryption key whenever credentials are present;
never store plaintext credentials or an unkeyed credential digest in receipts.
Public sources need no encryption key. A settings-key rotation may conservatively
conflict with an old request; inspect the existing source before starting anew.
Keep Admin authorization and URL/provider validation. Do not automatically run a
provider on save, change approval rules, or extend this to durable browser drafts.
Closing the creation UI or reloading starts a new attempt; credentials stay out of
browser storage. The additive receipt table needs no backfill and is retained on
rollback; old code restores the earlier retry limitation.

Verify real SQLite atomicity, concurrent/repeated requests, changed credentials
and configuration, actor isolation, deletion, rollback, legacy requests and
unchanged linked control history. Exercise TR/EN wizard and manual creation in an
isolated browser runtime with real saves and deliberately dropped acknowledgements;
intercept discovery to avoid provider calls. Include exact-source recovery,
Viewer/Editor denial and representative theme/mobile screenshots. Run required
lint/types/build/regressions and exact-release production checks. Record delivery
evidence in the PR; do not count intercepted provider transport as provider UAT.
