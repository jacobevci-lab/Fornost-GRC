# Cross-module record search and register context

The existing header search / Ctrl+K palette now has **Modules** and **Records** modes. Records searches the eight core GRC registers: risks, BIA, assets, compliance, vendors, controls, evidence, and audit requirements. It searches public codes, internal IDs, titles, owners, control/requirement references, audit names, and service names. It does not search attachment contents or enterprise workflow histories.

`GET /api/search?q=...&module=...&cursor=...` authenticates each request using the current session. Module permissions are applied in SQL before the 25-result page limit. A Viewer can search readable modules; a restricted account cannot query a forbidden module. Cursors are tied to the normalized query, selected module, and current readable scope. Results expose only ID, module, code, title, owner and status. Queries require 2–120 characters, use bound literal substring matching, and handle Turkish uppercase characters consistently in SQLite and JavaScript. Ordering is deterministic by record ID, not relevance or last-modified time.

The palette supports keyboard navigation, exact ID navigation, loading, no-match, retry, load-more and request cancellation. Errors are not shown as empty results. Vendor navigation uses the existing inventory work focus; requested vendors are included before the existing bounded list limit. Core record focus never substitutes another record for a missing ID.

Core register search/filter context is stored separately per user, module and browser tab. It survives module switching and refresh. Exact-record focus temporarily bypasses filters without overwriting them. **Return to previous view** restores the underlying context; **Show all records** explicitly clears it. Browser storage failure leaves ordinary navigation and filtering usable. This does not persist every enterprise module's internal tab or scroll state.

No existing theme stylesheet, theme token, navigation hierarchy, dashboard design or branding is changed. New CSS is scoped to the added search controls and uses existing tokens.

Validation: SQLite authorization/pagination/search tests include 5,100 records, cursor/query isolation, malformed JSON, Turkish casing, literal wildcard handling and failures. `scripts/record-search-qa.mjs` runs against a disposable loopback app: eight module lookups/navigation, scoped Viewer and session revocation, filter restoration, retry/stale responses, deletion, and TR/EN × light/dark × desktop/mobile screenshots and accessibility checks. The existing full Workspace Layout QA continues after this gate.

## Record context and graph return

Exact core-register focus survives reload within the same user/tab. It is a navigation hint, not a cached record or access grant: current records are fetched again, missing/forbidden targets remain unavailable, and source errors retain retry. Opening another module, clearing focus or applying register criteria clears the hint. A different account does not inherit it.

A graph-to-record handoff now carries the originating graph view, search, module, page and selected node. **Return to previous view** restores that origin; returning to a register preserves its existing query/filter preferences. This does not promise persistence of every enterprise module's internal state.
