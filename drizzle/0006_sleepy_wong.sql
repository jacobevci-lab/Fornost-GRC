CREATE TABLE `security_test_links` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`finding_id` text NOT NULL,
	`action_id` text NOT NULL,
	`severity` text NOT NULL,
	`owner` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_test_links_run_id_unique` ON `security_test_links` (`run_id`);--> statement-breakpoint
CREATE TABLE `security_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario` text NOT NULL,
	`tenant_id` text NOT NULL,
	`actor` text NOT NULL,
	`expected` text NOT NULL,
	`result` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_test_runs_tenant_idx` ON `security_test_runs` (`tenant_id`,`created_at`);