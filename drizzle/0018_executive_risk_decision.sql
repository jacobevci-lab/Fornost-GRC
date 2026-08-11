CREATE TABLE `security_executive_risk_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `recovery_id` text NOT NULL UNIQUE,
  `execution_id` text NOT NULL,
  `tenant_id` text NOT NULL,
  `proposed_decision` text NOT NULL,
  `rationale` text NOT NULL,
  `residual_risk` text NOT NULL,
  `risk_owner` text NOT NULL,
  `compensating_control` text NOT NULL,
  `valid_until` text NOT NULL,
  `additional_investment` text NOT NULL,
  `status` text NOT NULL,
  `proposed_by` text NOT NULL,
  `proposed_at` text NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `approval_note` text,
  `review_result` text,
  `reviewed_by` text,
  `reviewed_at` text
);
CREATE INDEX `security_executive_risk_tenant_status_idx` ON `security_executive_risk_decisions` (`tenant_id`,`status`);
CREATE INDEX `security_executive_risk_validity_idx` ON `security_executive_risk_decisions` (`tenant_id`,`valid_until`);
