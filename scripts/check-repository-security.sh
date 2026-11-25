#!/usr/bin/env bash
set -euo pipefail

report=${1:?Supply an output path for the Trivy JSON report}
trivy fs --scanners vuln,misconfig --include-dev-deps --ignorefile '' \
  --format json --output "$report" .

# A clean scan still has results for the application and QA locks plus the Dockerfile.
jq --exit-status '
  any(.Results[]; .Target == "package-lock.json" and .Type == "npm") and
  any(.Results[]; .Target == "scripts/package-lock.json" and .Type == "npm") and
  any(.Results[]; .Target == "Dockerfile" and .Type == "dockerfile" and
    ((.MisconfSummary.Successes // 0) + (.MisconfSummary.Failures // 0) > 0))
' "$report" >/dev/null || { echo "Incomplete Trivy coverage for application/QA lockfiles or Dockerfile." >&2; exit 1; }

summary=$(jq -r '
  [.Results[] | (.Vulnerabilities[]?, .Misconfigurations[]?) | .Severity] as $severities |
  "Trivy repository scan: \([$severities[] | select(. == "HIGH")] | length) HIGH, \([$severities[] | select(. == "CRITICAL")] | length) CRITICAL."
' "$report")
echo "$summary"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  echo "$summary" >> "$GITHUB_STEP_SUMMARY"
fi

trivy convert --scanners vuln,misconfig --ignorefile '' --severity HIGH,CRITICAL \
  --format table --exit-code 2 "$report"
