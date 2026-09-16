import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const simpleGrcRecords = sqliteTable("simple_grc_records", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  dataJson: text("data_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("simple_grc_records_module_idx").on(table.module, table.updatedAt)]);

export const evidenceAutomationRules = sqliteTable("evidence_automation_rules", {
  id:text("id").primaryKey(), name:text("name").notNull(), sourceId:text("source_id").notNull(), controlRefs:text("control_refs").notNull(),
  jsonPath:text("json_path").notNull(), operator:text("operator").notNull(), expected:text("expected").notNull(), schedule:text("schedule").notNull(),
  enabled:integer("enabled").notNull().default(1), lastStatus:text("last_status"), lastRunAt:text("last_run_at"), freshnessHours:integer("freshness_hours").notNull().default(24),
  failureThreshold:integer("failure_threshold").notNull().default(1), consecutiveFailures:integer("consecutive_failures").notNull().default(0), autoFinding:integer("auto_finding").notNull().default(1),
  remediationOwner:text("remediation_owner").notNull().default(""), remediationDueDays:integer("remediation_due_days").notNull().default(7), nextRunAt:text("next_run_at"), lastEvidenceAt:text("last_evidence_at"),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(), updatedBy:text("updated_by").notNull(),
},(table)=>[index("evidence_automation_rules_due_idx").on(table.enabled,table.nextRunAt)]);

export const evidenceAutomationRuns = sqliteTable("evidence_automation_runs", {
  id:text("id").primaryKey(), ruleId:text("rule_id").notNull(), ruleName:text("rule_name").notNull(), sourceName:text("source_name").notNull(), status:text("status").notNull(),
  score:integer("score").notNull(), detail:text("detail").notNull(), responseHash:text("response_hash").notNull(), evidenceId:text("evidence_id"), createdAt:text("created_at").notNull(), actor:text("actor").notNull(),
  triggerType:text("trigger_type").notNull().default("manual"), durationMs:integer("duration_ms").notNull().default(0), errorCode:text("error_code"),
},(table)=>[index("evidence_automation_runs_rule_created_idx").on(table.ruleId,table.createdAt)]);

export const evidenceAutomationFindings = sqliteTable("evidence_automation_findings", {
  id:text("id").primaryKey(), ruleId:text("rule_id").notNull(), evidenceId:text("evidence_id"), title:text("title").notNull(), severity:text("severity").notNull(), owner:text("owner").notNull(),
  dueDate:text("due_date").notNull(), status:text("status").notNull().default("open"), detail:text("detail").notNull(), occurrenceCount:integer("occurrence_count").notNull().default(1),
  createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(), acknowledgedBy:text("acknowledged_by"), acknowledgedAt:text("acknowledged_at"), closureNote:text("closure_note"),
  closureEvidenceRef:text("closure_evidence_ref"), closureEvidenceSha256:text("closure_evidence_sha256"), closedBy:text("closed_by"), closedAt:text("closed_at"),
},(table)=>[index("evidence_automation_findings_status_due_idx").on(table.status,table.dueDate),index("evidence_automation_findings_rule_status_idx").on(table.ruleId,table.status)]);

export const aiActionDrafts = sqliteTable("ai_action_drafts", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), title: text("title").notNull(),
  payloadJson: text("payload_json").notNull(), rationale: text("rationale").notNull(),
  sourceRefsJson: text("source_refs_json").notNull().default("[]"), status: text("status").notNull().default("pending"),
  provider: text("provider").notNull(), model: text("model").notNull(), promptHash: text("prompt_hash"),
  createdBy: text("created_by").notNull(), reviewedBy: text("reviewed_by"), reviewedAt: text("reviewed_at"),
  reviewNote: text("review_note"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("ai_action_drafts_status_idx").on(table.status, table.createdAt), index("ai_action_drafts_creator_idx").on(table.createdBy, table.createdAt)]);

export const aiDraftEvents = sqliteTable("ai_draft_events", {
  id: text("id").primaryKey(), draftId: text("draft_id").notNull(), action: text("action").notNull(),
  actor: text("actor").notNull(), detail: text("detail").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("ai_draft_events_draft_idx").on(table.draftId, table.createdAt)]);

export const aiDraftPublications = sqliteTable("ai_draft_publications", {
  id: text("id").primaryKey(), draftId: text("draft_id").notNull().unique(), recordId: text("record_id").notNull(),
  module: text("module").notNull(), publicationNote: text("publication_note").notNull(),
  publishedBy: text("published_by").notNull(), publishedAt: text("published_at").notNull(),
}, (table) => [index("ai_draft_publications_record_idx").on(table.recordId, table.publishedAt)]);

export const aiDraftTickets = sqliteTable("ai_draft_tickets", {
  id:text("id").primaryKey(), draftId:text("draft_id").notNull().unique(), provider:text("provider"),
  externalId:text("external_id"), externalUrl:text("external_url"), status:text("status").notNull(),
  publicationNote:text("publication_note").notNull(), createdBy:text("created_by").notNull(),
  createdAt:text("created_at").notNull(), completedAt:text("completed_at"), lastError:text("last_error"),
},(table)=>[index("ai_draft_tickets_status_idx").on(table.status,table.createdAt)]);

export const aiProviderFallbacks=sqliteTable("ai_provider_fallbacks",{id:text("id").primaryKey(),provider:text("provider").notNull(),baseUrl:text("base_url").notNull(),model:text("model").notNull(),enabled:integer("enabled").notNull().default(0),configJson:text("config_json").notNull().default("{}"),secretCiphertext:text("secret_ciphertext"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),updatedBy:text("updated_by").notNull()});
export const aiProviderHealth=sqliteTable("ai_provider_health",{id:text("id").primaryKey(),profile:text("profile").notNull(),provider:text("provider").notNull(),model:text("model").notNull(),operation:text("operation").notNull(),status:text("status").notNull(),latencyMs:integer("latency_ms").notNull().default(0),detail:text("detail").notNull(),createdAt:text("created_at").notNull()},table=>[index("ai_provider_health_created_idx").on(table.createdAt,table.status)]);
export const aiUseCases=sqliteTable("ai_use_cases",{id:text("id").primaryKey(),name:text("name").notNull(),purpose:text("purpose").notNull(),owner:text("owner").notNull(),dataClassification:text("data_classification").notNull(),impactLevel:text("impact_level").notNull(),decisionRole:text("decision_role").notNull(),controlsJson:text("controls_json").notNull().default("[]"),status:text("status").notNull().default("draft"),reviewDate:text("review_date").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),approvedBy:text("approved_by"),approvedAt:text("approved_at"),decisionNote:text("decision_note")},table=>[index("ai_use_cases_status_review_idx").on(table.status,table.reviewDate)]);
export const aiEvalCases=sqliteTable("ai_eval_cases",{id:text("id").primaryKey(),name:text("name").notNull(),inputText:text("input_text").notNull(),expectedTermsJson:text("expected_terms_json").notNull().default("[]"),forbiddenTermsJson:text("forbidden_terms_json").notNull().default("[]"),maxLatencyMs:integer("max_latency_ms").notNull().default(30000),enabled:integer("enabled").notNull().default(1),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()});
export const aiEvalRuns=sqliteTable("ai_eval_runs",{id:text("id").primaryKey(),caseId:text("case_id").notNull(),provider:text("provider").notNull(),model:text("model").notNull(),status:text("status").notNull(),score:integer("score").notNull(),latencyMs:integer("latency_ms").notNull(),outputHash:text("output_hash"),failureReason:text("failure_reason").notNull(),runBy:text("run_by").notNull(),createdAt:text("created_at").notNull()},table=>[index("ai_eval_runs_case_created_idx").on(table.caseId,table.createdAt)]);
export const aiAgentRuns=sqliteTable("ai_agent_runs",{id:text("id").primaryKey(),agentKind:text("agent_kind").notNull(),objective:text("objective").notNull(),status:text("status").notNull(),reportJson:text("report_json").notNull(),sourceRefsJson:text("source_refs_json").notNull().default("[]"),outputHash:text("output_hash"),provider:text("provider").notNull(),model:text("model").notNull(),providerProfile:text("provider_profile").notNull(),latencyMs:integer("latency_ms").notNull().default(0),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),completedAt:text("completed_at"),reviewedBy:text("reviewed_by"),reviewedAt:text("reviewed_at"),reviewNote:text("review_note")},table=>[index("ai_agent_runs_status_created_idx").on(table.status,table.createdAt)]);
export const aiKnowledgeSources=sqliteTable("ai_knowledge_sources",{id:text("id").primaryKey(),name:text("name").notNull(),sourceType:text("source_type").notNull(),classification:text("classification").notNull(),status:text("status").notNull().default("draft"),currentVersion:integer("current_version").notNull().default(1),contentHash:text("content_hash").notNull(),characterCount:integer("character_count").notNull(),chunkCount:integer("chunk_count").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),approvedBy:text("approved_by"),approvedAt:text("approved_at"),decisionNote:text("decision_note")},table=>[index("ai_knowledge_sources_status_updated_idx").on(table.status,table.updatedAt)]);
export const aiKnowledgeGovernance=sqliteTable("ai_knowledge_governance",{sourceId:text("source_id").primaryKey(),owner:text("owner").notNull(),reviewDueAt:text("review_due_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull()},table=>[index("ai_knowledge_governance_review_idx").on(table.reviewDueAt)]);
export const aiKnowledgeVersions=sqliteTable("ai_knowledge_versions",{id:text("id").primaryKey(),sourceId:text("source_id").notNull(),version:integer("version").notNull(),contentHash:text("content_hash").notNull(),normalizedContent:text("normalized_content").notNull(),characterCount:integer("character_count").notNull(),chunkCount:integer("chunk_count").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull()},table=>[uniqueIndex("ai_knowledge_versions_source_version_idx").on(table.sourceId,table.version)]);
export const aiKnowledgeChunks=sqliteTable("ai_knowledge_chunks",{id:text("id").primaryKey(),sourceId:text("source_id").notNull(),version:integer("version").notNull(),ordinal:integer("ordinal").notNull(),contentText:text("content_text").notNull(),contentHash:text("content_hash").notNull(),createdAt:text("created_at").notNull()},table=>[uniqueIndex("ai_knowledge_chunks_source_version_ordinal_idx").on(table.sourceId,table.version,table.ordinal)]);
export const aiFeedback=sqliteTable("ai_feedback",{id:text("id").primaryKey(),activityId:text("activity_id").notNull(),kind:text("kind").notNull(),severity:text("severity").notNull(),comment:text("comment").notNull(),status:text("status").notNull().default("open"),assignedTo:text("assigned_to"),resolutionNote:text("resolution_note"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),resolvedBy:text("resolved_by"),resolvedAt:text("resolved_at")},table=>[uniqueIndex("ai_feedback_activity_creator_idx").on(table.activityId,table.createdBy),index("ai_feedback_status_severity_created_idx").on(table.status,table.severity,table.createdAt),index("ai_feedback_creator_created_idx").on(table.createdBy,table.createdAt)]);
export const aiBudgetPolicies=sqliteTable("ai_budget_policies",{profile:text("profile").primaryKey(),monthlyTokenLimit:integer("monthly_token_limit").notNull().default(0),warnPercent:integer("warn_percent").notNull().default(80),hardLimit:integer("hard_limit").notNull().default(0),promptCostPerMillion:real("prompt_cost_per_million").notNull().default(0),completionCostPerMillion:real("completion_cost_per_million").notNull().default(0),currency:text("currency").notNull().default("USD"),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull()});
export const aiUsageLedger=sqliteTable("ai_usage_ledger",{id:text("id").primaryKey(),actor:text("actor").notNull(),operation:text("operation").notNull(),profile:text("profile").notNull(),provider:text("provider").notNull(),model:text("model").notNull(),promptTokens:integer("prompt_tokens").notNull().default(0),completionTokens:integer("completion_tokens").notNull().default(0),estimatedCostMicrounits:integer("estimated_cost_microunits").notNull().default(0),currency:text("currency").notNull().default("USD"),metered:integer("metered").notNull().default(0),createdAt:text("created_at").notNull()},table=>[index("ai_usage_ledger_profile_created_idx").on(table.profile,table.createdAt),index("ai_usage_ledger_created_idx").on(table.createdAt)]);
export const aiOperatingPolicy=sqliteTable("ai_operating_policy",{id:text("id").primaryKey(),emergencyStop:integer("emergency_stop").notNull().default(0),chatEnabled:integer("chat_enabled").notNull().default(1),draftsEnabled:integer("drafts_enabled").notNull().default(1),agentsEnabled:integer("agents_enabled").notNull().default(1),retrievalEnabled:integer("retrieval_enabled").notNull().default(1),evaluationsEnabled:integer("evaluations_enabled").notNull().default(1),viewerChat:integer("viewer_chat").notNull().default(1),editorChat:integer("editor_chat").notNull().default(1),maintenanceMessage:text("maintenance_message").notNull().default(""),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull()});
export const aiAgentDraftLinks=sqliteTable("ai_agent_draft_links",{id:text("id").primaryKey(),runId:text("run_id").notNull(),findingId:text("finding_id").notNull(),draftId:text("draft_id").notNull().unique(),conversionNote:text("conversion_note").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull()},table=>[index("ai_agent_draft_links_run_idx").on(table.runId,table.createdAt),uniqueIndex("ai_agent_draft_links_run_finding_unique").on(table.runId,table.findingId)]);

export const grcRecords = sqliteTable("grc_records", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  title: text("title").notNull(),
  meta: text("meta").notNull(),
  owner: text("owner").notNull(),
  status: text("status").notNull(),
  score: integer("score").notNull(),
  due: text("due").notNull(),
  progress: integer("progress").notNull().default(0),
  linksJson: text("links_json").notNull().default("[]"),
  workflowState: text("workflow_state").notNull().default("Taslak"),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowEvents = sqliteTable("workflow_events", {
  eventId: text("event_id").primaryKey(),
  recordId: text("record_id").notNull(),
  action: text("action").notNull(),
  fromState: text("from_state"),
  toState: text("to_state").notNull(),
  reason: text("reason").notNull(),
  actor: text("actor").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const identityAssignments = sqliteTable("identity_assignments", {
  id: text("id").primaryKey(), principal: text("principal").notNull(),
  principalType: text("principal_type").notNull(), role: text("role").notNull(),
  scope: text("scope").notNull(), source: text("source").notNull(),
  risk: text("risk").notNull(), status: text("status").notNull(),
  validUntil: text("valid_until"), owner: text("owner").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const accessReviews = sqliteTable("access_reviews", {
  id: text("id").primaryKey(), title: text("title").notNull(),
  scope: text("scope").notNull(), reviewer: text("reviewer").notNull(),
  due: text("due").notNull(), progress: integer("progress").notNull(),
  total: integer("total").notNull(), approved: integer("approved").notNull(),
  revoked: integer("revoked").notNull(), pending: integer("pending").notNull(),
  status: text("status").notNull(), updatedAt: text("updated_at").notNull(),
});

export const accessReviewItems = sqliteTable("access_review_items", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull(),
  principal: text("principal").notNull(), principalType: text("principal_type").notNull(),
  account: text("account").notNull(), system: text("system").notNull(),
  entitlement: text("entitlement").notNull(), scope: text("scope").notNull(),
  risk: text("risk").notNull(), lastUsed: text("last_used").notNull(),
  decision: text("decision").notNull().default("Bekliyor"), reason: text("reason"),
  reviewer: text("reviewer").notNull(), reassignedTo: text("reassigned_to"),
  decidedBy: text("decided_by"), decidedAt: text("decided_at"),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("access_review_items_campaign_idx").on(table.campaignId, table.decision)]);

export const accessRemediationTasks = sqliteTable("access_remediation_tasks", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull(),
  itemId: text("item_id").notNull(), principal: text("principal").notNull(),
  system: text("system").notNull(), entitlement: text("entitlement").notNull(),
  action: text("action").notNull(), owner: text("owner").notNull(),
  due: text("due").notNull(), status: text("status").notNull(),
  completionEvidence: text("completion_evidence"), createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
});

export const accessReviewEvents = sqliteTable("access_review_events", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull(),
  itemId: text("item_id"), action: text("action").notNull(),
  reason: text("reason").notNull(), actor: text("actor").notNull(),
  occurredAt: text("occurred_at").notNull(),
});

export const accessReviewExceptions = sqliteTable("access_review_exceptions", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull(),
  itemId: text("item_id").notNull(), decision: text("decision").notNull(),
  justification: text("justification").notNull(), expiresAt: text("expires_at").notNull(),
  compensatingControl: text("compensating_control").notNull(), status: text("status").notNull(),
  createdBy: text("created_by").notNull(), reviewer: text("reviewer"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
});

export const accessReviewEvidencePackages = sqliteTable("access_review_evidence_packages", {
  id: text("id").primaryKey(), campaignId: text("campaign_id").notNull(),
  packageType: text("package_type").notNull(), manifestHash: text("manifest_hash").notNull(),
  itemCount: integer("item_count").notNull(), status: text("status").notNull(),
  generatedBy: text("generated_by").notNull(), generatedAt: text("generated_at").notNull(),
  verifiedBy: text("verified_by"), verifiedAt: text("verified_at"),
});

export const accessReviewSchedules = sqliteTable("access_review_schedules", {
  id:text("id").primaryKey(), name:text("name").notNull(), cadence:text("cadence").notNull(),
  scope:text("scope").notNull(), owner:text("owner").notNull(), nextRun:text("next_run").notNull(),
  reminderDays:text("reminder_days").notNull(), escalationDays:integer("escalation_days").notNull(),
  status:text("status").notNull(), lastRun:text("last_run"), updatedAt:text("updated_at").notNull(),
});
export const accessReviewSnapshots = sqliteTable("access_review_snapshots", {
  id:text("id").primaryKey(), campaignId:text("campaign_id").notNull(), source:text("source").notNull(),
  principalCount:integer("principal_count").notNull(), entitlementCount:integer("entitlement_count").notNull(),
  capturedAt:text("captured_at").notNull(), capturedBy:text("captured_by").notNull(), snapshotHash:text("snapshot_hash").notNull(), status:text("status").notNull(),
});
export const accessReviewNotifications = sqliteTable("access_review_notifications", {
  id:text("id").primaryKey(), campaignId:text("campaign_id").notNull(), level:text("level").notNull(), channel:text("channel").notNull(), recipient:text("recipient").notNull(), message:text("message").notNull(), deliveryMode:text("delivery_mode").notNull(), status:text("status").notNull(), createdAt:text("created_at").notNull(), createdBy:text("created_by").notNull(),
});

export const delegationRecords = sqliteTable("delegation_records", {
  id: text("id").primaryKey(), fromUser: text("from_user").notNull(),
  toUser: text("to_user").notNull(), role: text("role").notNull(),
  scope: text("scope").notNull(), startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(), reason: text("reason").notNull(),
  status: text("status").notNull(), createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const lifecycleCases = sqliteTable("lifecycle_cases", { id:text("id").primaryKey(), employee:text("employee").notNull(), eventType:text("event_type").notNull(), department:text("department").notNull(), effectiveDate:text("effective_date").notNull(), source:text("source").notNull(), tasksTotal:integer("tasks_total").notNull(), tasksDone:integer("tasks_done").notNull(), risk:text("risk").notNull(), status:text("status").notNull(), owner:text("owner").notNull(), updatedAt:text("updated_at").notNull() });
export const sodExceptions = sqliteTable("sod_exceptions", { id:text("id").primaryKey(), policyId:text("policy_id").notNull(), principal:text("principal").notNull(), conflict:text("conflict").notNull(), justification:text("justification").notNull(), compensatingControl:text("compensating_control").notNull(), expiresAt:text("expires_at").notNull(), riskOwner:text("risk_owner").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), reviewer:text("reviewer"), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull() });
export const integrationRemediationJobs = sqliteTable("integration_remediation_jobs", { id:text("id").primaryKey(), connector:text("connector").notNull(), target:text("target").notNull(), action:text("action").notNull(), scope:text("scope").notNull(), rollbackPlan:text("rollback_plan").notNull(), executionMode:text("execution_mode").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), approvedBy:text("approved_by"), verificationResult:text("verification_result"), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull() });
export const integrationRemediationEvents = sqliteTable("integration_remediation_events", { id:text("id").primaryKey(), jobId:text("job_id").notNull(), action:text("action").notNull(), detail:text("detail").notNull(), actor:text("actor").notNull(), occurredAt:text("occurred_at").notNull() });
export const securityTestRuns = sqliteTable("security_test_runs", { id:text("id").primaryKey(), scenario:text("scenario").notNull(), tenantId:text("tenant_id").notNull(), actor:text("actor").notNull(), expected:text("expected").notNull(), result:text("result").notNull(), detail:text("detail").notNull(), createdAt:text("created_at").notNull() }, (table) => [index("security_test_runs_tenant_idx").on(table.tenantId, table.createdAt)]);
export const securityTestLinks = sqliteTable("security_test_links", { id:text("id").primaryKey(), runId:text("run_id").notNull().unique(), tenantId:text("tenant_id").notNull(), findingId:text("finding_id").notNull(), actionId:text("action_id").notNull(), severity:text("severity").notNull(), owner:text("owner").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull() });
export const securityAssurancePackages = sqliteTable("security_assurance_packages", { id:text("id").primaryKey(), tenantId:text("tenant_id").notNull(), title:text("title").notNull(), period:text("period").notNull(), scopeCount:integer("scope_count").notNull(), evidenceCount:integer("evidence_count").notNull(), exceptionCount:integer("exception_count").notNull(), snapshotHash:text("snapshot_hash").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), approvedBy:text("approved_by"), approvedAt:text("approved_at") });
export const securityRemediationVerifications = sqliteTable("security_remediation_verifications", {
  id:text("id").primaryKey(), runId:text("run_id").notNull(), tenantId:text("tenant_id").notNull(),
  evidence:text("evidence").notNull(), status:text("status").notNull(), submittedBy:text("submitted_by").notNull(),
  submittedAt:text("submitted_at").notNull(), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"),
  verificationNote:text("verification_note")
}, (table) => [index("security_remediation_verification_run_idx").on(table.runId, table.tenantId, table.submittedAt)]);

export const securitySlaGovernance = sqliteTable("security_sla_governance", {
  id:text("id").primaryKey(), runId:text("run_id").notNull().unique(), tenantId:text("tenant_id").notNull(),
  actionId:text("action_id").notNull(), owner:text("owner").notNull(), dueDate:text("due_date").notNull(),
  status:text("status").notNull(), extensionReason:text("extension_reason"), requestedDueDate:text("requested_due_date"),
  requestedBy:text("requested_by"), requestedAt:text("requested_at"), approvedBy:text("approved_by"), approvedAt:text("approved_at")
}, (table) => [index("security_sla_tenant_due_idx").on(table.tenantId, table.dueDate)]);

export const securitySlaNotifications = sqliteTable("security_sla_notifications", {
  id:text("id").primaryKey(), runId:text("run_id").notNull(), tenantId:text("tenant_id").notNull(),
  level:text("level").notNull(), recipient:text("recipient").notNull(), channel:text("channel").notNull(),
  message:text("message").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull()
}, (table) => [index("security_sla_notification_run_idx").on(table.runId, table.tenantId)]);

export const securityAuditorRooms = sqliteTable("security_auditor_rooms", {
  id:text("id").primaryKey(), packageId:text("package_id").notNull(), tenantId:text("tenant_id").notNull(), auditorName:text("auditor_name").notNull(), auditorEmail:text("auditor_email").notNull(), accessLevel:text("access_level").notNull(), maskingEnabled:integer("masking_enabled").notNull().default(1), expiresAt:text("expires_at").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), revokedBy:text("revoked_by"), revokedAt:text("revoked_at")
}, (table) => [index("security_auditor_rooms_tenant_idx").on(table.tenantId, table.expiresAt)]);
export const securityAuditorEvents = sqliteTable("security_auditor_events", {
  id:text("id").primaryKey(), roomId:text("room_id").notNull(), tenantId:text("tenant_id").notNull(), eventType:text("event_type").notNull(), detail:text("detail").notNull(), actor:text("actor").notNull(), occurredAt:text("occurred_at").notNull()
}, (table) => [index("security_auditor_events_room_idx").on(table.roomId, table.occurredAt)]);
export const securityAuditorRequests = sqliteTable("security_auditor_requests", {
  id:text("id").primaryKey(), roomId:text("room_id").notNull(), tenantId:text("tenant_id").notNull(), subject:text("subject").notNull(), question:text("question").notNull(), status:text("status").notNull(), dueAt:text("due_at").notNull(), openedBy:text("opened_by").notNull(), openedAt:text("opened_at").notNull(), answeredBy:text("answered_by"), answeredAt:text("answered_at"), answer:text("answer"), evidenceRef:text("evidence_ref"), decidedBy:text("decided_by"), decidedAt:text("decided_at"), decisionNote:text("decision_note")
}, (table) => [index("security_auditor_requests_room_idx").on(table.roomId, table.status), index("security_auditor_requests_tenant_due_idx").on(table.tenantId, table.dueAt)]);

export const securityAuditFindings = sqliteTable("security_audit_findings", {
  id:text("id").primaryKey(), requestId:text("request_id").notNull().unique(), roomId:text("room_id").notNull(), tenantId:text("tenant_id").notNull(),
  title:text("title").notNull(), severity:text("severity").notNull(), status:text("status").notNull(), raisedBy:text("raised_by").notNull(), raisedAt:text("raised_at").notNull(),
  rootCause:text("root_cause"), impact:text("impact"), actionPlan:text("action_plan"), owner:text("owner"), dueDate:text("due_date"), respondedBy:text("responded_by"), respondedAt:text("responded_at"),
  reviewedBy:text("reviewed_by"), reviewedAt:text("reviewed_at"), reviewNote:text("review_note")
}, (table) => [index("security_audit_findings_tenant_status_idx").on(table.tenantId, table.status), index("security_audit_findings_room_idx").on(table.roomId)]);

export const securityFindingActions = sqliteTable("security_finding_actions", {
  id:text("id").primaryKey(), findingId:text("finding_id").notNull().unique(), tenantId:text("tenant_id").notNull(), owner:text("owner").notNull(), dueDate:text("due_date").notNull(),
  milestonesJson:text("milestones_json").notNull(), progress:integer("progress").notNull().default(0), status:text("status").notNull(), evidenceRef:text("evidence_ref"), progressNote:text("progress_note"),
  updatedBy:text("updated_by"), updatedAt:text("updated_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note")
}, (table) => [index("security_finding_actions_tenant_status_idx").on(table.tenantId, table.status), index("security_finding_actions_due_idx").on(table.tenantId, table.dueDate)]);
export const securityEffectivenessReviews = sqliteTable("security_effectiveness_reviews", { id:text("id").primaryKey(), findingActionId:text("finding_action_id").notNull(), findingId:text("finding_id").notNull(), tenantId:text("tenant_id").notNull(), reviewDay:integer("review_day").notNull(), dueDate:text("due_date").notNull(), owner:text("owner").notNull(), status:text("status").notNull(), metricValue:text("metric_value"), evidenceRef:text("evidence_ref"), reviewNote:text("review_note"), reviewedBy:text("reviewed_by"), reviewedAt:text("reviewed_at"), decision:text("decision") }, (table) => [index("security_effectiveness_reviews_action_idx").on(table.findingActionId, table.reviewDay), index("security_effectiveness_reviews_tenant_due_idx").on(table.tenantId, table.dueDate)]);
export const securityControlImprovements = sqliteTable("security_control_improvements", { id:text("id").primaryKey(), effectivenessId:text("effectiveness_id").notNull().unique(), findingId:text("finding_id").notNull(), tenantId:text("tenant_id").notNull(), controlRef:text("control_ref").notNull(), frameworkRefs:text("framework_refs").notNull(), rootCause:text("root_cause").notNull(), improvementPlan:text("improvement_plan"), owner:text("owner"), dueDate:text("due_date"), successMetric:text("success_metric"), status:text("status").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), approvedBy:text("approved_by"), approvedAt:text("approved_at"), implementationEvidence:text("implementation_evidence"), implementedBy:text("implemented_by"), implementedAt:text("implemented_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_control_improvements_tenant_status_idx").on(table.tenantId, table.status), index("security_control_improvements_finding_idx").on(table.findingId)]);
export const securityImprovementPortfolio = sqliteTable("security_improvement_portfolio", { id:text("id").primaryKey(), improvementId:text("improvement_id").notNull().unique(), tenantId:text("tenant_id").notNull(), theme:text("theme").notNull(), riskReduction:integer("risk_reduction").notNull(), effort:integer("effort").notNull(), estimatedCost:text("estimated_cost").notNull(), dependencies:text("dependencies").notNull(), priorityScore:integer("priority_score").notNull(), status:text("status").notNull(), proposedBy:text("proposed_by").notNull(), proposedAt:text("proposed_at").notNull(), decidedBy:text("decided_by"), decidedAt:text("decided_at"), decisionNote:text("decision_note"), fundingOwner:text("funding_owner") }, (table) => [index("security_improvement_portfolio_tenant_status_idx").on(table.tenantId, table.status), index("security_improvement_portfolio_priority_idx").on(table.tenantId, table.priorityScore)]);
export const securityPortfolioExecutions = sqliteTable("security_portfolio_executions", { id:text("id").primaryKey(), portfolioId:text("portfolio_id").notNull().unique(), tenantId:text("tenant_id").notNull(), deliveryOwner:text("delivery_owner").notNull(), budgetBaseline:text("budget_baseline").notNull(), targetDate:text("target_date").notNull(), milestonesJson:text("milestones_json").notNull(), progress:integer("progress").notNull().default(0), actualSpend:text("actual_spend"), varianceNote:text("variance_note"), deliveryEvidence:text("delivery_evidence"), benefitMetric:text("benefit_metric").notNull(), benefitResult:text("benefit_result"), status:text("status").notNull(), startedBy:text("started_by").notNull(), startedAt:text("started_at").notNull(), updatedBy:text("updated_by"), updatedAt:text("updated_at"), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_portfolio_executions_tenant_status_idx").on(table.tenantId, table.status), index("security_portfolio_executions_target_idx").on(table.tenantId, table.targetDate)]);
export const securityExecutiveRiskDecisions = sqliteTable("security_executive_risk_decisions", { id:text("id").primaryKey(), recoveryId:text("recovery_id").notNull().unique(), executionId:text("execution_id").notNull(), tenantId:text("tenant_id").notNull(), proposedDecision:text("proposed_decision").notNull(), rationale:text("rationale").notNull(), residualRisk:text("residual_risk").notNull(), riskOwner:text("risk_owner").notNull(), compensatingControl:text("compensating_control").notNull(), validUntil:text("valid_until").notNull(), additionalInvestment:text("additional_investment").notNull(), status:text("status").notNull(), proposedBy:text("proposed_by").notNull(), proposedAt:text("proposed_at").notNull(), approvedBy:text("approved_by"), approvedAt:text("approved_at"), approvalNote:text("approval_note"), reviewResult:text("review_result"), reviewedBy:text("reviewed_by"), reviewedAt:text("reviewed_at") }, (table) => [index("security_executive_risk_tenant_status_idx").on(table.tenantId, table.status), index("security_executive_risk_validity_idx").on(table.tenantId, table.validUntil)]);
export const securityResidualRiskOversight = sqliteTable("security_residual_risk_oversight", { id:text("id").primaryKey(), decisionId:text("decision_id").notNull().unique(), tenantId:text("tenant_id").notNull(), riskLevel:integer("risk_level").notNull(), exposureAmount:text("exposure_amount").notNull(), concentrationGroup:text("concentration_group").notNull(), controlEffectiveness:integer("control_effectiveness").notNull(), toleranceLimit:integer("tolerance_limit").notNull(), reviewDate:text("review_date").notNull(), status:text("status").notNull(), preparedBy:text("prepared_by").notNull(), preparedAt:text("prepared_at").notNull(), decidedBy:text("decided_by"), decidedAt:text("decided_at"), decisionNote:text("decision_note") }, (table) => [index("security_residual_oversight_tenant_status_idx").on(table.tenantId, table.status), index("security_residual_oversight_review_idx").on(table.tenantId, table.reviewDate)]);
export const securityBoardRiskPacks = sqliteTable("security_board_risk_packs", { id:text("id").primaryKey(), tenantId:text("tenant_id").notNull(), period:text("period").notNull(), title:text("title").notNull(), oversightIdsJson:text("oversight_ids_json").notNull(), totalExposure:text("total_exposure").notNull(), toleranceEvents:integer("tolerance_events").notNull(), concentrationSummary:text("concentration_summary").notNull(), decisionSummary:text("decision_summary").notNull(), actionOwner:text("action_owner").notNull(), dueDate:text("due_date").notNull(), status:text("status").notNull(), preparedBy:text("prepared_by").notNull(), preparedAt:text("prepared_at").notNull(), approvedBy:text("approved_by"), approvedAt:text("approved_at"), approvalNote:text("approval_note"), closedBy:text("closed_by"), closedAt:text("closed_at"), closureEvidence:text("closure_evidence") }, (table) => [index("security_board_risk_packs_tenant_status_idx").on(table.tenantId, table.status), index("security_board_risk_packs_due_idx").on(table.tenantId, table.dueDate)]);
export const securityRiskScenarios = sqliteTable("security_risk_scenarios", { id:text("id").primaryKey(), appetiteId:text("appetite_id").notNull(), tenantId:text("tenant_id").notNull(), scenarioName:text("scenario_name").notNull(), horizonDays:integer("horizon_days").notNull(), baselineValue:integer("baseline_value").notNull(), stressedValue:integer("stressed_value").notNull(), forecastValue:integer("forecast_value").notNull(), confidence:integer("confidence").notNull(), assumptions:text("assumptions").notNull(), treatmentPlan:text("treatment_plan").notNull(), treatmentOwner:text("treatment_owner").notNull(), dueDate:text("due_date").notNull(), status:text("status").notNull(), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_risk_scenarios_tenant_status_idx").on(table.tenantId, table.status),index("security_risk_scenarios_due_idx").on(table.tenantId, table.dueDate)]);
export const securityResiliencePlans = sqliteTable("security_resilience_plans", { id:text("id").primaryKey(), scenarioId:text("scenario_id").notNull().unique(), tenantId:text("tenant_id").notNull(), criticalService:text("critical_service").notNull(), businessImpact:text("business_impact").notNull(), dependencyMap:text("dependency_map").notNull(), rtoMinutes:integer("rto_minutes").notNull(), rpoMinutes:integer("rpo_minutes").notNull(), exerciseType:text("exercise_type").notNull(), exerciseDate:text("exercise_date").notNull(), recoveryOwner:text("recovery_owner").notNull(), status:text("status").notNull(), preparedBy:text("prepared_by").notNull(), preparedAt:text("prepared_at").notNull(), evidenceRef:text("evidence_ref"), actualRtoMinutes:integer("actual_rto_minutes"), actualRpoMinutes:integer("actual_rpo_minutes"), exercisedBy:text("exercised_by"), exercisedAt:text("exercised_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_resilience_tenant_status_idx").on(table.tenantId, table.status),index("security_resilience_exercise_idx").on(table.tenantId, table.exerciseDate)]);
export const securityIctDependencies = sqliteTable("security_ict_dependencies", { id:text("id").primaryKey(), resiliencePlanId:text("resilience_plan_id").notNull().unique(), tenantId:text("tenant_id").notNull(), providerName:text("provider_name").notNull(), serviceName:text("service_name").notNull(), subcontractorChain:text("subcontractor_chain").notNull(), concentrationScore:integer("concentration_score").notNull(), contractualRto:integer("contractual_rto").notNull(), contractualRpo:integer("contractual_rpo").notNull(), exitStrategy:text("exit_strategy").notNull(), alternateProvider:text("alternate_provider").notNull(), portabilityScope:text("portability_scope").notNull(), jointTestDate:text("joint_test_date").notNull(), owner:text("owner").notNull(), status:text("status").notNull(), assessedBy:text("assessed_by").notNull(), assessedAt:text("assessed_at").notNull(), testEvidence:text("test_evidence"), actualExitMinutes:integer("actual_exit_minutes"), testedBy:text("tested_by"), testedAt:text("tested_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_ict_tenant_status_idx").on(table.tenantId, table.status),index("security_ict_test_date_idx").on(table.tenantId, table.jointTestDate)]);
export const securityVendorIncidents = sqliteTable("security_vendor_incidents", { id:text("id").primaryKey(), dependencyId:text("dependency_id").notNull(), tenantId:text("tenant_id").notNull(), title:text("title").notNull(), severity:text("severity").notNull(), detectedAt:text("detected_at").notNull(), serviceImpact:text("service_impact").notNull(), providerNoticeAt:text("provider_notice_at").notNull(), regulatoryDeadline:text("regulatory_deadline").notNull(), notificationScope:text("notification_scope").notNull(), slaClause:text("sla_clause").notNull(), contractualBreach:text("contractual_breach").notNull(), responseOwner:text("response_owner").notNull(), correctivePlan:text("corrective_plan").notNull(), dueDate:text("due_date").notNull(), status:text("status").notNull(), reportedBy:text("reported_by").notNull(), reportedAt:text("reported_at").notNull(), providerEvidence:text("provider_evidence"), actualRecoveryMinutes:integer("actual_recovery_minutes"), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), verifiedBy:text("verified_by"), verifiedAt:text("verified_at"), verificationNote:text("verification_note") }, (table) => [index("security_vendor_incidents_tenant_status_idx").on(table.tenantId, table.status)]);
export const securityVendorReassessments = sqliteTable("security_vendor_reassessments", { id:text("id").primaryKey(), incidentId:text("incident_id").notNull().unique(), dependencyId:text("dependency_id").notNull(), tenantId:text("tenant_id").notNull(), inherentRisk:integer("inherent_risk").notNull(), controlScore:integer("control_score").notNull(), residualRisk:integer("residual_risk").notNull(), controlScope:text("control_scope").notNull(), contractChanges:text("contract_changes").notNull(), slaChanges:text("sla_changes").notNull(), monitoringPlan:text("monitoring_plan").notNull(), owner:text("owner").notNull(), reviewDate:text("review_date").notNull(), recommendation:text("recommendation").notNull(), status:text("status").notNull(), preparedBy:text("prepared_by").notNull(), preparedAt:text("prepared_at").notNull(), evidenceRef:text("evidence_ref"), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), decidedBy:text("decided_by"), decidedAt:text("decided_at"), decisionNote:text("decision_note") }, (table) => [index("security_vendor_reassess_tenant_status_idx").on(table.tenantId, table.status),index("security_vendor_reassess_review_idx").on(table.tenantId, table.reviewDate)]);

export const integrationSettings = sqliteTable("integration_settings", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().unique(),
  provider: text("provider").notNull(),
  enabled: integer("enabled").notNull().default(0),
  configJson: text("config_json").notNull().default("{}"),
  secretCiphertext: text("secret_ciphertext"),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by").notNull(),
}, (table) => [index("integration_settings_kind_idx").on(table.kind)]);

export const integrationEvents = sqliteTable("integration_events", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  action: text("action").notNull(),
  status: text("status").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("integration_events_kind_created_idx").on(table.kind, table.createdAt)]);

export const aiRegulatoryObligations = sqliteTable("ai_regulatory_obligations", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull(),
  profileId: text("profile_id"),
  renewalOfId: text("renewal_of_id"),
  cycleNumber: integer("cycle_number").notNull().default(1),
  framework: text("framework").notNull(),
  obligationCode: text("obligation_code").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  owner: text("owner").notNull(),
  reviewer: text("reviewer").notNull(),
  dueDate: text("due_date").notNull(),
  priority: text("priority").notNull(),
  evidencePlan: text("evidence_plan").notNull(),
  recurringDays: integer("recurring_days").notNull().default(0),
  status: text("status").notNull().default("open"),
  actionNote: text("action_note"),
  evidenceReference: text("evidence_reference"),
  evidenceSha256: text("evidence_sha256"),
  verificationEvidenceReference: text("verification_evidence_reference"),
  verificationEvidenceSha256: text("verification_evidence_sha256"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  submittedBy: text("submitted_by"),
  submittedAt: text("submitted_at"),
  verifiedBy: text("verified_by"),
  verifiedAt: text("verified_at"),
  reopenedBy: text("reopened_by"),
  reopenedAt: text("reopened_at"),
}, (table) => [index("ai_regulatory_obligation_model_status_idx").on(table.modelId, table.status, table.priority, table.dueDate)]);

export const aiAssurancePackages = sqliteTable("ai_assurance_packages", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull(),
  periodDays: integer("period_days").notNull(),
  periodSince: text("period_since").notNull(),
  periodUntil: text("period_until").notNull(),
  schemaVersion: text("schema_version").notNull(),
  manifestJson: text("manifest_json").notNull(),
  manifestSha256: text("manifest_sha256").notNull().unique(),
  signatureAlgorithm: text("signature_algorithm").notNull(),
  signatureValue: text("signature_value").notNull(),
  signingKeyId: text("signing_key_id").notNull(),
  generatedBy: text("generated_by").notNull(),
  generatedAt: text("generated_at").notNull(),
  verificationCount: integer("verification_count").notNull().default(0),
  lastVerifiedBy: text("last_verified_by"),
  lastVerifiedAt: text("last_verified_at"),
}, (table) => [index("ai_assurance_packages_model_date_idx").on(table.modelId, table.generatedAt)]);

export const regulatoryIntelligenceSources = sqliteTable("regulatory_intelligence_sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  authority: text("authority").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  sourceType: text("source_type").notNull(),
  url: text("url").notNull(),
  owner: text("owner").notNull(),
  reviewFrequencyDays: integer("review_frequency_days").notNull(),
  enabled: integer("enabled").notNull().default(1),
  lastCheckedAt: text("last_checked_at"),
  nextCheckAt: text("next_check_at").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("regulatory_sources_url_idx").on(table.url),
  index("regulatory_sources_due_idx").on(table.enabled, table.nextCheckAt),
]);

