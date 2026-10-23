# Audit reminder calendars and escalation

In Audit Management → selected audit → Requests and review → Reminder calendar and escalation, an audit writer can configure this audit's evidence-request notifications and opt-in milestone reminders. Existing audits retain calendar days, assignment, one day before due, due day and three days overdue until a profile is saved.

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

Profile changes are recorded in the request event ledger. They are operational settings, not part of the immutable whole-audit closure package or a claim of external tamper-proof retention. Profile scope remains one audit. Shared calendar definitions and explicit version adoption are described below; holiday feeds, multi-level escalation, delegation and digest profiles remain separate.

## Validation

Date/weekday/profile limits, calendar compatibility, custom weekends, holiday skipping, DST/midnight, latest milestone, recipient deduplication, inactive accounts, stale revisions, commit-time account/workflow/parent races and transactional rollback have regression coverage. Isolated browser QA covers profile persistence, invalid dates, duplicate-submit prevention, viewer rejection, stale-save draft retention, recovery and TR/EN in both existing themes at desktop/mobile widths.


Milestones have a separate per-task opt-in, default off, in Plan and scope. They use their own time zone and have no assignment email; only advance/due/overdue and optional escalation phases apply. Profile saves atomically withdraw both request and milestone queued notices. Milestone recipients require active audit-write access; task emails omit narratives and evidence. Enabling a task or saving the shared profile refreshes its queue, and the common scheduler reconciles it before dispatch.

## Portable calendar reuse

The profile editor can export a versioned `fornost-audit-calendar` JSON envelope and import it through an explicit preview/apply/save flow. Only mode, weekdays and holidays are portable; unknown fields, unsupported versions, invalid/duplicate dates or weekdays and files over 16 KB are rejected. The incoming list replaces the target list without merging. Profile thresholds, escalation recipient, deadlines and time zones are preserved. Both file and pasted input are supported; changing the source invalidates its preview. File reads are guarded against stale completion/unmount. Preview and apply are browser-local; the existing authorized revision-checked profile save is the only server mutation. Saved profiles still reconcile pending request, milestone and workpaper notifications. This is a copy, not a centrally managed live calendar or public-holiday feed.


## Shared organization calendars

In the profile editor, **Shared calendar library** provides installation-wide definitions for day counting, working weekdays and up to 366 explicit holiday dates. Admins publish named definitions and new versions with a reason and preview, archive/reactivate them, and inspect immutable version history. There are up to 200 definitions, including archives, and the latest 50 versions are listed. The existing shared-template storage/API is reused with `kind=calendar`; no additional migration or email-log screen is introduced.

An audit writer selects a current active definition, uses **Preview calendar changes**, inspects working-day changes and holidays added/removed, then **Apply shared calendar to draft** and **Save reminder profile**. Preview/apply are local. The saved profile records the server-validated source ID, revision, name and version. Only calendar fields change: thresholds, escalation recipient, time zones and actual task/request/workpaper dates stay unchanged. Saving uses the existing atomic profile/history/outbox withdrawal path; the scheduler reconciles request, milestone and workpaper notifications.

**Check calendar updates** compares the draft source with the current central definition and offers an explicit update preview. Publication never silently changes an existing audit. Saved pins remain usable after newer versions or archival, including when editing only reminder thresholds. New adoption rejects an archived or outdated source, mismatched calendar content and a revision/archive race at commit. A stale-source conflict retains the draft and lets the writer check the current version again. Other profile/workflow conflicts still require the normal reload/review flow.

**Use as local calendar** detaches only source tracking; saving persists that choice. Manually changing calendar fields or applying portable JSON also makes the draft local. Cancel restores the saved profile. Older clients that omit provenance retain it when calendar content is unchanged; changed calendar content drops the old reference. Client-supplied source names/version numbers are replaced with the authoritative stored snapshot.

Library management requires a current active Admin; audit read grants protect definitions/history, and existing audit write/closure rules protect profile changes. Source provenance is operational profile history, not an addition to the immutable whole-audit closure bundle. This increment does not add automatic bulk propagation, external holiday feeds, calendar-specific delegated administrators, automatic deadline rescheduling or customer mail-provider UAT.
