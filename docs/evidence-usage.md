# Evidence usage and change impact

In **Evidence Library → Usage and change impact**, select an evidence record and refresh its current usage. The workspace is available to authenticated readers of Evidence Library, including scoped viewers. It does not upload files, replace evidence pins, reopen work or change approvals.

The workspace distinguishes three relationships:

- **Record link:** a control/compliance mapping, audit requirement or CAPA evidence reference. It does not establish which file version was reviewed.
- **Current version pinned:** a request/workpaper or continuity/regulatory decision snapshot identifies the current version; the stored version ID, evidence ID, version number and content hash agree with the version table.
- **Earlier version pinned / version unverified:** a snapshot uses an older retained version or fails the same identity/hash check. Open requests/workpapers appear in **Open work to review**. Accepted requests, approved/cancelled workpapers and work in a closed audit retain their recorded pins and appear as preserved history, without automatic invalidation.

Open the linked record to decide whether to resubmit evidence, withdraw/reopen a workpaper or request review. Existing ownership, independent review and audit closure rules still apply. A newer file alone does not prove that a previous period's evidence was inadequate. Version identity checks are not chain-integrity checks or content-adequacy review.

Audit writers with evidence-read access can also select **Review task** beside a request/workpaper to [explicitly create a dated follow-up](evidence-change-followups.md). This separate action previews current source/version context and saves a normal audit milestone with immutable origin. It never replaces pins or approves the source. Existing tasks are reused per source/current version, including completed/cancelled tasks. The usage endpoint itself remains read-only.

Use the source selector, search and history/review filters to narrow visible rows. Search also matches source record IDs and decision actors. **Download usage report** exports the entire loaded usage snapshot, independent of the screen filter, including source states, read limits, check time and exact internal navigation targets. It excludes file contents and storage keys. Refresh before relying on an older downloaded report.

## Coverage and access

| Source | Match and limit |
| --- | --- |
| Control/compliance links | Up to 100 current evidence `controlRef`/`controlRefs` tokens; exact native ID, then public code, then unique `controlId`/`controlRef`. Ambiguous/missing references are shown, never guessed from titles. Only readable modules are queried. |
| Audit requirements | The 1,000 most recently updated requirement records; exact evidence native ID/public-code tokens in `evidenceRef`. |
| Evidence requests | The latest 200 matching requests with a live audit parent; exact evidence ID in the current saved evidence snapshot. |
| Workpapers | The latest 200 matching workpapers with a live audit parent; exact evidence ID in the current saved evidence snapshot. Sample contents are not returned by this endpoint. |
| Continuity decisions | Latest 200 matching immutable exercise-result and gap-closure pins, including older decisions. Exact native evidence ID; source exercise/gap and plan provide current context. |
| Regulatory decisions | Latest 200 matching immutable impact-submission and independent-verification pins, including earlier cycles. Exact native evidence ID; impact, change and source provide current context. |
| Findings and CAPA | The 1,000 most recently updated canonical findings; exact native ID/public-code tokens in submission or verification evidence references. These remain record references, even when a manually supplied hash exists. |

Open **Source coverage** to inspect per-source limits and results. Its compact summary shows completed/total sources; warnings about incomplete or restricted sources stay visible even when details are collapsed. Every source reports **complete**, **limited**, **unavailable** or **outside access scope**. Complete means that this source's stated query finished within its limit; it does not mean that every product module, archived report or free-text mention has been scanned. Zero results from a limited/unavailable source are not proof of no usage. A partially granted control/compliance scope is marked limited. CAPA remains outside the existing scoped dataset allowlist.

General historical event/report/closure archives, arbitrary free text, automation run history and other enterprise modules are excluded. The two decision sources read the dedicated immutable pin table, not general event bodies. General library changes do not automatically re-evaluate controls or create follow-up tasks. Those broader change-impact workflows remain open research items.

## Retained workflow decisions

Continuity and regulatory rows show the decision purpose, actor/time and exact pinned version alongside the source record's **current** owner, status and due date. Every such row is preserved history, including old submissions on a reopened workflow. A pin does not establish that its decision remains the current approval. New uploads and later submission/verification cycles do not replace earlier pins. **Open work to review** and **Review task** remain request/workpaper workflows; the new history rows do not silently create review work.

These two enterprise sources require full module access. Scoped accounts see **Outside access scope**; source tables are not queried for them. An orphaned decision stays visible, marks source coverage limited and disables **Open record**. Missing or corrupt optional source data is unavailable, never a complete empty result. The report includes sanitized version metadata, actor/time, source availability and navigation identity, without raw digests, storage keys or file contents.

**Open record** locates the exact exercise, gap or impact and its parent even beyond the normal module list limit. The existing module authorization and bounded list sizes remain enforced. Missing targets are identified explicitly. Usage and module reads stop after 15 seconds; use **Refresh usage** or **Retry** after an error. A late response from an earlier target cannot replace the current selection; form drafts are not reset by a failed read. The read retry does not resubmit a decision.

## Operations and validation

`GET /api/evidence/usage?id=<native-evidence-id>` requires a live session, enforces Evidence Library access and checks every source's module grants before querying it. It returns `private, no-store`. Writes are unsupported. Missing evidence returns 404; invalid identity 400; unavailable anchor 503. If the evidence anchor changes during the source reads, the request returns 409 and the user must refresh. Sources are read separately; this is a timestamped operational view, not a transactional cross-module audit snapshot.

No new table, background task or email setting is added. Existing hosted and on-prem databases are used. Missing optional source tables are reported unavailable instead of being represented as empty.

`tests/evidence-usage.test.ts` runs the actual SQL against SQLite, covering exact/ambiguous references, version and hash validation, preserved approvals, closed audits, source limits/failure, denied cross-module reads and anchor changes. `scripts/evidence-usage-qa.mjs` exercises v1→v2 usage, approved/open work, request/control/workpaper navigation, scoped viewing, JSON download and TR/EN × light/dark × desktop/mobile accessibility/layout in Chromium. The workspace CI preserves screenshots and result/cleanup receipts as `evidence-usage-preview`.

`tests/workflow-evidence-usage.test.ts` covers retained decisions, exact identity, source failure/limits and denied reads. `tests/workflow-record-focus.test.ts` exercises the actual GET routes with targets beyond list limits and verifies read-only business data. `scripts/workflow-evidence-usage-qa.mjs` extends the connected-selection browser fixture through a new file, a second regulatory review cycle, source navigation, failure/retry and superseded responses; screenshots and receipts are retained as `workflow-evidence-usage-preview`.
