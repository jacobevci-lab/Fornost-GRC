# Localized and readable vendor states

On production revision ace918a, the Turkish vendor queue renders canonical
`onboarding`, `high` and `unassessed` values. GRC operators need consistent
status names in cards, inventory, decisions and selection fields. Reuse the
existing My Work vendor status dictionary, extend presentation labels for risk,
attention and data classification, and keep saved/API values unchanged. Unknown
values stay visible; do not infer approval or hide unsupported states.

Severity badges still use literal colors designed for dark backgrounds. Use
existing semantic theme tokens and verify neutral, danger, warning and positive
states on the actual populated UI in both languages and themes. Include mobile
layout, complete contrast coverage, and unchanged option values in acceptance.

Scope: vendor presentation and its regression coverage. No status transitions,
role boundaries, storage, CSV schema or business-record mutations. Run existing
TPRM contracts plus the focused browser gate. Deploy only after validation;
rollback is a revert with no migration.
