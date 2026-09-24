export const EVIDENCE_ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;

export type EvidenceVersionRow = {
  id: string;
  evidence_id: string;
  version_no: number;
  file_key: string;
  file_name: string;
  file_type: string;
  file_size: number;
  content_sha256: string;
  chain_sha256: string;
  previous_version_id: string | null;
  previous_chain_sha256: string | null;
  evidence_title: string;
  owner: string;
  period: string;
  frameworks: string;
  control_refs: string;
  change_note: string;
  created_by: string;
  created_at: string;
};

const versionTable = `CREATE TABLE IF NOT EXISTS evidence_versions(
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  file_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  chain_sha256 TEXT NOT NULL,
  previous_version_id TEXT,
  previous_chain_sha256 TEXT,
  evidence_title TEXT NOT NULL,
  owner TEXT NOT NULL,
  period TEXT NOT NULL,
  frameworks TEXT NOT NULL,
  control_refs TEXT NOT NULL,
  change_note TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(evidence_id,version_no)
)`;
const controlTable = `CREATE TABLE IF NOT EXISTS evidence_version_controls(
  version_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  control_ref TEXT NOT NULL,
  normalized_ref TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(version_id,normalized_ref)
)`;
const indexes = [
  "CREATE INDEX IF NOT EXISTS evidence_versions_evidence_idx ON evidence_versions(evidence_id,version_no)",
  "CREATE INDEX IF NOT EXISTS evidence_versions_created_idx ON evidence_versions(created_at)",
  "CREATE INDEX IF NOT EXISTS evidence_version_controls_ref_idx ON evidence_version_controls(normalized_ref,created_at)",
  "CREATE INDEX IF NOT EXISTS evidence_version_controls_evidence_idx ON evidence_version_controls(evidence_id,version_no)",
];

export function normalizeEvidenceControlRef(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleLowerCase("tr-TR");
}

export function splitEvidenceControlRefs(value: unknown) {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const item of String(value ?? "").split(/[;,|\n]+/).map((entry) => entry.trim()).filter(Boolean)) {
    const normalized = normalizeEvidenceControlRef(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    refs.push(item.slice(0, 160));
  }
  return refs.slice(0, 100);
}

export function validateEvidenceFile(bytes: Uint8Array, declaredType: string) {
  if (!EVIDENCE_ALLOWED_TYPES.includes(declaredType as (typeof EVIDENCE_ALLOWED_TYPES)[number])) return false;
  const head = [...bytes.slice(0, 12)];
  if (declaredType === "application/pdf") return String.fromCharCode(...head.slice(0, 5)) === "%PDF-";
  if (declaredType === "image/png") return head.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (declaredType === "image/jpeg") return head[0] === 255 && head[1] === 216 && head[2] === 255;
  return String.fromCharCode(...head.slice(0, 4)) === "RIFF" && String.fromCharCode(...head.slice(8, 12)) === "WEBP";
}

