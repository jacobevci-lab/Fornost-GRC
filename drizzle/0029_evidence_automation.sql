CREATE TABLE IF NOT EXISTS `evidence_automation_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `vendor` text NOT NULL,
  `category` text NOT NULL,
  `driver` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `config_json` text NOT NULL,
  `secret_ciphertext` text,
  `last_test_status` text,
  `last_test_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `evidence_automation_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `source_id` text NOT NULL,
  `control_refs` text NOT NULL,
  `json_path` text NOT NULL,
  `operator` text NOT NULL,
  `expected` text NOT NULL,
  `schedule` text NOT NULL,
  `enabled` integer NOT NULL DEFAULT 1,
  `last_status` text,
  `last_run_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `updated_by` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `evidence_automation_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `rule_id` text NOT NULL,
  `rule_name` text NOT NULL,
  `source_name` text NOT NULL,
  `status` text NOT NULL,
  `score` integer NOT NULL,
  `detail` text NOT NULL,
  `response_hash` text NOT NULL,
  `evidence_id` text,
  `created_at` text NOT NULL,
  `actor` text NOT NULL
);
