# Continuous Assurance → Enterprise CAPA Promotion

Fornost keeps raw continuous-control findings separate from governed enterprise findings. A failed automated control is promoted only through the Continuous Assurance review queue, so operational automation cannot bypass maker-checker governance.

## Queue a CAPA promotion

`POST /api/continuous-assurance`

`Admin` and `Editor` users can submit the governance context required to create a CAPA candidate:

```json
{
  "action": "queue-capa-promotion",
  "findingId": "<evidence_automation_findings.id>",
  "reviewer": "independent.reviewer@example.com",
  "dueDate": "2026-10-15",
  "rootCause": "Root cause with sufficient detail",
  "correctiveAction": "Corrective action with sufficient detail",
  "preventiveAction": "Preventive action with sufficient detail"
}
```

The request does not provide trusted rule, control, risk, source evidence, owner, severity, or finding-detail lineage. The server loads those references from the Continuous Assurance runtime and Connected GRC records before it builds the canonical candidate.

The queue derives:

- the automation finding from `evidence_automation_findings`
- the automation rule and mapped control from `evidence_automation_rules`
- the linked risk from `simple_grc_records` / `Risk Assessment`
- the immutable origin evidence from `simple_grc_records` / `Kanıtlar`
- the evidence SHA-256 from the stored `responseHash`

A candidate that lacks control, risk, independent reviewer, valid source evidence integrity, root cause, corrective action, preventive action, or a severity-bounded SLA is rejected before it enters the review queue.

## Independent approval

A queued promotion is written to `continuous_assurance_work_items` with `action = capa-promotion` and `status = pending-review`.

Only an `Admin` may approve or reject it:

```json
{
  "action": "review-work-item",
  "workItemId": "<continuous_assurance_work_items.id>",
  "decision": "approve",
  "note": "Independent review completed."
}
```

The user who queued the work item cannot approve the same item. This maker-checker rule is enforced server-side. Rejections require a documented reason.

Only after independent approval does `promoteContinuousAssuranceFinding` create or resolve the canonical Enterprise Findings & CAPA record.

## Canonical Connected GRC lineage

The approved enterprise finding uses:

- `source_type = continuous-control`
- `source_ref = <automation rule id>`
- `control_ref = <governed control>`
- `risk_ref = <governed risk>`
- `finding_type = control-deficiency`
- `evidence_reference = <origin evidence id>`
- `evidence_sha256 = <origin evidence SHA-256>`
- `detected_by = system:continuous-assurance`

Keeping the automation rule, control, risk, source finding, and evidence references distinct lets Connected GRC reconstruct `finding-automation-rule`, `finding-control`, `finding-risk`, `finding-remediation`, `remediation-control`, `remediation-risk`, and related assurance edges without title matching.

An active canonical CAPA for the same continuous-control rule and target control blocks duplicate creation. Closed or formally accepted records do not prevent a later newly governed finding from being promoted.

## Audit trail and closed loop

Approved promotion writes an immutable `continuous-assurance-promotion` event to `enterprise_finding_events`, including the source evidence reference and SHA-256 digest together with the queue actor, approving actor, automation finding, rule, control, risk, and work item references.

The resulting lifecycle is:

`Continuous Control → Automated Evidence → Automation Finding → Review Queue → Enterprise Finding/CAPA → Remediation → Re-test → Residual Risk Reassessment`

After remediation, the governed Continuous Assurance flow can queue a re-test. Approved re-tests are reconciled against subsequent automation runs; the residual-risk state is then updated without inventing a risk reduction when there is no approved residual rating or successful evidence-backed re-test.

## Work queue recovery (2026-10-06)

Queue and identity reads and review/retest writes now use a shared 15-second deadline covering headers and JSON parsing. Superseded/unmounted reads cannot publish stale state. Writes have a synchronous duplicate-submit guard and are never automatically retried. Unknown write outcomes close the review dialog, display an explicit warning and refresh the queue read-only. Authorization/conflict responses also refresh permissions and queue state.

Unknown queue and SLA counters display a dash, not zero. Search covers all loaded items (finding, rule, control, owner and result code), preserving the existing 25-item progressive display. The existing API cap of 500 items is disclosed when reached. Independent Admin review requires a known requester and a different identified reviewer; rejection notes are 10–1,200 trimmed characters, matching the server limit.

The shared request boundary remains covered by the CAPA deadline/cancellation regressions. `assurance-queue-access.test.ts` checks review identity/role/note rules and malformed payloads; `assurance-queue-recovery-qa.mjs` exercises the browser recovery and duplicate-write paths with isolated fixtures.
