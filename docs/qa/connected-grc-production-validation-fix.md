# Connected GRC production validation fix

The dedicated production QA now validates only records that the Connected GRC enterprise adapters can actually project.

## Why

Several APIs return auxiliary arrays that are intentionally not Connected GRC nodes. Counting every top-level array produced false domain-projection failures even though all live sources returned HTTP 200 and the Connected GRC UI reached 7/7 readiness.

Examples:

- Findings: `sourceSignals` and `events` are not finding nodes.
- Risk Appetite: `linkedRisks` and board snapshots are not adapter rows.
- Regulatory Intelligence: `records` contains general GRC records and is not a regulatory node collection.

The QA therefore mirrors the adapter contract and counts only the arrays consumed by `buildConnectedGrcEnterpriseRows`.

## Language check

The application already persists the selected language and updates `document.documentElement.lang`. The production QA now targets the actual `.language-switch` EN button exactly, then requires both `html[lang=en]` and the English `Dashboard` navigation label.

## Runtime integrity

Cloudflare Access headers remain scoped to first-party requests. Console and request-failure gates continue to fail only on first-party product errors; Cloudflare Insights traffic is excluded from product failures.
