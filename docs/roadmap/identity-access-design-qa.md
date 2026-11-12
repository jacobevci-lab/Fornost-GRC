# Identity access desk — design QA

Review: 12 November 2026. Reference: the selected first “Kimlik ve erişim çalışma masası” mockup. Implementation retains the production shell, cream/teal palette, user-first table/detail split, short horizontal view controls, and a separate provider-profile view.

## Evidence
- [Browser run 43179863579](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43179863579), application revision `40b0b157c4322ccef318da223f4a3c1021b3a938`, artifact `identity-desk-qa` (13925628151).
- `identity-desk-qa-artifacts/report.json`: identity workspace scenarios passed, zero page errors, eleven screenshots. The aggregate run then exposed a test-fixture status expectation (demo restore returns 201); the fixture assertion was corrected before final validation.
- Reviewed the TR light desktop, EN dark mobile, profile preflight, and earlier session-confirmation desktop/mobile images against the selected composition.

## Review result
| Area | Result |
| --- | --- |
| Main hierarchy | Pass: user directory first, selected account beside it, account actions and recent events visible. |
| Local navigation | Pass: one horizontal row; scrolls within the control on narrow screens. |
| Readability | Pass after isolating 13–14px operational text and 16–20px headings from the legacy 10px reset. |
| Contrast | Pass after scoping primary colors; automated light/dark, hover and disabled checks require 4.5:1. |
| Responsive layout | Pass: detail panel stacks below the directory; horizontal scrolling stays inside the table and view controls. |
| Keyboard | Pass: modal dialog focus, Escape/discard recovery and return to the invoking button. |
| Content/state honesty | Pass: no production sample identities, no claimed SSO/MFA/SCIM success, failed reads block mutation. |
| Account actions | Pass: create/rename, role and module scope, suspension/reactivation, email-confirmed deletion, retained history and session revocation. |

Differences from the concept are intentional: real account counts, the existing global shell, existing three roles/eight module scopes, an explicit metadata-only profile notice, and a bounded latest-20-change history rather than a fabricated sign-in audit. Scope remains module-wide, not row- or business-unit-level access.

The follow-up clears outdated operation notices on explicit refresh, view change and locale change. Final release status and all aggregate workflow results are recorded in [PR #409](https://github.com/jacobevci-lab/Fornost-GRC/pull/409). Authenticated browser verification is performed in an isolated runtime; production verification checks the deployed revision and health. Vendor preflight success is simulated; real external SSO has not been validated.
