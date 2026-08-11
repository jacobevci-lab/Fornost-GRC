CREATE TABLE `security_audit_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`room_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`severity` text NOT NULL,
	`status` text NOT NULL,
	`raised_by` text NOT NULL,
	`raised_at` text NOT NULL,
	`root_cause` text,
	`impact` text,
	`action_plan` text,
	`owner` text,
	`due_date` text,
	`responded_by` text,
	`responded_at` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`review_note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_audit_findings_request_id_unique` ON `security_audit_findings` (`request_id`);--> statement-breakpoint
CREATE INDEX `security_audit_findings_tenant_status_idx` ON `security_audit_findings` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `security_audit_findings_room_idx` ON `security_audit_findings` (`room_id`);