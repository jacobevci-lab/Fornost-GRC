import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import {
  appendEvidenceVersion,
  ensureEvidenceHistorySchema,
  normalizeEvidenceControlRef,
  publicEvidenceVersion,
  sha256HexBytes,
  splitEvidenceControlRefs,
  validateEvidenceFile,
  verifyEvidenceVersionChainWithAnchor,
  type EvidenceIntegrityState,
  type EvidenceVersionRow,
} from "../../../evidence/versioning";

type Env = Record<string, unknown> & { DB: D1Database; BUCKET?: R2Bucket };
type EvidenceRecord = { id: string; data_json: string; created_at: string; updated_at: string };
type EvidenceIntegrityOverviewState = EvidenceIntegrityState | "unavailable";
type EvidenceIntegrityOverview = {
  state: EvidenceIntegrityOverviewState;
  checked: number;
  failedVersion: number;
};

type EvidenceItem = {
  id: string;
  title: string;
  owner: string;
  period: string;
  controlRefs: string[];
  currentVersion: number;
  headHash: string;
  updatedAt: string;
  tracked: boolean;
};

const recordTable = `CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const filesTable = `CREATE TABLE IF NOT EXISTS simple_evidence_files (file_key TEXT PRIMARY KEY,file_name TEXT NOT NULL,content_type TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL)`;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
const text = (value: unknown, max = 2000) => String(value ?? "").trim().slice(0, max);
const parse = (raw: string) => {
  try {
    const data = JSON.parse(raw || "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as Env;
}

async function ready(env: Env) {
  await env.DB.prepare(recordTable).run();
  await env.DB.prepare(filesTable).run();
  await ensureEvidenceHistorySchema(env.DB);
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "evidence";
}

async function putEvidenceObject(env: Env, key: string, fileName: string, fileType: string, bytes: Uint8Array, createdAt: string) {
  if (env.BUCKET) {
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: fileType } });
    return;
  }
  await env.DB.prepare("INSERT INTO simple_evidence_files(file_key,file_name,content_type,content,created_at) VALUES(?,?,?,?,?)")
    .bind(key, fileName, fileType, bytes, createdAt).run();
}

async function removeEvidenceObject(env: Env, key: string) {
  try {
    if (env.BUCKET) {
      const bucket = env.BUCKET as unknown as { delete?: (objectKey: string) => Promise<unknown> };
      if (bucket.delete) await bucket.delete(key);
    } else await env.DB.prepare("DELETE FROM simple_evidence_files WHERE file_key=?").bind(key).run();
  } catch {
    // Best-effort orphan cleanup after a failed metadata transaction.
  }
}

async function recordById(db: D1Database, evidenceId: string) {
  return db.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE id=? AND module='Kanıtlar'")
    .bind(evidenceId).first<EvidenceRecord>();
}

async function listEvidenceItems(db: D1Database): Promise<EvidenceItem[]> {
  const rows = await db.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE module='Kanıtlar' ORDER BY updated_at DESC LIMIT 500").all<EvidenceRecord>();
  return rows.results.map((row) => {
    const data = parse(row.data_json);
    const refs = splitEvidenceControlRefs(data.controlRefs || data.controlRef);
    return {
      id: row.id,
      title: text(data.evidenceTitle || row.id, 180),
      owner: text(data.owner, 180),
      period: text(data.period, 120),
      controlRefs: refs,
      currentVersion: Number(data.versionNo || 0),
      headHash: text(data.versionChainSha256, 64),
      updatedAt: row.updated_at,
      tracked: Number(data.versionNo || 0) > 0,
    };
  });
}

function legacySnapshot(record: EvidenceRecord) {
  const data = parse(record.data_json);
  return {
    id: `legacy:${record.id}`,
    evidenceId: record.id,
    versionNo: 0,
    fileKey: text(data.fileKey, 500),
    fileName: text(data.fileName, 180),
    fileType: text(data.fileType, 100),
    fileSize: Number(data.fileSize || 0),
    contentSha256: text(data.contentSha256, 64),
    chainSha256: "",
    previousVersionId: "",
    evidenceTitle: text(data.evidenceTitle || record.id, 180),
    owner: text(data.owner, 180),
    period: text(data.period, 120),
    frameworks: text(data.frameworks, 1000),
    controlRefs: splitEvidenceControlRefs(data.controlRefs || data.controlRef),
    changeNote: "Legacy evidence created before version-chain tracking.",
    createdBy: "legacy",
    createdAt: record.created_at,
    legacy: true,
  };
}

export async function GET(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (access.response) return access.response;
  const env = await runtime();
  await ready(env);
  const evidenceId = text(req.nextUrl.searchParams.get("id"), 120);
  const controlRef = text(req.nextUrl.searchParams.get("controlRef"), 160);

  if (evidenceId) {
    const record = await recordById(env.DB, evidenceId);
    if (!record) return json({ error: "Kanıt kaydı bulunamadı." }, 404);
    const rows = await env.DB.prepare("SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no ASC LIMIT 500")
      .bind(evidenceId).all<EvidenceVersionRow>();
    const data = parse(record.data_json);
    const integrity = await verifyEvidenceVersionChainWithAnchor(rows.results, {
      versionNo: data.versionNo,
      chainSha256: data.versionChainSha256,
    });
    const versions = rows.results.length ? rows.results.map(publicEvidenceVersion).reverse() : [legacySnapshot(record)];
    return json({ evidence: { id: record.id, ...data }, versions, integrity });
  }

  if (controlRef) {
    const normalized = normalizeEvidenceControlRef(controlRef);
    if (!normalized) return json({ error: "Kontrol referansı geçersiz." }, 400);
    const rows = await env.DB.prepare(`SELECT v.* FROM evidence_version_controls c
      JOIN evidence_versions v ON v.id=c.version_id
      WHERE c.normalized_ref=? ORDER BY v.created_at DESC,v.version_no DESC LIMIT 300`)
      .bind(normalized).all<EvidenceVersionRow>();
    return json({ controlRef, normalizedRef: normalized, timeline: rows.results.map(publicEvidenceVersion), count: rows.results.length });
  }

  const [recent, allVersions, items, totals] = await Promise.all([
    env.DB.prepare("SELECT * FROM evidence_versions ORDER BY created_at DESC,version_no DESC LIMIT 100").all<EvidenceVersionRow>(),
    env.DB.prepare("SELECT * FROM evidence_versions ORDER BY evidence_id,version_no LIMIT 2000").all<EvidenceVersionRow>(),
    listEvidenceItems(env.DB),
    env.DB.prepare("SELECT COUNT(*) total,COUNT(DISTINCT evidence_id) evidence_count FROM evidence_versions").first<{ total: number; evidence_count: number }>(),
  ]);
  const grouped = new Map<string, EvidenceVersionRow[]>();
  for (const row of allVersions.results) grouped.set(row.evidence_id, [...(grouped.get(row.evidence_id) || []), row]);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const integrityByEvidenceId = new Map<string, EvidenceIntegrityOverview>();
  let verified = 0;
  let broken = 0;
  for (const [id, rows] of grouped) {
    const item = itemById.get(id);
    if (!item || !item.tracked || rows.length !== item.currentVersion) {
      integrityByEvidenceId.set(id, { state: "unavailable", checked: rows.length, failedVersion: 0 });
      continue;
    }
    const state = await verifyEvidenceVersionChainWithAnchor(rows, {
      versionNo: item.currentVersion,
      chainSha256: item.headHash,
    });
    integrityByEvidenceId.set(id, state);
    if (state.state === "verified") verified += 1;
    else if (state.state === "broken") broken += 1;
  }
  const evidenceItems = items.map(({ headHash: _headHash, ...item }) => {
    const integrity = item.tracked
      ? integrityByEvidenceId.get(item.id) || { state: "unavailable" as const, checked: 0, failedVersion: 0 }
      : { state: "legacy-unverified" as const, checked: 0, failedVersion: 0 };
    return { ...item, integrity: integrity.state, checkedVersions: integrity.checked, failedVersion: integrity.failedVersion };
  });
  const integrityScanComplete = evidenceItems.filter((item) => item.tracked).every((item) => item.integrity !== "unavailable");
  const linkedControls = await env.DB.prepare("SELECT COUNT(DISTINCT normalized_ref) total FROM evidence_version_controls").first<{ total: number }>();
  return json({
    evidenceItems,
    recentVersions: recent.results.map(publicEvidenceVersion),
    summary: {
      evidenceRecords: items.length,
      trackedEvidence: Number(totals?.evidence_count || 0),
      legacyEvidence: Math.max(0, items.length - Number(totals?.evidence_count || 0)),
      totalVersions: Number(totals?.total || 0),
      linkedControls: Number(linkedControls?.total || 0),
      verifiedChains: verified,
      brokenChains: broken,
      integrityScanComplete,
    },
  });
}

export async function POST(req: NextRequest) {
  const access = await requireRole(req, ["Admin", "Editor"]);
  if (access.response) return access.response;
  if (Number(req.headers.get("content-length") || 0) > 11 * 1024 * 1024) return json({ error: "İstek boyutu çok büyük." }, 413);
  const env = await runtime();
  await ready(env);
  const form = await req.formData();
  const evidenceId = text(form.get("evidenceId"), 120);
  const changeNote = text(form.get("changeNote"), 1000);
  const file = form.get("file");
  if (!/^EVD-[a-zA-Z0-9-]+$/.test(evidenceId)) return json({ error: "Geçerli bir kanıt referansı gerekli." }, 400);
  if (changeNote.length < 5) return json({ error: "Versiyon değişiklik notu en az 5 karakter olmalı." }, 400);
  if (!(file instanceof File)) return json({ error: "Yeni versiyon dosyası gerekli." }, 400);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) return json({ error: "Dosya 1 byte ile 10 MB arasında olmalı." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validateEvidenceFile(bytes, file.type)) return json({ error: "Yalnız PDF/JPG/PNG/WebP ve doğrulanmış dosya içeriği kabul edilir." }, 400);
  const record = await recordById(env.DB, evidenceId);
  if (!record) return json({ error: "Kanıt kaydı bulunamadı." }, 404);
  const data = parse(record.data_json);
  const refs = splitEvidenceControlRefs(text(form.get("controlRefs"), 2000) || data.controlRefs || data.controlRef);
  if (!refs.length) return json({ error: "En az bir kontrol referansı gerekli." }, 400);
  const createdAt = new Date().toISOString();
  const fileName = safeFileName(file.name);
  const fileKey = `evidence/${evidenceId}/history/${crypto.randomUUID()}-${fileName}`;
  const contentSha256 = await sha256HexBytes(bytes);
  await putEvidenceObject(env, fileKey, fileName, file.type, bytes, createdAt);
  try {
    const version = await appendEvidenceVersion(env.DB, {
      evidenceId,
      fileKey,
      fileName,
      fileType: file.type,
      fileSize: file.size,
      contentSha256,
      evidenceTitle: text(data.evidenceTitle || evidenceId, 180),
      owner: text(data.owner, 180),
      period: text(data.period, 120),
      frameworks: text(data.frameworks, 1000),
      controlRefs: refs.join(", "),
      changeNote,
      createdBy: access.actor.email,
      createdAt,
    }, {
      additionalStatements: (commit) => {
        const nextData = {
          ...data,
          fileKey,
          fileName,
          fileType: file.type,
          fileSize: String(file.size),
          contentSha256,
          versionNo: String(commit.versionNo),
          versionChainSha256: commit.chainSha256,
          versionUpdatedAt: createdAt,
          controlRef: refs[0],
          controlRefs: refs.join(", "),
        };
        return [env.DB.prepare("UPDATE simple_grc_records SET data_json=?,updated_at=? WHERE id=? AND module='Kanıtlar'")
          .bind(JSON.stringify(nextData), createdAt, evidenceId)];
      },
    });
    return json({ ok: true, message: `Kanıt v${version.versionNo} olarak versiyonlandı.`, version: { ...version, evidenceId, fileKey, fileName, contentSha256, controlRefs: refs } }, 201);
  } catch (error) {
    await removeEvidenceObject(env, fileKey);
    return json({ error: error instanceof Error ? error.message : "Kanıt versiyonu kaydedilemedi." }, 500);
  }
}
