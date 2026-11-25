# Recording an executed supplier contract extension

Open **Vendor Management → Third Parties → Open → Record contract extension**. The assigned independent Admin reviewer inspects the current contract end and review deadline, chooses the new contract end, explains the executed amendment, selects its file version from Evidence and enters the confirmation phrase. The new date must be a real calendar date after both today's UTC date and the existing contract end. The reason must contain 20–1,200 characters. This records an already executed agreement; it is not a signing or legal approval service.

The action updates the TPRM profile and linked core vendor `contractEnd` together with an event and the selected evidence snapshot. It preserves the review deadline, risk status, assessments, findings and prior review-schedule history. An overdue review stays due. To complete that review, return to the submitted assessment and independently approve/conditionally approve it with its next review date within the extended term.

The assigned Admin reviewer cannot also be the supplier creator, business owner or risk owner. Current active/full-access account and evidence-integrity checks apply. Other Admins and Editors cannot extend the term; Viewer can read history. Scoped core access does not grant access to enterprise TPRM. Rejected/offboarded suppliers cannot be extended. Term shortening, a proposed-amendment approval queue, legal signing, automatic renewal and automatic review scheduling are outside this delivery.

## History and recovery

**Contract extension history** in supplier detail reads retained events newest first, with pages of 50. Each entry includes previous/new contract dates, the unchanged review date at recording, reason, actual actor/time and that event's evidence version. Later extensions, assessment decisions and offboarding preserve earlier entries. Evidence Usage also links each retained extension back to the exact supplier. Empty legacy history is not reconstructed. Unreadable detail/evidence or a failed history read is shown explicitly; **Refresh history** retries. Pages reflect live history, so reopen or refresh the first page after concurrent additions. The ordinary latest-decision panel retains only the latest pin per purpose; use contract history for all extensions.

If source data changes, the draft date, note and evidence stay in place. **Refresh decision context** reads current state; **Use current version** explicitly adopts it and clears confirmation. Check the dates and reconfirm. Failed source reads block Apply. If the response is lost after a successful save, reload shows the new contract end and history; the unchanged request conflicts and cannot record the same extension twice. Close the draft and inspect history before starting another extension.

## API and operation

`POST /api/third-party-risk` accepts `action: "extend-contract"`, `vendorId`, mandatory `expectedRevision`, `contractExtension: { previousDate, nextDate }`, `note`, `confirmation: "SÖZLEŞME UZATIMINI KAYDET"`, `evidenceMode: "library"` and `evidenceSelection: { evidenceId, versionId }`. The extension object accepts exactly those two date keys. Its fields are rejected on other operations. This new action has no free-text evidence fallback. Profile snapshot, linked core record, actor and evidence are rechecked in the committing transaction.

`GET /api/third-party-risk?view=contract-history&vendorId=…&page=0` returns vendor-bound events, their individual pins and `hasMore`. The page is an integer from 0 to 9,999; results are limited to 50 per page and all retained events remain in storage. This history read is separate from the metadata-only My Work feed and uses the existing TPRM read boundary.

No migration, new menu, settings, palette or notification delivery is introduced. Existing decision calls retain their behavior. Rollback preserves canonical contract dates, events and evidence pins; reverting the UI does not reverse an executed amendment. Production installation, customer UAT and measured adoption are separate from automated validation. Exact build/release evidence belongs in the PR.
