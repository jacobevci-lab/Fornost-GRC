import {
  check,
  emailOk,
  hash,
  plusDays,
  sendLink,
  stamp,
  text,
  throttle,
  token,
  type Env,
} from "./store";
import { evaluateEvidenceEligibility } from "../evidence/eligibility";
import { evidenceReviewerIsIndependent } from "../evidence/intake";
import {
  sha256HexBytes,
  verifyEvidenceVersionChainWithAnchor,
  type EvidenceVersionRow,
} from "../evidence/versioning";
import { ensurePosture, indexPrograms } from "../framework-posture/store";
type Config = {
  policies: string[];
  documents: string[];
  frameworks: string[];
  tr: string;
  en: string;
};
const empty: Config = {
  policies: [],
  documents: [],
  frameworks: [],
  tr: "",
  en: "",
};
async function config(db: D1Database): Promise<Config> {
  const row = await db
    .prepare("SELECT config FROM trust_publication WHERE id=1")
    .first<{ config: string }>();
  return row ? JSON.parse(row.config) : empty;
}
async function catalog(db: D1Database, selected?: Config) {
  await ensurePosture(db);
  const [policies, files, programs] = await Promise.all([
    db
      .prepare(
        "SELECT v.id,p.title,v.content, v.version_number version FROM policy_documents p JOIN policy_versions v ON v.id=p.current_version_id WHERE p.status='published' AND v.status='published' AND (?=0 OR v.id IN (SELECT value FROM json_each(?)))",
      )
      .bind(selected ? 1 : 0, JSON.stringify(selected?.policies || []))
      .all<{ id: string; title: string; content: string; version: number }>(),
    db
      .prepare(
        "SELECT v.id,v.evidence_id,v.file_key,v.content_sha256,v.evidence_title title,r.data_json FROM simple_grc_records r JOIN evidence_versions v ON r.id=v.evidence_id AND v.id=json_extract(r.data_json,'$.reviewedVersion') AND v.version_no=(SELECT max(h.version_no) FROM evidence_versions h WHERE h.evidence_id=r.id) WHERE r.module='Kanıtlar' AND v.file_type='application/pdf' AND v.file_size<=10485760 AND (?=0 OR v.id IN (SELECT value FROM json_each(?)))",
      )
      .bind(selected ? 1 : 0, JSON.stringify(selected?.documents || []))
      .all<{
        id: string;
        evidence_id: string;
        file_key: string;
        content_sha256: string;
        title: string;
        data_json: string;
      }>(),
    indexPrograms(db),
  ]);
  const documents = files.results.filter((x) => {
    const d = JSON.parse(x.data_json);
    return (
      evaluateEvidenceEligibility(d).current &&
      d.reviewStatus === "approved" &&
      d.reviewedBy &&
      d.reviewedBy.toLowerCase() === String(d.reviewer).toLowerCase() &&
      evidenceReviewerIsIndependent(d) &&
      d.contentSha256 === x.content_sha256
    );
  });
  return {
    policies: policies.results,
    documents,
    frameworks: programs.enrolled,
  };
}
export async function trustView(db: D1Database, admin = false) {
  const c = await config(db);
  if (
    !admin &&
    !c.policies.length &&
    !c.documents.length &&
    !c.frameworks.length
  )
    return { tr: c.tr, en: c.en, policies: [], documents: [], frameworks: [] };
  const data = await catalog(db, admin ? undefined : c);
  const options = {
    policies: data.policies.map(({ id, title }) => ({ id, title })),
    documents: data.documents.map(({ id, title }) => ({ id, title })),
    frameworks: data.frameworks,
  };
  if (admin)
    return {
      config: c,
      options,
      requests: (
        await db
          .prepare(
            "SELECT id,version_id,name,company,email,status,acknowledged_at FROM trust_requests ORDER BY acknowledged_at DESC LIMIT 150",
          )
          .all()
      ).results,
    };
  return {
    tr: c.tr,
    en: c.en,
    policies: data.policies
      .filter((v) => c.policies.includes(v.id))
      .map(({ title, version, content }) => ({ title, version, content })),
    documents: options.documents.filter((v) => c.documents.includes(v.id)),
    frameworks: data.frameworks.filter((v) => c.frameworks.includes(v)),
  };
}
export async function publish(
  db: D1Database,
  b: Record<string, unknown>,
  actor: string,
) {
  const options = await catalog(db);
  const select = (key: string, allowed: string[]) => {
    const list = b[key];
    check(
      Array.isArray(list) &&
        list.length <= 100 &&
        list.every((x) => typeof x === "string" && allowed.includes(x)),
      409,
      "selection",
    );
    return [...new Set(list as string[])];
  };
  const c: Config = {
    documents: select(
      "documents",
      options.documents.map((x) => x.id),
    ),
    policies: select(
      "policies",
      options.policies.map((x) => x.id),
    ),
    frameworks: select("frameworks", options.frameworks),
    tr: text(b.tr, 4000),
    en: text(b.en, 4000),
  };
  await db.batch([
    db
      .prepare("INSERT OR REPLACE INTO trust_publication VALUES(1,?,?,?)")
      .bind(JSON.stringify(c), actor, stamp()),
    db
      .prepare(
        "UPDATE trust_requests SET status='revoked',grant_hash=NULL WHERE status IN ('pending','approved') AND version_id NOT IN(SELECT value FROM json_each(?))",
      )
      .bind(JSON.stringify(c.documents)),
  ]);
  return { ok: true };
}
async function listed(db: D1Database, id: string) {
  const c = await config(db);
  check(c.documents.includes(id), 410, "document");
  const d = (await catalog(db, { ...empty, documents: [id] })).documents.find(
    (v) => v.id === id,
  );
  check(d, 410, "document");
  return d;
}
export async function requestAccess(
  db: D1Database,
  req: Request,
  b: Record<string, unknown>,
) {
  await throttle(db, req, "nda", 10);
  const version = text(b.document, 128),
    email = text(b.email, 254).toLowerCase(),
    name = text(b.name, 120),
    company = text(b.company, 160);
  check(
    name &&
      company &&
      emailOk(email) &&
      !/@(gmail|hotmail|outlook|yahoo|icloud|protonmail)\.com$/i.test(email) &&
      b.accepted === true,
    422,
    "nda",
  );
  await listed(db, version);
  await db
    .prepare(
      "INSERT INTO trust_requests(id,version_id,name,company,email,acknowledged_at,nda_version) SELECT ?,?,?,?,?,?,'1' WHERE NOT EXISTS(SELECT 1 FROM trust_requests WHERE version_id=? AND email=? AND status='pending')",
    )
    .bind(
      crypto.randomUUID(),
      version,
      name,
      company,
      email,
      stamp(),
      version,
      email,
    )
    .run();
  return { submitted: true };
}
export async function decide(
  env: Env,
  req: Request,
  id: string,
  action: string,
  actor: string,
) {
  const db = env.DB,
    at = stamp();
  if (action === "revoke") {
    const r = await db
      .prepare(
        "UPDATE trust_requests SET status='revoked',grant_hash=NULL,decided_at=?,decided_by=? WHERE id=? AND status IN ('pending','approved')",
      )
      .bind(at, actor, id)
      .run();
    check(r.meta?.changes, 409, "state");
    return { ok: true };
  }
  const row = await db
    .prepare(
      "SELECT version_id,email FROM trust_requests WHERE id=? AND status='pending'",
    )
    .bind(id)
    .first<{ version_id: string; email: string }>();
  check(row, 409, "state");
  await listed(db, row.version_id);
  const key = token(),
    r = await db
      .prepare(
        "UPDATE trust_requests SET status='approved',grant_hash=?,expires_at=?,decided_by=?,decided_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM trust_publication,json_each(config,'$.documents') WHERE value=trust_requests.version_id)",
      )
      .bind(await hash(key), plusDays(7), actor, at, id)
      .run();
  check(r.meta?.changes, 409, "state");
  return sendLink(
    db,
    env,
    req,
    row.email,
    "/trust-center#access=" + key,
    "Fornost · Kısıtlı belge erişimi / Restricted document access",
  );
}
export async function download(env: Env, key: string) {
  check(/^[a-f0-9]{64}$/.test(key), 404, "link");
  const digest = await hash(key);
  const row = await env.DB.prepare(
    "SELECT version_id,email,company,id FROM trust_requests WHERE grant_hash=? AND status='approved' AND expires_at>?",
  )
    .bind(digest, stamp())
    .first<{
      version_id: string;
      email: string;
      company: string;
      id: string;
    }>();
  check(row, 410, "link");
  const d = await listed(env.DB, row.version_id),
    meta = JSON.parse(d.data_json),
    history = await env.DB.prepare(
      "SELECT * FROM evidence_versions WHERE evidence_id=? ORDER BY version_no",
    )
      .bind(d.evidence_id)
      .all<EvidenceVersionRow>();
  check(
    (
      await verifyEvidenceVersionChainWithAnchor(history.results, {
        versionNo: meta.versionNo,
        chainSha256: meta.versionChainSha256,
      })
    ).state === "verified",
    409,
    "integrity",
  );
  const file = await env.BUCKET?.get(d.file_key);
  const raw = file
    ? await new Response(file.body).arrayBuffer()
    : (
        await env.DB.prepare(
          "SELECT content FROM simple_evidence_files WHERE file_key=?",
        )
          .bind(d.file_key)
          .first<{ content: number[] | ArrayBuffer }>()
      )?.content;
  check(raw, 410, "document");
  const bytes = Array.isArray(raw) ? Uint8Array.from(raw) : new Uint8Array(raw);
  check((await sha256HexBytes(bytes)) === d.content_sha256, 409, "integrity");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib"),
    src = await PDFDocument.load(bytes),
    out = await PDFDocument.create(),
    font = await out.embedFont(StandardFonts.Helvetica);
  check(src.getPageCount() > 0 && src.getPageCount() <= 400, 422, "file");
  const label = (row.email + " | " + row.company + " | " + row.id.slice(0, 8))
    .normalize("NFKD")
    .replace(/[^ -~]/g, "?");
  for (const p of src.getPages()) {
    const { width, height } = p.getSize(),
      embedded = await out.embedPage(p),
      page = out.addPage([width, height + 26]);
    page.drawPage(embedded, { x: 0, y: 26 });
    page.drawText(label, {
      x: 8,
      y: 9,
      font,
      size: Math.min(
        9,
        (width - 16) / Math.max(1, font.widthOfTextAtSize(label, 1)),
      ),
      color: rgb(0.05, 0.31, 0.32),
    });
    page.drawText(row.id.slice(0, 8), {
      x: width * 0.38,
      y: height * 0.48,
      size: Math.max(10, Math.min(32, width / 15)),
      font,
      opacity: 0.18,
    });
  }
  const verified = await env.DB.prepare(
    "SELECT 1 FROM trust_requests WHERE grant_hash=? AND status='approved' AND expires_at>?",
  )
    .bind(digest, stamp())
    .first();
  check(verified, 410, "link");
  return new Response(new Uint8Array(await out.save()), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'attachment; filename="Fornost-restricted.pdf"',
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
