CREATE TABLE `security_resilience_plans` (
  `id` text PRIMARY KEY NOT NULL,
  `scenario_id` text NOT NULL UNIQUE,
  `tenant_id` text NOT NULL,
  `critical_service` text NOT NULL,
  `business_impact` text NOT NULL,
  `dependency_map` text NOT NULL,
  `rto_minutes` integer NOT NULL,
  `rpo_minutes` integer NOT NULL,
  `exercise_type` text NOT NULL,
  `exercise_date` text NOT NULL,
  `recovery_owner` text NOT NULL,
  `status` text NOT NULL,
  `prepared_by` text NOT NULL,
  `prepared_at` text NOT NULL,
  `evidence_ref` text,
  `actual_rto_minutes` integer,
  `actual_rpo_minutes` integer,
  `exercised_by` text,
  `exercised_at` text,
  `verified_by` text,
  `verified_at` text,
  `verification_note` text
);
CREATE INDEX `security_resilience_tenant_status_idx` ON `security_resilience_plans` (`tenant_id`,`status`);
CREATE INDEX `security_resilience_exercise_idx` ON `security_resilience_plans` (`tenant_id`,`exercise_date`);
