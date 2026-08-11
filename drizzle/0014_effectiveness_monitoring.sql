CREATE TABLE `security_effectiveness_reviews` (`id` text PRIMARY KEY NOT NULL,`finding_action_id` text NOT NULL,`finding_id` text NOT NULL,`tenant_id` text NOT NULL,`review_day` integer NOT NULL,`due_date` text NOT NULL,`owner` text NOT NULL,`status` text NOT NULL,`metric_value` text,`evidence_ref` text,`review_note` text,`reviewed_by` text,`reviewed_at` text,`decision` text);
--> statement-breakpoint
CREATE INDEX `security_effectiveness_reviews_action_idx` ON `security_effectiveness_reviews` (`finding_action_id`,`review_day`);
