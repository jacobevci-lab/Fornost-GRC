# Enterprise workspace sign-in

The current login only supports local accounts; the identity profile is metadata preflight, not federation. Administrators need a real SSO / directory / emergency-local entry point without changing account roles, entity grants or independent approvals. The login must retain the compact 12px control scale, deep teal brand, TR/EN and light/dark preferences.

## Delivery contract

- Primary OIDC or SAML SSO action identifies the configured provider. Email-domain discovery only suggests SSO; it never changes the authentication decision.
- Native OIDC uses authorization code + PKCE, state, nonce and validated ID-token signatures/issuer/audience. SAML signature validation and LDAP operations run in an optional customer-controlled Node identity bridge; the Worker never opens an insecure directory connection.
- Directory and SSO settings coexist. Directory configuration includes host/port, LDAPS or StartTLS, Base DN, Bind DN, bind secret and connection test. Secrets remain server-side and encrypted. A bridge bearer credential is an installation secret, separate from the directory bind password.
- Only existing active Fornost accounts may sign in. External subjects are pinned to their assigned account; no JIT account or role creation. Session revocation and entity/module grants continue to apply.
- SSO-required mode accepts local passwords only for explicitly selected active emergency administrators. Enabling it requires a valid SSO configuration and an emergency admin; existing installations remain local-enabled until an administrator saves the policy.
- All completed login attempts record method, outcome, bounded reason and time in the administration audit trail. No passwords, authorization codes, tokens or raw provider responses enter logs.
- State is short-lived, browser-bound, configuration-revision-bound and single-use. Login throttles, request bounds, secure cookies, stale-config conflicts and unavailable-provider recovery fail closed.
- Public login includes persisted TR/EN and light/dark switches, a Trust Center link and accessible segmented local/directory forms. A configured provider's outage does not silently switch authentication method.

## Validation and release

Use real SQLite/D1 tests for state consumption, account mapping, audit persistence, policy and concurrency; signed local IdP fixtures for callback verification and replay; bridge tests for TLS/bind/search and SAML verification boundaries. Run real browser journeys for local login/recovery, configured and unavailable provider states, domain discovery, admin settings, TR/EN × light/dark at desktop/mobile. Run lint, TypeScript, production build and the affected regression suites. Customer Entra/Okta/AD endpoints require administrator configuration and remain unverified until a real customer login succeeds.

Publish using the established PR/main pipeline only after validation. Keep federation disabled by default; rollback restores the preceding application revision without deleting audit or account data. Update the administrator guide and provide the optional bridge deployment instructions.
