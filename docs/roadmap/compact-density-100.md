# Compact density at 100% zoom

## Delivery brief

GRC operators report that PR #483 made the interface too large. Keep its single
font family and cross-surface inheritance, while applying the requested explicit
scale: 12px / 1.35 body and controls, 10px breadcrumbs and table headings, 10.5px
cell details and badges, 11px supporting text, 13px section/card headings, 15px
page/modal headings and 17px tabular KPIs. Use root-relative tokens with a 100%
root; do not simulate density with browser zoom, transforms or a smaller root.

Reduce single-line controls to 28–32px, table cell padding to 6px × 10px, KPI
padding to 12px and expanded navigation item padding to 6px vertically. Preserve
natural height for multiline actions, textareas, file controls and card buttons;
keep hidden fields, checkboxes, range controls, icons and resize handles usable.
Existing color tokens, layouts, record lifecycle, RBAC and SoD remain unchanged.

## Acceptance and release

- All 30 navigation destinations, representative real forms and drawers, and
  vendor/Trust portals share the scale in TR/EN and light/dark.
- Browser measurements at 1440×900 and 390×844, 100% zoom: no unexpected page
  overflow, clipped control/heading text, font-family mismatch or oversized
  table/form text. Measure row padding, navigation and control dimensions too.
- Review desktop/mobile screenshots; check 125% user text scaling still works.
- Run lint, typecheck, build and the affected browser suites. Preserve interaction
  and contrast checks when updating typography expectations.
- Publish after validation; verify the exact production revision and smoke test.
  Revert the delivery commit for rollback. No data migration is needed.

## Evidence

Implementation and final validation results will be recorded in the delivery PR.
Baseline is main 4fbc365 (PR #483), with 13px / 1.45 data text, 12px captions and
20px KPI values. Density is measured from rendered geometry, not inferred from
font size alone. Synthetic portal payloads test presentation; authorization is
covered by the existing external-assurance suite.
