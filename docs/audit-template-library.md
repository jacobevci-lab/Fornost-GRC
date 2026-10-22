# Shared audit template library

The installation-wide library stores reusable **plan narratives**, **single milestone text**, and **task packs**. It is available inside each matching Templates panel and inside Create task pack under **Audit → Plan and scope**. Existing built-in starters and portable JSON text templates remain available.

## Reuse a definition

Open **Shared template library**, search the active definitions, and select one. Inspect its content, version, author and change reason. **Transfer template to draft preview** opens the existing field-selection preview for a plan or milestone; populated fields remain unchecked. Apply only the desired text, then save the underlying record through its normal workflow.

For a task pack, transfer and review the task list, then **Apply shared pack to draft**. This replaces the pack draft with the template's ordered tasks and sequence setting. The current owner/time zone remain; every task date starts empty and must be explicitly selected. Add tasks (up to 12), reorder or remove them, or deselect unwanted tasks. Reordering retains each draft task's date. Preview the resulting assignments, dates and prerequisite chain, then Save all tasks atomically. The 100-task audit limit still applies.

Library reads are on demand, with a 15-second deadline and explicit retry. A failed read invalidates the previous selection. Only a currently loaded active definition's latest version can transfer to preview; archived and historical versions are inspectable but read-only. An already copied draft is independent: subsequent library changes or archival do not revoke or update that draft or any saved audit record. Reload to see newer definitions.

## Administer definitions

Only **Admin** can publish, revise, archive or reactivate definitions. Audit-authorized Editors and Viewers can read the API; the reuse UI appears in editable audit workflows. Scoped accounts need Audit Management read access. Library access does not grant rights to save an audit, assign another owner or bypass closure locks.

Edit the source draft in the existing plan/task/pack editor, open the library, provide a name (up to 80 characters) and a reason (3–2,000 characters), then preview either a **new shared template** or a **new version of the selected template**. The preview shows the exact content that will be shared. Changes to source text, name or reason invalidate publication preview. **Publish library change** is the explicit write. A new version uses the current local draft, not the historical version being viewed.

Archive and reactivate also require a reason and explicit preview. Archival removes the definition from active selection; it does not delete history or affect existing audit records. Each definition has a stable ID and a monotonically increasing version. The latest 50 versions are selectable; older snapshots remain retained. A kind cannot change across versions. There is no hard-delete API.

Each kind is capped at 200 definitions, including archives. Reads expose completeness explicitly; history and lists never silently claim to be exhaustive beyond their bounds. At capacity, revise an existing definition. A failed or uncertain save preserves the local draft and requires a library refresh before further changes. Check whether the new definition/version already exists before attempting another creation; stable creation IDs prevent duplicate retries.

## Data and enforcement

Plan templates carry only objective, scope, exclusions, methodology, deliverables and narrative milestones. Single-task templates carry title and description. Packs carry 1–12 title/description pairs and a sequence flag. Structured people, dates, time zones, audit/evidence IDs, status, approvals, reminder settings and recurrence are excluded. Administrators must still review free text before sharing it with audit users: prose can contain business information.

`GET /api/audits/templates?kind=plan|milestone|task-pack` lists active definitions; `archived=1` selects archives. `id` selects a definition with history; optional `revision` selects its exact retained snapshot. `POST` accepts `save`, `archive` or `restore` with `id`, `expectedRevision`, `note` and, for save, a strictly validated `template`. Request bodies are limited to 120,000 UTF-8 bytes. This is one installation's shared library, not cross-tenant sharing.

Runtime schema initialization creates `audit_shared_templates` and `audit_shared_template_versions` idempotently on D1/SQLite. A guarded current-row write and history append commit in one transaction. Expected-revision, capacity and the actor's current active Admin account are checked in the SQL write. History insertion failure rolls back the current definition; history rows reject UPDATE and DELETE. This is database-enforced append-only history, not cryptographic external attestation. Closed audit data is never touched by library publication.

The library does not schedule tasks, propagate changes into instantiated records, manage shared calendars, or add independent template/milestone approval. Those remain distinct scopes. Email & Notifications remains a settings screen.
