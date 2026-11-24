import {withBasePath} from "../base-path";
import {event} from '../enterprise/http';
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
  titleTr:string;titleEn:string;ndaRequired:string[];
  tr: string;
  en: string;
};
const empty: Config = {
  titleTr:"",titleEn:"",ndaRequired:[],
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
  if(!row)return empty;const parsed=JSON.parse(row.config);return {...empty,...parsed,ndaRequired:parsed.ndaRequired??parsed.documents??[]};
}
async function catalog(db: D1Database, selected?: Config) {
  await ensurePosture(db);
  const [policies, files, programs] = await Promise.all([
    db
      .prepare(
        "SELECT v.id,coalesce(c.code,p.code) code,p.title,v.content, v.version_number version FROM policy_documents p JOIN policy_versions v ON v.id=p.current_version_id LEFT JOIN simple_grc_record_codes c ON c.record_id=p.id WHERE p.status='published' AND v.status='published' AND (?=0 OR v.id IN (SELECT value FROM json_each(?)))",
      )
      .bind(selected ? 1 : 0, JSON.stringify(selected?.policies || []))
      .all<{ id: string; code:string; title: string; content: string; version: number }>(),
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
    return {titleTr:c.titleTr,titleEn:c.titleEn,tr: c.tr, en: c.en, policies: [], documents: [], frameworks: [] };
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
            "SELECT r.id,r.version_id,r.name,r.company,r.email,r.status,r.acknowledged_at,r.expires_at expiresAt,d.reason,coalesce(d.nda_required,1) ndaRequired,coalesce(d.accepted_at,CASE WHEN d.request_id IS NULL THEN r.acknowledged_at END) acceptedAt FROM trust_requests r LEFT JOIN trust_request_details d ON d.request_id=r.id ORDER BY acknowledged_at DESC LIMIT 150",
          )
          .all()
      ).results,
    };
  return {
    titleTr:c.titleTr,titleEn:c.titleEn,
    tr: c.tr,
    en: c.en,
    policies: data.policies
      .filter((v) => c.policies.includes(v.id))
      .map(({ title, code,version, content }) => ({ title, code,version, content })),
    documents: options.documents.filter((v) => c.documents.includes(v.id)).map(v=>({...v,ndaRequired:c.ndaRequired.includes(v.id)})),
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
    titleTr:text(b.titleTr,160),titleEn:text(b.titleEn,160),
    ndaRequired: b.ndaRequired===undefined?select("documents",options.documents.map(x=>x.id)):select("ndaRequired",Array.isArray(b.documents)?b.documents as string[]:[]),
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
    db.prepare("UPDATE trust_requests SET status='revoked',grant_hash=NULL WHERE status IN ('pending','approved') AND version_id IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM trust_request_details d WHERE d.request_id=trust_requests.id AND d.accepted_at IS NULL)").bind(JSON.stringify(c.ndaRequired)),
    event(db,actor,"trust-published",JSON.stringify({policies:c.policies,documents:c.documents,frameworks:c.frameworks,ndaRequired:c.ndaRequired})),
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
    company = text(b.company, 160),reason=text(b.reason,2000),c=await config(db),ndaRequired=c.ndaRequired.includes(version);
  check(
    name &&
      company &&
      emailOk(email) &&
      !/@(gmail|hotmail|outlook|yahoo|icloud|protonmail)\.com$/i.test(email) &&
      reason.length>=10 && (b.reason as string).length<=2000 && (!ndaRequired||b.accepted === true),
    422,
    "nda",
  );
  await listed(db, version);
  const id=crypto.randomUUID(),at=stamp();
  await db.batch([
    db.prepare("INSERT INTO trust_requests(id,version_id,name,company,email,acknowledged_at,nda_version) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM trust_requests WHERE version_id=? AND email=? AND status='pending')").bind(id,version,name,company,email,at,ndaRequired?'1':'not-required',version,email),
    db.prepare('INSERT INTO trust_request_details SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM trust_requests WHERE id=?)').bind(id,reason,ndaRequired?1:0,b.accepted===true?at:null,id),
    event(db,'external-visitor','trust-access-requested',JSON.stringify({request:id,version,ndaRequired}),'changes()=1'),
  ]);
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
  if (action === "revoke"||action === "reject") {
    const result=await db.batch([
      db.prepare("UPDATE trust_requests SET status=?,grant_hash=NULL,decided_at=?,decided_by=? WHERE id=? AND (status='pending' OR ?='revoke' AND status='approved')").bind(action==='reject'?'rejected':'revoked',at,actor,id,action),
      event(db,actor,action==='reject'?'trust-access-rejected':'trust-access-revoked',JSON.stringify({request:id}),'changes()=1'),
    ]);check(result[0].meta?.changes,409,'state');
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
  const c=await config(db),detail=await db.prepare('SELECT * FROM trust_request_details WHERE request_id=?').bind(id).first<{accepted_at:string|null}>();
  check(!c.ndaRequired.includes(row.version_id)||!detail||detail.accepted_at,422,'nda');
  const publication=await db.prepare("SELECT config FROM trust_publication WHERE id=1").first<{config:string}>();
  const key = token(),
    result = await db.batch([db
      .prepare(
        "UPDATE trust_requests SET status='approved',grant_hash=?,expires_at=?,decided_by=?,decided_at=? WHERE id=? AND status='pending' AND EXISTS(SELECT 1 FROM trust_publication,json_each(config,'$.documents') WHERE value=trust_requests.version_id) AND (SELECT config FROM trust_publication WHERE id=1)=?",
      )
      .bind(await hash(key), plusDays(7), actor, at, id,publication?.config||'')
      ,event(db,actor,'trust-access-approved',JSON.stringify({request:id,version:row.version_id,days:7}),'changes()=1')]);
  check(result[0].meta?.changes, 409, "state");
  const delivery=await sendLink(
    db,
    env,
    req,
    row.email,
    "/trust-center#access=" + key,
    "Fornost · Kısıtlı belge erişimi / Restricted document access",
  );
  return {...delivery,url:delivery.url||withBasePath("/trust-center#access="+key),expiresAt:plusDays(7)};
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
  const c=await config(env.DB),detail=await env.DB.prepare("SELECT accepted_at FROM trust_request_details WHERE request_id=?").bind(row.id).first<{accepted_at:string|null}>();
  check(!c.ndaRequired.includes(row.version_id)||!detail||detail.accepted_at,410,"nda");
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
  const current=await listed(env.DB,row.version_id);check(current.data_json===d.data_json,409,"integrity");
  await event(env.DB,"external-visitor","trust-document-downloaded",JSON.stringify({request:row.id,version:row.version_id})).run();
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
