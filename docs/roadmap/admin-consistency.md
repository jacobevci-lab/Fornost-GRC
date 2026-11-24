# Administration consistency

User outcome: administrators manage one connector register, understand each user's entity grants, and only see settings actions applicable to the current screen. Existing TR/EN, theme tokens, evidence/SoD gates and canonical record codes remain intact.

Implementation: establish the root sans token and shared administration scale; keep the identity profile navigation explicit; edit entity roles/memberships in the same transaction and optimistic revision as account changes; join ticket transport and enterprise webhook configuration in one connector view without copying credentials or fabricating health; refresh that view after every successful connector action; conditionally render editable settings forms.

Verification: account authorization, stale updates, atomic grants/session revocation and deletion; canonical connector rows/history; tab visibility, entity editing, font inheritance and TR/EN/light/dark browser journeys; typecheck/build/full existing test suite. Release follows existing main/production authorization after checks pass.

Production cleanup: verify the exact four named disposable accounts, preserve the real administrator and audit history. The smoke account is referenced by production QA secrets; transition verification to temporary per-run accounts before removing it. Do not claim cleanup until the production inventory confirms it.

Observed pre-release results: identity lifecycle/session/module-access browser suites passed; the dedicated administration journey passed entity isolation, save visibility, direct profile navigation, connector refresh/history and 28 locale/theme/font/layout checks. Sampled text contrast was at least 5.27:1 (light) and 7.73:1 (dark). Integration and evidence browser regression suites also passed. The read-only production inventory matched the four requested accounts and Yakup Evci as the retained permanent administrator; deletion is deferred until main serves the expected release revision.
