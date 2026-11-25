# Attention source recovery and action readiness

The attention panel publishes one reconciled read result instead of incrementally mixing operational insight, automation, work and CAPA lifecycle responses. Primary data has a 15-second read budget, including response bodies and lifecycle lookup. Refresh aborts the previous read; unmount aborts requests and invalidates its publication token. Late or superseded reads cannot replace a newer view.

Missing or malformed insight/automation collections produce the existing unavailable/retry state, not an empty all-clear. Work responses use the shared queue contract and completeness check. A failed, invalid or partial work register preserves readable operational signals but explicitly marks governance unavailable, withholds CAPA/retest actions and explains how to refresh or use the full assurance queue. Existing drafts are retained but hidden until readiness returns; submit handlers also enforce readiness.

Validation: deterministic tests cover known-empty versus unknown queues, valid 500-row partial coverage, malformed primary collections and cancellation propagation. Browser QA stalls a primary source through the real timeout, checks error/retry recovery and releases the stale response after a successful refresh; it also checks action withholding for a malformed work response. Existing exact CAPA lookup tests remain in place.

This does not make independent APIs transactionally consistent or paginate all work into attention. The dedicated assurance register remains the complete searchable work interface. Write requests are not automatically retried.
