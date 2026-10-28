# Incident responsibilities in My Work

My Work reads canonical incident assignments and opens the exact incident in Security Incidents. It does not copy incidents into a separate task store or provide a second decision path.

| Incident stage | Personal queue | Next action |
| --- | --- | --- |
| Declared | Owner and commander | Triage the incident |
| Triage | Owner and commander | Record containment |
| Contained | Owner and commander | Record eradication |
| Eradicated | Owner and commander | Record recovery |
| Recovered | Owner and commander | Submit root cause, lessons and notification decision for review |
| Review | Owner, commander and assigned independent reviewer | Reviewer closes; owner/commander see Waiting for others |
| Closed | Recent completion for owner, commander and reviewer | No active task; completion uses the actual closure timestamp |

Reopening restores response work and removes the previous completion. An Admin can inspect the authorized organization queue; other roles retain their personal scope. Viewing a queue item does not grant authority to advance or close it. The existing assigned-team and independent Admin closure checks remain authoritative.

Use **Work queue module → Incident**, search or a saved view to find the work. Critical and high severity incidents appear in Priority. No deadline is inferred from detection, declaration or update time; incidents are undated in the queue because their source does not contain an explicit task due date. The incident workspace retains its existing response/recovery attention indicators. Closed records appear in the last-30-day completion view only when their real closure timestamp falls in that range; missing or future timestamps do not create recent completions.

## Read scope and recovery

`GET /api/incidents?view=work` retains existing authentication and enterprise access rules. Full-access Admin, Editor and Viewer accounts can read; scoped core-module accounts remain restricted. The response contains only ID/code/title, status/severity, assigned people and creation/update/closure timestamps. It excludes descriptions, impact/root-cause narratives, asset references, evidence and event detail.

Up to 2,000 incidents are returned with active records first, critical/high work before lower severity and recent closures before older closures. One additional lookahead row detects overflow. Invalid or duplicate records and unavailable sources make coverage incomplete. A failed or denied refresh removes stale incident rows. My Work disables CSV while any source is incomplete; successful refresh restores the current authorized scope. The bound applies before personal/module filtering and is not a claim of complete customer-scale coverage.

No migration, configuration, menu, palette, reminder or external notification is introduced. Rollback can remove this read/projection integration without changing incident decisions or history. Production deployment, customer UAT and adoption remain separate from isolated acceptance testing.
