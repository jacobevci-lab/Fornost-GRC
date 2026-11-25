CREATE TABLE `security_assurance_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`period` text NOT NULL,
	`scope_count` integer NOT NULL,
	`evidence_count` integer NOT NULL,
	`exception_count` integer NOT NULL,
	`snapshot_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text
);
