# Integrations, supplier assessments, Trust Center and board reports

Group administrators manage external connections and publication from the consolidated workspace. Board packages are also available to a consolidated Group CISO with full module access. All connectors and public document selections start disabled or empty. Apply `0119_external_assurance.sql` when upgrading an installation.

## Integration Center

Open Administration → Integrations. Configure the existing ticket provider below the four connector cards. Set `FORNOST_SETTINGS_ENCRYPTION_KEY` in the installation secret store for provider credentials. Saving an inbound connector reveals a random token once. Rotation replaces that connector’s credential. Pass it in the HTTPS Authorization header; keep webhook URLs and secrets out of query strings.

| Connector | Transport and payload | Outcome |
|---|---|---|
| Microsoft Entra ID | Microsoft Graph client credentials. Register application permissions for the authentication-method registration report, directory role assignment schedules and sign-in audit logs. Grant tenant consent. Manual sync or the hourly scheduled collection reads all three datasets. An external collector can instead push `mfaCoverage`, `pimGlobalAdmins`, `highRiskSignIns`. | MFA uses registered users divided by users returned, PIM counts distinct activated Global Admin principals, sign-ins count high-risk sign-ins over 24 hours. Configured controls receive dated observations. Approved KRIs accept one measurement per UTC day and open native breaches at the red threshold. |
| Cloud posture | POST a normalized AWS, Azure or GCP alert, an AWS Security Hub EventBridge event, a GCP Security Command Center notification or an Azure Defender alert. Map the provider’s resource identifier to an asset and risk before sending. | Normalized encryption, public storage and IAM findings update both records. These observations do not grant assurance. |
| Jira / ServiceNow | Create a ticket from the finding detail. For callbacks, configure a Jira Automation web request or ServiceNow outbound REST message. Include the matching ticket key/number, status and current closure evidence code and SHA-256. | Done/resolved submits the finding for independent verification, with the evidence version and digest pinned to the event. The assigned verifier closes it through the existing CAPA workflow. |
| Slack / Teams | Configure a Slack incoming webhook or Teams workflow/incoming webhook and enable it. The scheduled worker checks current attestation campaigns, assigned PBCs, and open CAPA deadlines within seven days. Manual sync sends due notices immediately. | The outbox deduplicates by event and due date. The test sends an identified test message to the configured channel. |

Inbound URL: `POST /api/public-exchange/hook-{entra|cloud|tickets}`. Use `Authorization: Bearer <connector token>`, `Content-Type: application/json` and a stable `X-Event-ID` per provider event. A retry with the same event ID is idempotent. A JSON payload of `{"test":true}` validates the inbound token without updating GRC records.

Cloud example: `{"provider":"AWS","resource":"arn:aws:s3:::customer-exports","category":"public-storage","severity":"high"}`. Supported normalized severities are low, medium, high, critical and resolved.

Ticket example: `{"ticket":"GRC-12","status":"Done","evidenceCode":"EVD-007","evidenceSha256":"<current 64-character SHA-256>"}`. Missing or stale evidence returns a conflict. A delivery whose outcome is uncertain remains reserved against duplicate external ticket creation. Enter its reference in the finding drawer to recover the link. Fornost reads the provider record and checks the original finding correlation before accepting it.

## External portals

Set an HTTPS application URL in the email configuration (or `FORNOST_PUBLIC_URL`) and configure the existing email transport. A failed or unconfigured transport leaves an explicit recipient link for the authorized operator.

- In Supplier Management, open a supplier and send a security assessment. The vendor-specific invitation is valid for 14 days. Issuing another invitation invalidates the old one. A concurrent change to the invited draft blocks submission. A successful submission retains the prior draft, creates a new submitted cycle, stores a preliminary score, and supplies the existing independent review queue. The questionnaire and optional SOC 2, ISO 27001, penetration-test and DPA PDFs enter the Evidence Library pending review.
- In Governance → Trust Center Management, select exact published policy versions, enrolled frameworks and independently approved, current PDF evidence versions. Architecture summaries are maintained separately in Turkish and English. Customers submit a confidentiality acknowledgement for a specific document. Approval issues a seven-day bearer grant to the recipient. Download checks the current version, approval, content digest, evidence chain, expiry and grant. Each page of the delivered PDF identifies the recipient. Withdrawing a selected version revokes its pending requests and grants. Forwarded bearer links can be used by their holder until expiry or revocation.

## Board package

In Insights → Reporting select the report sections and language. The server stores a digest-bound snapshot. Risk scores include assessed records with valid coordinates. FAIR-Lite reports the number of estimates and preserves currency boundaries. Framework percentages use covered requirements divided by in-scope requirements. Critical concentration shows the share of active suppliers classified critical. CAPA and incident counts use their native lifecycle records. Export the executive PDF, print, or download the standalone 16:9 HTML presentation.

The targeted SQLite integration tests run with `node --import tsx --test tests/external-assurance.test.ts`. The external-assurance browser QA workflow uses an isolated D1 instance, an anonymous browser and an authenticated administrator. It never requires real provider credentials or sends real supplier invitations.

## Production release verification

Release acceptance requires the deployed revision to match `main`, a successful public Trust Center read with no administrator data, rejection of anonymous administration and tokenless supplier access, and authenticated reads of all four connector cards, Trust Center management and board reporting. The production smoke workflow checks these without configuring providers, publishing documents or sending invitations. The additive runtime initialization creates the same tables and indexes as migration 0119; operator-managed upgrades should also apply the SQL migration to retain the installation migration ledger.

The UI matrix covers 28 modules in two languages, two themes and three widths (336 visits). Historical workspace QA failures in incident retry, continuity Escape handling, AI navigation and legacy CRUD fixtures were already present in PR #474 (run 45347925890); they are not recorded as passing checks for this release. The external-assurance and connection-desk browser workflows remain separate acceptance evidence. Reverting the application revision leaves the additive external-assurance tables intact; it does not require deleting data.
