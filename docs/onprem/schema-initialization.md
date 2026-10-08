# Request-owned schema initialization

Identity, AI, core GRC, evidence, findings and integrations cache only completed
schema initialization, separately for each database binding. Pending database
promises stay with the request that created them. A slow, failed or abandoned
request cannot make subsequent requests await its unfinished initialization.

Concurrent cold requests may independently run the idempotent compatibility
checks. Warm requests reuse completed metadata without repeating DDL. A failed
request propagates its error; it neither marks its binding ready nor clears a
successful concurrent initialization. Separate bindings never share readiness.
Identity's legacy password-iteration ALTER tolerates only the exact duplicate
column race. Locks, timeouts and other SQL errors continue to propagate.

This addresses an unsafe cross-request I/O caching pattern, not a proven root
cause for every production timeout. Cloudflare documents request-owned I/O and
the risks of sharing I/O objects across invocations:
https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request

Validation covers unfinished concurrent initialization, independent bindings,
failure/retry, late failures after concurrent success, and real SQLite concurrent
legacy repair. Migrations remain the canonical schema source; compatibility
initializers support older persisted installations.
