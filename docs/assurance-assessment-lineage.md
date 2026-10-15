# Re-test assessment lineage

An approved re-test can change a risk record only when its selected run was produced with the current source and rule settings. A source or rule edit after collection now produces an explicit re-test error instead of applying a result from another configuration. The previous risk decision, finding closure and exception re-test obligation are preserved.

Each new run and its evidence carry the same SHA-256 assessment fingerprint. It covers the rule's mapping, evaluation and policy inputs, its assessment revision, and the source's collection configuration, driver, enabled state and encrypted credential representation. Only the digest is added to run/evidence records. Names, connection diagnostics and previous results are excluded.

Database triggers advance the rule revision on meaningful rule edits and linked source edits. Changing settings and restoring them, even within the same timestamp, therefore requires another run. A result still in flight is also rejected if its observed revision changed. No-op edits and cosmetic renames do not invalidate completed tests.

Reconciliation preserves the first eligible run after independent approval (or the later exception-end boundary). A newer pass cannot silently replace an earlier error or failure. It also verifies that the approved target is still mapped. The transaction pins the selected run, rule/source snapshots, work approval, evidence, risk and finding state; concurrent changes defer the entire claim, and dependent-write failures roll it back.

The result dialog explains a configuration change, unverified historical configuration or changed control scope in Turkish and English. “Request New Test” uses the same configuration verdict as reconciliation. An explicit retry of approved inconclusive work remains available even if a later pass exists; that later pass cannot complete the earlier task. The new work still needs an independent reviewer and current closure proof; a current failed control still requires remediation. A changed target mapping must be resolved before retry. Passing automation never substitutes for independent residual-risk approval.

## Upgrade and operation

Migration `0089_assessment_lineage.sql` adds `evidence_automation_rules.assessment_revision`, `evidence_automation_runs.assessment_fingerprint` and two revision triggers. Runtime initialization handles already-upgraded databases and concurrent column creation. Existing history is retained; historical fingerprints are deliberately not fabricated. An outstanding approved task that selects an unversioned historical run receives `configuration-unverified` and needs a newly approved retry. Completed historical work is not rewritten.

Treat the two new columns and triggers as additive data during application rollback; do not drop history or synthesize fingerprints. An older application can continue to use the schema, but its unstamped runs will be unverified when this version resumes. Rolling back application code also removes this new reconciliation protection until restored.

## Verification

Real SQLite tests exercise pass/fail/error after settings changes, credential/configuration changes, A → B → A edits, target remapping, legacy runs, evidence fingerprint mismatch, source/rule availability, first-run selection, a newly approved retry, concurrent run/work/configuration edits, transaction rollback, trigger-inclusive D1 change counts, and the 100-binding limit. Migration and concurrent runtime upgrades preserve historical rows. In-flight collector tests cover reverted settings as well.

The localhost D1/browser suite creates explicitly synthetic source, run and evidence fixtures, edits the source through the real API, verifies unchanged risk and retained exception obligation, checks EN/TR result messages on desktop/mobile, and completes an independently approved retry with a current fingerprint. Vendor HTTP is substituted in SQLite tests; this verification does not certify an external vendor tenant.
