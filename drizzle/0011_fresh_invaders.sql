CREATE TABLE `security_auditor_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`subject` text NOT NULL,
	`question` text NOT NULL,
	`status` text NOT NULL,
	`due_at` text NOT NULL,
	`opened_by` text NOT NULL,
	`opened_at` text NOT NULL,
	`answered_by` text,
	`answered_at` text,
	`answer` text,
	`evidence_ref` text,
	`decided_by` text,
	`decided_at` text,
	`decision_note` text
);
--> statement-breakpoint
CREATE INDEX `security_auditor_requests_room_idx` ON `security_auditor_requests` (`room_id`,`status`);--> statement-breakpoint
CREATE INDEX `security_auditor_requests_tenant_due_idx` ON `security_auditor_requests` (`tenant_id`,`due_at`);