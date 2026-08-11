CREATE TABLE `security_finding_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`finding_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`owner` text NOT NULL,
	`due_date` text NOT NULL,
	`milestones_json` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`evidence_ref` text,
	`progress_note` text,
	`updated_by` text,
	`updated_at` text,
	`verified_by` text,
	`verified_at` text,
	`verification_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_finding_actions_finding_id_unique` ON `security_finding_actions` (`finding_id`);--> statement-breakpoint
CREATE INDEX `security_finding_actions_tenant_status_idx` ON `security_finding_actions` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `security_finding_actions_due_idx` ON `security_finding_actions` (`tenant_id`,`due_date`);