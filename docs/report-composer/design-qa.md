# Report composer design QA — 2026-11-11

Selected direction: Report Preparation Desk, the first reporting concept approved in the conversation. Existing Fornost shell and theme tokens are retained. The original screen and generated concept were inspected before implementation.

## Visual comparison

The approved concept was cropped to the report workspace (excluding the unchanged application header), and the Chromium workspace screenshot was scaled to the same comparison width. A side-by-side comparison was inspected, along with individual desktop and mobile images. Test records and report identities are synthetic and differ from the concept's illustrative data.

Evidence: [focused browser run](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43057773062), head `20851f1c1b6f90b4d1573a67fccdff036a9f6317`, artifact `report-composer-qa`.

| Area | Observation and resolution |
| --- | --- |
| Layout | Scope/sections rail, document/records tabs and right document surface match the selected information architecture. Mobile stacks settings above the preview without page overflow. |
| Typography | First Chromium capture exposed legacy 10px overrides. Composer-specific 13–14px controls/body, 26px desktop title and readable document typography resolve this. |
| Color and contrast | Warm cream, teal actions and existing dark theme retained. PDF action uses a stable dark teal with white text; enabled, hover and disabled states pass 4.5:1 in both themes. White document preview intentionally represents the downloadable document in dark mode too. |
| Controls | Section checkboxes retain clickable label areas; oversized inherited checkbox boxes were corrected. Source records preserve pagination, resizing and full-data export. |
| Content | Real scope exclusions, report identity, timestamp and priority methodology replace illustrative claims. Empty and unavailable states do not display fabricated metrics. |
| Assets | No raster illustration or third-party image required; UI consists of existing controls, typography and document content. |

Intentional implementation differences: an explicit CAPA source-status strip; an HTML document viewport with scrolling, rather than a simulated paginated PDF viewer; PDF pagination disclaimer; source-derived priority records rather than invented recommendations. Word/PowerPoint, historical dates, snapshot archives and page-zoom controls are not presented as available features.

No open P0/P1/P2 visual issues were observed in the reviewed captures. This is an internal design review, not independent accessibility certification or customer acceptance.

## Behavioral coverage

The focused run passed all 16 combinations of document/register, TR/EN, light/dark and 1640/390px viewports. It also passed preview-to-HTML equality, shared report identity across exports, filtered PDF/HTML/CSV/XLSX, escaped notes, section visibility, account-definition save/reload/apply/rename/removal, preserved business records and core-source failure/recovery. The existing 121-row export regression passed CAPA references, pagination, permission failures, recovery and PDF font failure.

A final follow-up narrows saved-value label translation to the relevant fields, includes explicit record identity/code in Excel, and uses numeric hour fixtures to verify the BIA recovery-target metric. The follow-up passed the complete focused browser and export regression workflow on runtime head `3168ce69ab15c201fdb4976afa7ab94ef546dc3a`: [final runtime browser evidence](https://github.com/jacobevci-lab/Fornost-GRC/actions/runs/43058547363). Subsequent changes only align legacy source-contract tests with the new UI; runtime files are unchanged.

Local Chromium was blocked by the execution environment's socket policy. Actual browser evidence above comes from isolated GitHub Actions Chromium; no claim is made that a local browser session passed.
