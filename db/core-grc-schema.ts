import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Canonical schema for core GRC support tables that sit alongside
 * simple_grc_records in db/schema.ts.
 *
 * Existing runtime CREATE TABLE statements remain temporarily for backward
 * compatibility with persisted on-prem installations that predate the
 * migration baseline. New deployments must receive these tables via D1
 * migrations.
 */
export const simpleGrcMetadata = sqliteTable("simple_grc_metadata", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const simpleAudits = sqliteTable("simple_audits", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  template: text("template").notNull(),
  auditType: text("audit_type").notNull(),
  auditor: text("auditor").notNull(),
  auditOwner: text("audit_owner").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const simpleGrcRecordCodes = sqliteTable("simple_grc_record_codes", {
  recordId: text("record_id").primaryKey(),
  module: text("module").notNull(),
  code: text("code").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const simpleGrcRecordCodeCounters = sqliteTable("simple_grc_record_code_counters", {
  module: text("module").primaryKey(),
  value: integer("value").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

export const auditRequestWorkflows = sqliteTable("audit_request_workflows", {
  auditId: text("audit_id").primaryKey(), state: text("state").notNull(), revision: text("revision").notNull(),
  timeZone: text("time_zone").notNull(), planRevision: text("plan_revision").notNull().default(""),
});
export const auditRequests = sqliteTable("audit_requests", {
  id: text("id").primaryKey(), auditId: text("audit_id").notNull(), dataJson: text("data_json").notNull(),
  revision: text("revision").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("audit_requests_parent_idx").on(table.auditId, table.createdAt, table.id)]);
export const auditRequestEvents = sqliteTable("audit_request_events", {
  id: text("id").primaryKey(), auditId: text("audit_id").notNull(), requestId: text("request_id").notNull(),
  action: text("action").notNull(), actor: text("actor").notNull(), snapshotJson: text("snapshot_json").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("audit_request_events_parent_idx").on(table.auditId, table.createdAt, table.id)]);

export const auditWorkplanClosures = sqliteTable("audit_workplan_closures", {
  id: text("id").primaryKey(), auditId: text("audit_id").notNull(), snapshotJson: text("snapshot_json").notNull(), snapshotSha256: text("snapshot_sha256").notNull(), requestCount: integer("request_count").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("audit_workplan_closures_parent_idx").on(table.auditId, table.createdAt, table.id)]);
export const auditWorkplanClosureItems = sqliteTable("audit_workplan_closure_items", {
  closureId: text("closure_id").notNull(), id: text("id").notNull(), auditId: text("audit_id").notNull(), dataJson: text("data_json").notNull(), revision: text("revision").notNull(), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.closureId, table.id] })]);
export const auditWorkplanEvents = sqliteTable("audit_workplan_events", {
  id: text("id").primaryKey(), auditId: text("audit_id").notNull(), action: text("action").notNull(), actor: text("actor").notNull(), note: text("note").notNull(), closureId: text("closure_id").notNull(), revision: text("revision").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("audit_workplan_events_parent_idx").on(table.auditId, table.createdAt, table.id)]);

export const auditStatusReports = sqliteTable("audit_status_reports", {
  id:text("id").primaryKey(),auditId:text("audit_id").notNull(),headerJson:text("header_json").notNull(),snapshotSha256:text("snapshot_sha256").notNull(),itemCount:integer("item_count").notNull(),inputSha256:text("input_sha256").notNull(),writeToken:text("write_token").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("audit_status_reports_parent_idx").on(table.auditId,table.createdAt,table.id)]);
export const auditStatusReportItems = sqliteTable("audit_status_report_items", {
  reportId:text("report_id").notNull(),kind:text("kind").notNull(),id:text("id").notNull(),recordJson:text("record_json").notNull(),
},table=>[primaryKey({columns:[table.reportId,table.kind,table.id]})]);
export const auditReportSourceRevision = sqliteTable("audit_report_source_revision", {
  id:integer("id").primaryKey(),revision:text("revision").notNull(),
});

export const auditClosureState = sqliteTable("audit_closure_state", {
  auditId:text("audit_id").primaryKey(),state:text("state").notNull(),revision:text("revision").notNull(),submissionId:text("submission_id").notNull(),reportId:text("report_id").notNull(),
});
export const auditClosureEvents = sqliteTable("audit_closure_events", {
  id:text("id").primaryKey(),auditId:text("audit_id").notNull(),payloadJson:text("payload_json").notNull(),snapshotSha256:text("snapshot_sha256").notNull(),inputSha256:text("input_sha256").notNull(),writeToken:text("write_token").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("audit_closure_events_parent_idx").on(table.auditId,table.createdAt,table.id)]);

export const auditReminderProfiles = sqliteTable("audit_reminder_profiles", {
  auditId: text("audit_id").primaryKey(), revision: text("revision").notNull(), dataJson: text("data_json").notNull(), updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull(),
});
