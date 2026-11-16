# Product-specific evidence connectors

Implementation and documentation review: 2026-10-01. The earlier catalog populated a generic GET URL and static credential for every product. The new `provider-v1` sources have a shared typed catalog, individual setup fields, fixed API routes, server-side authentication and documented collection scopes. Existing sources retain their original behavior until an administrator explicitly edits them.

## Supported native datasets

Each product card opens its own setup requirements; the same fields are used in the guided onboarding wizard. The catalog links to the official API documentation beside the permission. These are read-only integrations, not vendor configuration/remediation tools.

| Product | Collected evidence | Configuration and least-privilege access |
| --- | --- | --- |
| Microsoft 365 / Graph | Secure Score history or Secure Score control profiles | Tenant ID, application ID, secret VALUE; application `SecurityEvents.Read.All`, admin consent |
| Entra ID | Conditional Access policies | Microsoft app; `Policy.Read.All`, admin consent |
| Intune | Selected managed-device compliance/encryption fields | Microsoft app; `DeviceManagementManagedDevices.Read.All`, admin consent and Intune licensing |
| Defender XDR | Security incidents through Graph v1.0 | Microsoft app; `SecurityIncident.Read.All`, admin consent |
| Defender for Endpoint | Machine health/inventory | Microsoft app; WindowsDefenderATP `Machine.Read.All`, admin consent |
| Sentinel | Incidents in one Log Analytics workspace | Microsoft app, subscription, resource group, workspace; Azure RBAC Microsoft Sentinel Reader at workspace scope |
| Azure Resource Manager | Subscription resource inventory | Microsoft app, subscription; Azure RBAC Reader at subscription scope |
| Cloudflare | Token-visible zones | Scoped API token, Zone Read; no Global API Key |
| GitHub | Organisation repository metadata | Organisation, approved fine-grained PAT with Metadata Read for selected repositories |
| GitLab.com | Token-visible membership projects | Personal/group access token with `read_api` |
| Tenable Vulnerability Management | Cloud VM scan inventory/status | Access key AND secret key, CAN VIEW access to scans |
| CrowdStrike Falcon | Host IDs | Region US-1/US-2/EU-1, client ID/secret, Hosts READ |
| Okta | User lifecycle inventory (default API excludes DEPROVISIONED users) | Original org URL and SSWS token owned by a least-privilege read-only administrator |
| SonarQube Server | One project's quality gate status | HTTPS root origin, project key, user token with Browse permission |

There are 14 profiles and 15 selectable datasets. Inventory visibility is always bounded by the credential's permissions. An empty result does not prove that the tenant has no assets/incidents; it only describes this credential's response. CrowdStrike host IDs are not sensor posture, Tenable scans are not the full vulnerability export, and GitHub repositories are not branch-protection results.

## Microsoft setup

1. Create a single-tenant Entra app registration. These unattended collectors do not need a redirect URI or a user login flow.
2. For Graph datasets, add the application's listed Microsoft Graph **application** permission and grant admin consent. For Defender for Endpoint use the WindowsDefenderATP permission, not a Graph permission.
3. For Sentinel/ARM, assign the app's service principal the listed **Azure RBAC** role at the workspace/subscription. Graph permission/consent is not a replacement for Azure RBAC.
4. Enter Directory (Tenant) ID, Application (Client) ID and the client secret **value**, not the secret identifier. Sentinel additionally asks for subscription, resource group and workspace.
5. Save, then test the connection. The server requests a fresh client-credentials token for each collection. No manually copied short-lived access token is needed.
6. Discover fields and map only the evidence actually returned to the intended control. A successful connection is not a compliance verdict. Set a meaningful path, comparison and freshness policy before enabling automation.

Token audiences are Graph `https://graph.microsoft.com/.default`, ARM `https://management.azure.com/.default`, and Defender for Endpoint `https://api.securitycenter.microsoft.com/.default`. The last audience intentionally differs from its `https://api.security.microsoft.com/api/machines` request host, following Microsoft's app-only authentication documentation. These profiles target the global cloud; sovereign clouds, managed identity and certificate authentication are not implemented.

## Collection and secret handling

