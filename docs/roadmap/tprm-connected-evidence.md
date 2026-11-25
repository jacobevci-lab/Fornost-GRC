# Connected TPRM evidence and assignments — 27 October 2026

## Product decision

Main `5074cc4340ac4781eedafc0c07f9c8fd767a7dcc` still asks TPRM operators to type evidence references/digests and internal assignee email addresses. The existing continuity/regulatory library and directory selectors already solve this problem elsewhere. Extend those canonical workflows to supplier assessment submission/decisions, remediation submission/verification and evidence-backed exit. This removes confirmed duplicate entry and makes retained decision versions inspectable; adoption and task-completion time remain unmeasured. External auditor grants, background scheduling and structural continuity-plan revision remain separate packages.

## Journey and scope

Third Parties → onboarding/adoption or finding → active account selection → existing lifecycle decision → explicit evidence record/file-version selection → atomic source/event/retained pin → source decision history and Evidence Usage → exact supplier/assessment/finding. Existing free-text API clients remain compatible and do not receive a verified canonical pin. No new menu, palette or email settings. External vendor contacts remain free text; internal business/risk/finding owners and independent Admin reviewers come from the existing directory.

Preserve independent review and active-profile/critical-finding blockers. New selection writes bind live identities/policies, evidence metadata/file verification and the full observed source to the commit. Decision forms bind the revision the user inspected; a conflict preserves decision text and selection and requires explicit refresh/acknowledgement. The retained version remains historical after a new upload or later lifecycle action. Usage reads remain bounded and restricted for scoped accounts; missing parents and failed sources are not represented as complete coverage. Exact source navigation prioritizes the selected record and parents within existing limits.

## Acceptance and release

- Authorized operators select actual accounts/files and complete assessment, remediation and exit decisions without entering hashes. Viewer/scoped and self-review attempts fail server-side.
- Invalid/revoked selections, changed bytes/metadata/actors/sources and event failures cannot leave partial source updates or decision pins. Legacy callers retain existing behavior.
- Current source panels and historical Evidence Usage distinguish submission, decision, verification and exit versions; exports and deletion protection retain canonical evidence relationships.
- Loading/retry, decision conflicts, changed navigation targets and failed reads do not silently replace drafts or show stale results as current. TR/EN labels and mobile/keyboard behavior are tested.
- Tests cover routes/transactions, history, exact navigation and actual Chromium journeys. User/admin/module documentation and research delivery inventory reflect limits. The additive pin workflow needs no new business schema; rollback leaves pins retained. Production deployment and customer UAT remain separate from merge.

The prior complete browser workflow used nearly 44 minutes of its 45-minute budget. Increase its execution allowance to accommodate this additional real journey without skipping or weakening existing checks. Record exact revision and completed evidence in the delivery PR. Use only owned synthetic data in disposable CI and retain its immutable decision history only there.
