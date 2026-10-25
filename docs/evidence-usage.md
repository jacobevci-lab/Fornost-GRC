# Evidence usage and change impact

In **Evidence Library → Usage and change impact**, select an evidence record and refresh its current usage. The workspace is available to authenticated readers of Evidence Library, including scoped viewers. It does not upload files, replace evidence pins, reopen work or change approvals.

The workspace distinguishes three relationships:

- **Record link:** a control/compliance mapping, audit requirement or CAPA evidence reference. It does not establish which file version was reviewed.
- **Current version pinned:** a request/workpaper snapshot identifies the current version; the stored version ID, evidence ID, version number and content hash agree with the version table.
- **Earlier version pinned / version unverified:** a snapshot uses an older retained version or fails the same identity/hash check. Open requests/workpapers appear in **Open work to review**. Accepted requests, approved/cancelled workpapers and work in a closed audit retain their recorded pins and appear as preserved history, without automatic invalidation.

Open the linked record to decide whether to resubmit evidence, withdraw/reopen a workpaper or request review. Existing ownership, independent review and audit closure rules still apply. A newer file alone does not prove that a previous period's evidence was inadequate. Version identity checks are not chain-integrity checks or content-adequacy review.

Use the search and filters to narrow visible rows. **Download usage report** exports the entire loaded usage snapshot, independent of the screen filter, including source states, read limits, check time and exact internal navigation targets. It excludes file contents and storage keys. Refresh before relying on an older downloaded report.

## Coverage and access

| Source | Match and limit |
| --- | --- |
| Control/compliance links | Up to 100 current evidence `controlRef`/`controlRefs` tokens; exact native ID, then public code, then unique `controlId`. Ambiguous/missing references are shown, never guessed from titles. Only readable modules are queried. |
| Audit requirements | The 1,000 most recently updated requirement records; exact evidence native ID/public-code tokens in `evidenceRef`. |
| Evidence requests | The latest 200 matching requests with a live audit parent; exact evidence ID in the current saved evidence snapshot. |
| Workpapers | The latest 200 matching workpapers with a live audit parent; exact evidence ID in the current saved evidence snapshot. Sample contents are not returned by this endpoint. |
| Findings and CAPA | The 1,000 most recently updated canonical findings; exact native ID/public-code tokens in submission or verification evidence references. These remain record references, even when a manually supplied hash exists. |

Every source reports **complete**, **limited**, **unavailable** or **outside access scope**. Complete means that this source's stated query finished within its limit; it does not mean that every product module, archived report or free-text mention has been scanned. Zero results from a limited/unavailable source are not proof of no usage. A partially granted control/compliance scope is marked limited. CAPA remains outside the existing scoped dataset allowlist.

Historical event/report/closure snapshots, arbitrary free text, automation run history and other enterprise modules are excluded. General library changes do not automatically re-evaluate controls or create follow-up tasks. Those broader change-impact workflows remain open research items.

## Operations and validation

`GET /api/evidence/usage?id=<native-evidence-id>` requires a live session, enforces Evidence Library access and checks every source's module grants before querying it. It returns `private, no-store`. Writes are unsupported. Missing evidence returns 404; invalid identity 400; unavailable anchor 503. If the evidence anchor changes during the source reads, the request returns 409 and the user must refresh. Sources are read separately; this is a timestamped operational view, not a transactional cross-module audit snapshot.

No new table, background task or email setting is added. Existing hosted and on-prem databases are used. Missing optional source tables are reported unavailable instead of being represented as empty.

`tests/evidence-usage.test.ts` runs the actual SQL against SQLite, covering exact/ambiguous references, version and hash validation, preserved approvals, closed audits, source limits/failure, denied cross-module reads and anchor changes. `scripts/evidence-usage-qa.mjs` exercises v1→v2 usage, approved/open work, request/control/workpaper navigation, scoped viewing, JSON download and TR/EN × light/dark × desktop/mobile accessibility/layout in Chromium. The workspace CI preserves screenshots and result/cleanup receipts as `evidence-usage-preview`.
