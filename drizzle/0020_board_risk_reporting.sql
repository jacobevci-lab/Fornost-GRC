CREATE TABLE `security_board_risk_packs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`period` text NOT NULL,
	`title` text NOT NULL,
	`oversight_ids_json` text NOT NULL,
	`total_exposure` text NOT NULL,
	`tolerance_events` integer NOT NULL,
	`concentration_summary` text NOT NULL,
	`decision_summary` text NOT NULL,
	`action_owner` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`prepared_by` text NOT NULL,
	`prepared_at` text NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`approval_note` text,
	`closed_by` text,
	`closed_at` text,
	`closure_evidence` text
);
--> statement-breakpoint
CREATE INDEX `security_board_risk_packs_tenant_status_idx` ON `security_board_risk_packs` (`tenant_id`,`status`);
--> statement-breakpoint
CREATE INDEX `security_board_risk_packs_due_idx` ON `security_board_risk_packs` (`tenant_id`,`due_date`);
