# Connected third-party decision evidence

The Third-Party Risk Center uses the existing active-account directory and Evidence Library. No new navigation entry, theme, email setting or business schema is added.

## Operator journey

1. Create/adopt a supplier. Select business/risk owners and an independent Admin reviewer. The external supplier contact remains free text. Finding owners use the same directory and cannot be the assigned reviewer.
2. In due diligence, submit the assessment with an explicit evidence record and file version. The reviewer inspects the current risk, coverage, treatment and ownership context before approval or conditional approval. Existing critical-gap/high-finding blockers still apply.
3. The finding owner starts remediation and submits the selected version. The assigned independent reviewer verifies it. Creator, submitter and finding owner cannot verify their own work.
4. Once all findings are closed, the independent reviewer inspects the exit plan and selects exit evidence before offboarding.
5. Open **Latest decision evidence** in the source, or **Evidence Library → Usage and change impact → Third-party decisions**, to inspect purpose, actor, time and pinned version. **Open record** returns to the exact assessment, finding or supplier even beyond the usual bounded lists.

A newer upload never changes an earlier decision's selected version. These pins record historical use, not current approval or a certified electronic signature. File integrity is checked by the server; adequacy and period suitability remain the decision maker's responsibility.

## Changes and recovery

A decision binds the source revision shown when it was opened. On a conflict, refresh the current context, inspect it, choose **Use current version**, and re-enter the displayed confirmation phrase. The open decision retains its note and evidence selection. Read/selection errors offer retries and disable submission when the current source is unavailable. Closing the decision, changing navigation target or leaving the page discards the draft; it is not a durable autosave.

The existing confirmation tokens remain exact API phrases (also displayed in English sessions). An unconfirmed network result requires inspecting current source/history before another decision. State/revision guards reject a repeated committed transition; this is not a general idempotent intake/reassessment API. Existing creation forms do not gain the decision draft recovery guarantee.

## Authorization and storage

New directory/library writes revalidate active identity, full access policy, assignments and source at commit. Evidence selection verifies exact record/version identity, version-chain and anchor integrity and stored file bytes; selected metadata and the SQL storage snapshot are bound to the guarded transaction. Source changes, decision event and immutable `workflow_evidence_pins` entry commit together. Invalid/tampered/unavailable evidence, concurrent source/policy changes or event/pin write failure cannot leave a partial decision.

Library decisions send `evidenceMode: "library"`, `evidenceSelection: {evidenceId, versionId}` and `expectedRevision`. Directory assignment sends `assignmentMode: "directory"`. Legacy manually supplied evidence references/digests remain accepted through existing lifecycle checks, but do not acquire verified library pins. A canonical pin protects its evidence record from deletion. No migration is required; existing pin storage is reused. Rollback must retain all pins and events.

Full-access Viewer reads source/history without writes. Scoped core-module grants do not open the enterprise TPRM endpoint, selector or usage source. Usage reads do not query restricted decision tables. Export/CSV retains existing Admin restrictions.

## Read bounds

The source lists remain bounded at 1,000 profiles/core suppliers, 2,000 assessments and 3,000 findings. `focusKind`/`focusId` prioritize an exact vendor-review, vendor-assessment or vendor-finding and its parents without increasing list sizes. Displayed summaries describe the loaded lists, not a certified whole-database census. The source includes at most 6,000 latest matching decision pins, with an explicit limited-history warning. A focused read limits pins to that target.

Evidence Usage reads at most 200 matching TPRM decisions and exposes limited/unavailable/restricted states. All six purposes remain separate: assessment submission, approval, conditional approval, finding submission, finding verification and supplier exit. Missing parents retain the history row with incomplete coverage and disabled navigation. Reports contain sanitized metadata, not file contents, raw digests or storage keys. Usage version-identity checks do not rerun save-time file/chain verification.

## Verification

`tests/tprm-connected-evidence.test.ts` exercises the real route and SQLite transactions, full lifecycle, independence, directory revocation, source/actor/file races, invalid versions, atomic event/pin failures, older retained versions and repeat rejection. The workflow usage/focus tests cover historical semantics, scope, source failure/limits and old records beyond every bounded list.

`scripts/tprm-connected-evidence-qa.mjs` runs the actual Chromium journey against disposable CI data: directory intake, concurrent UI finding, decision conflict/retry, independent review, remediation/exit, historical usage, exact navigation and TR/EN light/dark desktop/tablet/mobile accessibility. Results and screenshots use `tprm-connected-evidence-preview`. The complete browser suite remains enabled; its total allowance is 60 minutes because the prior passing run already used nearly 44 minutes before this journey was added. Exact run/revision receipts belong in the delivery PR. CI loopback QA is not production deployment or customer UAT.
