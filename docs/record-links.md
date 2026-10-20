# Authorized record and task links

Use **Copy record link** in an existing core record dialog, an exact-record focus banner, the selected/focused vendor workspace, an audit request, a workpaper or a saved audit milestone. Eight core registers are supported: risks, BIA, assets, compliance, vendors, controls, evidence and audit requirements. Audit request, workpaper and milestone links also carry their exact audit parent.

Links use an installation-local URL fragment, so target identifiers are not sent in the initial page request or ordinary HTTP referrer. They contain identifiers only, not names, evidence files, credentials or access tokens. The local sign-in screen retains the fragment until the authenticated application is ready. The server then resolves the exact target under the current session and module grants; workpapers additionally require evidence-read access. Missing, deleted and forbidden targets receive the same unavailable result. Invalid or duplicate parameters are rejected. Transient source failures retain the target for retry.

Successful navigation clears the fragment using replaceState, avoiding repeated navigation after reload/sign-out. Full-access vendor users enter the existing vendor workspace; scoped users enter their allowed register. Existing core-record search/filter history remains available through Return to previous view. A copied link grants no permission and is not an external-auditor invitation. Clipboard rejection exposes a selectable fallback field instead of claiming success.

## Audit notification emails

In **Email & Notifications → Application URL (task links)**, administrators may configure the complete HTTPS installation address, including an on-prem port and base path, for example `https://grc.company.example:8443/fornost-grc/`. Credentials, query strings, fragments, whitespace and unsafe path encodings are rejected. The address is never inferred from an incoming Host/Origin header.

At delivery, audit request notifications append the exact task link using the current email configuration and the fresh outbox source. Existing current-recipient, task-state and profile-revision checks still run before delivery. All three existing transports use the same link: SMTP bridge, Microsoft Graph Mail and HTTP Email API. Empty or invalid legacy configuration preserves existing menu instructions without a link. Changing the URL does not rewrite history or resend accepted messages.

No external email is sent during QA; transport bodies are inspected through a mocked fetch. Customer mail delivery and external SSO redirect/UAT remain installation-specific validation. There are no new operational log panels, attachment links, delegation grants or write actions in this feature.

Milestone links open the exact task under **Plan and scope**. Audit-read access is sufficient to open and copy a link; existing owner/admin write rules remain unchanged. Completed and cancelled tasks remain readable while the parent audit exists. Unsaved drafts have no link. These links do not add milestone email reminders.
