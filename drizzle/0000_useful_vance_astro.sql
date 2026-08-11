CREATE TABLE `grc_records` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`title` text NOT NULL,
	`meta` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`score` integer NOT NULL,
	`due` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`links_json` text DEFAULT '[]' NOT NULL,
	`workflow_state` text DEFAULT 'Taslak' NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`action` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`occurred_at` text NOT NULL
);
