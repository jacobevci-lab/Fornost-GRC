# Connected incident response decisions

Open **Security Incidents & Crisis** to declare an incident and follow its response through independent closure. The existing palette, menus and notification settings are unchanged.

## Declare and respond

1. Select an active incident owner, a different incident commander and an independent Admin reviewer from the directory. The declaring account cannot be its own reviewer. Writers must have full workspace access; scoped core-module grants do not open this enterprise workflow.
2. Enter the description, business impact, detection date, classification and affected assets; risk and BIA references are optional. Canonical record IDs/codes must resolve to the correct module. Existing free-text references retain legacy behavior.
3. Open the incident and advance **triage → containment → eradication → recovery → review → closure**. The assigned owner/commander or an Admin may progress response stages. Only the assigned independent Admin may close; the declaring account, owner and commander cannot close their own incident. Only an Admin may reopen a closed incident.
4. Review current incident context, including impact, affected records, assignments, root cause, lessons and notification rationale. Containment, eradication, recovery, review and closure require an actual library file version. The server verifies its bytes and version chain and derives the evidence reference/hash.
5. Review requires root cause and lessons. Review and closure require a notification decision and rationale. Recording this decision does not send a notification or determine legal obligations; the authorized response team makes that assessment.

The same selected version may support multiple decisions when appropriate, but each event retains its own pin. A newer upload or reopening does not replace prior decisions. The reviewer remains responsible for the evidence's period, relevance and sufficiency.

## Conflicts and connection loss

Notes, selected files, root cause, lessons and notification rationale stay in the open decision draft after errors. A conflict or unknown write outcome blocks resubmission until **Refresh decision context** reads current state. If the source changed, inspect it and choose **Use current context**, then enter the confirmation again. Refresh/adoption makes no business write. If the operation already completed, it cannot be submitted again; close the dialog to refresh the parent record and history.

Declaration forms carry a stable request ID. Retrying the same form after a lost response returns its original incident, even if response work has since advanced. Changing an already committed declaration under the same ID is rejected. This protects retries of that form; separately opening a new declaration is a new operation and is not content deduplication.

List and history failures have explicit refresh/retry states. The ordinary list and its counts are bounded to 3,000 records, with a visible limit notice. A focused link prioritizes its exact incident regardless of its ordinary list position. The cross-incident summary shows the latest 20 events; open an incident for its own history.

## History and Evidence Usage

Each reviewed decision retains its actor, time, prior/next status, note, reviewed incident snapshot and decision rationale. Its evidence appears beside the exact event. Incident history loads 50 events per page and supports older pages; retained history is not truncated by the page size. Refresh starts again at the latest page. Historical source snapshots describe what was reviewed then, not the incident's current state.

**Evidence Library → Usage and change impact → Incident decisions** shows up to 200 matching canonical historical decisions, including prior cycles. Purpose, actor/time and selected version appear alongside the incident's current owner/state. Detection dates are not presented as due dates. **Open record** reaches that exact incident and history. Missing parents, failed reads, restricted access and the 200-decision limit remain explicit. Full-access Viewers may inspect; scoped accounts do not query these enterprise sources.

This source covers canonical decision pins, not general event bodies or old free-text/hash declarations. Legacy evidence declarations remain visible in incident history without being described as verified version pins. Existing reference protections block deletion of pinned evidence. A historical pin does not establish current approval or automatically create reassessment work.

## API and operations

- `GET /api/incidents?view=decision&incidentId=…` returns the complete current record and revision. Reviewed transitions send `decisionMode: "reviewed"` and `expectedRevision`.
- Evidence-bearing transitions send `evidenceMode: "library"` and `evidenceSelection: {evidenceId, versionId}`. Directory creation sends `assignmentMode: "directory"`; optional UUID `requestId` enables declaration retry recovery.
- `GET /api/incidents?view=history&incidentId=…` returns 50 events, only their evidence pins and an opaque `nextCursor`; pass it as `cursor` for the next page. `focusKind=incident&focusId=…` prioritizes the exact list target.
- Reviewed-source, live-account and selected-file guards participate in the same SQL transaction as lifecycle/event/pin writes. Failed event or pin writes roll back the transition. Object-store verification and SQL are not a distributed transaction.
- Legacy clients omitting the new modes retain existing validation and do not gain canonical pins. Invalid/missing/stale sources return 400/404/409; unavailable source/history reads return 503; live identity/permission violations return 403. Library or directory selection errors return 422.
- No new migration, email provider, reminder or automatic response action is required. On rollback preserve incident events and `workflow_evidence_pins`; older application code cannot display the new structured event detail correctly. Reinstall the current version to recover that presentation. Do not delete audit history to roll back UI behavior.

Automated acceptance uses synthetic records in disposable loopback. Production rollout, customer SSO/mail/notification workflows, installation-specific restore drills and customer UAT remain separate checks.


## Personal work queue

Owners and commanders now reach active response work from My Work. At review, the assigned independent reviewer receives the closure handoff while response owners see waiting-for-review. Closed/reopened work follows actual state and closure time. [Assignments, dates and read bounds](incident-my-work.md).
