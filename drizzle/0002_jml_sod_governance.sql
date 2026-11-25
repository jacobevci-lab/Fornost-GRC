CREATE TABLE `lifecycle_cases` (
  `id` text PRIMARY KEY NOT NULL,
  `employee` text NOT NULL,
  `event_type` text NOT NULL,
  `department` text NOT NULL,
  `effective_date` text NOT NULL,
  `source` text NOT NULL,
  `tasks_total` integer NOT NULL,
  `tasks_done` integer NOT NULL,
  `risk` text NOT NULL,
  `status` text NOT NULL,
  `owner` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sod_exceptions` (
  `id` text PRIMARY KEY NOT NULL,
  `policy_id` text NOT NULL,
  `principal` text NOT NULL,
  `conflict` text NOT NULL,
  `justification` text NOT NULL,
  `compensating_control` text NOT NULL,
  `expires_at` text NOT NULL,
  `risk_owner` text NOT NULL,
  `status` text NOT NULL,
  `created_by` text NOT NULL,
  `reviewer` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
