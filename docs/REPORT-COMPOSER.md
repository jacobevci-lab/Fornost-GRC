# Report preparation desk

Reporting opens a two-pane composer: scope and sections on the left, a document preview or source records on the right. The existing shell, palette, locale switch, module access and separate global-assurance report remain available.

## Use

1. Choose Management summary or Detailed register, a module and a classification.
2. Expand Advanced filters to select business unit, owner and status. Changing the module resets dependent filters; applying a saved definition restores the complete filter set together.
3. Select sections: management indicators (required), management note, high/critical records, data quality, status distribution and record appendix. Notes support up to 4,000 characters and are escaped as plain text.
4. Review the HTML document or the source register (50 rows per screen). PDF and HTML honor section selection. CSV and Excel include every record in the selected scope, regardless of pagination or section visibility.
5. Download PDF, HTML, CSV or XLSX. Preview and exports share a report ID and generation timestamp until filters, sections, note, language or source data change. PDF uses its own paginated layout; the preview is the exact downloadable HTML.
6. Save/open a definition using account views. Definitions retain template, classification, filters and sections, not notes or record data. They use current data when applied. Personal definitions support save, apply, update, rename and removal; administrators can publish team definitions with the existing revision and restore history.

## Scope and interpretation

- Supported input is the loaded core GRC register and, for administrators, the complete canonical CAPA reporting feed. AI and separate enterprise workflow stores are excluded and explicitly identified in the UI and output. The global-assurance report retains its separate scope.
- The displayed time is point-in-time report generation, not a historical period selector. Definitions are reusable configurations, not immutable archived report snapshots.
- High/critical priorities use assessed risk scores of at least 10 and declared high/critical severity for other modules. Unknown assessments are not converted into high or low risk. Metrics keep their existing module-specific methodology.
- A classification labels the output; it does not encrypt the downloaded file. AI commentary remains in its separate disclosure and is not inserted automatically.
- A failed required source blocks export instead of showing a misleading zero. A failed CAPA source does not block a core-only report. PDF font failures show a recoverable error with alternate export formats.
- Account-view APIs recheck current identity, role and module access. CAPA-only definitions are hidden from non-admin readers. No new persistence schema or migration is required.

## Validation

- `tests/report-export.test.ts`: all-row export, risk semantics, HTML/formula escaping, selected sections, PDF text/pagination and shared metadata.
- `tests/account-views.test.ts`: definition schema, persistence, isolation, CAPA/team permissions, current access and the existing concurrency/history safeguards.
- `scripts/report-composer-qa.mjs`: real Chromium preview/downloads, filtered PDF/HTML/CSV/XLSX, saved-definition lifecycle, empty/unavailable states and 16 TR/EN × light/dark × desktop/mobile × document/register layouts.
- `scripts/reporting-export-qa.mjs`: 121-row pagination and complete downloads, canonical CAPA references, source failure/recovery, font failure and PDF button contrast.
