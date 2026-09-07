# Fornost AI Architecture v3

## Goal

Fornost AI v1 adds a provider-agnostic, on-prem friendly GRC copilot without giving an LLM direct database access or autonomous write privileges.

Core rule:

> AI proposes and analyzes. Fornost authorizes. Humans approve mutations.

The conversational copilot remains read-only. V2 adds typed drafts, human review, explicit controlled publication and measurable operational quality without granting the model autonomous write access.

## Runtime flow

```text
Browser / Ask Fornost
        |
        v
POST /api/ai/chat
        |
        +--> existing Fornost Auth + RBAC
        |
        +--> deterministic read-scope inference
        |
        +--> structured GRC context builder
        |      Risk / Asset / BIA / Compliance / Controls / Evidence / Audit / Vendor
        |
        +--> context sanitization
        |      secret/token/password/cookie/credential-like fields removed
        |
        +--> AI Gateway provider adapter
               |-- OpenAI-compatible local/cloud endpoint
               `-- Ollama
        |
        v
Local or remote model
        |
        v
Response + Fornost source IDs
        |
        `--> AI activity audit log
```

## Trust boundaries

### LLM boundary

The model is not trusted to authorize, query or mutate platform state. It never receives a database credential and never connects directly to D1.

### Context boundary

Structured Fornost records are retrieved server-side. Context records are treated as **untrusted data**, not instructions. Secret-like keys are removed before provider invocation and total context is bounded.

### Network boundary

Public AI endpoints must use HTTPS. Private/on-prem endpoints require explicit opt-in:

```text
FORNOST_AI_ALLOW_PRIVATE_ENDPOINTS=true
```

Loopback additionally requires:

```text
FORNOST_AI_ALLOW_LOOPBACK=true
```

These flags are separate from generic integration connector policy so AI enablement does not weaken unrelated SSRF controls.

## Authentication and authorization

All AI APIs reuse the existing `requireRole()` control.

- Admin: chat + provider configuration/test
- Editor: chat
- Viewer: chat

V1 reads the same GRC workspace data already readable by these roles in the current single-workspace data model. Future multi-tenant work must apply tenant/workspace predicates before context assembly.

## Provider abstraction

Supported v1 adapters:

- `openai-compatible`
- `ollama`

Provider settings include:

- base URL
- model
- enabled state
- temperature
- timeout
- max output tokens
- optional API key

Provider secrets use the existing Fornost AES-GCM integration encryption helper and `FORNOST_SETTINGS_ENCRYPTION_KEY`.

An optional encrypted fallback profile may use a different provider, endpoint and model. Chat, typed-draft generation and evaluation calls first use the primary profile, then make at most one fallback attempt. Every attempt writes a bounded `ai_provider_health` result. Redirect blocking, endpoint validation and private/loopback opt-in apply independently to both profiles.

## Prompt-injection controls

The system prompt explicitly defines retrieved GRC records as untrusted data and instructs the model not to execute or follow instructions embedded in records, evidence metadata or policy text.

Additional controls:

- no direct model tool execution in v1
- deterministic server-side retrieval only
- bounded history and prompt size
- bounded provider response size
- redirect blocking on outbound provider requests
- provider URL validation
- API keys excluded from context and client responses
- no full prompt stored in audit logs; SHA-256 hash only

## Auditability

`ai_activity_logs` records:

- actor
- action
- provider/model
- prompt hash
- Fornost context source IDs
- status
- latency
- short operational detail
- timestamp

Raw user prompts and model answers are intentionally not persisted by v1 to reduce sensitive-data retention.

## Data model

Migration `0030_fornost_ai_v1.sql` creates:

- `ai_provider_settings`
- `ai_activity_logs`

Migration `0031_fornost_ai_drafts.sql` adds `ai_action_drafts`. Migration `0032_fornost_ai_draft_events.sql` adds the immutable draft revision trail. Drafts are schema-validated, retain only bounded structured output and source references, and move from `pending` to `approved` or `rejected` through an Admin decision. Editors may revise only their own pending drafts; Admins may revise any pending draft. Every edit and decision is separately audited. Approval requires a human review note and does not publish or mutate a live GRC record in this slice.

Migration `0033_fornost_ai_draft_publications.sql` adds idempotent publication receipts. An Admin may publish an approved risk-treatment draft only to an explicitly selected Risk Assessment record, or an approved audit-finding draft only to an explicitly selected Audit Management requirement. Publication requires a separate note and the exact `YAYINLA` confirmation. Optimistic locking protects concurrent record changes and the unique draft receipt prevents replay.

Migration `0034_fornost_ai_v2.sql` adds controlled remediation ticket receipts. Only an Admin can convert an approved remediation-task draft into a ticket through the configured Jira, ServiceNow, Azure DevOps, GitHub Issues or webhook integration. The exact `OLUŞTUR` confirmation and a publication note are mandatory. A reservation is persisted before the outbound request; failed or uncertain operations are not automatically retried, preventing accidental duplicate external tickets.

Migration `0035_fornost_ai_governance.sql` adds:

- `ai_provider_fallbacks` and `ai_provider_health`
- `ai_use_cases` for AI purpose, owner, data classification, impact, human-decision role, controls and review dates
- `ai_eval_cases` and `ai_eval_runs` for repeatable model quality and safety checks

Evaluation responses are never stored. Only score, latency, provider/model, failure reason and SHA-256 output hash are retained. Evaluation batches are Admin-only and bounded to ten enabled cases per request.

Runtime also defensively creates these tables when needed so the API remains resilient in on-prem upgrade scenarios.

## UI

`FornostAiCopilot` is mounted from the root layout and becomes visible after successful Fornost authentication.

The panel provides:

- Ask Fornost chat
- source ID chips
- provider/model state
- Admin-only provider settings
- save and connection test
- explicit read-only mode indicator
- typed risk treatment, audit finding and remediation task drafts
- Admin-only approval/rejection queue with audit events
- schema-validated human editing and mandatory review notes
- explicit target selection and second-confirmation publication for risk treatments and audit findings
- immutable publication receipts and replay protection
- controlled remediation ticket publication through existing integrations
- Admin-only seven-day quality, latency, approval and output metrics
- provider model discovery and selected-model availability feedback
- Admin-only AI use-case inventory with approval/suspension decisions
- repeatable expected/forbidden-term model evaluations
- encrypted primary/fallback provider chain and per-attempt health history

## V1 limitations by design

Not included yet:

- autonomous agents
- generic or autonomous live-record write tools
- vector database / full document RAG
- PDF/document chunk embedding

## V2 target

Add controlled tool calling with a human approval gate:

```text
LLM suggestion
   -> typed action request
   -> schema validation
   -> RBAC / policy decision
   -> human review and approval
   -> existing Fornost API
   -> audit event
```

Initial write-capable tools should create **drafts only**, for example:

- risk treatment draft
- audit finding draft
- remediation task draft
- Jira ticket draft

## V3 target

Add agentic workflows only after tool authorization and approval controls are mature:

- Risk Agent
- Audit Agent
- Compliance Agent
- Evidence Agent

Agents must remain constrained by the same tool allowlists, authorization checks, audit trail and human approval rules.
