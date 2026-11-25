CREATE TABLE IF NOT EXISTS `ai_provider_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `provider` text NOT NULL,
  `base_url` text NOT NULL,
  `model` text NOT NULL,
  `enabled` integer DEFAULT 0 NOT NULL,
  `config_json` text DEFAULT '{}' NOT NULL,
  `secret_ciphertext` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_activity_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `actor` text NOT NULL,
  `action` text NOT NULL,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `prompt_hash` text,
  `context_refs_json` text DEFAULT '[]' NOT NULL,
  `status` text NOT NULL,
  `latency_ms` integer DEFAULT 0 NOT NULL,
  `detail` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_activity_logs_created_idx` ON `ai_activity_logs` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_activity_logs_actor_idx` ON `ai_activity_logs` (`actor`,`created_at`);
