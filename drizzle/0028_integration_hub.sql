CREATE TABLE `integration_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`secret_ciphertext` text,
	`updated_at` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_settings_kind_unique` ON `integration_settings` (`kind`);
--> statement-breakpoint
CREATE INDEX `integration_settings_kind_idx` ON `integration_settings` (`kind`);
--> statement-breakpoint
CREATE TABLE `integration_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `integration_events_kind_created_idx` ON `integration_events` (`kind`,`created_at`);
