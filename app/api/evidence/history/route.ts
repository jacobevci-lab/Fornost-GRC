import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../auth/security";
import { ensureCoreGrcSchemaCompatibility } from "../../grc/schema-compat";
import {
  appendEvidenceVersion,
  ensureEvidenceHistorySchema,
  normalizeEvidenceControlRef,
  publicEvidenceVersion,
  sha256HexBytes,
  splitEvidenceControlRefs,
  type EvidenceVersionRow,
} from "../../../evidence/versioning";

import { historyIntegrity, readEvidenceControlTimeline, readEvidenceHistoryOverview } from "../../../evidence/history-overview";
import { EVIDENCE_MAX_BYTES } from "../../../evidence/file-types";
import { validateEvidenceUpload, evidenceFileErrorMessage } from "../../../evidence/validate-upload";

type Env = Record<string, unknown> & { DB: D1Database; BUCKET?: R2Bucket };
type EvidenceRecord = { id: string; data_json: string; created_at: string; updated_at: string };
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
  await ensureCoreGrcSchemaCompatibility(env.DB);
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
    const results = await env.DB.batch([
      env.DB.prepare("SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 500").bind(evidenceId),
      env.DB.prepare("SELECT COUNT(*) total FROM evidence_versions WHERE evidence_id=?").bind(evidenceId),
      env.DB.prepare("SELECT id,data_json,created_at,updated_at FROM simple_grc_records WHERE id=? AND module='Kanıtlar'").bind(evidenceId),
    ]);
    // Reread the anchor in the same snapshot as the bounded history.
    const current = results[2].results[0] as EvidenceRecord | undefined;
    if (!current) return json({ error: "Kanıt kaydı bulunamadı." }, 404);
    const rows = results[0].results as unknown as EvidenceVersionRow[], total = Number((results[1].results[0] as { total: number })?.total || 0);
    const data = parse(current.data_json), integrity = await historyIntegrity(rows, total, data);
    const versions = rows.length ? rows.map(publicEvidenceVersion) : Number(data.versionNo || 0) > 0 ? [] : [legacySnapshot(current)];
    return json({ evidence: { id: current.id, ...data }, versions, integrity, versionsComplete: rows.length === total, totalVersions: total });
  }

  if (controlRef) {
    const normalized = normalizeEvidenceControlRef(controlRef);
    if (!normalized) return json({ error: "Kontrol referansı geçersiz." }, 400);
    return json({ controlRef, normalizedRef: normalized, ...await readEvidenceControlTimeline(env.DB, normalized) });
  }
  return json(await readEvidenceHistoryOverview(env.DB));
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
  if (file.size < 1 || file.size > EVIDENCE_MAX_BYTES) return json({ error: "Dosya 1 byte ile 10 MB arasında olmalı." }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let fileType: string;
  try { fileType = validateEvidenceUpload(bytes, file.name, file.type); } catch (error) { return json({ error: evidenceFileErrorMessage(error) }, 400); }
  const record = await recordById(env.DB, evidenceId);
  if (!record) return json({ error: "Kanıt kaydı bulunamadı." }, 404);
  const data = parse(record.data_json);
  const refs = splitEvidenceControlRefs(text(form.get("controlRefs"), 2000) || data.controlRefs || data.controlRef);
  if (!refs.length) return json({ error: "En az bir kontrol referansı gerekli." }, 400);
  const createdAt = new Date().toISOString();
  const fileName = safeFileName(file.name);
  const fileKey = `evidence/${evidenceId}/history/${crypto.randomUUID()}-${fileName}`;
  const contentSha256 = await sha256HexBytes(bytes);
  await putEvidenceObject(env, fileKey, fileName, fileType, bytes, createdAt);
  try {
    const version = await appendEvidenceVersion(env.DB, {
      evidenceId,
      fileKey,
      fileName,
      fileType,
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
          status: "İncelemede",
          reviewStatus: "pending-review",
          fileKey,
          fileName,
          fileType,
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
