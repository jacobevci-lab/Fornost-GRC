CREATE TABLE IF NOT EXISTS `ai_action_drafts` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `title` text NOT NULL,
  `payload_json` text NOT NULL,
  `rationale` text NOT NULL,
  `source_refs_json` text DEFAULT '[]' NOT NULL,
  `status` text DEFAULT 'pending' NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `prompt_hash` text,
  `created_by` text NOT NULL,
  `reviewed_by` text,
  `reviewed_at` text,
  `review_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_action_drafts_status_idx` ON `ai_action_drafts` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_action_drafts_creator_idx` ON `ai_action_drafts` (`created_by`,`created_at`);
