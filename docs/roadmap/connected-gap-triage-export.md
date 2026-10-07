# Connected GRC gap triage and export

The Gaps view now filters high/medium connection gaps, missing targets, and ambiguous targets independently. The filter combines with the existing search and source module. Clear restores all three filters and incremental list limits. Global coverage and total gap counts remain unchanged by filters. Unresolved references are not assigned an invented severity.

The same filtered results can be downloaded as UTF-8 CSV. The export contains all loaded matching results, not just the first visible cards/references. Exact source IDs, codes, rules, missing relationships, reference fields and candidate identities support remediation in authoritative modules. Candidate records are encoded as JSON within an escaped CSV cell. All cells retain spreadsheet formula protection.

Every row records source completeness, source counts, export time, filters and issue count. A zero-result export retains this context instead of implying organization-wide completeness. Loading disables export; incomplete sources produce a clearly named partial export. The export describes loaded source coverage, not regulatory compliance or a globally transactional snapshot across modules. No data mutation or new permission scope is introduced.

Validation: targeted unit tests cover categories, combined filters, partial/empty exports, IDs, candidate JSON, 83 references beyond the render budget and formula escaping. The existing connected AI browser QA additionally downloads the filtered 25-reference CSV, checks its last record, switches issue type to no matches, clears filters and checks the mobile layout. CI is authoritative for browser execution.

Release observation before this increment: production QA for d6f96141511df47fc6581b00d0da285383d567f2 stopped at the revision gate; app.fornostsecurity.com served 6f44078f69db3a7dc2205f6c69ebb8388bf51567 throughout the wait. No Cloudflare Workers build check was present for the newer commit at inspection. Cloudflare dashboard required sign-in. Do not treat successful PR QA as live validation.
