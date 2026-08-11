CREATE TABLE `security_auditor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`event_type` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_auditor_events_room_idx` ON `security_auditor_events` (`room_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `security_auditor_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`auditor_name` text NOT NULL,
	`auditor_email` text NOT NULL,
	`access_level` text NOT NULL,
	`masking_enabled` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`revoked_by` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE INDEX `security_auditor_rooms_tenant_idx` ON `security_auditor_rooms` (`tenant_id`,`expires_at`);