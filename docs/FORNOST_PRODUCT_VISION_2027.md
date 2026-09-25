# Fornost GRC 2027 Product Vision

## Product promise

**Fornost should understand complexity so the user does not have to.**

Fornost is an AI-native Connected Risk and Continuous Assurance platform. The product should connect organizational context, risk, controls, frameworks, evidence, findings and remediation while keeping day-to-day interaction simple for non-GRC users.

The target experience is:

`Connect → Discover → Understand → Prioritize → Act → Verify`

The user should mainly need to **review, decide and approve**. Fornost should collect, map, correlate, monitor, test, remind, escalate and prepare context automatically wherever integrations and policy allow it.

## Core product principles

1. **Do not ask for information Fornost can discover.** If Entra, Defender, Tenable, Jira, AWS or another connected source already knows the answer, retrieve it instead of adding another form field.
2. **Action before administration.** Home and My Work must answer “What needs my attention?” before showing reporting or configuration.
3. **Progressive disclosure.** Default screens expose the minimum useful fields and actions. Expert configuration belongs under Advanced or contextual drill-downs.
4. **Control-centric assurance.** A common control is defined once and can satisfy many frameworks. Its effectiveness, automation, evidence freshness, failures, risks, assets and obligations remain connected.
5. **One AI experience.** Ask Fornost is the visible AI surface. Specialist agents remain an implementation detail behind the orchestrator.
6. **Human decision points stay explicit.** AI can propose, correlate and draft. Material risk acceptance, regulatory applicability, control changes and governance decisions require a traceable human approval path.
7. **Connected by default.** Process, asset, risk, control, framework, evidence, finding and remediation records should not become isolated registers.
8. **No dashboard theatre.** Prefer actionable signals, trends and exceptions over decorative charts.

## Complexity budget

Every new feature must be reviewed against these limits before release:

| Surface | Default limit |
| --- | ---: |
| Main navigation groups | 8 |
| Nested navigation levels | 2 |
| Primary actions per screen | 3 |
| Default form fields | 7 |
| Dashboard headline KPIs | 6 |
| Required fields | Minimum needed to create a valid record |

Breaking a limit requires a documented reason. The preferred solution is automation, progressive disclosure, role-based visibility or contextual drill-down rather than adding more UI.

## Product architecture

### Experience layer

- Home
- My Work
- Role-based workspaces
- Global search / command palette
- Ask Fornost
- Contextual recommendations and approvals

### Intelligence layer

- Risk engine
- Control and assurance engine
- Evidence freshness and integrity engine
- AI orchestration
- Regulatory impact analysis
- Workflow and notification orchestration

### Connected GRC graph

`Organization → Business Unit → Process → Asset / Vendor / AI System → Risk → Control → Framework / Policy / Evidence → Control Test → Finding → Remediation → Residual Risk`

Users should not have to maintain the graph manually. Fornost should derive and suggest relationships from imports, integrations and existing records wherever possible.

## P0 — Foundation and adoption

The objective is for a security, risk, compliance or audit team to use Fornost every day without needing extensive product training.

- Unified Connected GRC data model
- Organization / process / asset context
- Risk and BIA
- Common Control Library
- Framework mapping
- Evidence Library
- Findings and remediation
- Audit Management
- My Work
- Role-based UX
- Ask Fornost foundation
- Connected GRC explorer
- Initial Jira, email, Entra, Defender and vulnerability-management integrations
- Simplified forms with basic and advanced sections
- Action-oriented Home experience

### P0 acceptance rule

A business owner should be able to complete an assigned GRC task without understanding the full GRC data model or navigating unrelated modules.

## P1 — Continuous Assurance

- Continuous control monitoring
- Automated evidence collection
- Control testing engine
- Dynamic risk signals
- KRI and risk appetite
- Policy lifecycle
- Risk-based third-party assessment
- Operational resilience
- Smart notifications and digests
- AI recommendations with human approval

The product moves from a system of record toward a **system of action**.

## P2 — Intelligence and differentiation

- Regulatory Intelligence
- AI system and agent governance
- Financial risk quantification
- External threat and exposure context
- Vendor continuous monitoring
- Automatic regulatory impact mapping
- Predictive risk signals
- Control optimization and duplicate-control reduction
- Benchmarking and maturity guidance

## Home experience

The default Home surface should prioritize a small number of decision-ready signals such as:

- Critical risks requiring action
- Failed controls
- Overdue remediation
- Upcoming audit readiness gaps
- Expiring or invalid evidence
- Material regulatory changes

Each signal should provide a clear next action and a path to supporting evidence.

## My Work

My Work is the adoption layer for people who are not full-time GRC users. It should unify assigned work across risks, controls, evidence, audits, findings, vendors and assurance.

Recommended default views:

- Due today
- This week
- Waiting for others
- Needs attention
- Completed

Operational metrics, SLA analytics and historical timelines are secondary detail and should be hidden until requested.

## Control Intelligence

Controls are first-class objects. A control should expose, when relevant:

- Owner
- Type and objective
- Implementation state
- Design effectiveness
- Operating effectiveness
- Automation level
- Test frequency
- Evidence freshness and integrity
- Failure count
- Linked risks
- Linked assets/processes
- Mapped frameworks and obligations
- Findings and remediation

A single control can support multiple frameworks. Framework-specific duplicate controls should be avoided unless the obligation is materially different.

## Evidence model

Evidence is not only a file. It should carry provenance and assurance context:

- Source
- Collection method
- Collected at
- Related control/test
- Asset/process context
- Owner/reviewer
- Validity and expiry
- Freshness
- Integrity/hash status
- Automation level
- Verification state

Target maturity: `Manual → Semi-automated → Automated → Continuous`.

## Ask Fornost

Ask Fornost should answer questions using the organization’s connected context rather than acting as a generic compliance chatbot.

Examples:

- Why did our cyber risk increase this month?
- Which control failures affect critical business services?
- What needs my attention today?
- Which audit controls are missing current evidence?
- What changed that affects CRA readiness?
- Create a remediation proposal for these failed controls.

Specialist risk, control, evidence, audit, vendor and regulatory agents may work behind the scenes, but the user sees one coherent assistant.

## Product review checklist

Before merging a new user-facing feature, answer:

1. Does the user need to enter this manually?
2. Can Fornost obtain or infer it from a trusted source?
3. Does it need to be visible by default?
4. Can the primary task be completed in three actions or fewer?
5. Can a non-GRC business owner understand the screen?
6. Does this create a connected relationship or another isolated register?
7. Can an exception-based view replace a larger dashboard/table?
8. Is AI reducing work, or merely adding another interface?

If the feature fails these questions, simplify it before adding more capability.

## North-star positioning

Fornost should combine enterprise GRC depth with modern automation and approachable UX:

**Connected Risk + Continuous Assurance + AI-native Governance — without enterprise GRC complexity for the user.**
