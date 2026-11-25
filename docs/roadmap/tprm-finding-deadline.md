# Reasoned supplier finding deadline planning

## Decision — 30 October 2026

At source `62acb1a`, supplier findings accept `due_date` only at creation. Their lifecycle can start, submit, return, close and reopen, but the owner/reviewer cannot record an agreed revised deadline. My Work and overdue counts consequently keep the original date. Complete this administrative planning flow from the existing Findings & CAPA row, without creating another task or modifying approval policy.

The assigned active independent Admin reviewer may revise the date of an open/in-progress finding on an active supplier. The actor must be distinct from the finding owner, creator and submitter, and supplier creator/business/risk owners. Verification and closed findings cannot be rescheduled; return/reopen remains an explicit existing lifecycle decision. The new ISO date must be today or later and differ from the current date. Contract dates are context, not an invented legal upper bound for remediation obligations.

Inspect the current finding, cycle, owner, reviewer, status, due date and latest action note; choose the date, explain the change and confirm. Update the canonical finding date and append one retained event atomically. Retain previous/new dates, the owner/status/severity at planning, and whether the prior deadline was overdue at that moment. Preserve the lifecycle feedback note, evidence pins, assignments, risk decisions and completion identities. My Work derives its due date from the canonical record. Reuse the newly delivered per-finding history.

## Acceptance

- Only the assigned independent Admin may schedule through either UI or API. Disabled/downgraded/scoped actors, owners, creators, submitters and unrelated Admins cannot bypass this.
- Full finding/profile/assessment source and live actor guards reject stale reads or commit-time changes without partial history. Exact old-token replay cannot create duplicate events.
- Invalid/missing/unchanged/past dates, unknown fields and insufficient reasons fail explicitly. Changing the date does not accept risk, resolve the finding or erase prior lateness.
- Failed reads, conflicts and unknown write outcomes retain the proposed date/reason. Explicit adoption shows current context and clears confirmation. History failures do not silently discard an action draft.
- My Work, register overdue status and Viewer history reflect the change while earlier submissions/closures and notes remain intact. Earlier assessment cycles remain identifiable.
- Actual browser acceptance covers TR/EN, light/dark, three widths, keyboard/Escape/focus, real roles, source failure/conflict/lost response and return/resubmit/closure after scheduling. Unit/route checks cover atomicity, full-row races and history parsing.

No schema migration, new menu, palette change, reminder or external transport is added. Update README, User/Admin guides and workflow documentation. Rollback is an application revert retaining revised dates/events. Record final checks and exact release identity in the PR. Production deployment/customer UAT and adoption remain unverified; task-completion baseline is unmeasured.
