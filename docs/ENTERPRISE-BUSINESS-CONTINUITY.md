# Enterprise Business Continuity & Operational Resilience

Fornost GRC links approved BIA records to governed continuity plans, recovery objectives, exercises and independently verified improvement gaps.

## Lifecycle

1. An Editor or Admin creates a draft plan with BIA reference, dependencies, RTO, RPO and MTPD.
2. The assigned independent Admin reviewer approves it. The creator, owner and crisis lead cannot approve their own plan.
3. The owner, crisis lead or Admin activates the approved plan and schedules exercises.
4. Exercise results require SHA-256 evidence. Partial/failed outcomes or RTO/RPO breaches automatically create an improvement gap.
5. Only the assigned independent Admin reviewer can close a gap with evidence; the gap owner cannot close it.

Exports are Admin-only, formula-safe CSV. Every lifecycle decision is written to the immutable continuity event stream. Runtime schema self-heal supports existing on-prem installations while migration `0074_business_continuity_resilience.sql` provides deterministic fresh installation.
