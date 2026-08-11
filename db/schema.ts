import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const simpleGrcRecords = sqliteTable("simple_grc_records", {
  id: text("id").primaryKey(),
  module: text("module").notNull(),
  dataJson: text("data_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("simple_grc_records_module_idx").on(table.module, table.updatedAt)]);

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
