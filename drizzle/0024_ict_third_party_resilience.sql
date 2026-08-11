CREATE TABLE `security_ict_dependencies` (
	`id` text PRIMARY KEY NOT NULL,
	`resilience_plan_id` text NOT NULL UNIQUE,
	`tenant_id` text NOT NULL,
	`provider_name` text NOT NULL,
	`service_name` text NOT NULL,
	`subcontractor_chain` text NOT NULL,
	`concentration_score` integer NOT NULL,
	`contractual_rto` integer NOT NULL,
	`contractual_rpo` integer NOT NULL,
	`exit_strategy` text NOT NULL,
	`alternate_provider` text NOT NULL,
	`portability_scope` text NOT NULL,
	`joint_test_date` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`assessed_by` text NOT NULL,
	`assessed_at` text NOT NULL,
	`test_evidence` text,
	`actual_exit_minutes` integer,
	`tested_by` text,
	`tested_at` text,
	`verified_by` text,
	`verified_at` text,
	`verification_note` text
);
CREATE INDEX `security_ict_tenant_status_idx` ON `security_ict_dependencies` (`tenant_id`,`status`);
CREATE INDEX `security_ict_test_date_idx` ON `security_ict_dependencies` (`tenant_id`,`joint_test_date`);
