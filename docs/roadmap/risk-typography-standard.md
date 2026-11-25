# Risk typography standard

## Delivery brief

Administrative workspaces currently override the compact Risk register with a
14/18px scale. Historical global styles also compete with individual module rules
and leave browser form fonts and public portals outside the same hierarchy.

Use Risk Assessment and Risk Appetite as the reference for a single semantic
typography contract: breadcrumb, page title, KPI, tabs, section titles, table
headings/cells, labels, fields and buttons. Capture their computed styles before
changing production CSS. Preserve the existing font stack, colors, spacing,
navigation, record codes, permissions and assurance decisions.

The requested compact target is 13px data/forms, 13–15px semibold section titles
and 20px semibold tabular KPI values. Small explanatory text and table headings
retain a distinct compact level. Use relative units so browser text scaling is
respected. All interactive application surfaces, including public portals and
top-layer dialogs, share the contract; printable exports retain their document
layout. Code and hashes may use the monospace stack.

## Acceptance and validation

- One font family and semantic scale, defined globally; remove local family and
  conflicting typography overrides, including the separate administration scale.
- Read-only browser matrix across every navigation destination in TR/EN and
  light/dark, with computed styles and screenshots. Include representative forms,
  record details, Ask Fornost drawer, public Trust Center and vendor portal.
- Check document overflow, form control text containment and responsive layouts;
  distinguish intentionally scrollable tables from page overflow.
- Run lint, typecheck, build and relevant existing browser regression suites.
- Record reference values and observed results below; do not equate a source
  inspection with a browser measurement or an unrun check with a pass.

## Reference and results

Pending baseline browser capture and implementation.
