# Connected record actions and My Work — 1 October 2026

This increment implements the product promise that an owner can reach the relevant record without navigating unrelated registers. It adds no module, schema, permission or alternative mutation API.

## User-facing changes

- Connected GRC and My Work can focus the exact Risk, BIA, Asset, Compliance, Control, Evidence or Audit requirement record. The audit's workspace opens automatically. A compact selected-record banner provides one action to return to the full register.
- Exact identifiers/public codes are resolved within the intended module. Ambiguous/deleted references produce an explicit unavailable message instead of selecting a similarly named record. Existing evidence-by-control searches and enterprise module handlers remain separate.
- Core register searches include visible record codes and internal identifiers as well as record data.
- My Work includes authoritative Findings/CAPA work, including reviewer assignments; clicking a finding uses the existing governed Findings workspace.
- Today, exact owner matching, full pagination (20 per page), explicit refresh failures and visible mobile deadlines improve daily use. Similar names or email substrings no longer match assignments. Existing record permissions and maker/checker decisions remain enforced by the original modules/APIs.
- Date-only Today/deadline rules follow the existing UTC calendar-day contract. Date-only display cannot shift to yesterday in western browser time zones.

## Scope and design

Seven core registers support exact focus. Vendor/TPRM and other enterprise lifecycles retain their authoritative module navigation; this change does not pretend legacy vendor rows are current TPRM records. My Work contains core records and CAPA, not every enterprise lifecycle. No new dashboard KPI or primary action is added. The selected-record banner has one recovery action. Mobile keeps the title and deadline visible with the existing compact typography.

## Validation

New functional tests cover exact IDs, module aliases, duplicate codes, missing references, assignment collisions, Today boundaries, pagination beyond 80 and CAPA projection. The runtime runner exercises all seven contextual core transitions and record edit/cancel, 83 inbox fixtures with an ownership collision, last-page access, mobile deadlines, and CAPA navigation. Existing comprehensive QA covers CRUD, governance lifecycles, 324 TR/EN light/dark responsive states and accessibility. PR workflow results and artifacts are authoritative for the final tested commit.

Live environment cleanup/verification from the previous QA remains limited by the browser credential-observation safeguard. This increment does not alter browser authentication or confirmation controls to work around that safeguard. External integration delivery is outside this increment.
