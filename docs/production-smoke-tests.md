# Production smoke tests

Fornost includes a production smoke-test workflow that validates the deployed Cloudflare runtime and, when a dedicated smoke-test identity is configured, performs a short synthetic Asset/Risk transaction that cleans up after itself.

## What it checks

Always:

- Root application endpoint returns HTTP 200.
- `/api/health` returns HTTP 200 and `status: ok`.
- Cloudflare D1 accepts a read-only query.
- Cloudflare R2 accepts a read-only object lookup against a reserved health-probe key.
- A minimal set of browser security headers is reported.

When a dedicated smoke-test identity is configured:

- Local authentication succeeds and returns a valid session.
- The synthetic identity is an Admin so cleanup is guaranteed.
- An Asset can be created.
- A Risk can be created and linked to the synthetic Asset reference.
- Both records can be read back from D1 and the relationship persists.
- The Risk can be updated and the change persists.
- Both synthetic records are deleted before the run finishes.

The synthetic records use a unique `SMOKE-...` marker. The script also performs best-effort cleanup in a `finally` block if a test fails after creating data.

## GitHub configuration

Optional repository variable:

- `FORNOST_PROD_URL` — production URL. If omitted, the runner defaults to the current `workers.dev` production endpoint.

Optional repository secrets for deployments protected by Cloudflare Access:

- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

Use a Cloudflare Access service token scoped only to the Fornost production application. Never commit the service-token credentials to the repository.

Optional repository secrets for authenticated synthetic CRUD:

- `FORNOST_SMOKE_EMAIL`
- `FORNOST_SMOKE_PASSWORD`

Create a dedicated Fornost local Admin identity for this purpose. Do not reuse a human administrator's password. Both secrets must be configured together. If neither is configured, the authenticated CRUD portion is skipped while the root, D1 and R2 checks still run.

## Triggers

The workflow can be run manually, runs after pushes to `main`, and performs a scheduled check every six hours. Push-triggered checks wait briefly for the external Cloudflare Git deployment to finish before testing the production URL.
