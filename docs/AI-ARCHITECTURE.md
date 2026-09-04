# Fornost AI Architecture v1

## Goal

Fornost AI v1 adds a provider-agnostic, on-prem friendly GRC copilot without giving an LLM direct database access or autonomous write privileges.

Core rule:

> AI proposes and analyzes. Fornost authorizes. Humans approve mutations.

The first release is intentionally **read-only**.

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

## V1 limitations by design

Not included yet:

- autonomous agents
- write tools
- Jira/task creation from AI
- vector database / full document RAG
- PDF/document chunk embedding
- AI Governance inventory / ISO 42001 module
- multi-provider failover
- model evaluation dashboard

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
