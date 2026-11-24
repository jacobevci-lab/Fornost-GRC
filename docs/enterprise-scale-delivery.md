# Enterprise scale delivery

## Outcome and constraints

One independently verified control can support several active framework requirements. Evidence approval alone must not certify control effectiveness. A verification is bound to the exact control content and current approved evidence version; changes withdraw its contribution automatically.

Authorized users need consolidated and subsidiary workspaces containing the ten canonical GRC record families, entity labels, financial exposure and a scope-filtered relationship map. Entity and module permissions are intersected on the server before pagination, aggregation or relationship projection. Existing main-entity records remain compatible. Creation produces native draft records and canonical short codes, with entity assignment and audit receipt committed atomically. No scoped write may approve evidence, approve a supplier, accept a risk or close a finding.

FAIR-Lite uses the Beta-PERT mean of minimum / most likely / maximum single-event loss, multiplied by an annual probability of 1–100%. SLE and ALE are rounded to minor currency units. Currency totals remain separate; missing estimates do not become zero-risk claims. This is a simplified estimate, not a full FAIR simulation.

## Delivery checks

- One CTL and approved EVD support ISO 27001 and SOC 2 only after independent control verification. Ownership conflicts, stale evidence and changed controls withdraw compliance.
- A second subsidiary, descendant grants, sibling denial, module permissions, creation, pagination, aggregates and graph references are exercised with real records.
- SLE/ALE boundaries, rounding and mixed currencies are tested.
- Browser verification covers native creation, scope switching, shared-framework disclosure and TR/EN light/dark layouts. Local checks and release CI must pass before publishing the exact reviewed revision.

## Implementation decisions

Extend the existing org_entities / org_record_entities model and fail-closed scope gateway. Do not expose unscoped module APIs to scoped sessions. Reuse canonical validators and writers for draft intake; retain independent human lifecycle decisions in their native workflows.

## User workflow and operational boundaries

- The header scope selector reloads the session workspace. Group administrators can manage the hierarchy and grants under Identity & Access → Entity scopes. Group CISO is read-only. Subsidiary managers/contributors retain their platform and module permissions, intersected with their granted entity subtree.
- Consolidated native registers show the entity next to each record. Scoped workspaces provide overview, risk/asset/BIA/vendor/control/policy/audit/finding/incident/AI intake, evidence visibility, read-only framework posture and a relationship map. Entity assignment is stored in `org_record_entities.org_entity_id`; unmapped historical records belong to `root`.
- Draft intake reuses native validation, directory selection and code allocation. The new route cannot approve evidence or vendors, accept risks, publish policies, deploy AI systems or close CAPA. Those decisions stay in their existing independent human workflows; unscoped lifecycle APIs remain inaccessible to a scoped session.
- A control owner cannot verify effectiveness. In Compliance Management, open a mapped requirement, expand **Independent effectiveness verification**, record the test rationale and submit with an independent account. Only current approved evidence is offered. Verification is bound to both source content and update revisions, so reverting a changed control does not revive an old signature.
- Approved evidence can be reused across mappings, but partial mappings and undecided applicability remain gaps. Scoped framework views include only controls and evidence within the authorized scope.
- Graphs explicitly disclose their 1,000-record-per-module display bound. Financial totals read up to 10,001 risk records independently of register pagination; larger scopes display an unavailable total rather than a partial amount. Financial totals include all risk records in the selected scope, each quantified estimate once.
- The financial inputs are a single-event approximation: SLE = (minimum + 4 × most likely + maximum) / 6; ALE = unrounded SLE × annual probability / 100. Each output is rounded independently to two decimals. No exchange rate, event correlation or Monte Carlo simulation is implied.

## Validation

`tests/enterprise-scale.test.ts` exercises all ten native intake families, canonical codes, idempotent retries, atomic receipts, sibling isolation, module denial, guessed IDs, cross-entity references, grant revocation/reference moves during a transaction, multi-framework verification and stale-source withdrawal, plus SLE/ALE rounding and currency separation. `scripts/enterprise-scale-qa.mjs` exercises the same principal flows through a real browser and HTTP API on a disposable local D1 in CI, with desktop/mobile TR/EN and light/dark screenshots.
