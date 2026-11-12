import { ensureEvidenceHistorySchema } from "./versioning";
import { ensureCoreGrcSchemaCompatibility } from "../api/grc/schema-compat";

/** Storage keys are exact identities, not paths to normalize or resolve. */
export async function canReadEvidenceFile(db: D1Database, key: string) {
  const match = /^evidence\/([^/]+)\/(.+)$/.exec(key);
  if (!match || key.includes("..") || /[\\\u0000-\u001f]/.test(key)) return false;
  await ensureCoreGrcSchemaCompatibility(db);
  await ensureEvidenceHistorySchema(db);
  // Bind the path owner too: a different writable row must not revive an
  // orphan file by copying its key into editable metadata.
  const row = await db.prepare(`SELECT 1 allowed FROM simple_grc_records r
    WHERE r.id=? AND r.module='Kanıtlar' AND (
      CASE WHEN json_valid(r.data_json) THEN json_extract(r.data_json,'$.fileKey') END = ?
      OR EXISTS(SELECT 1 FROM evidence_versions v WHERE v.evidence_id=r.id AND v.file_key=?)
    )`).bind(match[1], key, key).first();
  return Boolean(row);
}
