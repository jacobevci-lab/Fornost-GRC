CREATE TABLE IF NOT EXISTS `security_vendor_reassessments` (
  `id` text PRIMARY KEY NOT NULL,
  `incident_id` text NOT NULL UNIQUE,
  `dependency_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `inherent_risk` integer NOT NULL,
  `control_score` integer NOT NULL,
  `residual_risk` integer NOT NULL,
  `control_scope` text NOT NULL,
  `contract_changes` text NOT NULL,
  `sla_changes` text NOT NULL,
  `monitoring_plan` text NOT NULL,
  `owner` text NOT NULL,
  `review_date` text NOT NULL,
  `recommendation` text NOT NULL,
  `status` text NOT NULL,
  `prepared_by` text NOT NULL,
  `prepared_at` text NOT NULL,
  `evidence_ref` text,
  `submitted_by` text,
  `submitted_at` text,
  `decided_by` text,
  `decided_at` text,
  `decision_note` text
);
CREATE INDEX IF NOT EXISTS `security_vendor_reassess_tenant_status_idx` ON `security_vendor_reassessments` (`tenant_id`,`status`);
CREATE INDEX IF NOT EXISTS `security_vendor_reassess_review_idx` ON `security_vendor_reassessments` (`tenant_id`,`review_date`);
