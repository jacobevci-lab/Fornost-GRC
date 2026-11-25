# Policy attestation campaign outcomes and closure

Administrators use **Policy Center → Attestation → Campaign outcomes** to review collection results and close a campaign. This completes the existing campaign lifecycle; no extra menu, migration or email transport setting is required.

## Review and complete collection

1. Search the open campaign list and choose **Review outcomes**. The list separates accepted, declined and unanswered responses. Its existing 1,000-campaign bound is stated when reached.
2. Inspect the policy version actually issued to this campaign, its content and digest. A newer published policy does not replace this campaign's linked version. Filter/search participants and their notes; results paginate in groups of 25.
3. Choose **Prepare closure** and write a reason of 20–1,000 characters. Acknowledge unresolved responses when any participant declined or did not answer, then confirm that new responses will stop.
4. Choose **Close campaign**. The closing administrator, time, reason, exact outcome counts, policy version/digest and source fingerprint are retained in the existing policy event store.
5. Use **Closed** or **All** to inspect the historical result. Closing never turns an unanswered or declined response into acceptance. Participant records and original response notes/timestamps remain intact.

Closed campaigns no longer generate pending My Work tasks or active response buttons. Pending totals only include open campaigns. The campaign no longer blocks policy retirement, but other existing blockers and the assigned independent reviewer's retirement permission still apply. Closure itself is an administrative collection decision, not an independent policy approval or proof of universal compliance.

## Permissions and recovery

Campaign outcome detail and closure require Admin access. Editors and Viewers cannot use this management endpoint. Existing full-module boundaries remain in force; scoped core-register access does not grant access to the enterprise policy lifecycle. Participants retain the existing right to accept or decline only their own open assignment. The UI only offers those actions for the signed-in subject.

The server checks the current active administrator and binds account/policy state, campaign fields, policy content/version and all participant outcomes to the atomic close/event transaction. A concurrent response or source change returns a conflict rather than closing using obsolete counts. No participant row is changed by closure. Failure to write the event rolls back closure.

Refresh errors, rejected decisions and unknown write outcomes retain the open closure draft. After a source conflict, **Refresh results**, review the new answers and select **Use current results**; acknowledgements reset. An identical retry after a lost success response returns the original closure without adding a second event. A changed request cannot overwrite that event. Refreshing a successfully closed campaign exposes its history; cancel the remaining draft if applicable. Closing the dialog or navigating away does not persist an unsaved draft.

## Boundaries

- Detail reads inspect at most 500 recipients, with a 501st-row lookahead. Missing, malformed, duplicate or over-limit outcomes are explicitly incomplete and cannot be closed. This is the same intended maximum as campaign creation; legacy over-limit data needs separate remediation.
- The campaign list remains bounded to 1,000 records. It is not an exhaustive historical export. Detail reads use the exact campaign identity and are independent of the general 5,000-attestation list bound.
- Existing legacy closed campaigns may lack a structured closure event; the UI says so instead of inventing a reason or counts at closure.
- No reopening, automatic closure, participant reassignment, reminders, supplier portal or background scheduling is added. A new campaign is a separate explicit collection exercise.
- Rollback can restore the earlier UI/API without deleting historical campaigns/events. Closed records remain closed.
- Automated SQLite and isolated Chromium evidence establishes the tested behavior, not customer UAT or production deployment. See the delivery PR for exact revisions and results.
