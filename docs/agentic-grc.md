# Agentic GRC — operation guide

| Workspace | Action | Result |
|---|---|---|
| Top bar / Intelligence → Ask Fornost | Ask about Risk, Control, Evidence, Vendor, BIA, KRI, CAPA or AI | Current source codes, retrieval time and coverage; offline rules work without a provider |
| Ask Fornost | “Create reminders for overdue findings” / “SLA süresi geçen bulgular için hatırlatma aç” | Explicit approval card listing findings, owners, note and due date; internal reminders in My Work |
| Ask Fornost | “Create a high access risk draft for Entra ID” | Asset selection if ambiguous; populated risk draft card, editable owner/title before proposing |
| Regulatory Center → selected change | Run AI Impact and Policy Gap Analysis | Requirement excerpts, matching policy paragraphs/control codes, potential gaps and effort range |
| Regulatory analysis | Draft Policy Update / Prepare CAPA | Human-edited draft content or assigned CAPA, followed by an explicit approval card |
| AI Governance → Impact & risk assessment | EU AI Act five-question wizard | Preliminary class, recorded answers, official source links, versioned checklist |
| AI Governance → system assessment | Edit AI BOM | Base model, vector store, MCP/API grants, resource scope, data boundary and HITL checkpoints |
| AI Governance → Shadow AI & discovery | Import CSV | Mapping/preview, selected candidates added to the existing admission/ban queue |

## Authority and privacy

- Ask Fornost registry reads and CAPA/risk/evidence-note proposals now enforce live module/entity scope (see modular-agent-tools.md). Editors/Admins can apply actions only with the relevant write grant; Viewers only query. Regulatory/deep-governance workspaces and legacy reminders still require consolidated full access. Per-system governance also enforces owner/Admin authority.
- Proposal parameters are stored on the server. Only the requesting user can approve the exact proposal revision. Cards expire after 20 minutes. Source changes or withdrawn authority prevent application. Repeated/concurrent approvals return the original receipt.
- Native writes and `Ask Fornost (Kullanıcı Onaylı)` audit receipts commit together. Reminders never send external messages or close findings. Risk drafts are initial proposals, not approved assessments. Published policy content remains unchanged; the usual independent review/publish path applies to the new version.
- Analysis uses the existing privacy router. Offline mode makes no provider calls. Restricted material is excluded; BYOK retrieval is limited to Internal/Public sources. No model output can select SQL, invoke arbitrary tools, approve evidence or bypass SoD.

## Screening and discovery boundaries

The EU AI Act wizard is a screening aid, not certification or legal approval. Unknown applicability, exceptions and uncertainty require expert resolution. Annex III/profiling, Annex I product safety and transparency are separate branches. Higher existing classifications are retained. Checklist applicability depends on role/use case; e.g. a fundamental-rights impact assessment is not assumed mandatory for every deployer. Rule version: 2026-11-24, using the Commission's AI Act Service Desk; source URLs are retained with results.

Saving a wizard, checklist or BOM change revokes production approval. Native gates reject unresolved/prohibited screening, unfinished checklists and declared write/admin tools without an HITL checkpoint. BOM model/write/scope metadata feeds the existing system profile and independent review. The map is a declaration; it does not discover or enforce actual MCP permissions.

CSV discovery uses catalogue/name/domain signals. A signal is a review candidate, not proof of unauthorised use. An approved-name match is still selectable because a different OAuth application can reuse a name. Stable identities deduplicate repeated uploads. Absence of signals is not proof that Shadow AI is absent. Import does not contact SSO, revoke OAuth grants, block network access or change procurement records.

## Limits and recovery

- Ask context: up to 500 recent records per module, up to 32 source excerpts; coverage is shown. It is not an exhaustive portfolio count.
- Reminder proposal: up to 50 overdue open findings with active owners. If the limit is exceeded, use the normal finding work queue.
- Regulation analysis: up to 60 requirement segments, 500 policies/controls, 20,000 characters per policy and 60,000 characters of supplied regulatory text. The stored summary is used only when no full text is supplied. Effort uses a transparent 2–6/4–12 hour review heuristic, not a delivery commitment.
- BOM: up to 30 declared tools. Shadow CSV: 2 MB, 1,000 data rows; up to 300 selected candidates per import; preview expires after 20 minutes. Failed partial imports can be retried safely; existing fingerprints are skipped.
- Refresh stale proposals/analyses before approval. Complete an existing unfinished policy version before drafting another. Resolve the wizard/checklist/HITL blockers before requesting production approval again.

Migration `0121_agentic_grc.sql` is additive. Browser QA uses an isolated localhost database and never seeds production. Regression tests verify actor isolation, explicit confirmation, source pinning, expiry, concurrent replay, rollback, SoD, retained classification, native metadata/approval gates and CSV deduplication.
