# Production smoke tests

Fornost includes a production smoke-test workflow that validates the deployed Cloudflare runtime without mutating production data.

## What it checks

- Root application endpoint is reachable.
- `/api/health` returns HTTP 200 and `status: ok`.
- Cloudflare D1 accepts a read-only query.
- Cloudflare R2 accepts a read-only list operation.
- A minimal set of browser security headers is reported.

The checks are intentionally read-only. Asset/Risk CRUD and end-to-end browser flows should be covered by a separate authenticated Playwright suite with dedicated test identities and cleanup.

## GitHub configuration

Optional repository variable:

- `FORNOST_PROD_URL` — production URL. If omitted, the runner currently defaults to the `workers.dev` production endpoint.

Optional repository secrets for deployments protected by Cloudflare Access:

- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Use a Cloudflare Access service token scoped only to the Fornost production application. Never commit the service-token credentials to the repository.

## Triggers

The workflow can be run manually, runs after pushes to `main`, and performs a scheduled check every six hours. Push-triggered checks wait briefly for the external Cloudflare Git deployment to finish before testing the production URL.
