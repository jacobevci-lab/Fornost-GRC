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

Baseline captured by Compact Typography QA run 45561598410, commit
7bdfdc4e20309ec5b48e291c0d542d905295d22b. The actual Risk font stack is
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif.

| Role | Before (computed) | Shared target (default 16px root) |
| --- | --- | --- |
| Breadcrumb | 10px / 14.5px | 12px / 17.4px |
| Page heading | 16px / 20.8px | 16px / 20.8px, 600 |
| Section heading | 13px / 17.55px | 13px / 17.55px, 600 |
| Card heading | 11–18px | 13–15px / 1.35, 600 |
| Table heading | 10px / 14.5px | 12px / 17.4px, 600 |
| Data, tabs and buttons | 10–14px / 14.5–21px | 13px / 18.85px |
| Form label / field | 11–12px / 15.4–18px | 13px / 18.85px |
| Modal heading | 18px / 23.4px | 16px / 20.8px, 600 |
| KPI value | Competing 10–24px rules | 20px / 24px, 600, tabular |

The explicit requested 12–13px data and 20px KPI targets resolve the legacy
10px blanket override, rather than perpetuating that accidental shrinking.
The first cascade layer in globals.css owns important typography declarations;
module styles continue owning layout and color. This covers detached/top-layer
surfaces without IDs or escalating specificity. Root-relative units honor text
scaling. Code/hash styles are explicit semantic exceptions.

Local validation passed: lint, TypeScript, production build, all 2,098 unit /
regression tests, on-prem installer smoke and D1 migration preflight. The D1
preflight retains its existing historical-schema warning; no migration changed.
Existing UI regression expectations for larger dashboard/AI KPI values and
headings are updated to the same explicit compact values, preserving interaction,
contrast and overflow checks.

Browser matrix run 45562712288 on 511030768f2c8c10ce0e21c7f9bbb29c1e42005a
passed 384 views and 49,158 element measurements: all 30 navigation destinations
in TR/EN and light/dark at desktop/mobile widths, 14 real dialog types, Risk
record detail, Ask Fornost drawer, seven settings surfaces, both public portal
forms and 125% text scaling. No font, size, line-height, clipping, document-overflow
or page-error failures were reported. Public portal data is a deterministic
presentation fixture; the existing external-assurance suite owns authorization.

Manual screenshot inspection identified the sidebar brand caption clipping; it
now wraps, with a dedicated geometry check. Long resizable headers also wrap.
Final revision checks and deployment evidence are tracked in PR #483 and its
Compact Typography QA / production QA artifacts.
