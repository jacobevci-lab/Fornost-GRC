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

Each provider profile also has a verified trust zone (`external`, `private`, or `local`) and a maximum outbound data classification. The trust zone must match the endpoint hostname; a public endpoint cannot be mislabeled as private. External providers are capped at `Internal`, while private/local profiles may be capped at `Confidential`. `Restricted` content is never eligible for model context. When failover is configured, the strictest maximum across the entire chain is selected before context retrieval, so switching providers can never expand data exposure. Chat, draft generation, governed agents, and the retrieval lab all use this shared policy and write the effective maximum to the bounded audit detail.

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

Migration `0036_fornost_ai_agents.sql` adds manually invoked assurance runs and replay-protected links to the governed draft queue. Risk, Audit, Compliance and Evidence agents analyze only bounded, sanitized Fornost context. A run produces at most eight schema-validated findings, and every finding must cite a source ID that was actually supplied to the model. Raw model output is discarded after validation; the stored report contains only the bounded structured result and its SHA-256 hash.

Agent runs never mutate live GRC data. Admin review with an explicit note and confirmation is required before a finding can be converted into an existing `pending` AI action draft. Conversion requires a second `TASLAK OLUŞTUR` confirmation and is unique per run/finding pair. The resulting draft still follows the existing edit, review, publication and ticket controls.

Migration `0037_fornost_ai_knowledge.sql` adds a governed AI knowledge base. Admins may ingest bounded plain text, Markdown, HTML, CSV, JSON, PDF or DOCX content. Up to ten files may be staged together with a 30 MB aggregate browser-memory limit. PDF and DOCX files are converted to plain text inside the administrator's browser; raw files are never uploaded to Fornost or an AI provider. Each prepared file is submitted as an independent draft so one failure does not roll back the rest of the batch. File size, page count and extracted-text limits are enforced before a draft can be created, and matching content hashes are blocked as duplicates. HTML script/style blocks and tags are removed, content is normalized, SHA-256 hashed, versioned and split into bounded overlapping chunks. New and replacement versions always start as `draft`; only an Admin can approve them with a review note and exact `ONAYLA` confirmation. Approval, archive, new-version, duplicate-denial and deletion operations are audited.

Migration `0038_fornost_ai_knowledge_governance.sql` adds source ownership and an explicit next-review date without changing stored document versions. Existing installations remain compatible through a separate governance table. Approved sources become visually overdue after their planned review date; legacy sources without a plan retain the 180-day approval-age fallback. An Admin can record a completed review without changing the approved document, while a replacement PDF/DOCX or text version always resets approval. Up to 50 selected drafts or active sources can be approved or archived in one explicitly confirmed operation; eligibility is validated for the complete selection before any row changes and one bounded audit event records all affected references.

Copilot, typed drafts and assurance agents use the same deterministic lexical retriever. It selects only chunks from the current approved version, supplies no more than 9,000 knowledge characters, and exposes exact `KB-…-V…-C…` IDs as model citation anchors. `Restricted` sources are intentionally excluded from all model context even when approved. Knowledge text remains untrusted data and never becomes system instructions. No vector service, remote embedding call or autonomous record mutation is introduced.

Knowledge RAG operations also provide browser-side ingestion for TXT, Markdown, HTML, CSV and JSON files, Admin-only current-content inspection and immutable version metadata, plus an Admin/Editor retrieval laboratory. Retrieval tests call no model and retain no raw search string: the audit trail stores only a SHA-256 query hash and returned source references. Copilot post-validates bracketed record references, removes invented source IDs, returns only sources actually cited by the answer and exposes citation-integrity status to the UI.

The quality center supports fixed 7, 30 and 90-day windows. It combines call success, provider health, evaluation results, governed output counts, agent failures and knowledge-review freshness into deterministic control-readiness states; no model is called to calculate these states. The same bounded summary can be exported as CSV, while recent operational errors remain visible without exposing prompts or model responses.

Admins may idempotently install a five-case safety baseline covering human approval boundaries, prompt-injection resistance, Restricted-data egress, evidence grounding and credential handling. Baseline cases use stable identifiers and `INSERT OR IGNORE`, so repeated installation never creates duplicates. They remain ordinary evaluation cases and retain only scores, latency, failure reason and output hashes after execution.

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
- Admin-only 7/30/90-day quality, latency, approval and output metrics with provider health, control-readiness checks, recent-error triage and CSV export
- provider model discovery and selected-model availability feedback
- Admin-only AI use-case inventory with approval/suspension decisions
- repeatable expected/forbidden-term model evaluations
- idempotent built-in AI safety evaluation baseline
- encrypted primary/fallback provider chain and per-attempt health history
- manually invoked Risk, Audit, Compliance and Evidence assurance agents
- grounded findings, Admin review and replay-protected conversion to the governed draft queue
- versioned and approval-gated AI knowledge sources with grounded chunk citations
- single and ten-file batch TXT, Markdown, HTML, CSV, JSON, PDF and DOCX ingestion, file-based replacement versions, duplicate prevention, ownership and review scheduling, controlled bulk approval/archive, source health/freshness summary, search and filters, Admin source inspection, immutable version history and retrieval laboratory
- server-side Copilot citation integrity enforcement and invalid-reference removal

## V1 limitations by design

Not included yet:

- autonomous agents
- generic or autonomous live-record write tools
- vector database / embedding retrieval (deterministic lexical retrieval is available)

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

Expand agentic workflows only after tool authorization and approval controls are mature. The initial read-only assurance agents are now available for:

- Risk Agent
- Audit Agent
- Compliance Agent
- Evidence Agent

Agents must remain constrained by the same tool allowlists, authorization checks, audit trail and human approval rules.
