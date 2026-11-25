ALTER TABLE evidence_automation_rules ADD COLUMN template_id TEXT;
--> statement-breakpoint
ALTER TABLE evidence_automation_rules ADD COLUMN template_version INTEGER;
--> statement-breakpoint
ALTER TABLE evidence_automation_runs ADD COLUMN assessment_json TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS evidence_automation_rules_template_idx ON evidence_automation_rules(source_id,template_id);
