# Continuous control views — design QA

Approved scope: priority work list and optional source view in Evidence Automation. Guided review is deferred. Existing navigation, fonts, color themes, actions and canonical data remain authoritative.

Source visual truth:
- Priority: `generated_images/exec-15d19f14-f896-4934-8913-a2da9193c15c.png` (1487 × 1058).
- Source grouping: `generated_images/exec-93f29bbb-7a7b-4c43-a2d9-a4df547dab89.png` (1487 × 1058).

Implementation captures: pending the `continuous-control-views-preview` browser artifact. Target desktop viewport 1440 × 960 CSS px, DPR 1; mobile 390 × 844 CSS px, DPR 1. Full-page captures may be taller than the viewport. Synthetic test controls differ from the illustrative mock records; no fictitious values are shipped.

Full-view and focused region comparison: pending actual browser evidence. Local Chromium cannot open process sockets in this execution environment; the established isolated GitHub Chromium runner is used.

Required fidelity checks: existing application font/typography, compact toolbar and inline rows, theme/semantic tokens, existing native icons (no new raster assets), and bilingual truthful source/result/owner copy. Functional checks cover default priority, source grouping, combined filters, refresh/selection retention, missing source and stale evidence, keyboard expansion/Escape, run evidence navigation and responsive bounds.

Intentional adaptations: retain actual source/rule/run contracts, show only supported actions, show all matching controls, distinguish recorded last result from current evidence, and avoid invented device counts or business-impact scoring. Mock CAPA action is not added without a linked finding and the existing governance workflow.

First browser iteration at d825d86: isolated layout probe 43638071210, artifact 14131096938 (`failure.png`, 1440 × 960). The priority grouping, selected inline run, retained source context and existing cream/teal shell rendered correctly. The journey stopped at the owner selector's ambiguous accessible name.

Findings and fixes awaiting a new browser capture:
- P2: owner/view select labels included nested option text. Added explicit bilingual accessible names; the exact-name browser interaction remains required.
- P2: legacy global 10px typography flattened control names and metadata. Scoped 13px body, 14px control/group titles, 12px metadata and 16px source headings to the work queue, preserving the application font family and palette. Removed the inherited extra box around the queue action heading.
- Fixture repair: the SonarQube fixture inherited the Microsoft vendor, so searching Microsoft legitimately matched it. Use SonarSource; retain the combined-filter count assertion.

Full-view/source-view comparison and mobile results are still pending; no visual pass is claimed.

final result: blocked
