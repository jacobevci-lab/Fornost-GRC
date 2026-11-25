CREATE TABLE `security_control_improvements` (
	`id` text PRIMARY KEY NOT NULL,
	`effectiveness_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`control_ref` text NOT NULL,
	`framework_refs` text NOT NULL,
	`root_cause` text NOT NULL,
	`improvement_plan` text,
	`owner` text,
	`due_date` text,
	`success_metric` text,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`submitted_by` text,
	`submitted_at` text,
	`approved_by` text,
	`approved_at` text,
	`implementation_evidence` text,
	`implemented_by` text,
	`implemented_at` text,
	`verified_by` text,
	`verified_at` text,
	`verification_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_control_improvements_effectiveness_id_unique` ON `security_control_improvements` (`effectiveness_id`);--> statement-breakpoint
CREATE INDEX `security_control_improvements_tenant_status_idx` ON `security_control_improvements` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `security_control_improvements_finding_idx` ON `security_control_improvements` (`finding_id`);
