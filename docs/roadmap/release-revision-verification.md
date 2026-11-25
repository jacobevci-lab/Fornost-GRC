# Revision-aware production verification

The health endpoint now reports the immutable Git revision embedded at build time. An explicit FORNOST_BUILD_REVISION must be a full lowercase 40-character SHA; otherwise the build uses the actual Git checkout, then GITHUB_SHA for source archives. Builds without revision metadata report `unknown` rather than claiming a commit. On-prem source builds without Git can set FORNOST_BUILD_REVISION; prebuilt artifacts preserve their original revision.

Production smoke and full QA require github.sha to appear in a healthy, uncached `/api/health` response before login, synthetic CRUD or browser QA. This replaces the smoke workflow's fixed 75-second sleep. The wait is bounded to eight minutes, each request to ten seconds, follows no redirects and retains existing Cloudflare Access headers. Invalid, absent, old or unhealthy revisions cannot pass. Provider response bodies and access credentials are not logged.

Both workflows check the revision again after testing without waiting through a mismatch. Smoke also checks the revision during its normal health check. This detects a different revision at the verification boundaries; it is not a deployment lock or an atomic historical snapshot of every request. Manual production workflows must run against the intended deployed commit/ref. A deliberately older rollback must be tested against its own revision.

Verification covers source-revision precedence, source-archive fallback, malformed metadata, old/legacy healthy deployments, access redirects, unhealthy/missing revisions, bounded polling and post-QA mismatch. Runtime rollout must confirm the new revision field in the deployed artifact; a successful response from the prior version is no longer sufficient.
