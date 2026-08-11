CREATE TABLE `security_residual_risk_oversight` (
  `id` text PRIMARY KEY NOT NULL,
  `decision_id` text NOT NULL UNIQUE,
  `tenant_id` text NOT NULL,
  `risk_level` integer NOT NULL,
  `exposure_amount` text NOT NULL,
  `concentration_group` text NOT NULL,
  `control_effectiveness` integer NOT NULL,
  `tolerance_limit` integer NOT NULL,
  `review_date` text NOT NULL,
  `status` text NOT NULL,
  `prepared_by` text NOT NULL,
  `prepared_at` text NOT NULL,
  `decided_by` text,
  `decided_at` text,
  `decision_note` text
);
CREATE INDEX `security_residual_oversight_tenant_status_idx` ON `security_residual_risk_oversight` (`tenant_id`,`status`);
CREATE INDEX `security_residual_oversight_review_idx` ON `security_residual_risk_oversight` (`tenant_id`,`review_date`);
