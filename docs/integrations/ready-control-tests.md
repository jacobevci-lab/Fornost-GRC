# Ready control tests

This on-prem product increment adds four versioned, read-only control tests to the existing Evidence Automation screen. It does not create a separate module or require shared SaaS tenancy.

## Use

1. Save an Intune, Defender for Endpoint or SonarQube native evidence source using its product-specific setup.
2. In Evidence Sources choose **Ready Control**, or use **Continuous Controls → Ready Control**.
3. Select the test, verify the proposed control references, choose a schedule and optionally assign a remediation owner. Blank owner uses the signed-in administrator.
4. Enable the test and select **Run** for its first result. Subsequent due runs use the existing on-prem scheduler. Scheduler enablement requires the configured scheduler token; enabling a test alone does not configure a missing scheduler.
5. Open **Run History → View Results** to inspect counts, affected records and failure reasons. Existing findings/CAPA governance and independent closure remain in force; a later passing run does not silently close a finding.

Advanced options retain evidence freshness, consecutive failure threshold, remediation due days and automatic finding creation. Custom JSON rules remain available through **Add Control**. Default ready-test form has five inputs; technical JSON paths and comparison operators are not exposed.

## Version 1 definitions

| Test | Dataset | Passing condition |
| --- | --- | --- |
| Intune device compliance | managed-devices | Every visible device reports `compliant`, with a valid last sync no older than 7 days. `noncompliant` and `inGracePeriod` fail; conflict/error/unknown/unrecognised values are unverified. |
| Intune device encryption | managed-devices | Every visible device reports boolean `isEncrypted=true`, with a valid last sync no older than 7 days. No recovery-key assurance is implied. |
| Defender sensor health | machines | Every visible device reports `Active`, with a valid lastSeen no older than 7 days. Inactive/impaired/no-sensor-data states fail; unknown values are unverified. This is not a complete EDR coverage test. |
| SonarQube quality gate | quality-gate | The configured project's returned status is `OK`, without explicitly ignored conditions. `ERROR`/`WARN` fail; `NONE` and unknown states are unverified. The endpoint does not establish analysis recency or all-branch coverage. |

The 7-day device threshold is a Fornost test policy, not a framework certification rule. Suggested Annex A references require the customer to confirm applicability; the application does not automatically certify a framework control.

## Result contract

- Scope is always **credential-visible**, never presumed to cover the whole organisation. Provider pagination must complete before assessment; returned count and dataset identity are checked.
- A non-empty set containing only verified passing rows passes. A known failing row fails the test even when other rows are unverified. No rows or unverified-only/no-failure results produce `error / ASSESSMENT_INCOMPLETE` and no successful evidence record.
- Missing/duplicate identities, unknown enum values and missing/invalid/future device timestamps cannot pass. Five minutes of future timestamp tolerance permits minor clock skew.
- Every row contributes to counts. Only the first 100 affected rows are retained in the assessment projection, with explicit truncation. Raw evidence retains the existing size/truncation rules. The projection contains bounded IDs, labels and reason codes, never an arbitrary copy of provider fields.
- Test ID and version are pinned at creation. Provider/dataset/version mismatch fails before collection. Changing an unrelated source into a different provider cannot silently reuse a ready test.
- One ready test per source/template is enforced in the database, including concurrent creates. Custom rules are unaffected.
- Run, evidence and last-run state are committed together. Provider HTTP errors retain their error codes. The existing threshold policy also raises operational findings for persistent collection/assessment errors; those are not proof of an actual device-policy failure.
- Detail reads use the existing authenticated workspace roles. Only Admin can configure ready tests; Admin/Editor can execute them; Viewer is read-only.

## Validation and limits

Behaviour tests execute the real collector, evaluator and database orchestration against SQLite with substituted vendor HTTP. They cover fail/repeat/pass, one open finding, independent closure preservation, no-data and throttled runs, migrations, source mismatch and legacy custom rules. Isolated browser QA checks real source/rule persistence, authorization, canonical configuration, duplicate rejection, and form rendering. Result rendering uses an explicitly labelled in-memory HTTP fixture; no fake result is stored in the product database.

Real customer API credentials, complete inventory scope and provider licensing still require verification in the customer's environment. There is no write-back to endpoint products, automatic asset discovery into the GRC asset register, per-device exception workflow or incremental large-inventory collector in this increment.

## Official definition references, reviewed 2026-10-01

- [Intune managedDevice](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice?view=graph-rest-1.0)
- [Intune complianceState](https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-compliancestate?view=graph-rest-1.0)
- [Defender machine resource](https://learn.microsoft.com/en-us/defender-endpoint/api/machine)
- [SonarSource quality-gate action](https://github.com/SonarSource/sonarqube-quality-gate-action/blob/master/script/check-quality-gate.sh)
