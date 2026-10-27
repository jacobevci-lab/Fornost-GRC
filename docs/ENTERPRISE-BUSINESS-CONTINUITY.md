# Enterprise Business Continuity & Operational Resilience

Fornost GRC links approved BIA records to governed continuity plans, recovery objectives, exercises and independently verified improvement gaps.

## Lifecycle

1. An Editor or Admin creates a draft plan with BIA reference, dependencies, RTO, RPO and MTPD.
2. The assigned independent Admin reviewer approves it. The creator, owner and crisis lead cannot approve their own plan.
3. The owner, crisis lead or Admin activates the approved plan and schedules exercises.
4. Exercise results select a canonical evidence file/version; the server verifies bytes and the version chain and pins the decision without manual digest entry. Partial/failed outcomes or RTO/RPO breaches automatically create an improvement gap.
5. Only the assigned independent Admin reviewer can close a gap with evidence; the gap owner cannot close it.

Exports are Admin-only, formula-safe CSV. Every lifecycle decision is written to the continuity event stream. Canonical exercise-result and gap-closure evidence snapshots are immutable and commit with that decision. Runtime schema self-heal supports existing on-prem installations while migration `0074_business_continuity_resilience.sql` provides deterministic fresh installation.

The UI uses active account selection for owner, independent Admin reviewer, crisis lead and facilitator. Selection errors preserve the draft. See [User Guide](USER-GUIDE.md#süreklilik-ve-regülasyon-kararlarında-kanıt-seçimi) for the journey and [Admin Guide](ADMIN-GUIDE.md#connected-evidence-selections-continuity-and-regulatory-workflows) for legacy API compatibility and storage limits.


## Assigned work and exact navigation

Plans, exercises and improvement gaps are included in the existing [My Work continuity queue](continuity-my-work.md). The queue preserves canonical assignments, lifecycle dates and independent approval/retest requirements; choose a row to open its exact source.

## Periodic plan reviews

**Plan details and reviews** exposes full current plan context and retained review snapshots. For active plans, the assigned independent Admin reviewer can record a rationale, confirm continued suitability and set the next review date. The date, immutable decision and event update atomically; conflicts preserve the draft and uncertain responses can be retried without duplication. Active plan review work includes the assigned reviewer in My Work. See [periodic review workflow and limits](continuity-plan-review.md). This does not change the plan strategy/targets or replace exercise verification.
