CREATE TABLE `security_risk_scenarios` (`id` text PRIMARY KEY NOT NULL,`appetite_id` text NOT NULL,`tenant_id` text NOT NULL,`scenario_name` text NOT NULL,`horizon_days` integer NOT NULL,`baseline_value` integer NOT NULL,`stressed_value` integer NOT NULL,`forecast_value` integer NOT NULL,`confidence` integer NOT NULL,`assumptions` text NOT NULL,`treatment_plan` text NOT NULL,`treatment_owner` text NOT NULL,`due_date` text NOT NULL,`status` text NOT NULL,`created_by` text NOT NULL,`created_at` text NOT NULL,`submitted_by` text,`submitted_at` text,`verified_by` text,`verified_at` text,`verification_note` text);
--> statement-breakpoint
CREATE INDEX `security_risk_scenarios_tenant_status_idx` ON `security_risk_scenarios` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `security_risk_scenarios_due_idx` ON `security_risk_scenarios` (`tenant_id`,`due_date`);
