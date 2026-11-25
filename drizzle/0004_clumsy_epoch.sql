CREATE TABLE `access_review_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`level` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`message` text NOT NULL,
	`delivery_mode` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_review_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`cadence` text NOT NULL,
	`scope` text NOT NULL,
	`owner` text NOT NULL,
	`next_run` text NOT NULL,
	`reminder_days` text NOT NULL,
	`escalation_days` integer NOT NULL,
	`status` text NOT NULL,
	`last_run` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `access_review_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`source` text NOT NULL,
	`principal_count` integer NOT NULL,
	`entitlement_count` integer NOT NULL,
	`captured_at` text NOT NULL,
	`captured_by` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`status` text NOT NULL
);