- Source credentials are stored as an AES-GCM encrypted bundle using the existing `FORNOST_SETTINGS_ENCRYPTION_KEY`. Configure this server secret (at least 32 characters) before saving credential-bearing integrations. Never set it in the browser or commit production keys. Production deployment does not automatically obtain this key from the repository.
- Source GET responses contain only whitelisted non-secret configuration and a `hasSecret` flag. OAuth tokens remain in server memory for the run. Editing with blank credentials preserves the encrypted bundle only for the same provider, origin, tenant and client identity. Identity changes require fresh credentials. Closing the form or switching products clears entered credentials.
- Native collectors follow OData continuations, Link headers, GitLab page headers, Cloudflare page metadata, CrowdStrike offsets or Defender top/skip as appropriate. Continuations must stay on the same origin and endpoint path. HTTP redirects are rejected.
- Native collection is bounded by 20 pages, a cumulative 1 MB response budget and a 30-second deadline. Exceeding a bound, repeated pagination, invalid schema, HTTP errors or error envelopes fails the run. Partial collection is not promoted to successful evidence. Large installations need a scoped collector or a future incremental/export adapter.
- A `fornostCollection` object records dataset, page count, record count, collection time and credential-visible scope. Existing evidence raw snapshots retain a 200,000-character storage limit and now explicitly flag truncation; the response hash covers the full evaluated payload. This does not make a truncated snapshot suitable for full replay.
- 401, 403, 429, upstream availability, schema and transport failures have sanitized error codes. A 429 fails this run; retry occurs on the next scheduled/manual run, with no new automatic backoff loop.
- Discovery and the existing rule engine provide field inspection, manual control mapping, freshness/scheduling, evidence history and finding workflows. Native adapters do not automatically certify controls or mutate provider configurations.
- Okta user and incident datasets can contain personal information. Scope service accounts and evidence access to the required population. Custom origins use the existing HTTPS/private-address policy; this is not DNS-rebinding protection.

## Catalog entries requiring an adapter

These entries have explicit setup guides and a **Collector required** label. They are not working native integrations. A user can connect an independently deployed HTTPS JSON collector, but this change does not ship that collector binary or an inbound webhook receiver.

| Family | Why generic URL + bearer is insufficient | Useful next evidence |
| --- | --- | --- |
| AWS Security Hub | STS role assumption, SigV4 signing, region/account scope, GetFindings pagination | Normalised findings and standards/control state |
| GCP Security Command Center | Workload/service identity, org/source/location scope, OAuth and page tokens | Active findings by asset/control |
| Cortex XDR | Tenant API FQDN, API key ID, Standard/Advanced key mode; version-specific routes and nonce/timestamp signing | Endpoint coverage and incident summaries |
| FortiGate / FortiAnalyzer | FortiOS VDOM and REST token versus FortiAnalyzer ADOM and JSON-RPC sessions | Policy inventory, device health, logging coverage |
| PAN-OS / Panorama | API key, versioned REST resources, separate XML operational API and scope | Policy/configuration summaries |
| Cisco / Check Point / Juniper / Aruba / F5 | Exact appliance/cloud product, version, scope and session/signing flow differ | Network control and device-health evidence |
| SentinelOne / SIEM products | Tenant/version-specific API; cursor or asynchronous search jobs and time windows | Agent coverage, alert/logging coverage summaries |
| CyberArk / Segura / BeyondTrust / IGA | Deployment-specific least-privilege sessions/OAuth and account/safe scope | Rotation/access-review metadata, never privileged secret values |
| LDAP / databases / DAM | On-prem protocols, scoped read-only reports and data minimisation | Stale accounts, policy and coverage summaries |
| Purview DLP / Audit | Management Activity subscriptions/content retrieval, distinct permissions | DLP/audit coverage and event counts, excluding sensitive content |
| Qualys / Rapid7 / Checkmarx / Snyk | Product/region-specific auth, asynchronous exports and pagination | Vulnerability summaries and scan freshness |
| Ticketing / webhook | Different product schemas and write/signature contracts | Traceable remediation links and authenticated events |

Some catalog families deliberately group several products. Their guide is a discovery checklist, not a claim that every product/version shares one authentication method. Validate the specific deployment before implementing its adapter.

## Follow-up product work

### Source-connected AI mapping preview

Evidence Automation → connected source → **Map evidence with AI** runs a bounded
read-only collection for Intune, Defender for Endpoint or SonarQube. The four
existing ready tests assess the returned dataset. The configured AI provider
receives aggregate results, test definitions and up to 24 eligible control
descriptions from the latest 121 scanned records. The UI flags bounded coverage.
This is an optional analysis; manual configuration remains available without AI.

The model proposes only existing control IDs and supported test IDs, with a
rationale and remaining evidence needs. Failed tests are negative evidence,
not compliance approval; unverifiable tests cannot be proposed. Credentials,
raw provider data and device identities are excluded from the model context.
Existing AI operating, classification, data-protection and usage-budget policies
apply. Admin access is required; at most three analysis requests per actor per
minute are admitted. No provider settings are changed.

Choose **Review mapping and prepare control**, inspect the schedule/owner and
explicitly enable the ready control. Source/control changes or a collection older
than 30 minutes reject approval. The rule and its approval receipt commit together.
One proposal per analysis can be enabled. Existing source/template uniqueness
still applies; this flow does not rewrite a previously configured monitor.
Run the enabled control to collect durable evidence into the Evidence module;
the preview itself is not a canonical evidence record. The analysis receipt keeps
the aggregate preview, payload hash, provider/model and human approval lineage.

