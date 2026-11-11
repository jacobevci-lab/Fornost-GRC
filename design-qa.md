# Connected GRC workbench design verification

Scope: relationship desk, impact review and gap completion. Existing assurance operations, palette, shell, access boundaries and canonical record workflows remain in place.

## References and evidence

Selected design: the 11 November 2026 Relationship Inspection Desk (`exec-e4101140-8c8d-4608-8d5a-a646a0ab189a.png`), with Impact Review (`exec-b4b3241f-0c12-4f63-bdbd-637cc7579a49.png`) and Gap Completion (`exec-76727765-caad-4253-9d33-477d9bf848e3.png`) as supporting views.

[Chromium workbench QA #4](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43028771322) passed at `2de114dc326514d844240ae6f28a03cab0f0bcb7`. [Artifact](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43028771322/artifacts/13859252237) contains 24 TR/EN, light/dark, 1640/390px workspace captures plus the empty state and report. Synthetic isolated records only; credentials are excluded. The local cloud preview was unavailable; these are actual Chromium renders from GitHub Actions, not a claim that the unavailable cloud session passed.

Reference and rendered captures were inspected together at the workspace content level. At 1640px the existing expanded sidebar leaves approximately 1304px for content. Representative light desktop diagram, plan editor, queue and dark mobile impact captures were directly inspected. No unresolved P0/P1/P2 visual findings were observed within this scope.

## Findings and repairs

- Preserved three-pane relationship exploration, two-pane impact/queue investigation, cream/teal tokens and explicit selected-record states. The existing assurance tab remains reachable.
- Repaired inherited 10px body typography, illegible primary hover text, content asides inheriting 100vh, and SVG edges inheriting the generic icon dimensions.
- Desktop uses readable 13px controls/body, 12px record titles, 17px section headings and a 26px page heading. Small metadata stays subordinate. Mobile stacks panels and scrolls tables within their containers.
- Relationship directions are retained in paths. Selected graph edges carry labels; diagram/list, bounded depth, zoom and fit are available. A deterministic layered graph replaces the illustrative freeform arrangement to keep real records stable.
- Explicit relationship edits use canonical fields with reason/history. Missing sources do not become a false clean state. Ambiguous legacy references show candidates without selecting one automatically.
- Product adaptations: existing navigation/search stay above the desk; the relation editor is contextual; actual owners, dates and BIA targets replace illustrative fixture values. No inferred effectiveness, compliance percentage or invented causal impact is shown.
- Verified internal mobile table scrolling, review topics from the visible relationship neighborhood and explicit history actions in the final visual rerun.

## Verified behavior

Browser QA passed UI link/unlink and persisted history, preservation of linked records, diagram/list and impact paths, BIA RTO display, uncertain-write replay prevention, gap search/reset and partial-source retry. All 24 language/theme/viewport combinations passed document-overflow checks with no page errors.

Local connected graph, navigation, source and transactional-write regressions: 89 passed, including a final nonvisual regression ensuring relationship edits preserve unrelated legacy and long-form source fields. Tests cover required links, source/target permission boundaries, stale versions, concurrent target disappearance, audit rollback, evidence reference consistency and draft-plan non-approval. The isolated layout probe also passed 324 module/language/theme/viewport views, including Connected GRC navigation and pagination, at the same reviewed revision: https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43028771450. All nine CI jobs passed, including regression tests, dependency/image audit and Docker/Podman/on-prem checks. The focused workflow also passed the existing AI/source recovery suite (8 layouts) and reference ambiguity/correction suite (8 layouts). Repository-wide Workspace Layout QA is separate and is not claimed complete here. Release checks run again on the final commit containing the nonvisual preservation fix.

final result: passed for the reviewed UI; final-commit CI and deployment status are recorded by the PR checks.
