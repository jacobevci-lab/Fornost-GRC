# Continuous Assurance → Enterprise CAPA Promotion

Fornost keeps raw continuous-control findings separate from governed enterprise findings. A failed automated control is only promoted when the organization adds the governance context required for a real CAPA record.

## Promotion endpoint

`POST /api/findings/promote-continuous-assurance`

The caller must be an `Admin` or `Editor`. The request supplies governance context only; trusted automation lineage is loaded server-side.

```json
{
  "findingId": "<evidence_automation_findings.id>",
  "controlRef": "CTL-001",
  "riskRef": "RSK-001",
  "reviewer": "independent.reviewer@example.com",
  "dueDate": "2026-10-15",
  "rootCause": "Root cause with sufficient detail",
  "correctiveAction": "Corrective action with sufficient detail",
  "preventiveAction": "Preventive action with sufficient detail"
}
```

`controlRef` may be omitted when the source rule maps to exactly one control. If a rule maps to multiple controls, the target control is mandatory and must already belong to that rule.

## Trusted lineage

The API does **not** trust the client to provide the automation rule, source evidence reference, evidence digest, owner, severity, title, or finding detail. It resolves them from:

- `evidence_automation_findings`
- `evidence_automation_rules`
- `evidence_automation_runs`

The source evidence must have a 64-character SHA-256 `response_hash`. Promotion is rejected when the evidence record or integrity digest cannot be resolved.

The canonical finding is created with:

- `source_type = continuous-control`
- `source_ref = <automation rule id>`
- `control_ref = <governed control>`
- `risk_ref = <governed risk>`
- `finding_type = control-deficiency`

This keeps the automation rule, control, risk, source finding, and immutable evidence as distinct lineage anchors in Connected GRC.

## Governance gates

Promotion reuses the Enterprise Findings & CAPA validation rules. It therefore enforces severity-based SLA, a valid action owner and independent reviewer, maker-checker separation, complete root cause, corrective action, preventive action, control mapping, risk mapping, and immutable source evidence.

An open/active canonical CAPA for the same continuous-control rule and target control blocks duplicate promotion. The source automation finding is acknowledged only after the canonical finding and immutable promotion event are committed in the same D1 batch.

## Audit trail

The promotion writes `finding-promote-continuous-assurance` to `enterprise_finding_events`. The event stores the source evidence reference and SHA-256 digest in the dedicated evidence fields and records automation finding, rule, control, risk, and evidence capture time in bounded event detail.

The resulting flow is:

`Continuous Control → Automated Evidence → Automation Finding → Enterprise Finding/CAPA → Remediation → Residual Risk`

Connected GRC source adapters use these references to reconstruct the end-to-end assurance chain without relying on title matching.
