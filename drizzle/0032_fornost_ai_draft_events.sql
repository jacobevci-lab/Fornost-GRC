CREATE TABLE IF NOT EXISTS `ai_draft_events` (
  `id` text PRIMARY KEY NOT NULL,
  `draft_id` text NOT NULL,
  `action` text NOT NULL,
  `actor` text NOT NULL,
  `detail` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_draft_events_draft_idx` ON `ai_draft_events` (`draft_id`,`created_at`);
