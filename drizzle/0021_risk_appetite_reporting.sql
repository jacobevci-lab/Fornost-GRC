CREATE TABLE `security_risk_appetite` (`id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`category` text NOT NULL,`appetite_level` integer NOT NULL,`warning_threshold` integer NOT NULL,`breach_threshold` integer NOT NULL,`kri_name` text NOT NULL,`owner` text NOT NULL,`status` text NOT NULL,`proposed_by` text NOT NULL,`proposed_at` text NOT NULL,`approved_by` text,`approved_at` text,`approval_note` text);
--> statement-breakpoint
CREATE INDEX `security_risk_appetite_tenant_idx` ON `security_risk_appetite` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE TABLE `security_kri_breaches` (`id` text PRIMARY KEY NOT NULL,`appetite_id` text NOT NULL,`tenant_id` text NOT NULL,`measured_value` integer NOT NULL,`severity` text NOT NULL,`response_owner` text NOT NULL,`response_plan` text NOT NULL,`due_date` text NOT NULL,`status` text NOT NULL,`detected_by` text NOT NULL,`detected_at` text NOT NULL,`resolved_by` text,`resolved_at` text,`resolution_evidence` text);
--> statement-breakpoint
CREATE INDEX `security_kri_breaches_tenant_idx` ON `security_kri_breaches` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE TABLE `security_executive_reports` (`id` text PRIMARY KEY NOT NULL,`tenant_id` text NOT NULL,`period` text NOT NULL,`title` text NOT NULL,`snapshot_json` text NOT NULL,`status` text NOT NULL,`prepared_by` text NOT NULL,`prepared_at` text NOT NULL,`approved_by` text,`approved_at` text,`approval_note` text);
--> statement-breakpoint
CREATE INDEX `security_executive_reports_tenant_idx` ON `security_executive_reports` (`tenant_id`,`prepared_at`);
