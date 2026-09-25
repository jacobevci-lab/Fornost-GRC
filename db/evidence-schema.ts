import { blob, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Canonical storage model for auditable evidence version history.
 *
 * Evidence files normally live in R2. simple_evidence_files is the bounded D1
 * fallback used by local/on-prem installations when object storage is absent.
 * Runtime self-heal remains only as a compatibility path for installations
 * created before migration 0079.
 */
export const evidenceVersions = sqliteTable("evidence_versions", {
  id: text("id").primaryKey(),
  evidenceId: text("evidence_id").notNull(),
  versionNo: integer("version_no").notNull(),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  contentSha256: text("content_sha256").notNull(),
  chainSha256: text("chain_sha256").notNull(),
  previousVersionId: text("previous_version_id"),
  previousChainSha256: text("previous_chain_sha256"),
  evidenceTitle: text("evidence_title").notNull(),
  owner: text("owner").notNull(),
  period: text("period").notNull(),
  frameworks: text("frameworks").notNull(),
  controlRefs: text("control_refs").notNull(),
  changeNote: text("change_note").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  uniqueIndex("evidence_versions_number_idx").on(table.evidenceId, table.versionNo),
  index("evidence_versions_evidence_idx").on(table.evidenceId, table.versionNo),
  index("evidence_versions_created_idx").on(table.createdAt),
]);

export const evidenceVersionControls = sqliteTable("evidence_version_controls", {
  versionId: text("version_id").notNull(),
  evidenceId: text("evidence_id").notNull(),
  controlRef: text("control_ref").notNull(),
  normalizedRef: text("normalized_ref").notNull(),
  versionNo: integer("version_no").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.versionId, table.normalizedRef] }),
  index("evidence_version_controls_ref_idx").on(table.normalizedRef, table.createdAt),
  index("evidence_version_controls_evidence_idx").on(table.evidenceId, table.versionNo),
]);

export const simpleEvidenceFiles = sqliteTable("simple_evidence_files", {
  fileKey: text("file_key").primaryKey(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  content: blob("content").notNull(),
  createdAt: text("created_at").notNull(),
});