Validation uses substituted provider/model responses and isolated browser fixtures;
real customer API and model quality/coverage acceptance remain required. This is a
bounded source-connected workflow, not an agent that invents adapters or executes
arbitrary provider operations. Closing an in-flight preview stops the browser wait,
but server-side analysis may finish; it is never automatically retried.

Intune compliance/encryption, Defender sensor health and SonarQube quality gate now have [ready control tests](ready-control-tests.md) with versioned evaluation and affected-record results. Other products still require manually configured rules or future product-specific tests.

Prioritise AWS role-based and GCP workload-identity collectors, then a version-verified Cortex adapter and Microsoft certificate authentication. Large-tenant incremental cursors/export jobs, backoff with Retry-After, credential-expiry reminders and normalised control templates need separate implementations and end-to-end vendor fixtures. An inbound webhook feature additionally needs signature verification, replay protection, schema/version selection and delivery history; the present card does not expose a fake receiver URL.

## Primary references

The native profiles carry endpoint-specific links in `app/connectors/catalog.ts`; adapter guides carry vendor links in `app/connectors/guides.ts`. Additional authentication/protocol references used in this review:

- [Microsoft client credentials](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow)
- [Defender for Endpoint app-only access and token audience](https://learn.microsoft.com/en-us/defender-endpoint/api/exposed-apis-create-app-webapp)
- [Graph Secure Score](https://learn.microsoft.com/en-us/graph/api/security-list-securescores?view=graph-rest-1.0) and [control profiles](https://learn.microsoft.com/en-us/graph/api/security-list-securescorecontrolprofiles?view=graph-rest-1.0)
- [Tenable API authorization](https://developer.tenable.com/docs/authorization)
- [CrowdStrike OAuth2](https://developer.crowdstrike.com/api-reference/collections/oauth2/)
- [Cloudflare API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [GitHub organisation repositories](https://docs.github.com/en/rest/repos/repos#list-organization-repositories)
- [GitLab REST authentication](https://docs.gitlab.com/api/rest/authentication/)
- [Okta API tokens](https://developer.okta.com/docs/guides/create-an-api-token/main/)
- [SonarQube Web API](https://docs.sonarsource.com/sonarqube-server/extension-guide/web-api)
- [AWS GetFindings](https://docs.aws.amazon.com/securityhub/1.0/APIReference/API_GetFindings.html)
- [Cortex XDR 5.x API documentation](https://cortex-docs.paloaltonetworks.com/xdr-5-api)
- [Microsoft Management Activity API](https://learn.microsoft.com/en-us/office/office-365-management-api/office-365-management-activity-api-reference)

## Validation scope

`tests/product-connectors.test.ts` executes mocked HTTP contracts for auth, audience, pagination, error responses and collection limits. The isolated runtime QA covers source persistence, secret redaction/rotation, role boundaries and product-specific forms across themes and mobile/desktop widths. Real vendor tenant access, licensing, consent and provider data cannot be asserted by these fixtures; administrators must run Test Connection with their own scoped credentials after deployment.


### Creating a control after a connection interruption

The setup wizard and manual continuous-control form retain a creation request
identifier while a save is retried. If the first save committed but its response
was lost, the same administrator's identical retry returns the existing rule.
It does not reset the schedule, history or assurance state. Changed contents under
the same request produce a conflict with a link to the saved control; inspect
that control before starting a new creation. A removed result is not recreated
by replaying its request. Closing/reopening the wizard or reloading the page
starts a new attempt, so inspect existing controls first after an uncertain save.
The API accepts an optional UUIDv4 `requestId` on `save-rule`; clients must retain
it for retries of the same creation. Unkeyed legacy clients retain their previous
behavior. Source creation and provider requests have separate retry semantics.


### Retrying an unconfirmed source save

Both source-creation forms now keep a request ID while an open attempt is retried.
If the server saved the source but its response was lost, sending the same contents
again returns the original source without rewriting credentials, connection test
results or linked control history. Changed contents under that request return a
conflict and an **Open saved source** action when the source still exists. Removed
sources are not recreated by replaying their request. Review the saved source
before editing it or deliberately starting another creation attempt.

API clients may send a UUIDv4 `requestId` on initial `save-source` requests; retain
it and the same payload until the response is confirmed. Keys are scoped to the
authenticated administrator. Updates still use `sourceId` and the existing update
concurrency checks; unkeyed legacy creation remains supported. Saving does not
verify provider connectivity. Credential fingerprints use the server encryption
key, never plaintext credentials in the receipt; rotating that key may make an
old retry conflict. Public sources do not require the encryption key. Closing the
creation UI or reloading begins a new attempt; credentials are never saved in
browser storage. This does not provide durable draft recovery after reload.
