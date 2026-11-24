# Governed agent gateway and tools

Use Administration → AI Configuration to select Offline / Rules, local Ollama/vLLM, or customer BYOK (OpenAI, Azure OpenAI, OpenAI-compatible, existing Bedrock). Local defaults to `http://localhost:11434/api/chat` and `qwen2.5:7b`; install the selected model separately. The server normalizes an Ollama chat URL to its API base. A cloud-hosted Fornost instance cannot use the operator browser's localhost: deploy the gateway in the customer network for local-only data processing. Existing server private/loopback endpoint opt-ins remain required. Public cloud routes require HTTPS and explicit retention verification. The ZDR flag records customer verification, not an automatic provider guarantee. Keys remain encrypted at rest and never return to the browser.

`LLMGateway` exposes `local_ollama`, `byok_cloud` and `rule_based_fallback` outcomes over the existing persisted local/byok/offline configuration. Provider connection/response failures activate the deterministic engine. Access, emergency stop, classification, budget, stale configuration and audit failures remain blocking. Connection Test reports the actual active mode and milliseconds, including fallback. Built-in evidence scores and citation-backed record summaries work without a provider. `store:false` is sent on compatible chat requests. PII redaction covers supported email/TCKN/IBAN patterns; secret/token redaction remains mandatory.

Untrusted document/source content is escaped inside `<untrusted_evidence_content>` in a user message, separate from fixed system instructions. This is defense in depth, not a promise that delimiters solve injection. Model text cannot execute tools or grant assurance. Grounding and domain checks remain server-side. The bounded orchestrator selects explicit registry tools from the user's intent; no unrestricted model-selected SQL, URLs or tool execution is exposed.

| Tool | Outcome |
| --- | --- |
| `search_grc_records(module, query, status_filter)` | Authorized canonical record codes; up to 500 records/module and 32 returned sources |
| `get_record_connections(record_code)` | The existing Connected GRC graph over authorized records; hidden targets are omitted |
| `get_overdue_and_gaps()` | Up to 50 overdue CAPAs, pending evidence, incident SLA breaches and records without visible connections |
| `propose_capa_draft(...)` | Editable proposal; creates a native **open** FND only after human confirmation |
| `propose_risk_draft(...)` | Editable initial assessment; creates a native RSK after human confirmation |
| `propose_evidence_review_note(...)` | Preliminary working note; never changes evidence status, verifier or version |

Both Ask entry points use the registry. Entity-scoped workspaces have an Ask Fornost button. Module grants and selected entity/subtree are checked against live authority. A proposal inherits its source entity; cross-entity links are rejected. A changed grant, mapping, source, actor or card revision requires a new review. Cards expire in 20 minutes. After editing, Save Changes issues a new card; Approve and Create is disabled until the exact edited proposal is saved. CAPA requires an eligible action owner and a different independent Admin verifier, also different from the requester. Native lifecycle approval/closure requirements remain in place.

There are no evidence/vendor approval or CAPA closure tools. No external messages are sent. Internal reminders remain the existing consolidated workflow. Evidence file pre-review remains available through the Evidence Library's existing full-access workflow; scoped users can propose notes only for accessible evidence. A confidence score or source link never means control effectiveness, certification or approved evidence.

Administration → Audit Trail shows the latest 100 AI call/tool/approval events with actor, operation, configured/active provider, token summary, latency and result. Prompts, documents and keys are excluded. Provider usage may be unknown when transport fails; it is not reported as zero.

Protocol references checked on 2026-11-24: [Ollama chat](https://docs.ollama.com/api/chat), [OpenAI Chat API](https://developers.openai.com/api/reference/resources/chat). Provider tests use deterministic protocol mocks, not a customer's live credentials. Browser tests use an isolated local database and clean synthetic fixtures.
