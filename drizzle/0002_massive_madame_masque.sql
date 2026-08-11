CREATE TABLE `access_remediation_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`item_id` text NOT NULL,
	`principal` text NOT NULL,
	`system` text NOT NULL,
	`entitlement` text NOT NULL,
	`action` text NOT NULL,
	`owner` text NOT NULL,
	`due` text NOT NULL,
	`status` text NOT NULL,
	`completion_evidence` text,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE TABLE `access_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`item_id` text,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_review_items` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`principal` text NOT NULL,
	`principal_type` text NOT NULL,
	`account` text NOT NULL,
	`system` text NOT NULL,
	`entitlement` text NOT NULL,
	`scope` text NOT NULL,
	`risk` text NOT NULL,
	`last_used` text NOT NULL,
	`decision` text DEFAULT 'Bekliyor' NOT NULL,
	`reason` text,
	`reviewer` text NOT NULL,
	`reassigned_to` text,
	`decided_by` text,
	`decided_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `access_review_items_campaign_idx` ON `access_review_items` (`campaign_id`,`decision`);
