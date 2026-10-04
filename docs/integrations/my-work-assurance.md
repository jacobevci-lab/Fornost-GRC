# My Work connected assurance actions

My Work renders assurance actions as a native child of the existing inbox. Language and Mine/Organization scope come directly from its React state. The previous DOM observer, inserted mount, duplicate identity lookup, history lookup and independent client data assembly are removed.

The existing read-only `/api/controls/assurance` snapshot supplies canonical findings, control automation, evidence integrity and one evaluation timestamp. Control decisions use the same engine as Control Library. Audit evidence gaps are evaluated per audit record, so two owners sharing a control do not collapse into the first owner's assignment. Evidence uses both validity fields, exact expiry, approval/review, validation and integrity rules. CAPA projection retains reviewer and acceptance expiry; expired acceptance returns to the action list without treating the projected remediation as a second finding.

Assignment uses complete name/email matching; email-bearing display names match their email. Organization scope remains Admin-only. This is a presentation filter over existing full-workspace authorization, not a new access boundary; module-scoped users retain the existing endpoint restrictions.

Users select one compact action category, review why it needs attention, and open the canonical record. Eight-row pagination reaches all evaluated actions. Counts describe records in each category and are not summed into an inflated unique-work total. The screen retains the established compact fonts and theme tokens.

Loading, transport errors, malformed snapshots and incomplete sources are explicit states. Incomplete evaluations withhold action counts. Refresh and the inbox five-minute timer reload the snapshot; a 20-second timeout, cancellation and sequence guard prevent stale requests from winning. A failed refresh does not advance the last evaluation time. The inbox also clears identity-dependent results after authentication failure.

The endpoint's existing read bounds and metadata-chain verification limits remain unchanged. These are read-time actions, not immutable audit opinions, automatic approvals or live provider verification. A server update is reflected on refresh or the periodic reload.

Validation: behavioral unit tests cover exact ownership, organization restrictions, reviewer assignment, expired acceptance, repeated audit controls with different owners, evidence eligibility, malformed/incomplete data, canonical navigation and pagination. The localhost-only browser scenario uses local D1 fixtures for pagination, Mine/Organization, record navigation, malformed source/recovery, both themes and mobile; only the transport-outage case is substituted.
