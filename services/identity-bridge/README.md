# Fornost enterprise identity bridge

Optional customer-operated service for AD/LDAP and SAML. Native OIDC runs in the Fornost application without this service. It authenticates identities; it cannot create accounts, assign roles, approve evidence or bypass organization scope.

## Deploy

1. Run Node 24, `npm ci --omit=dev` in this directory, then `npm start` (or build the provided Dockerfile). Mount certificates read-only; do not include them in an image.
2. Set the **same random secret of at least 32 characters** as `FORNOST_IDENTITY_BRIDGE_TOKEN` in the application and bridge. On-prem: put it in `.env.onprem` (0600), rerun the installer; it is included in protected backups. Managed Workers: provision it as a Worker secret. Never put it in browser variables.
3. Set `BRIDGE_TLS_CERT_FILE` and `BRIDGE_TLS_KEY_FILE` to the bridge server certificate/key; the application must trust its certificate. Defaults: listen on `127.0.0.1:8444`. Containers set `BRIDGE_HOST=0.0.0.0` and restrict network ingress to the application.
4. Set `FORNOST_APP_ORIGIN=https://your-fornost-host` (include non-default port). Set `FORNOST_DIRECTORY_HOSTS=dc1.example.com,dc2.example.com`. Only those exact directory hosts are allowed. Add a private directory CA with `NODE_EXTRA_CA_CERTS=/mounted/directory-ca.pem`; certificate and hostname validation always remain enabled.
5. Enable `FORNOST_ALLOW_PRIVATE_CONNECTORS=true` in the application only when it must contact an internal bridge. Apply outbound network policy to restrict the app/bridge to approved endpoints. The application denies HTTP except explicit loopback development; it does not disable certificate checks.
6. Under **Identity & Access → Enterprise SSO and SCIM**, configure the SSO or Active Directory / LDAP tab. Save, run the connection check, then verify a real user sign-in in another browser before requiring enterprise login.

For isolated local development only, `BRIDGE_ALLOW_LOOPBACK_HTTP=1` with `BRIDGE_HOST=127.0.0.1` allows an HTTP bridge. Never expose that listener on another interface. Production callbacks and SAML ACS remain HTTPS.

## Directory

Choose LDAPS (636) or mandatory StartTLS (389). Configure Base DN and a least-privileged read-only Bind DN/password. StartTLS must succeed before any credential is sent. The service searches by `sAMAccountName` (or `uid`) and `userPrincipalName`, rejects ambiguous results and disabled AD accounts, then binds a separate connection as the exact matched user DN. The `mail` attribute must match an existing **active** Fornost user. Immutable `objectGUID` or `entryUUID` is pinned to that account. No automatic provisioning. User passwords are not persisted or logged.

A connection test verifies TLS, service bind and Base DN. It does **not** prove an end user's password, MFA, group grants or business access. LDAP password bind does not provide MFA; enforce organizational MFA through SSO where required.

## SAML 2.0

Register the configured Fornost SP Entity ID and exact HTTPS ACS (`/api/auth/saml`, including the installation base path) at the IdP. Supply its issuer, SSO URL and PEM signing certificate. Both the response **and assertion** must be signed with SHA-256 or stronger, with the configured audience, Destination and Recipient. Require a persistent NameID and an `email`, `mail`, or standard email-address claim.

The application stores five-minute, encrypted, browser-bound, revision-bound request state and atomically consumes it once. The bridge validates signature, issuer, audience, InResponseTo, validity and endpoint constraints. Unsolicited IdP-initiated login is intentionally unsupported. For signed outgoing AuthnRequests, additionally set `SAML_SP_KEY_FILE` and `SAML_SP_CERT_FILE`. Configure MFA at your IdP; successful protocol validation alone is not an MFA assurance claim. Certificate rotation is an administrator change followed by real login validation.

## OIDC / emergency access / operations

OIDC uses authorization code with PKCE S256, state, nonce and validated RS256 ID-token signatures. Register `/api/auth/callback` with the deployment base path. Entra requires an exact single-tenant issuer; other providers must supply `email_verified=true`. Configure client-secret-post authentication. A valid external email can only bind to an existing active local account; the provider's immutable subject is then pinned. Account disabling, deletion, module and organization permissions continue to apply.

Requiring enterprise login restricts local passwords to explicitly selected active administrators. Initially include your current administrator account; keep credentials securely escrowed and test recovery. The final authorized emergency administrator cannot be disabled/deleted/demoted while this policy is active. Disabling a provider does not elevate any account. Existing sessions retain their normal lifetime; disable the account to revoke its sessions.

Sign-in outcomes appear under Administration → Audit Trail, with method and safe reason codes. Provider bodies, passwords, client secrets and SAML assertions are not logged. Failures do not fall back to a local password. Authentication is limited per identifier and network; unknown directory identifiers are hashed in audit events. Back up the database and encryption key together; losing the key makes saved credentials and pending SSO transactions unusable.

Run `npm test` for cryptographically signed SAML fixtures and LDAP TLS/bind contract tests. Repository `enterprise-login-qa.yml` covers the running app with an isolated OIDC IdP and directory transport fixture. These tests do not certify a customer's Entra/Okta/AD deployment; customer endpoints, CA trust, MFA and account mappings require acceptance testing.
