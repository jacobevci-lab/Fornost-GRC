CREATE TABLE `access_review_evidence_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`package_type` text NOT NULL,
	`manifest_hash` text NOT NULL,
	`item_count` integer NOT NULL,
	`status` text NOT NULL,
	`generated_by` text NOT NULL,
	`generated_at` text NOT NULL,
	`verified_by` text,
	`verified_at` text
);
--> statement-breakpoint
CREATE TABLE `access_review_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`item_id` text NOT NULL,
	`decision` text NOT NULL,
	`justification` text NOT NULL,
	`expires_at` text NOT NULL,
	`compensating_control` text NOT NULL,
	`status` text NOT NULL,
	`created_by` text NOT NULL,
	`reviewer` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
