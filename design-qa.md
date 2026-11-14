# Continuous control views — design QA

Approved scope: priority work list and optional source view in Evidence Automation. Guided review is deferred. Existing navigation, fonts, color themes, actions and canonical data remain authoritative.

Source visual truth:
- Priority: `generated_images/exec-15d19f14-f896-4934-8913-a2da9193c15c.png` (1487 × 1058).
- Source grouping: `generated_images/exec-93f29bbb-7a7b-4c43-a2d9-a4df547dab89.png` (1487 × 1058).

Implementation evidence: [isolated browser run 43638666869](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43638666869) passed on application commit `ed80befc6494897ec00063a881dd645c48dd0c33`. Its [continuous-control-views-preview artifact 14131317519](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43638666869/artifacts/14131317519) contains the real Chromium captures. Desktop viewport 1440 × 960 CSS px, DPR 1; mobile 390 × 844 CSS px, DPR 1. Full-page captures are taller than the viewport: priority light 1440 × 1611 and source light 1440 × 1863. Synthetic test controls differ from illustrative mock records; no fictitious values are shipped.

Full-view comparison: reference and actual capture were assembled together, side by side, for both views. Focused comparison placed reference and actual grouped rows, expanded result/evidence region, and source cards together at native scale. Mobile source view and settled dark source view were inspected separately. Local Chromium cannot open process sockets in this execution environment; the established isolated GitHub Chromium runner supplies browser evidence.

Required fidelity checks: existing application font/typography, compact toolbar and inline rows, theme/semantic tokens, existing native icons (no new raster assets), and bilingual truthful source/result/owner copy. Functional checks cover default priority, source grouping, combined filters, refresh/selection retention, missing source and stale evidence, keyboard expansion/Escape, run evidence navigation and responsive bounds.

Intentional adaptations: retain actual source/rule/run contracts, show only supported actions, show all matching controls, distinguish recorded last result from current evidence, and avoid invented device counts or business-impact scoring. Mock CAPA action is not added without a linked finding and the existing governance workflow.

First browser iteration at d825d86: isolated layout probe 43638071210, artifact 14131096938 (`failure.png`, 1440 × 960). The priority grouping, selected inline run, retained source context and existing cream/teal shell rendered correctly. The journey stopped at the owner selector's ambiguous accessible name.

Findings and verified fixes:
- P2: owner/view select labels included nested option text. Added explicit bilingual accessible names; the exact-name browser interaction remains required.
- P2: legacy global 10px typography flattened control names and metadata. Scoped 13px body, 14px control/group titles, 12px metadata and 16px source headings to the work queue, preserving the application font family and palette. Removed the inherited extra box around the queue action heading.
- Fixture repair: the SonarQube fixture inherited the Microsoft vendor, so searching Microsoft legitimately matched it. Use SonarSource; retain the combined-filter count assertion.

All three fixes passed the second browser journey and were visible in the ed80bef captures. The exact-name owner/view selectors, combined filters, all four priority groups, orphan source group, selection retention on refresh/view switch, keyboard Escape/Enter and evidence navigation passed. Mobile bounds and status-badge bounds passed with no browser page errors.

Five-surface review:
- Typography: current app font retained; control titles, metadata and source headings remain distinguishable at native scale.
- Layout: priority rows and inline detail match the selected work-list direction; the optional view uses two source columns on desktop and one on mobile. An expanded source intentionally grows to show the existing recorded-run details. Toolbar and actions wrap on mobile without horizontal overflow.
- Tokens: existing cream/teal light and dark tokens retained, with semantic failed/current/paused/verification states. Missing source and stale evidence never receive a green current-result badge.
- Assets: existing native controls/icons retained; no generated raster UI, replacement brand assets or new fonts shipped.
- Copy: TR/EN labels and action names use actual product capabilities. No unsupported business-impact score, device total or direct CAPA creation is implied.

P3 capture-only finding: the first dark priority screenshot caught finite theme transitions, while the following source and mobile captures show the settled dark palette. Screenshots now disable animations to capture their final state; the light source overview also closes the expanded row after testing selection retention. This changes only QA capture timing/state, not application behavior. Global shell contrast belongs to the unchanged application shell and is not presented as a redesign in this change.

No unresolved P0/P1/P2 finding in the implemented control-view scope. This visual result is separate from repository-wide release gates and production deployment verification.

final result: passed
