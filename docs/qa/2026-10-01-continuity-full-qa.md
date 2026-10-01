# Continuity redesign and isolated product QA — 2026-10-01

The continuity workspace now uses a compact three-view toolbar, a labelled search, contextual empty states and grouped plan fields. Lifecycle actions are localized and respect role/assignment boundaries. Confirmation dialogs show the exact required phrase and only request evidence when required. Native dialogs provide modal focus and Escape dismissal. Accepted compact typography, orange dark accents and warm light surfaces are retained.

QA uncovered and corrected two functional issues: regulatory impact transitions passed the routing action into the domain validator instead of the selected operation; numeric zero was rendered as an empty field in core record forms. Contrast was strengthened for small text on warm light surfaces. The continuity modal position and phone metric grid were corrected after screenshot review.

## Reproducible scope

`.github/workflows/workspace-layout-qa.yml` boots a fresh application and disposable database at `http://127.0.0.1:4173`. The destructive test runner has a fixed loopback URL and cannot be pointed at production. Seed records are preserved; CRUD tests create their own records. Governance records are closed/retired where immutable audit history excludes hard deletion.

| Coverage | Runner / evidence |
| --- | --- |
| 27 modules × TR/EN × light/dark × 1536/768/390 px = 324 screen states; overflow, screenshots | `scripts/workspace-layout-qa.mjs`, `layout-qa-artifacts/results.json` |
| Accepted font sizes and evidence title/code colors; warm surfaces; Audit idle stability; Connected GRC search/filter/pagination/drill-down; Evidence Automation views | Same runner |
| Real create/read/update/delete, invalid input and Admin/Editor/Viewer restrictions across all 8 core record types | `scripts/comprehensive-runtime-qa.mjs` |
| Browser CRUD: Risk, BIA (including numeric zero RPO), Assets, Compliance, Controls; Evidence upload/download byte integrity, edit and delete | Same runtime runner |
| Continuity plan → independent approval → activation → exercise → breached targets → gap → independent close → retirement | Same runtime runner |
| KRI approval/measurement/breach/remediation/close; policy version/approval/publish/retire; incident and CAPA lifecycle/reopen | Same runtime runner |
| Audit template creation/duplicate protection/archival deletion; vendor assessment/approval/offboarding; regulatory change/impact/verification/closure | Same runtime runner |
| Master-data add/duplicate/delete; AI model draft CRUD; evidence source edit/rule/disable without remote collection | Same runtime runner |
| AI workspace subview render sweep in both themes; uncaught JS and same-origin server errors | Same runtime runner |
| WCAG automated checks, module navigation, responsive language switching, sidebar modes, runtime and network errors | `scripts/full-product-qa-gate.mjs`; raw `qa-report-v2.json` plus `qa-gate.json` |
| Typecheck, lint, build, existing unit/regression suite, Docker/Podman and Linux compatibility | Repository CI workflow |

The workflow artifact `workspace-layout-qa` contains machine-readable results, screenshots and runtime logs. Raw accessibility results remain available alongside the gate: only documented shared-brand labels, verified replacement sidebar controls and independently verified benign network/navigation noise are excluded. Product accessibility findings are not suppressed.

## Limits

These are isolated-environment results, not evidence of production deployment. External SMTP delivery, SSO/LDAP federation, webhook/ticket delivery, third-party connector collection and hosted AI responses require real service configuration and are not claimed as verified. AI subview rendering and model draft CRUD do not imply every governed AI transition has been exercised end-to-end. Automated accessibility checks do not replace assistive-technology or human usability testing.
