# Continuous control views — design QA

Approved scope: priority work list and optional source view in Evidence Automation. Guided review is deferred. Existing navigation, fonts, color themes, actions and canonical data remain authoritative.

Source visual truth:
- Priority: `generated_images/exec-15d19f14-f896-4934-8913-a2da9193c15c.png` (1487 × 1058).
- Source grouping: `generated_images/exec-93f29bbb-7a7b-4c43-a2d9-a4df547dab89.png` (1487 × 1058).

Implementation captures: pending the `continuous-control-views-preview` browser artifact. Target desktop viewport 1440 × 960 CSS px, DPR 1; mobile 390 × 844 CSS px, DPR 1. Full-page captures may be taller than the viewport. Synthetic test controls differ from the illustrative mock records; no fictitious values are shipped.

Full-view and focused region comparison: pending actual browser evidence. Local Chromium cannot open process sockets in this execution environment; the established isolated GitHub Chromium runner is used.

Required fidelity checks: existing application font/typography, compact toolbar and inline rows, theme/semantic tokens, existing native icons (no new raster assets), and bilingual truthful source/result/owner copy. Functional checks cover default priority, source grouping, combined filters, refresh/selection retention, missing source and stale evidence, keyboard expansion/Escape, run evidence navigation and responsive bounds.

Intentional adaptations: retain actual source/rule/run contracts, show only supported actions, show all matching controls, distinguish recorded last result from current evidence, and avoid invented device counts or business-impact scoring. Mock CAPA action is not added without a linked finding and the existing governance workflow.

Findings: browser-rendered evidence and comparison are not yet available; no visual pass is claimed.

final result: blocked
