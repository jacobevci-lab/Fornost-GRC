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

Production verification follow-up: the new fixture modified a fetched register
body while preserving its original transport headers. Playwright retains an
existing content-length in this case; the live scan stalled on the intercepted
register read. Its synthetic row also used the normalized UI data shape, while
the register API requires data_json, causing a visible JSON parsing notice.
Regenerate response headers for the modified JSON, use the raw API row shape,
append the control only on the first page, and assert that no application notice
appears after startup. Keep the request-idle and contrast gates strict. This
follow-up changes QA fixtures only; real API checks remain in the production
baseline and smoke tests. Repeat the failed deployed-UI scenario and remaining
production gates before recording the release as verified.

The next live run still stalled on the intercepted read after correcting the
row and headers; the header change did not establish the cause of that timeout.
Separate a bounded, authenticated real-register preflight from a fully static
browser register fixture. The outcome test needs one synthetic control, not
customer register contents. Remove the nested upstream route.fetch, retain the
raw row contract and strict idle checks, and log each scenario start/completion
without customer data. Real register health remains mandatory in the preflight,
full-product baseline and CRUD smoke. This is test isolation, not an application
timeout or authorization change.
