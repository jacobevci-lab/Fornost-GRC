# Published policy periodic review

Open a published policy from **My Work** or **Policy Center → Policy Register → Open**, then choose **Periodic review and history**. Inspect the current published text, SHA-256, mappings, audience, ownership and existing schedule. The assigned independent Admin can prepare a review, explain why the version remains suitable (20–2,000 characters), select the next date and confirm the reviewed content.

The next date must be later than today and the current date. It may not exceed the configured review frequency measured from today. Review frequency remains controlled policy metadata. A same-day repeat cannot push a freshly reviewed policy beyond that limit. Policy owners, original creators and current-version authors/submitters cannot independently review their own work. Other full-access readers can inspect history; scoped core access does not grant Policy Center access.

If another version is in draft, review or approval, complete its existing workflow first. **Open versions** takes you there. A periodic review confirms continued suitability; it does not approve new content, publish a new version, change attestations or close exceptions. The existing My Work item uses the saved next-review date after refresh.

## Recovery and retained history

A source or authorization conflict does not save a partial decision. **Refresh policy** reads current information while retaining the draft. Inspect changes, choose **Use current context**, and confirm again. A failed read blocks submission. If the response is lost, retry the same draft or refresh: the stable request identity prevents duplicate reviews. Closing the dialog or navigating away discards an unsaved draft.

History retains the exact reviewed policy metadata and published version, the actor and timestamp, rationale and previous/new dates. Expand **Reviewed policy snapshot** to inspect that historical content. The latest 20 reviews are displayed; a notice identifies additional retained history. Unreadable snapshots are explicitly marked and never substituted with current content. Historical suitability does not imply current compliance or that later content has been reviewed.

## Administration and API

Apply additive migration `0099_policy_periodic_reviews.sql`. The table rejects updates and deletions through immutability triggers. Existing documents, versions, attestations and evidence pins are preserved. Code rollback must retain history and saved scheduling changes.

`GET /api/policy-lifecycle?view=review&policyId=…` returns the current source, revision digest, review window, capability and bounded history. `POST` action `review-policy` requires `policyId`, `requestId` (`PPR-` plus UUID), `expectedRevision`, `nextReviewDate`, `note` and confirmation `POLICY REVIEWED`. Identical requests by the original active Admin return the original outcome even if later source changes have occurred. Altered retries conflict.

The committing transaction binds all policy/version fields, the absence of an ongoing revision and live actor identity/role/status/access-policy snapshot. A content digest mismatch or invalid source prevents new review decisions. Review, date update and event commit together or roll back together. Content adequacy remains the reviewer's judgment; there is no automatic legal certification, external notification or content approval shortcut. Exact tests and release identity are recorded in the PR; production deployment is separate.
