CREATE TABLE IF NOT EXISTS `ai_draft_publications` (
  `id` text PRIMARY KEY NOT NULL,
  `draft_id` text NOT NULL UNIQUE,
  `record_id` text NOT NULL,
  `module` text NOT NULL,
  `publication_note` text NOT NULL,
  `published_by` text NOT NULL,
  `published_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_draft_publications_record_idx` ON `ai_draft_publications` (`record_id`,`published_at`);
