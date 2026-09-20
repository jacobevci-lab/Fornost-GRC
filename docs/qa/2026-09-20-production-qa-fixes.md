# Production QA remediation — 2026-09-20

Production target: `https://app.fornostsecurity.com`

## Root causes addressed

- Fixed `/api/ai/portfolio` production query ordering by the actual `ai_model_inventory.residual_score` column instead of the non-existent `risk_score` column.
- Corrected AI exception predicate grouping so only draft/approved exceptions that are expired or due for review are counted.
- Added a central production accessibility hardening layer for shared legacy surfaces:
  - required ARIA value attributes for keyboard-operable column separators;
  - semantic role for the dashboard risk distribution graphic;
  - accessible names for dynamically generated inputs/selects/textareas that do not have an explicit label yet;
  - keyboard focus for actual scrollable regions;
  - minimum hit-area improvements for compact controls.
- Normalized low-contrast legacy text to the current workspace tokens across light and dark themes.
- Added an explicit foreground token for bright teal actions so dark-mode primary buttons no longer render white text over a bright teal background.
- Hardened Connected GRC legacy surfaces against inherited low-contrast colors while preserving the amber dark-mode heading language.

## Validation

The QA fix branch is validated with a dedicated workflow that runs:

- TypeScript typecheck
- ESLint
- production build
- security unit tests

After merge/deploy, run the full production browser QA and compare against the 2026-09-20 baseline of 139 findings (19 critical / 69 high / 23 medium / 28 low).
