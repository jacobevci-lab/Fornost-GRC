CREATE TABLE `security_sla_governance` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`action_id` text NOT NULL,
	`owner` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`extension_reason` text,
	`requested_due_date` text,
	`requested_by` text,
	`requested_at` text,
	`approved_by` text,
	`approved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_sla_governance_run_id_unique` ON `security_sla_governance` (`run_id`);--> statement-breakpoint
CREATE INDEX `security_sla_tenant_due_idx` ON `security_sla_governance` (`tenant_id`,`due_date`);--> statement-breakpoint
CREATE TABLE `security_sla_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`level` text NOT NULL,
	`recipient` text NOT NULL,
	`channel` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_sla_notification_run_idx` ON `security_sla_notifications` (`run_id`,`tenant_id`);