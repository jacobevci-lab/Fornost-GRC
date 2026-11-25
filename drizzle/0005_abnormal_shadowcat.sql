CREATE TABLE `integration_remediation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `integration_remediation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`connector` text NOT NULL,
	`target` text NOT NULL,
	`action` text NOT NULL,
	`scope` text NOT NULL,
	`rollback_plan` text NOT NULL,
	`execution_mode` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`approved_by` text,
	`verification_result` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
