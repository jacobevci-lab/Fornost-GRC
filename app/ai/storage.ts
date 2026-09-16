import { cleanAiText } from "./security";

export type AiProviderKind = "openai-compatible" | "ollama";

export type AiSettingsRow = {
  id: string;
  provider: AiProviderKind;
  base_url: string;
  model: string;
  enabled: number;
  config_json: string;
  secret_ciphertext: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string;
};

const settingsSql = `CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  secret_ciphertext TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
)`;

const auditSql = `CREATE TABLE IF NOT EXISTS ai_activity_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT,
  context_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

const draftsSql = `CREATE TABLE IF NOT EXISTS ai_action_drafts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  rationale TEXT NOT NULL,
  source_refs_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT,
  created_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const draftsStatusIndexSql = "CREATE INDEX IF NOT EXISTS ai_action_drafts_status_idx ON ai_action_drafts(status,created_at)";
const draftsCreatorIndexSql = "CREATE INDEX IF NOT EXISTS ai_action_drafts_creator_idx ON ai_action_drafts(created_by,created_at)";
const draftEventsSql = `CREATE TABLE IF NOT EXISTS ai_draft_events (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;
const draftEventsIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_events_draft_idx ON ai_draft_events(draft_id,created_at)";
const draftPublicationsSql = `CREATE TABLE IF NOT EXISTS ai_draft_publications (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  record_id TEXT NOT NULL,
  module TEXT NOT NULL,
  publication_note TEXT NOT NULL,
  published_by TEXT NOT NULL,
  published_at TEXT NOT NULL
)`;
const draftPublicationsRecordIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_publications_record_idx ON ai_draft_publications(record_id,published_at)";
const draftTicketsSql = `CREATE TABLE IF NOT EXISTS ai_draft_tickets (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL UNIQUE,
  provider TEXT,
  external_id TEXT,
  external_url TEXT,
  status TEXT NOT NULL,
  publication_note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  last_error TEXT
)`;
const draftTicketsStatusIndexSql = "CREATE INDEX IF NOT EXISTS ai_draft_tickets_status_idx ON ai_draft_tickets(status,created_at)";
const fallbackSql = `CREATE TABLE IF NOT EXISTS ai_provider_fallbacks (
  id TEXT PRIMARY KEY, provider TEXT NOT NULL, base_url TEXT NOT NULL, model TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0, config_json TEXT NOT NULL DEFAULT '{}', secret_ciphertext TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
)`;
const providerHealthSql = `CREATE TABLE IF NOT EXISTS ai_provider_health (
  id TEXT PRIMARY KEY, profile TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  operation TEXT NOT NULL, status TEXT NOT NULL, latency_ms INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const providerHealthIndexSql = "CREATE INDEX IF NOT EXISTS ai_provider_health_created_idx ON ai_provider_health(created_at,status)";
const useCasesSql = `CREATE TABLE IF NOT EXISTS ai_use_cases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, purpose TEXT NOT NULL, owner TEXT NOT NULL,
  data_classification TEXT NOT NULL, impact_level TEXT NOT NULL, decision_role TEXT NOT NULL,
  controls_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'draft', review_date TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, decision_note TEXT
)`;
const useCasesIndexSql = "CREATE INDEX IF NOT EXISTS ai_use_cases_status_review_idx ON ai_use_cases(status,review_date)";
const evalCasesSql = `CREATE TABLE IF NOT EXISTS ai_eval_cases (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, input_text TEXT NOT NULL, expected_terms_json TEXT NOT NULL DEFAULT '[]',
  forbidden_terms_json TEXT NOT NULL DEFAULT '[]', max_latency_ms INTEGER NOT NULL DEFAULT 30000,
  enabled INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const evalRunsSql = `CREATE TABLE IF NOT EXISTS ai_eval_runs (
  id TEXT PRIMARY KEY, case_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  status TEXT NOT NULL, score INTEGER NOT NULL, latency_ms INTEGER NOT NULL,
  output_hash TEXT, failure_reason TEXT NOT NULL, run_by TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const evalRunsIndexSql = "CREATE INDEX IF NOT EXISTS ai_eval_runs_case_created_idx ON ai_eval_runs(case_id,created_at)";
const agentRunsSql = `CREATE TABLE IF NOT EXISTS ai_agent_runs (
  id TEXT PRIMARY KEY, agent_kind TEXT NOT NULL, objective TEXT NOT NULL, status TEXT NOT NULL,
  report_json TEXT NOT NULL, source_refs_json TEXT NOT NULL DEFAULT '[]', output_hash TEXT,
  provider TEXT NOT NULL, model TEXT NOT NULL, provider_profile TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  completed_at TEXT, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT
)`;
const agentRunsIndexSql = "CREATE INDEX IF NOT EXISTS ai_agent_runs_status_created_idx ON ai_agent_runs(status,created_at)";
const agentDraftLinksSql = `CREATE TABLE IF NOT EXISTS ai_agent_draft_links (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, finding_id TEXT NOT NULL, draft_id TEXT NOT NULL UNIQUE,
  conversion_note TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(run_id,finding_id)
)`;
const agentDraftLinksIndexSql = "CREATE INDEX IF NOT EXISTS ai_agent_draft_links_run_idx ON ai_agent_draft_links(run_id,created_at)";
const knowledgeSourcesSql = `CREATE TABLE IF NOT EXISTS ai_knowledge_sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source_type TEXT NOT NULL, classification TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft', current_version INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL, character_count INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
  approved_by TEXT, approved_at TEXT, decision_note TEXT
)`;
const knowledgeSourcesIndexSql = "CREATE INDEX IF NOT EXISTS ai_knowledge_sources_status_updated_idx ON ai_knowledge_sources(status,updated_at)";
const knowledgeGovernanceSql = `CREATE TABLE IF NOT EXISTS ai_knowledge_governance (
  source_id TEXT PRIMARY KEY, owner TEXT NOT NULL, review_due_at TEXT NOT NULL,
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const knowledgeGovernanceIndexSql = "CREATE INDEX IF NOT EXISTS ai_knowledge_governance_review_idx ON ai_knowledge_governance(review_due_at)";
const knowledgeVersionsSql = `CREATE TABLE IF NOT EXISTS ai_knowledge_versions (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, version INTEGER NOT NULL, content_hash TEXT NOT NULL,
  normalized_content TEXT NOT NULL, character_count INTEGER NOT NULL, chunk_count INTEGER NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(source_id,version)
)`;
const knowledgeVersionsIndexSql = "CREATE INDEX IF NOT EXISTS ai_knowledge_versions_source_idx ON ai_knowledge_versions(source_id,version)";
const knowledgeChunksSql = `CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, version INTEGER NOT NULL, ordinal INTEGER NOT NULL,
  content_text TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(source_id,version,ordinal)
)`;
const knowledgeChunksIndexSql = "CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_source_idx ON ai_knowledge_chunks(source_id,version,ordinal)";
const feedbackSql = `CREATE TABLE IF NOT EXISTS ai_feedback (
  id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  comment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', assigned_to TEXT,
  resolution_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_by TEXT, resolved_at TEXT,
  UNIQUE(activity_id,created_by)
)`;
const feedbackStatusIndexSql = "CREATE INDEX IF NOT EXISTS ai_feedback_status_severity_created_idx ON ai_feedback(status,severity,created_at)";
const feedbackCreatorIndexSql = "CREATE INDEX IF NOT EXISTS ai_feedback_creator_created_idx ON ai_feedback(created_by,created_at)";
const budgetPoliciesSql = `CREATE TABLE IF NOT EXISTS ai_budget_policies (
  profile TEXT PRIMARY KEY, monthly_token_limit INTEGER NOT NULL DEFAULT 0,
  warn_percent INTEGER NOT NULL DEFAULT 80, hard_limit INTEGER NOT NULL DEFAULT 0,
  prompt_cost_per_million REAL NOT NULL DEFAULT 0, completion_cost_per_million REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const usageLedgerSql = `CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, operation TEXT NOT NULL, profile TEXT NOT NULL,
  provider TEXT NOT NULL, model TEXT NOT NULL, prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0, estimated_cost_microunits INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD', metered INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
)`;
const usageProfileIndexSql = "CREATE INDEX IF NOT EXISTS ai_usage_ledger_profile_created_idx ON ai_usage_ledger(profile,created_at)";
const usageCreatedIndexSql = "CREATE INDEX IF NOT EXISTS ai_usage_ledger_created_idx ON ai_usage_ledger(created_at)";
const operatingPolicySql = `CREATE TABLE IF NOT EXISTS ai_operating_policy (
  id TEXT PRIMARY KEY, emergency_stop INTEGER NOT NULL DEFAULT 0,
  chat_enabled INTEGER NOT NULL DEFAULT 1, drafts_enabled INTEGER NOT NULL DEFAULT 1,
  agents_enabled INTEGER NOT NULL DEFAULT 1, retrieval_enabled INTEGER NOT NULL DEFAULT 1,
  evaluations_enabled INTEGER NOT NULL DEFAULT 1, viewer_chat INTEGER NOT NULL DEFAULT 1,
  editor_chat INTEGER NOT NULL DEFAULT 1, maintenance_message TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const dataProtectionPolicySql = `CREATE TABLE IF NOT EXISTS ai_data_protection_policy (
  id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'redact',
  redact_tckn INTEGER NOT NULL DEFAULT 1, redact_iban INTEGER NOT NULL DEFAULT 1,
  redact_payment_card INTEGER NOT NULL DEFAULT 1, redact_email INTEGER NOT NULL DEFAULT 1,
  redact_phone INTEGER NOT NULL DEFAULT 1, injection_detection INTEGER NOT NULL DEFAULT 1,
  injection_action TEXT NOT NULL DEFAULT 'neutralize', updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const dataProtectionEventsSql = `CREATE TABLE IF NOT EXISTS ai_data_protection_events (
  id TEXT PRIMARY KEY, actor TEXT NOT NULL, operation TEXT NOT NULL, direction TEXT NOT NULL,
  action TEXT NOT NULL, categories_json TEXT NOT NULL DEFAULT '[]', finding_count INTEGER NOT NULL DEFAULT 0,
  event_hash TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const dataProtectionEventsIndexSql="CREATE INDEX IF NOT EXISTS ai_data_protection_events_created_idx ON ai_data_protection_events(created_at,action)";
const modelInventorySql=`CREATE TABLE IF NOT EXISTS ai_model_inventory (
 id TEXT PRIMARY KEY, system_name TEXT NOT NULL, model_name TEXT NOT NULL, vendor TEXT NOT NULL,
 purpose TEXT NOT NULL, owner TEXT NOT NULL, deployment TEXT NOT NULL, region TEXT NOT NULL,
 data_classification TEXT NOT NULL, autonomy TEXT NOT NULL, affected_users INTEGER NOT NULL DEFAULT 0,
 impact INTEGER NOT NULL, likelihood INTEGER NOT NULL, data_sensitivity INTEGER NOT NULL,
 autonomy_risk INTEGER NOT NULL, control_maturity INTEGER NOT NULL, inherent_score INTEGER NOT NULL,
 residual_score INTEGER NOT NULL, risk_tier TEXT NOT NULL, controls TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', review_date TEXT NOT NULL, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, decision_note TEXT
)`;
const modelInventoryIndexSql="CREATE INDEX IF NOT EXISTS ai_model_inventory_status_risk_idx ON ai_model_inventory(status,risk_tier,review_date)";
const aiControlAssessmentsSql=`CREATE TABLE IF NOT EXISTS ai_control_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, framework TEXT NOT NULL, control_id TEXT NOT NULL,
 domain TEXT NOT NULL, title TEXT NOT NULL, requirement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'not-started',
 owner TEXT NOT NULL, due_date TEXT NOT NULL, evidence TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(model_id,framework,control_id)
)`;
const aiControlAssessmentsIndexSql="CREATE INDEX IF NOT EXISTS ai_control_assessments_model_status_idx ON ai_control_assessments(model_id,status,due_date)";
const aiModelChangesSql=`CREATE TABLE IF NOT EXISTS ai_model_changes (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_type TEXT NOT NULL, from_version TEXT NOT NULL,
 to_version TEXT NOT NULL, summary TEXT NOT NULL, risk_impact TEXT NOT NULL, rollback_plan TEXT NOT NULL,
 test_evidence TEXT NOT NULL DEFAULT '', planned_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 decision_note TEXT, approved_by TEXT, approved_at TEXT, deployed_by TEXT, deployed_at TEXT
)`;
const aiModelChangesIndexSql="CREATE INDEX IF NOT EXISTS ai_model_changes_model_status_idx ON ai_model_changes(model_id,status,planned_date)";
const aiModelMonitoringSql=`CREATE TABLE IF NOT EXISTS ai_model_monitoring (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, accuracy REAL NOT NULL, error_rate REAL NOT NULL,
 drift_score REAL NOT NULL, bias_score REAL NOT NULL, p95_latency_ms INTEGER NOT NULL,
 sample_size INTEGER NOT NULL, health TEXT NOT NULL, alerts_json TEXT NOT NULL DEFAULT '[]',
 note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL
)`;
const aiModelMonitoringIndexSql="CREATE INDEX IF NOT EXISTS ai_model_monitoring_model_created_idx ON ai_model_monitoring(model_id,recorded_at)";
const aiIncidentsSql=`CREATE TABLE IF NOT EXISTS ai_incidents (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_id TEXT, type TEXT NOT NULL, severity TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL, detected_by TEXT NOT NULL, impact TEXT NOT NULL,
 personal_data INTEGER NOT NULL DEFAULT 0, regulatory_impact INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'open', owner TEXT, sla_due_at TEXT NOT NULL, containment TEXT,
 root_cause TEXT, corrective_action TEXT, notification_decision TEXT, decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 resolved_by TEXT, resolved_at TEXT
)`;
const aiIncidentsIndexSql="CREATE INDEX IF NOT EXISTS ai_incidents_status_severity_idx ON ai_incidents(status,severity,sla_due_at)";
const aiIncidentEventsSql=`CREATE TABLE IF NOT EXISTS ai_incident_events (
 id TEXT PRIMARY KEY, incident_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL,
 detail TEXT NOT NULL, created_at TEXT NOT NULL
)`;
const aiIncidentEventsIndexSql="CREATE INDEX IF NOT EXISTS ai_incident_events_incident_idx ON ai_incident_events(incident_id,created_at)";
const aiEvidenceSql=`CREATE TABLE IF NOT EXISTS ai_evidence (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, control_id TEXT, change_id TEXT, incident_id TEXT,
 evidence_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, source TEXT NOT NULL,
 collection_method TEXT NOT NULL, classification TEXT NOT NULL, owner TEXT NOT NULL,
 expected_sha256 TEXT NOT NULL, integrity_status TEXT NOT NULL DEFAULT 'pending', verified_at TEXT,
 collected_at TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, decision_note TEXT
)`;
const aiEvidenceIndexSql="CREATE INDEX IF NOT EXISTS ai_evidence_model_status_idx ON ai_evidence(model_id,status,valid_until)";
const aiRisksSql=`CREATE TABLE IF NOT EXISTS ai_risks (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, incident_id TEXT, change_id TEXT,
 category TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, cause TEXT NOT NULL,
 consequence TEXT NOT NULL, owner TEXT NOT NULL, likelihood INTEGER NOT NULL, impact INTEGER NOT NULL,
 control_effectiveness INTEGER NOT NULL, inherent_score INTEGER NOT NULL, residual_score INTEGER NOT NULL,
 risk_tier TEXT NOT NULL, treatment TEXT NOT NULL, treatment_plan TEXT NOT NULL,
 treatment_owner TEXT NOT NULL, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 acceptance_expiry TEXT, decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
)`;
const aiRisksIndexSql="CREATE INDEX IF NOT EXISTS ai_risks_model_status_idx ON ai_risks(model_id,status,risk_tier,due_date)";
const aiVendorAssessmentsSql=`CREATE TABLE IF NOT EXISTS ai_vendor_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, risk_id TEXT, service_name TEXT NOT NULL,
 legal_entity TEXT NOT NULL, service_owner TEXT NOT NULL, data_locations TEXT NOT NULL,
 subprocessors TEXT NOT NULL, certifications TEXT NOT NULL, sla TEXT NOT NULL, exit_plan TEXT NOT NULL,
 contract_end TEXT NOT NULL, review_date TEXT NOT NULL, breach_hours INTEGER NOT NULL,
 dpa INTEGER NOT NULL, training_opt_out INTEGER NOT NULL, deletion_commitment INTEGER NOT NULL,
 audit_rights INTEGER NOT NULL, security_exhibit INTEGER NOT NULL, bcdr INTEGER NOT NULL,
 subprocessor_notice INTEGER NOT NULL, data_portability INTEGER NOT NULL, assurance_score INTEGER NOT NULL,
 assurance_tier TEXT NOT NULL, gaps TEXT NOT NULL, critical_gaps TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
)`;
const aiVendorAssessmentsIndexSql="CREATE INDEX IF NOT EXISTS ai_vendor_model_status_idx ON ai_vendor_assessments(model_id,status,review_date)";
const aiAccessAssignmentsSql=`CREATE TABLE IF NOT EXISTS ai_access_assignments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, principal_type TEXT NOT NULL, principal TEXT NOT NULL,
 display_name TEXT NOT NULL, access_level TEXT NOT NULL, data_scope TEXT NOT NULL, purpose TEXT NOT NULL,
 owner TEXT NOT NULL, mfa INTEGER NOT NULL, conditional_access INTEGER NOT NULL, jit INTEGER NOT NULL,
 managed_identity INTEGER NOT NULL, key_rotation_days INTEGER NOT NULL, risk_score INTEGER NOT NULL,
 risk_tier TEXT NOT NULL, last_used TEXT NOT NULL, expires_at TEXT NOT NULL, review_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', review_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, certified_by TEXT, certified_at TEXT
)`;
const aiAccessPrincipalIndexSql="CREATE UNIQUE INDEX IF NOT EXISTS ai_access_model_principal_idx ON ai_access_assignments(model_id,principal)";
const aiAccessReviewIndexSql="CREATE INDEX IF NOT EXISTS ai_access_review_idx ON ai_access_assignments(status,review_date,expires_at)";
const aiReleaseGatesSql=`CREATE TABLE IF NOT EXISTS ai_release_gates (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, change_id TEXT NOT NULL, version TEXT NOT NULL,
 environment TEXT NOT NULL, release_owner TEXT NOT NULL, rollback_owner TEXT NOT NULL,
 rollback_plan TEXT NOT NULL, planned_at TEXT NOT NULL, readiness_score INTEGER NOT NULL,
 checks_json TEXT NOT NULL, blockers_json TEXT NOT NULL, snapshot_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested', decision_note TEXT, valid_until TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
)`;
const aiReleaseGatesIndexSql="CREATE INDEX IF NOT EXISTS ai_release_gate_model_status_idx ON ai_release_gates(model_id,status,planned_at)";
const aiImpactAssessmentsSql=`CREATE TABLE IF NOT EXISTS ai_impact_assessments (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, risk_id TEXT, assessment_type TEXT NOT NULL,
 title TEXT NOT NULL, context TEXT NOT NULL, affected_groups TEXT NOT NULL, jurisdictions TEXT NOT NULL,
 necessity TEXT NOT NULL, proportionality TEXT NOT NULL, mitigations TEXT NOT NULL,
 monitoring_plan TEXT NOT NULL, consultation TEXT NOT NULL, owner TEXT NOT NULL, dpo TEXT NOT NULL,
 privacy INTEGER NOT NULL, fundamental_rights INTEGER NOT NULL, safety INTEGER NOT NULL,
 workforce INTEGER NOT NULL, vulnerable_groups INTEGER NOT NULL, autonomy INTEGER NOT NULL,
 scale INTEGER NOT NULL, control_maturity INTEGER NOT NULL, personal_data INTEGER NOT NULL,
 special_category_data INTEGER NOT NULL, automated_decision INTEGER NOT NULL, children INTEGER NOT NULL,
 workers INTEGER NOT NULL, public_services INTEGER NOT NULL, has_transparency INTEGER NOT NULL,
 has_human_oversight INTEGER NOT NULL, has_appeal INTEGER NOT NULL, dpo_consulted INTEGER NOT NULL,
 inherent_score INTEGER NOT NULL, residual_score INTEGER NOT NULL, impact_tier TEXT NOT NULL,
 critical_gaps TEXT NOT NULL, review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
)`;
const aiImpactAssessmentsIndexSql="CREATE INDEX IF NOT EXISTS ai_impact_model_status_idx ON ai_impact_assessments(model_id,status,review_date)";
const aiResiliencePlansSql=`CREATE TABLE IF NOT EXISTS ai_resilience_plans (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, scenario TEXT NOT NULL, owner TEXT NOT NULL,
 technical_owner TEXT NOT NULL, rto_minutes INTEGER NOT NULL, rpo_minutes INTEGER NOT NULL,
 max_degraded_minutes INTEGER NOT NULL, fallback_plan TEXT NOT NULL, manual_plan TEXT NOT NULL,
 shutdown_procedure TEXT NOT NULL, communication_plan TEXT NOT NULL, dependencies TEXT NOT NULL,
 next_exercise TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, UNIQUE(model_id,scenario)
)`;
const aiResiliencePlansIndexSql="CREATE INDEX IF NOT EXISTS ai_resilience_plan_review_idx ON ai_resilience_plans(model_id,status,next_exercise)";
const aiResilienceExercisesSql=`CREATE TABLE IF NOT EXISTS ai_resilience_exercises (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, model_id TEXT NOT NULL, actual_recovery_minutes INTEGER NOT NULL,
 actual_data_loss_minutes INTEGER NOT NULL, kill_switch_passed INTEGER NOT NULL, fallback_passed INTEGER NOT NULL,
 manual_mode_passed INTEGER NOT NULL, communication_passed INTEGER NOT NULL, score INTEGER NOT NULL,
 result TEXT NOT NULL, checks_json TEXT NOT NULL, critical_failures TEXT NOT NULL, findings TEXT NOT NULL,
 corrective_actions TEXT NOT NULL, exercised_at TEXT NOT NULL, next_retest TEXT NOT NULL,
 recorded_by TEXT NOT NULL, recorded_at TEXT NOT NULL
)`;
const aiResilienceExercisesIndexSql="CREATE INDEX IF NOT EXISTS ai_resilience_exercise_model_idx ON ai_resilience_exercises(model_id,result,exercised_at)";
const aiDatasetsSql=`CREATE TABLE IF NOT EXISTS ai_datasets (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, name TEXT NOT NULL, version TEXT NOT NULL, purpose TEXT NOT NULL,
 source_type TEXT NOT NULL, source_owner TEXT NOT NULL, provenance TEXT NOT NULL, license TEXT NOT NULL,
 legal_basis TEXT NOT NULL, data_classification TEXT NOT NULL, personal_data INTEGER NOT NULL DEFAULT 0,
 special_category INTEGER NOT NULL DEFAULT 0, consent_required INTEGER NOT NULL DEFAULT 0,
 consent_verified INTEGER NOT NULL DEFAULT 0, retention_days INTEGER NOT NULL, records INTEGER NOT NULL,
 quality_score INTEGER NOT NULL, bias_score INTEGER NOT NULL, documentation TEXT NOT NULL, review_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', blockers_json TEXT NOT NULL DEFAULT '[]', decision_note TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT, UNIQUE(model_id,name,version)
)`;
const aiDatasetsIndexSql="CREATE INDEX IF NOT EXISTS ai_dataset_model_review_idx ON ai_datasets(model_id,status,review_date)";
const aiRegulatoryProfilesSql=`CREATE TABLE IF NOT EXISTS ai_regulatory_profiles (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, classification TEXT NOT NULL, jurisdictions TEXT NOT NULL,
 provider_role INTEGER NOT NULL DEFAULT 0, deployer_role INTEGER NOT NULL DEFAULT 0, importer_role INTEGER NOT NULL DEFAULT 0,
 distributor_role INTEGER NOT NULL DEFAULT 0, personal_data INTEGER NOT NULL DEFAULT 0, automated_decision INTEGER NOT NULL DEFAULT 0,
 public_interaction INTEGER NOT NULL DEFAULT 0, high_impact INTEGER NOT NULL DEFAULT 0, owner TEXT NOT NULL,
 legal_reviewer TEXT NOT NULL, classification_rationale TEXT NOT NULL, transparency_notice TEXT NOT NULL,
 human_oversight TEXT NOT NULL, obligations_json TEXT NOT NULL, completed_keys_json TEXT NOT NULL, gaps_json TEXT NOT NULL,
 review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT
)`;
const aiRegulatoryProfilesIndexSql="CREATE INDEX IF NOT EXISTS ai_regulatory_status_review_idx ON ai_regulatory_profiles(status,review_date)";
const aiRegulatoryObligationsSql=`CREATE TABLE IF NOT EXISTS ai_regulatory_obligations (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, profile_id TEXT, renewal_of_id TEXT,
 cycle_number INTEGER NOT NULL DEFAULT 1, framework TEXT NOT NULL,
 obligation_code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, owner TEXT NOT NULL,
 reviewer TEXT NOT NULL, due_date TEXT NOT NULL, priority TEXT NOT NULL, evidence_plan TEXT NOT NULL,
 recurring_days INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open', action_note TEXT,
 evidence_reference TEXT, evidence_sha256 TEXT, verification_evidence_reference TEXT,
 verification_evidence_sha256 TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_by TEXT, submitted_at TEXT,
 verified_by TEXT, verified_at TEXT, reopened_by TEXT, reopened_at TEXT
)`;
const aiRegulatoryObligationsIndexSql="CREATE INDEX IF NOT EXISTS ai_regulatory_obligation_model_status_idx ON ai_regulatory_obligations(model_id,status,priority,due_date)";
const aiRegulatoryObligationsRenewalIndexSql="CREATE INDEX IF NOT EXISTS ai_regulatory_obligation_renewal_idx ON ai_regulatory_obligations(renewal_of_id,cycle_number)";
const aiRegulatoryObligationsUniqueSql="CREATE UNIQUE INDEX IF NOT EXISTS ai_regulatory_obligation_open_unique_idx ON ai_regulatory_obligations(model_id,framework,obligation_code) WHERE status!='completed'";
const aiLiteracyRecordsSql=`CREATE TABLE IF NOT EXISTS ai_literacy_records (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, principal TEXT NOT NULL, display_name TEXT NOT NULL, operator_role TEXT NOT NULL,
 manager TEXT NOT NULL, required_modules_json TEXT NOT NULL, completed_modules_json TEXT NOT NULL, missing_json TEXT NOT NULL,
 score INTEGER NOT NULL, attested INTEGER NOT NULL, limitations_acknowledged INTEGER NOT NULL,
 incident_duty_acknowledged INTEGER NOT NULL, trained_at TEXT NOT NULL, valid_until TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT, UNIQUE(model_id,principal,operator_role)
)`;
const aiLiteracyRecordsIndexSql="CREATE INDEX IF NOT EXISTS ai_literacy_model_validity_idx ON ai_literacy_records(model_id,status,valid_until)";
const aiModelArtifactsSql=`CREATE TABLE IF NOT EXISTS ai_model_artifacts (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, version TEXT NOT NULL, artifact_type TEXT NOT NULL, source TEXT NOT NULL,
 supplier TEXT NOT NULL, sha256 TEXT NOT NULL, signature_verified INTEGER NOT NULL, signature_issuer TEXT NOT NULL,
 license TEXT NOT NULL, sbom_reference TEXT NOT NULL, scanner TEXT NOT NULL, scan_date TEXT NOT NULL,
 malware_clean INTEGER NOT NULL, critical_vulnerabilities INTEGER NOT NULL, high_vulnerabilities INTEGER NOT NULL,
 unsafe_formats INTEGER NOT NULL, reproducible INTEGER NOT NULL, provenance TEXT NOT NULL, valid_until TEXT NOT NULL,
 blockers_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 UNIQUE(model_id,version,sha256)
)`;
const aiModelArtifactsIndexSql="CREATE INDEX IF NOT EXISTS ai_model_artifact_release_idx ON ai_model_artifacts(model_id,status,valid_until)";
const aiRedTeamCampaignsSql=`CREATE TABLE IF NOT EXISTS ai_red_team_campaigns (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL, methodology TEXT NOT NULL,
 lead TEXT NOT NULL, independent_tester TEXT NOT NULL, environment TEXT NOT NULL, categories_json TEXT NOT NULL,
 planned_at TEXT NOT NULL, completed_at TEXT NOT NULL, total_tests INTEGER NOT NULL, passed_tests INTEGER NOT NULL,
 pass_rate INTEGER NOT NULL, critical_findings INTEGER NOT NULL, high_findings INTEGER NOT NULL, medium_findings INTEGER NOT NULL,
 report_reference TEXT NOT NULL, remediation_plan TEXT NOT NULL, retest_at TEXT NOT NULL, blockers_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
 updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT, UNIQUE(model_id,name,completed_at)
)`;
const aiRedTeamCampaignsIndexSql="CREATE INDEX IF NOT EXISTS ai_red_team_release_idx ON ai_red_team_campaigns(model_id,status,retest_at)";
const aiTransparencyProfilesSql=`CREATE TABLE IF NOT EXISTS ai_transparency_profiles (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, intended_use TEXT NOT NULL, prohibited_uses TEXT NOT NULL,
 capabilities TEXT NOT NULL, limitations TEXT NOT NULL, explanation_method TEXT NOT NULL, human_oversight TEXT NOT NULL,
 notice_text TEXT NOT NULL, appeal_channel TEXT NOT NULL, owner TEXT NOT NULL, affected_groups TEXT NOT NULL,
 languages_json TEXT NOT NULL, review_date TEXT NOT NULL, gaps_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT
)`;
const aiTransparencyProfilesIndexSql="CREATE INDEX IF NOT EXISTS ai_transparency_review_idx ON ai_transparency_profiles(status,review_date)";
const aiOversightEventsSql=`CREATE TABLE IF NOT EXISTS ai_oversight_events (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, decision_reference TEXT NOT NULL, action TEXT NOT NULL, severity TEXT NOT NULL,
 reason TEXT NOT NULL, outcome TEXT NOT NULL, control_owner TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
 resolution_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, resolved_by TEXT, resolved_at TEXT,
 UNIQUE(model_id,decision_reference,action)
)`;
const aiOversightEventsIndexSql="CREATE INDEX IF NOT EXISTS ai_oversight_status_idx ON ai_oversight_events(model_id,status,severity,created_at)";
const aiAssurancePoliciesSql=`CREATE TABLE IF NOT EXISTS ai_assurance_policies (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, min_accuracy REAL NOT NULL,
 max_error_rate REAL NOT NULL, max_drift_score REAL NOT NULL, max_bias_score REAL NOT NULL,
 max_p95_latency_ms INTEGER NOT NULL, min_sample_size INTEGER NOT NULL, frequency_days INTEGER NOT NULL,
 evidence_plan TEXT NOT NULL, breach_action TEXT NOT NULL, review_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 approved_by TEXT, approved_at TEXT
)`;
const aiAssurancePoliciesIndexSql="CREATE INDEX IF NOT EXISTS ai_assurance_policy_review_idx ON ai_assurance_policies(status,review_date)";
const aiExceptionsSql=`CREATE TABLE IF NOT EXISTS ai_exceptions (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, parent_id TEXT, exception_type TEXT NOT NULL,
 reference TEXT NOT NULL, title TEXT NOT NULL, justification TEXT NOT NULL, scope TEXT NOT NULL,
 compensating_controls TEXT NOT NULL, owner TEXT NOT NULL, risk_tier TEXT NOT NULL,
 expires_at TEXT NOT NULL, review_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 decision_note TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL,
 updated_at TEXT NOT NULL, decided_by TEXT, decided_at TEXT
)`;
const aiExceptionsModelIndexSql="CREATE INDEX IF NOT EXISTS ai_exceptions_model_status_idx ON ai_exceptions(model_id,status,expires_at,review_at)";
const aiExceptionsReviewIndexSql="CREATE INDEX IF NOT EXISTS ai_exceptions_review_idx ON ai_exceptions(status,review_at,expires_at)";
const aiDecommissionPlansSql=`CREATE TABLE IF NOT EXISTS ai_decommission_plans (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL UNIQUE, replacement_model_id TEXT, reason TEXT NOT NULL,
 owner TEXT NOT NULL, planned_at TEXT NOT NULL, dependencies TEXT NOT NULL, stakeholder_plan TEXT NOT NULL,
 rollback_plan TEXT NOT NULL, data_disposition TEXT NOT NULL, retention_basis TEXT NOT NULL,
 disposal_method TEXT NOT NULL, artifact_plan TEXT NOT NULL, access_plan TEXT NOT NULL, evidence_plan TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', decision_note TEXT, execution_evidence_ref TEXT,
 execution_evidence_sha256 TEXT, verification_evidence_ref TEXT, verification_evidence_sha256 TEXT,
 verification_checks_json TEXT NOT NULL DEFAULT '{}', created_by TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL, approved_by TEXT, approved_at TEXT,
 executed_by TEXT, executed_at TEXT, verified_by TEXT, verified_at TEXT
)`;
const aiDecommissionPlansIndexSql="CREATE INDEX IF NOT EXISTS ai_decommission_status_date_idx ON ai_decommission_plans(status,planned_at)";
const aiFindingsSql=`CREATE TABLE IF NOT EXISTS ai_findings (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, domain TEXT NOT NULL, source_ref TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL, root_cause TEXT NOT NULL, corrective_action TEXT NOT NULL,
 preventive_action TEXT NOT NULL, owner TEXT NOT NULL, severity TEXT NOT NULL, due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', action_note TEXT, evidence_reference TEXT, evidence_sha256 TEXT,
 verification_evidence_reference TEXT, verification_evidence_sha256 TEXT,
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL,
 submitted_by TEXT, submitted_at TEXT, verified_by TEXT, verified_at TEXT, reopened_by TEXT, reopened_at TEXT
)`;
const aiFindingsModelIndexSql="CREATE INDEX IF NOT EXISTS ai_findings_model_status_idx ON ai_findings(model_id,status,severity,due_date)";
const aiFindingsSourceIndexSql="CREATE UNIQUE INDEX IF NOT EXISTS ai_findings_source_open_idx ON ai_findings(model_id,domain,source_ref) WHERE status!='resolved'";
const aiAssuranceAlertsSql=`CREATE TABLE IF NOT EXISTS ai_assurance_alerts (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, policy_id TEXT NOT NULL, monitoring_ref TEXT,
 metric TEXT NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL, observed_value REAL, threshold_value REAL,
 fingerprint TEXT NOT NULL UNIQUE, occurrence_count INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'open',
 owner TEXT, action_note TEXT, finding_id TEXT, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 acknowledged_by TEXT, acknowledged_at TEXT, escalated_by TEXT, escalated_at TEXT,
 resolved_by TEXT, resolved_at TEXT, reopened_by TEXT, reopened_at TEXT
)`;
const aiAssuranceAlertsIndexSql="CREATE INDEX IF NOT EXISTS ai_assurance_alerts_model_status_idx ON ai_assurance_alerts(model_id,status,severity,last_seen_at)";
const aiAssurancePackagesSql=`CREATE TABLE IF NOT EXISTS ai_assurance_packages (
 id TEXT PRIMARY KEY, model_id TEXT NOT NULL, period_days INTEGER NOT NULL,
 period_since TEXT NOT NULL, period_until TEXT NOT NULL, schema_version TEXT NOT NULL,
 manifest_json TEXT NOT NULL, manifest_sha256 TEXT NOT NULL UNIQUE,
 signature_algorithm TEXT NOT NULL, signature_value TEXT NOT NULL, signing_key_id TEXT NOT NULL,
 generated_by TEXT NOT NULL, generated_at TEXT NOT NULL, verification_count INTEGER NOT NULL DEFAULT 0,
 last_verified_by TEXT, last_verified_at TEXT
)`;
const aiAssurancePackagesIndexSql="CREATE INDEX IF NOT EXISTS ai_assurance_packages_model_date_idx ON ai_assurance_packages(model_id,generated_at)";

let schemaReady: Promise<void> | null = null;

export async function aiRuntime() {
  const { env } = await import("cloudflare:workers");
  const runtime = env as unknown as Record<string, unknown> & { DB: D1Database };
  if (!schemaReady) {
    schemaReady = runtime.DB.batch([
      runtime.DB.prepare(settingsSql),
      runtime.DB.prepare(auditSql),
      runtime.DB.prepare(draftsSql),
      runtime.DB.prepare(draftsStatusIndexSql),
      runtime.DB.prepare(draftsCreatorIndexSql),
      runtime.DB.prepare(draftEventsSql),
      runtime.DB.prepare(draftEventsIndexSql),
      runtime.DB.prepare(draftPublicationsSql),
      runtime.DB.prepare(draftPublicationsRecordIndexSql),
      runtime.DB.prepare(draftTicketsSql),
      runtime.DB.prepare(draftTicketsStatusIndexSql),
      runtime.DB.prepare(fallbackSql),
      runtime.DB.prepare(providerHealthSql),
      runtime.DB.prepare(providerHealthIndexSql),
      runtime.DB.prepare(useCasesSql),
      runtime.DB.prepare(useCasesIndexSql),
      runtime.DB.prepare(evalCasesSql),
      runtime.DB.prepare(evalRunsSql),
      runtime.DB.prepare(evalRunsIndexSql),
      runtime.DB.prepare(agentRunsSql),
      runtime.DB.prepare(agentRunsIndexSql),
      runtime.DB.prepare(agentDraftLinksSql),
      runtime.DB.prepare(agentDraftLinksIndexSql),
      runtime.DB.prepare(knowledgeSourcesSql),
      runtime.DB.prepare(knowledgeSourcesIndexSql),
      runtime.DB.prepare(knowledgeGovernanceSql),
      runtime.DB.prepare(knowledgeGovernanceIndexSql),
      runtime.DB.prepare(knowledgeVersionsSql),
      runtime.DB.prepare(knowledgeVersionsIndexSql),
      runtime.DB.prepare(knowledgeChunksSql),
      runtime.DB.prepare(knowledgeChunksIndexSql),
      runtime.DB.prepare(feedbackSql),
      runtime.DB.prepare(feedbackStatusIndexSql),
      runtime.DB.prepare(feedbackCreatorIndexSql),
      runtime.DB.prepare(budgetPoliciesSql),
      runtime.DB.prepare(usageLedgerSql),
      runtime.DB.prepare(usageProfileIndexSql),
      runtime.DB.prepare(usageCreatedIndexSql),
      runtime.DB.prepare(operatingPolicySql),
      runtime.DB.prepare(dataProtectionPolicySql),
      runtime.DB.prepare(dataProtectionEventsSql),
      runtime.DB.prepare(dataProtectionEventsIndexSql),
      runtime.DB.prepare(modelInventorySql),
      runtime.DB.prepare(modelInventoryIndexSql),
      runtime.DB.prepare(aiControlAssessmentsSql),
      runtime.DB.prepare(aiControlAssessmentsIndexSql),
      runtime.DB.prepare(aiModelChangesSql),
      runtime.DB.prepare(aiModelChangesIndexSql),
      runtime.DB.prepare(aiModelMonitoringSql),
      runtime.DB.prepare(aiModelMonitoringIndexSql),
      runtime.DB.prepare(aiIncidentsSql),
      runtime.DB.prepare(aiIncidentsIndexSql),
      runtime.DB.prepare(aiIncidentEventsSql),
      runtime.DB.prepare(aiIncidentEventsIndexSql),
      runtime.DB.prepare(aiEvidenceSql),
      runtime.DB.prepare(aiEvidenceIndexSql),
      runtime.DB.prepare(aiRisksSql),
      runtime.DB.prepare(aiRisksIndexSql),
      runtime.DB.prepare(aiVendorAssessmentsSql),
      runtime.DB.prepare(aiVendorAssessmentsIndexSql),
      runtime.DB.prepare(aiAccessAssignmentsSql),
      runtime.DB.prepare(aiAccessPrincipalIndexSql),
      runtime.DB.prepare(aiAccessReviewIndexSql),
      runtime.DB.prepare(aiReleaseGatesSql),
      runtime.DB.prepare(aiReleaseGatesIndexSql),
      runtime.DB.prepare(aiImpactAssessmentsSql),
      runtime.DB.prepare(aiImpactAssessmentsIndexSql),
      runtime.DB.prepare(aiResiliencePlansSql),
      runtime.DB.prepare(aiResiliencePlansIndexSql),
      runtime.DB.prepare(aiResilienceExercisesSql),
      runtime.DB.prepare(aiResilienceExercisesIndexSql),
      runtime.DB.prepare(aiDatasetsSql),
      runtime.DB.prepare(aiDatasetsIndexSql),
      runtime.DB.prepare(aiRegulatoryProfilesSql),
      runtime.DB.prepare(aiRegulatoryProfilesIndexSql),
      runtime.DB.prepare(aiRegulatoryObligationsSql),
      runtime.DB.prepare(aiRegulatoryObligationsIndexSql),
      runtime.DB.prepare(aiRegulatoryObligationsRenewalIndexSql),
      runtime.DB.prepare(aiRegulatoryObligationsUniqueSql),
      runtime.DB.prepare(aiLiteracyRecordsSql),
      runtime.DB.prepare(aiLiteracyRecordsIndexSql),
      runtime.DB.prepare(aiModelArtifactsSql),
      runtime.DB.prepare(aiModelArtifactsIndexSql),
      runtime.DB.prepare(aiRedTeamCampaignsSql),
      runtime.DB.prepare(aiRedTeamCampaignsIndexSql),
      runtime.DB.prepare(aiTransparencyProfilesSql),
      runtime.DB.prepare(aiTransparencyProfilesIndexSql),
      runtime.DB.prepare(aiOversightEventsSql),
      runtime.DB.prepare(aiOversightEventsIndexSql),
      runtime.DB.prepare(aiAssurancePoliciesSql),
      runtime.DB.prepare(aiAssurancePoliciesIndexSql),
      runtime.DB.prepare(aiExceptionsSql),
      runtime.DB.prepare(aiExceptionsModelIndexSql),
      runtime.DB.prepare(aiExceptionsReviewIndexSql),
      runtime.DB.prepare(aiDecommissionPlansSql),
      runtime.DB.prepare(aiDecommissionPlansIndexSql),
      runtime.DB.prepare(aiFindingsSql),
      runtime.DB.prepare(aiFindingsModelIndexSql),
      runtime.DB.prepare(aiFindingsSourceIndexSql),
      runtime.DB.prepare(aiAssuranceAlertsSql),
      runtime.DB.prepare(aiAssuranceAlertsIndexSql),
      runtime.DB.prepare(aiAssurancePackagesSql),
      runtime.DB.prepare(aiAssurancePackagesIndexSql),
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
  return runtime;
}
export async function getAiSettings(db: D1Database) {
  return db.prepare("SELECT * FROM ai_provider_settings WHERE id='default'").first<AiSettingsRow>();
}

export async function recordAiEvent(db: D1Database, input: {
  actor: string;
  action: string;
  provider?: string;
  model?: string;
  promptHash?: string;
  contextRefs?: string[];
  status: "success" | "error" | "denied";
  latencyMs?: number;
  detail?: string;
}) {
  const id=crypto.randomUUID();
  await db.prepare(`INSERT INTO ai_activity_logs(
    id,actor,action,provider,model,prompt_hash,context_refs_json,status,latency_ms,detail,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(
    id,
    cleanAiText(input.actor, 320) || "unknown",
    cleanAiText(input.action, 80),
    cleanAiText(input.provider, 80),
    cleanAiText(input.model, 200),
    cleanAiText(input.promptHash, 128) || null,
    JSON.stringify((input.contextRefs || []).slice(0, 80)),
    input.status,
    Math.max(0, Math.round(input.latencyMs || 0)),
    cleanAiText(input.detail, 500),
    new Date().toISOString(),
  ).run();
  return id;
}
