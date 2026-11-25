CREATE TABLE IF NOT EXISTS `simple_grc_records` (
  `id` text PRIMARY KEY NOT NULL,
  `module` text NOT NULL,
  `data_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `simple_grc_records_module_idx` ON `simple_grc_records` (`module`,`updated_at`);