export const regulatoryChanges = sqliteTable("regulatory_changes", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  externalRef: text("external_ref").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  publishedDate: text("published_date").notNull(),
  effectiveDate: text("effective_date").notNull(),
  severity: text("severity").notNull(),
  changeType: text("change_type").notNull(),
  applicability: text("applicability").notNull().default("undetermined"),
  status: text("status").notNull().default("triage"),
  owner: text("owner").notNull(),
  reviewer: text("reviewer").notNull(),
  applicabilityRationale: text("applicability_rationale"),
  contentSha256: text("content_sha256").notNull(),
  detectedBy: text("detected_by").notNull(),
  detectedAt: text("detected_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  closedBy: text("closed_by"),
  closedAt: text("closed_at"),
  closureNote: text("closure_note"),
}, (table) => [
  uniqueIndex("regulatory_changes_source_ref_idx").on(table.sourceId, table.externalRef),
  index("regulatory_changes_status_effective_idx").on(table.status, table.severity, table.effectiveDate),
]);

export const regulatoryChangeImpacts = sqliteTable("regulatory_change_impacts", {
  id: text("id").primaryKey(),
  changeId: text("change_id").notNull(),
  targetType: text("target_type").notNull(),
  targetRef: text("target_ref").notNull(),
  targetTitle: text("target_title").notNull(),
  impactLevel: text("impact_level").notNull(),
  requiredAction: text("required_action").notNull(),
  actionOwner: text("action_owner").notNull(),
  dueDate: text("due_date").notNull(),
  status: text("status").notNull().default("open"),
  actionNote: text("action_note"),
  evidenceReference: text("evidence_reference"),
  evidenceSha256: text("evidence_sha256"),
  verificationEvidenceReference: text("verification_evidence_reference"),
  verificationEvidenceSha256: text("verification_evidence_sha256"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
  submittedBy: text("submitted_by"),
  submittedAt: text("submitted_at"),
  verifiedBy: text("verified_by"),
  verifiedAt: text("verified_at"),
  reopenedBy: text("reopened_by"),
  reopenedAt: text("reopened_at"),
}, (table) => [
  uniqueIndex("regulatory_impacts_target_idx").on(table.changeId, table.targetType, table.targetRef),
  index("regulatory_impacts_status_due_idx").on(table.status, table.impactLevel, table.dueDate),
]);

export const regulatoryChangeEvents = sqliteTable("regulatory_change_events", {
  id: text("id").primaryKey(),
  changeId: text("change_id"),
  impactId: text("impact_id"),
  sourceId: text("source_id"),
  action: text("action").notNull(),
  detail: text("detail").notNull(),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("regulatory_events_change_date_idx").on(table.changeId, table.createdAt)]);

export const thirdPartyProfiles = sqliteTable("third_party_profiles", {
  vendorId: text("vendor_id").primaryKey(), name: text("name").notNull(), service: text("service").notNull(), legalEntity: text("legal_entity").notNull(), category: text("category").notNull(),
  criticality: text("criticality").notNull(), dataClassification: text("data_classification").notNull(), dataAccess: text("data_access").notNull(), hostingLocation: text("hosting_location").notNull(),
  businessOwner: text("business_owner").notNull(), riskOwner: text("risk_owner").notNull(), reviewer: text("reviewer").notNull(), contact: text("contact").notNull(), contractEnd: text("contract_end").notNull(), nextReview: text("next_review").notNull(), exitPlan: text("exit_plan").notNull(), status: text("status").notNull().default("onboarding"),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("third_party_profiles_status_review_idx").on(table.status, table.criticality, table.nextReview)]);

export const thirdPartyAssessments = sqliteTable("third_party_assessments", {
  id: text("id").primaryKey(), vendorId: text("vendor_id").notNull(), cycleNumber: integer("cycle_number").notNull(), renewalOfId: text("renewal_of_id"), impact: integer("impact").notNull(), likelihood: integer("likelihood").notNull(), controlMaturity: integer("control_maturity").notNull(), questionnaireJson: text("questionnaire_json").notNull(), coverage: integer("coverage").notNull(), inherentScore: integer("inherent_score").notNull(), residualScore: integer("residual_score").notNull(), riskTier: text("risk_tier").notNull(), criticalGapsJson: text("critical_gaps_json").notNull(), treatmentPlan: text("treatment_plan").notNull(), status: text("status").notNull().default("draft"), evidenceReference: text("evidence_reference"), evidenceSha256: text("evidence_sha256"), decisionNote: text("decision_note"), decisionEvidenceReference: text("decision_evidence_reference"), decisionEvidenceSha256: text("decision_evidence_sha256"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(), submittedBy: text("submitted_by"), submittedAt: text("submitted_at"), decidedBy: text("decided_by"), decidedAt: text("decided_at"),
}, (table) => [uniqueIndex("third_party_assessment_cycle_idx").on(table.vendorId, table.cycleNumber), index("third_party_assessment_status_risk_idx").on(table.status, table.riskTier, table.updatedAt)]);

export const thirdPartyFindings = sqliteTable("third_party_findings", {
  id: text("id").primaryKey(), assessmentId: text("assessment_id").notNull(), vendorId: text("vendor_id").notNull(), title: text("title").notNull(), severity: text("severity").notNull(), description: text("description").notNull(), owner: text("owner").notNull(), dueDate: text("due_date").notNull(), status: text("status").notNull().default("open"), actionNote: text("action_note"), evidenceReference: text("evidence_reference"), evidenceSha256: text("evidence_sha256"), verificationEvidenceReference: text("verification_evidence_reference"), verificationEvidenceSha256: text("verification_evidence_sha256"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull(), updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(), submittedBy: text("submitted_by"), submittedAt: text("submitted_at"), verifiedBy: text("verified_by"), verifiedAt: text("verified_at"), reopenedBy: text("reopened_by"), reopenedAt: text("reopened_at"),
}, (table) => [index("third_party_findings_status_due_idx").on(table.status, table.severity, table.dueDate), index("third_party_findings_vendor_idx").on(table.vendorId, table.assessmentId)]);

export const thirdPartyEvents = sqliteTable("third_party_events", {
  id: text("id").primaryKey(), vendorId: text("vendor_id"), assessmentId: text("assessment_id"), findingId: text("finding_id"), action: text("action").notNull(), detail: text("detail").notNull(), actor: text("actor").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("third_party_events_vendor_date_idx").on(table.vendorId, table.createdAt)]);

export const policyDocuments = sqliteTable("policy_documents", {
  id:text("id").primaryKey(), code:text("code").notNull().unique(), title:text("title").notNull(), category:text("category").notNull(), classification:text("classification").notNull(), owner:text("owner").notNull(), reviewer:text("reviewer").notNull(), audience:text("audience").notNull(), reviewFrequencyDays:integer("review_frequency_days").notNull(), status:text("status").notNull().default("draft"), currentVersionId:text("current_version_id"), nextReview:text("next_review"), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), updatedBy:text("updated_by").notNull(), updatedAt:text("updated_at").notNull(), retiredBy:text("retired_by"), retiredAt:text("retired_at"),
}, table=>[index("policy_documents_status_review_idx").on(table.status,table.nextReview,table.category)]);
export const policyVersions = sqliteTable("policy_versions", {
  id:text("id").primaryKey(), policyId:text("policy_id").notNull(), versionNumber:integer("version_number").notNull(), summary:text("summary").notNull(), content:text("content").notNull(), contentSha256:text("content_sha256").notNull(), controlRefsJson:text("control_refs_json").notNull(), regulationRefsJson:text("regulation_refs_json").notNull(), riskRefsJson:text("risk_refs_json").notNull(), effectiveDate:text("effective_date").notNull(), status:text("status").notNull().default("draft"), evidenceReference:text("evidence_reference"), evidenceSha256:text("evidence_sha256"), decisionNote:text("decision_note"), decisionEvidenceReference:text("decision_evidence_reference"), decisionEvidenceSha256:text("decision_evidence_sha256"), createdBy:text("created_by").notNull(), createdAt:text("created_at").notNull(), updatedBy:text("updated_by").notNull(), updatedAt:text("updated_at").notNull(), submittedBy:text("submitted_by"), submittedAt:text("submitted_at"), approvedBy:text("approved_by"), approvedAt:text("approved_at"), publishedBy:text("published_by"), publishedAt:text("published_at"),
}, table=>[uniqueIndex("policy_versions_policy_number_idx").on(table.policyId,table.versionNumber),index("policy_versions_status_date_idx").on(table.status,table.effectiveDate,table.updatedAt)]);
export const policyAttestationCampaigns = sqliteTable("policy_attestation_campaigns", {id:text("id").primaryKey(),policyId:text("policy_id").notNull(),versionId:text("version_id").notNull(),name:text("name").notNull(),audience:text("audience").notNull(),dueDate:text("due_date").notNull(),requiredCount:integer("required_count").notNull(),status:text("status").notNull().default("open"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),closedBy:text("closed_by"),closedAt:text("closed_at")},table=>[index("policy_campaigns_status_due_idx").on(table.status,table.dueDate)]);
export const policyAttestations = sqliteTable("policy_attestations", {id:text("id").primaryKey(),campaignId:text("campaign_id").notNull(),subjectEmail:text("subject_email").notNull(),status:text("status").notNull().default("pending"),note:text("note"),contentSha256:text("content_sha256"),attestedAt:text("attested_at"),updatedAt:text("updated_at").notNull()},table=>[uniqueIndex("policy_attestations_campaign_subject_idx").on(table.campaignId,table.subjectEmail)]);
export const policyExceptions = sqliteTable("policy_exceptions", {id:text("id").primaryKey(),policyId:text("policy_id").notNull(),versionId:text("version_id").notNull(),scope:text("scope").notNull(),rationale:text("rationale").notNull(),compensatingControl:text("compensating_control").notNull(),owner:text("owner").notNull(),reviewer:text("reviewer").notNull(),expiresAt:text("expires_at").notNull(),status:text("status").notNull().default("draft"),decisionNote:text("decision_note"),evidenceReference:text("evidence_reference"),evidenceSha256:text("evidence_sha256"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),submittedBy:text("submitted_by"),submittedAt:text("submitted_at"),decidedBy:text("decided_by"),decidedAt:text("decided_at"),closedBy:text("closed_by"),closedAt:text("closed_at")},table=>[index("policy_exceptions_status_expiry_idx").on(table.status,table.expiresAt)]);
export const policyEvents = sqliteTable("policy_events", {id:text("id").primaryKey(),policyId:text("policy_id"),versionId:text("version_id"),campaignId:text("campaign_id"),exceptionId:text("exception_id"),action:text("action").notNull(),detail:text("detail").notNull(),actor:text("actor").notNull(),createdAt:text("created_at").notNull()},table=>[index("policy_events_policy_date_idx").on(table.policyId,table.createdAt)]);

export const riskAppetiteStatements = sqliteTable("risk_appetite_statements", {id:text("id").primaryKey(),code:text("code").notNull().unique(),category:text("category").notNull(),statement:text("statement").notNull(),kriName:text("kri_name").notNull(),metricUnit:text("metric_unit").notNull(),direction:text("direction").notNull(),appetiteTarget:real("appetite_target").notNull(),warningThreshold:real("warning_threshold").notNull(),breachThreshold:real("breach_threshold").notNull(),owner:text("owner").notNull(),reviewer:text("reviewer").notNull(),frequencyDays:integer("frequency_days").notNull(),validFrom:text("valid_from").notNull(),validUntil:text("valid_until").notNull(),status:text("status").notNull().default("draft"),nextMeasurement:text("next_measurement"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),submittedBy:text("submitted_by"),submittedAt:text("submitted_at"),decidedBy:text("decided_by"),decidedAt:text("decided_at"),decisionNote:text("decision_note"),retiredBy:text("retired_by"),retiredAt:text("retired_at")},table=>[index("risk_appetite_status_due_idx").on(table.status,table.nextMeasurement,table.category)]);
export const riskKriMeasurements = sqliteTable("risk_kri_measurements", {id:text("id").primaryKey(),appetiteId:text("appetite_id").notNull(),periodStart:text("period_start").notNull(),periodEnd:text("period_end").notNull(),value:real("value").notNull(),band:text("band").notNull(),sourceRef:text("source_ref").notNull(),evidenceSha256:text("evidence_sha256").notNull(),note:text("note").notNull(),recordedBy:text("recorded_by").notNull(),recordedAt:text("recorded_at").notNull()},table=>[uniqueIndex("risk_kri_period_idx").on(table.appetiteId,table.periodEnd),index("risk_kri_band_date_idx").on(table.band,table.periodEnd)]);
export const riskKriBreaches = sqliteTable("risk_kri_breaches", {id:text("id").primaryKey(),appetiteId:text("appetite_id").notNull(),measurementId:text("measurement_id").notNull().unique(),severity:text("severity").notNull(),responseOwner:text("response_owner"),responsePlan:text("response_plan"),dueDate:text("due_date"),status:text("status").notNull().default("open"),evidenceReference:text("evidence_reference"),evidenceSha256:text("evidence_sha256"),detectedBy:text("detected_by").notNull(),detectedAt:text("detected_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),submittedBy:text("submitted_by"),submittedAt:text("submitted_at"),verifiedBy:text("verified_by"),verifiedAt:text("verified_at"),reopenedBy:text("reopened_by"),reopenedAt:text("reopened_at")},table=>[index("risk_kri_breaches_status_due_idx").on(table.status,table.severity,table.dueDate)]);
export const riskAppetiteScenarios = sqliteTable("risk_appetite_scenarios", {id:text("id").primaryKey(),appetiteId:text("appetite_id").notNull(),name:text("name").notNull(),horizonDays:integer("horizon_days").notNull(),baselineValue:real("baseline_value").notNull(),stressedValue:real("stressed_value").notNull(),forecastValue:real("forecast_value").notNull(),confidence:integer("confidence").notNull(),assumptions:text("assumptions").notNull(),treatmentPlan:text("treatment_plan").notNull(),owner:text("owner").notNull(),reviewer:text("reviewer").notNull(),dueDate:text("due_date").notNull(),status:text("status").notNull().default("draft"),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedBy:text("updated_by").notNull(),updatedAt:text("updated_at").notNull(),submittedBy:text("submitted_by"),submittedAt:text("submitted_at"),verifiedBy:text("verified_by"),verifiedAt:text("verified_at"),verificationNote:text("verification_note"),evidenceReference:text("evidence_reference"),evidenceSha256:text("evidence_sha256")},table=>[index("risk_appetite_scenarios_status_due_idx").on(table.status,table.dueDate)]);
export const riskBoardSnapshots = sqliteTable("risk_board_snapshots", {id:text("id").primaryKey(),period:text("period").notNull(),title:text("title").notNull(),reviewer:text("reviewer").notNull(),snapshotJson:text("snapshot_json").notNull(),snapshotSha256:text("snapshot_sha256").notNull().unique(),status:text("status").notNull().default("draft"),preparedBy:text("prepared_by").notNull(),preparedAt:text("prepared_at").notNull(),approvedBy:text("approved_by"),approvedAt:text("approved_at"),approvalNote:text("approval_note"),evidenceReference:text("evidence_reference"),evidenceSha256:text("evidence_sha256")},table=>[index("risk_board_snapshots_status_period_idx").on(table.status,table.period)]);
export const riskAppetiteEvents = sqliteTable("risk_appetite_events", {id:text("id").primaryKey(),appetiteId:text("appetite_id"),measurementId:text("measurement_id"),breachId:text("breach_id"),scenarioId:text("scenario_id"),snapshotId:text("snapshot_id"),action:text("action").notNull(),detail:text("detail").notNull(),actor:text("actor").notNull(),createdAt:text("created_at").notNull()},table=>[index("risk_appetite_events_entity_date_idx").on(table.appetiteId,table.createdAt)]);