export async function sha256HexBytes(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256HexText(value: string) {
  return sha256HexBytes(new TextEncoder().encode(value));
}

export type EvidenceChainInput = {
  evidenceId: string;
  versionNo: number;
  fileKey: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  contentSha256: string;
  previousVersionId?: string | null;
  previousChainSha256?: string | null;
  evidenceTitle: string;
  owner: string;
  period: string;
  frameworks: string;
  controlRefs: string;
  changeNote: string;
  createdBy: string;
  createdAt: string;
};

export function evidenceChainMaterial(input: EvidenceChainInput) {
  return JSON.stringify({
    evidenceId: input.evidenceId,
    versionNo: input.versionNo,
    fileKey: input.fileKey,
    fileName: input.fileName,
    fileType: input.fileType,
    fileSize: input.fileSize,
    contentSha256: input.contentSha256,
    previousVersionId: input.previousVersionId || "",
    previousChainSha256: input.previousChainSha256 || "",
    evidenceTitle: input.evidenceTitle,
    owner: input.owner,
    period: input.period,
    frameworks: input.frameworks,
    controlRefs: splitEvidenceControlRefs(input.controlRefs).join(", "),
    changeNote: input.changeNote,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
  });
}

export function computeEvidenceChainHash(input: EvidenceChainInput) {
  return sha256HexText(evidenceChainMaterial(input));
}

export async function ensureEvidenceHistorySchema(db: D1Database) {
  await db.prepare(versionTable).run();
  await db.prepare(controlTable).run();
  for (const sql of indexes) await db.prepare(sql).run();
}

export async function appendEvidenceVersion(db: D1Database, input: Omit<EvidenceChainInput, "versionNo" | "previousVersionId" | "previousChainSha256">) {
  await ensureEvidenceHistorySchema(db);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = await db.prepare("SELECT id,version_no,chain_sha256 FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1")
      .bind(input.evidenceId).first<{ id: string; version_no: number; chain_sha256: string }>();
    const versionNo = Number(previous?.version_no || 0) + 1;
    const id = `EVV-${crypto.randomUUID()}`;
    const chainInput: EvidenceChainInput = {
      ...input,
      versionNo,
      previousVersionId: previous?.id || null,
      previousChainSha256: previous?.chain_sha256 || null,
      controlRefs: splitEvidenceControlRefs(input.controlRefs).join(", "),
    };
    const chainSha256 = await computeEvidenceChainHash(chainInput);
    try {
      const versionStatement = db.prepare(`INSERT INTO evidence_versions(
        id,evidence_id,version_no,file_key,file_name,file_type,file_size,content_sha256,chain_sha256,
        previous_version_id,previous_chain_sha256,evidence_title,owner,period,frameworks,control_refs,change_note,created_by,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, input.evidenceId, versionNo, input.fileKey, input.fileName, input.fileType, input.fileSize,
        input.contentSha256, chainSha256, previous?.id || null, previous?.chain_sha256 || null,
        input.evidenceTitle, input.owner, input.period, input.frameworks, chainInput.controlRefs,
        input.changeNote, input.createdBy, input.createdAt,
      );
      const refs = splitEvidenceControlRefs(chainInput.controlRefs);
      const controlStatements = refs.map((controlRef) => db.prepare(
        "INSERT OR IGNORE INTO evidence_version_controls(version_id,evidence_id,control_ref,normalized_ref,version_no,created_at) VALUES(?,?,?,?,?,?)",
      ).bind(id, input.evidenceId, controlRef, normalizeEvidenceControlRef(controlRef), versionNo, input.createdAt));
      await db.batch([versionStatement, ...controlStatements]);
      return { id, versionNo, chainSha256, previousVersionId: previous?.id || "", previousChainSha256: previous?.chain_sha256 || "" };
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  throw new Error("Kanıt versiyonu oluşturulamadı.");
}

export async function verifyEvidenceVersionChain(rows: EvidenceVersionRow[]) {
  const ordered = [...rows].sort((a, b) => a.version_no - b.version_no);
  let previousId = "";
  let previousChain = "";
  for (const row of ordered) {
    if ((row.previous_version_id || "") !== previousId || (row.previous_chain_sha256 || "") !== previousChain) {
      return { state: "broken" as const, checked: ordered.length, failedVersion: row.version_no };
    }
    const expected = await computeEvidenceChainHash({
      evidenceId: row.evidence_id,
      versionNo: row.version_no,
      fileKey: row.file_key,
      fileName: row.file_name,
      fileType: row.file_type,
      fileSize: row.file_size,
      contentSha256: row.content_sha256,
      previousVersionId: row.previous_version_id,
      previousChainSha256: row.previous_chain_sha256,
      evidenceTitle: row.evidence_title,
      owner: row.owner,
      period: row.period,
      frameworks: row.frameworks,
      controlRefs: row.control_refs,
      changeNote: row.change_note,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
    if (expected !== row.chain_sha256) return { state: "broken" as const, checked: ordered.length, failedVersion: row.version_no };
    previousId = row.id;
    previousChain = row.chain_sha256;
  }
  return { state: ordered.length ? "verified" as const : "legacy-unverified" as const, checked: ordered.length, failedVersion: 0 };
}

export function publicEvidenceVersion(row: EvidenceVersionRow) {
  return {
    id: row.id,
    evidenceId: row.evidence_id,
    versionNo: row.version_no,
    fileKey: row.file_key,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    contentSha256: row.content_sha256,
    chainSha256: row.chain_sha256,
    previousVersionId: row.previous_version_id || "",
    evidenceTitle: row.evidence_title,
    owner: row.owner,
    period: row.period,
    frameworks: row.frameworks,
    controlRefs: splitEvidenceControlRefs(row.control_refs),
    changeNote: row.change_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
