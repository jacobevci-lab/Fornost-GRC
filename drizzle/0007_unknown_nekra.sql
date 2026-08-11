CREATE TABLE `security_remediation_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text NOT NULL,
	`submitted_by` text NOT NULL,
	`submitted_at` text NOT NULL,
	`verified_by` text,
	`verified_at` text,
	`verification_note` text
);
--> statement-breakpoint
CREATE INDEX `security_remediation_verification_run_idx` ON `security_remediation_verifications` (`run_id`,`tenant_id`,`submitted_at`);