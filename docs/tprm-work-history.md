# TPRM responsibilities and completion history in My Work

Existing vendor reviews, assessment cycles and supplier findings remain canonical. My Work reads their metadata and opens the exact native TPRM record; it does not create another task store or grant decision authority.

| Source stage | Personal visibility | Completion date |
| --- | --- | --- |
| Vendor profile | Business and risk owners | Rejected/offboarded profiles use the retained decision/exit event; otherwise active |
| Draft assessment | Business and risk owners | No completion or invented deadline |
| Submitted assessment | Business/risk owners and assigned reviewer; owners see Waiting for others | No completion |
| Approved, conditional, rejected or superseded assessment | Business/risk owners and the actual deciding reviewer | Original `decided_at`, even after a later cycle changes `updated_at` |
| Open or in-progress finding | Assigned action owner | No completion |
| Finding in verification | Action owner and assigned reviewer; owner sees Waiting for others | No completion |
| Closed finding | Action owner and the actual verifying reviewer | `verified_at`; reopening restores active work and removes this completion |

The **Completed** filter shows records whose actual completion falls in the previous 30 days. A later edit or assessment renewal cannot bring an old decision back into that window. Missing legacy dates do not fall back to creation/update time; missing historical reviewer identity is not inferred from today's reviewer. Closed decisions remain navigable in their source workspace. Profiles marked rejected or offboarded do not create active child assessment/finding tasks that their source workflow can no longer action. Existing terminal decisions remain historical.

Choose **Work queue module → Vendor**, search and the appropriate work-status filter. TR/EN states name the actual stage, including **Previous cycle**, **Conditionally approved** and **In verification**. Existing personal/organization scope, saved views and exact keyboard navigation are preserved. Existing review/finding due dates remain authoritative; assessment completion does not silently reschedule the profile's next review.

## Read scope and recovery

`GET /api/third-party-risk?view=work` retains existing authentication and enterprise access checks. Full-access Admin/Editor/Viewer accounts can read; scoped core-module access does not grant this enterprise source. The response contains identities, titles, status, severity, assigned people and dates. It omits questionnaires, vendor contact details, service/data-access narratives, treatment/exit plans, evidence and decision notes.

Each of profiles, assessments and findings returns up to 2,000 records, with an extra lookahead record distinguishing exact capacity from overflow. Active work precedes history; recent terminal decisions precede old ones. The bound applies before personal/module filtering. Missing parents, invalid/duplicate records, an unavailable source or overflow produce incomplete coverage and disable My Work CSV. A failed refresh removes stale TPRM projection rows; successful retry restores current source data. This bound is not a customer-scale completeness claim. Ordinary TPRM workspace limits remain unchanged.

No migration, notification, palette or menu changes are required. Rollback removes this read/projection integration without changing canonical assessments, findings, decisions or retained events. Production/customer UAT and adoption remain separate from isolated automated tests.
