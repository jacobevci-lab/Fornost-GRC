# Production QA Remediation — Pass 2

Date: 2026-09-20
Target: `https://app.fornostsecurity.com`

This pass addresses the residual findings after the first production QA remediation reduced findings from 139 to 60 and eliminated all critical findings.

## Changes

- Strengthens light-theme contrast for repeated row actions and legacy orange micro-labels.
- Fixes dashboard high-priority badge contrast.
- Removes opacity-based contrast loss in AI Settings helper text.
- Improves Master Data count-chip contrast.
- Applies specific dark-theme foregrounds for bright teal primary/active controls.
- Improves dark-theme warning/attention text in executive assurance and control assurance.
- Improves dark-theme positive status text in Settings.
- Adds keyboard focus support for the AI portfolio scroll region.
- Expands sub-24px interactive controls to a minimum 28px hit area, including checkboxes/radios.

## Validation

Open a PR against `main` to run the standard CI matrix. After CI passes, merge and rerun Production Smoke plus Full Production QA against the deployed custom domain.
