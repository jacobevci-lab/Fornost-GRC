# Trustworthy connector setup completion

At revision `6272ac8`, the setup wizard displays a green tick, "CONTINUOUS
ASSURANCE ACTIVE" and "chain is ready" for every successful HTTP response from
`run-rule`. The real API also returns HTTP 200 for a recorded collection error
or failed control. An operator needs to distinguish saved configuration from a
successful, evidenced first check. After a confirmed rule save followed by a
lost run response, the wizard stays on the creation form; another click creates
another rule because `save-rule` inserts a new record each time.

Use the returned outcome and evidence reference to distinguish pass, fail,
collection error and unconfirmed results. Never infer success from HTTP 200,
configuration save or missing evidence. After a confirmed rule ID and failed
run request, show an unconfirmed result and the existing rule link instead of
another creation action. Preserve exact returned evidence/finding links and
existing authorization. Do not add automatic retries, provider calls, backend
state changes or global redesign. A lost response to the initial rule-save
request itself remains outside this bounded client-side fix.

Also use the existing theme-aware foreground on the wizard's active step and
linked-control hover/focus fills, and fit all five desktop steps in one row.
Validate real UI progression with isolated transport fixtures for pass, fail,
error, missing evidence, unknown status and a lost run response; count one
rule-save request and verify recovery opens the existing rule. Check TR/EN,
light/dark, desktop/mobile, active-step and linked-control contrast and keyboard
focus. Fixtures must intercept writes, never contact a provider or change
customer records. Run lint, types, existing CI and browser gates, then verify
the released revision. Rollback is a code revert without migration.

Browser validation also caught transient linked-control contrast of 2.56:1 in
light-theme hover while the global button background was animating. Scope button
transitions in this wizard to borders/shadows so text and fill switch together;
retain the strict contrast check without delaying or suppressing findings. Use
decorative SVG outcome marks alongside the explicit result text.
