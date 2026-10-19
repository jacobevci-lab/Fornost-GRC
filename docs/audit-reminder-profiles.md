# Audit reminder calendars and escalation

In Audit Management → selected audit → Requests and review → Reminder calendar and escalation, an audit writer can configure this audit's evidence-request notifications. Existing audits retain calendar days, assignment, one day before due, due day and three days overdue until a profile is saved.

## Behavior

- Choose calendar days or business days; define at least one working weekday and up to 366 unique holiday dates. Holidays are manually maintained, with no jurisdiction-specific feed or automatic annual recurrence.
- Configure advance reminder (0 disables; up to 90 days), overdue reminder (1–90 days) and optional escalation (0 disables; otherwise at or after the overdue threshold).
- Business-day mode pauses all request notices, including assignments and escalations, on non-working days. A non-working due date anchors its reminder to the next working day; offsets count working dates around that anchor. Actual delivery/review due dates and My Work overdue status do not move.
- Delivery and review stages use their respective deadlines and next actor. The work plan's IANA time zone is used; date arithmetic is independent of elapsed hours/DST.
- A separate escalation notice goes to the explicitly selected active audit writer with evidence-read access, unless they are already the next actor. This is notification only: it does not delegate ownership, grant permissions, create another My Work task or approve work.
- Only the latest applicable reminder milestone is queued after downtime. One notification per request revision, profile revision and milestone; no daily backlog/digest. Saving a profile can create a new milestone notice, including for a request that already received one under the previous profile.
- Existing transport, scheduler, recipient frequency limits and retry policy still apply. No external email is sent by QA. Customer SMTP/Graph validation remains customer UAT.

## Consistency and access

Profiles are saved with exact expected profile and work-plan revisions. The transaction binds the active actor and escalation account/permission snapshots, verifies the parent and open work plan, records a profile event, and cancels prior queued notices atomically. Closed audits have SQL-level insert/update/delete locks. Delivery rechecks request, current profile, working day, workflow state and recipient access; it cannot recall a message already handed to a provider. No content/title/attachment is placed in escalation mail.

Profile changes are recorded in the request event ledger. They are operational settings, not part of the immutable whole-audit closure package or a claim of external tamper-proof retention. Profile scope is one audit; reusable organization-wide calendars, holiday imports, multi-level escalation, delegation and digest profiles are not implemented by this increment.

## Validation

Date/weekday/profile limits, calendar compatibility, custom weekends, holiday skipping, DST/midnight, latest milestone, recipient deduplication, inactive accounts, stale revisions, commit-time account/workflow/parent races and transactional rollback have regression coverage. Isolated browser QA covers profile persistence, invalid dates, duplicate-submit prevention, viewer rejection, stale-save draft retention, recovery and TR/EN in both existing themes at desktop/mobile widths.
