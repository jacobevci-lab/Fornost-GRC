import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
