# Next supplier review at independent approval

The existing TPRM **Approve** and **Conditional** dialogs show the current review date and contract end. The reviewer chooses the next review date alongside the decision rationale and canonical evidence version. A future existing date is initially retained. A date that is today or overdue must be replaced. The next date must be after today's UTC date and on or before contract end; it may bring a future review forward. No automatic frequency or renewal policy is imposed.

The assessment decision, profile review date, connected vendor record's `nextAssessment`, retained decision event and evidence pin are committed together. My Work and TPRM summaries then use the chosen date. A review within the next 30 days can still be due soon; approval does not hide an approaching deadline. Expired contracts cannot support a future review inside their term through this dialog. Contract amendment is a separate workflow.

The assessment row and supplier detail show **Review schedule** history: previous and next dates, contract end at decision, cycle, actual actor/time and rationale. Later assessment cycles preserve earlier schedules and decision evidence. Older decisions without this structured history remain readable but do not acquire an invented schedule record.

## Recovery and permissions

The assigned independent Admin reviewer remains the decision maker; the creator or submitter cannot approve their own assessment. Current full-access account and evidence-version checks apply. Viewer accounts can inspect history, but cannot decide. Scoped core-module access does not grant enterprise TPRM access.

If the assessment, profile revision, previous date or contract boundary changes, saving is blocked. **Refresh decision context** shows current data while retaining the note, date and evidence selection. **Use current version** explicitly adopts it and clears confirmation; check that the chosen date still fits the current contract and confirm again. Failed refreshes disable Apply. If the response is lost after commit, refresh reveals the resulting decision and history; a repeated decision cannot create another event or pin.

## API and operation

`POST /api/third-party-risk` accepts `reviewSchedule: { profileRevision, previousDate, contractEnd, nextDate }` only for `assessment-action` with `approve` or `conditional` and `evidenceMode: "library"`. The existing assessment `expectedRevision` and evidence selection are also required. Dates must be exact valid `YYYY-MM-DD` values. Unknown scheduling keys and scheduling data on submit/reject/finding/exit operations are rejected. The server compares current sources and rechecks the contract, profile, core vendor, assessment, actor and evidence at commit.

Legacy API requests omitting `reviewSchedule` retain their existing behavior and date; they do not receive these scheduling guarantees. Ordinary workspace reads add the retained schedule to each returned assessment. Existing collection limits still apply. The metadata-only My Work source exposes the current due date without decision notes or schedule history.

There is no migration, new menu, palette change or notification delivery. Reverting this integration preserves canonical dates, structured decision events and evidence pins. Do not delete that history during rollback. Automated validation is distinct from production deployment, customer UAT and measured adoption; immutable release evidence belongs in the PR.
