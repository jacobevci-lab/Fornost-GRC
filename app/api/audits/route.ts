import { auditPeriod, auditTypes, validateAuditTeam } from '../../audit-engagement';
import { emptyAuditPlan } from '../../audit-plan';
import { programName } from "../../framework-posture/catalog";
import { baselineToken, ensurePosture, makeBaseline, PostureError, readMatrix } from "../../framework-posture/store";
import { iso27001Refs, iso27001Titles } from '../../framework-posture/iso-annex';
import { auditRemovalPreview, updateAudit } from "../../audit-management";
import { canReadModule, canReadPosture, canWriteModule, isScoped } from "../../module-access";
import { deleteAudit, AuditLinked } from "../../audit-delete";
import { LifecycleConflict } from "../../enterprise-lifecycle-write";
import { ensureAuditClosureSchema } from "../../audit-closure-schema";
import { isAuditClosedError, auditClosedMessage } from "../../audit-closure";
import {getCatalogStatus} from "../../framework-catalog-status";
import asvsManifest from "../../asvs-catalog-manifest.json";
import { iso27001Management } from "../grc/iso27001-management";
import { readCatalogRequest, validateCatalogImport, type AuditCatalogImport } from "../../audit-catalog-import";
import { auditRequirementInserts } from "../../audit-create-batch";
import { nistCatalogs } from "../grc/nist-catalogs";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../auth/security";
import { soc2TemplateControls, soc2TemplateMeta } from "../grc/soc2-template";
import { frameworkTemplateCatalogs } from "../grc/framework-catalogs";

const auditsTable = `CREATE TABLE IF NOT EXISTS simple_audits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  template TEXT NOT NULL,
  audit_type TEXT NOT NULL,
  auditor TEXT NOT NULL,
  audit_owner TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;
const recordsTable = `CREATE TABLE IF NOT EXISTS simple_grc_records (id TEXT PRIMARY KEY,module TEXT NOT NULL,data_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`;
const metadataTable = `CREATE TABLE IF NOT EXISTS simple_grc_metadata (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)`;

type AuditInput = Record<string, unknown>;
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";

async function db() {
  const { env } = await import("cloudflare:workers");
  await env.DB.batch([env.DB.prepare("CREATE TABLE IF NOT EXISTS simple_grc_record_codes(record_id TEXT PRIMARY KEY,module TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)"), env.DB.prepare(auditsTable), env.DB.prepare(recordsTable), env.DB.prepare(metadataTable)]);
  return env.DB;
}

function auditTemplateRows(audit: Record<string, unknown>, imported?: AuditCatalogImport) {
  const template = String(audit.template || ""), name = String(audit.name || ""), nowDate = audit.structured ? "" : new Date().toISOString().slice(0, 10);
  const common = {
    catalogRevision: imported?.version || "2026-10-05-full-packs",
    auditName: name,
    auditType: String(audit.audit_type || ""),
    auditor: String(audit.auditor || ""),
    auditOwner: String(audit.audit_owner || ""),
    startDate: String(audit.periodStart || nowDate),
    endDate: String(audit.periodEnd || nowDate),
    dueDate: String(audit.targetDate || nowDate),
    status: "Başlanmadı",
    progress: 0,
    evidenceStatus: "Kanıt Bekleniyor",
    followUpOwner: String(audit.audit_owner || ""),
    recordKind: "ControlAssessment",
  };
  if (imported) return imported.requirements.map(requirement => ({...common, frameworkTemplate: imported.name, requirementRef:requirement.ref, controlRef:requirement.ref, requirementTitle:requirement.title, requirementStatement:requirement.statement, requirementGuidance:requirement.guidance || "", requirementAssessment:requirement.assessment || "", scopeCategory:requirement.category, catalogSource:imported.source, owner:String(audit.audit_owner || "Atanmadı")}));
  if (template.startsWith("SOC 2")) return soc2TemplateControls.map((control) => ({
    ...common,
    frameworkTemplate: soc2TemplateMeta.name,
    requirementRef: control.tscId,
    requirementTitle: control.expectation,
    controlRef: control.tscId,
    owner: control.controlOwner,
    businessUnit: control.controlOwner.split("/")[0].trim() || "Bilgi Güvenliği",
    frequency: control.frequency,
    scopeCategory: control.tscCategory.split("/")[0].trim(),
    expectedEvidence: control.expectedEvidence,
    typeIITestApproach: template === "SOC 2 Type I" ? "Belirlenen tarih itibarıyla kontrol tasarımını ve uygulanmasını doğrula; dönemsel operasyonel etkinlik görüşü oluşturma." : control.typeIITestApproach,
    isoAnnex: control.isoAnnex,
    isoClauses: control.isoClauses,
    designEffectiveness: "Test Edilmedi",
    operatingEffectiveness: "Test Edilmedi",
    auditorResult: "Değerlendirilmedi",
  }));
  if (template.startsWith("ISO/IEC 27001")) return [...iso27001Management.map(requirement => ({...common,frameworkTemplate:"ISO/IEC 27001:2022 + Amd 1:2024",requirementRef:requirement.ref,controlRef:requirement.ref,requirementTitle:requirement.title,owner:String(audit.audit_owner || "Bilgi Güvenliği"),businessUnit:"Bilgi Güvenliği",scopeCategory:requirement.category})), ...iso27001Refs.map((ref) => ({
    ...common,
    frameworkTemplate: "ISO/IEC 27001:2022 Annex A",
    requirementRef: ref,
    requirementTitle: iso27001Titles[ref] || "",
    controlRef: ref,
    owner: String(audit.audit_owner || "Bilgi Güvenliği"),
    businessUnit: "Bilgi Güvenliği",
    scopeCategory: ref.startsWith("A.5.") ? "Organizasyonel" : ref.startsWith("A.6.") ? "İnsan" : ref.startsWith("A.7.") ? "Fiziksel" : "Teknolojik",
  }))];
  const catalog = frameworkTemplateCatalogs[template];
  if (catalog) return catalog.map((requirement) => ({
    ...common,
    frameworkTemplate: template,
    requirementRef: requirement.ref,
    requirementTitle: requirement.title,
    requirementStatement: requirement.statement || "",
    requirementGuidance: requirement.guidance || "",
    requirementAssessment: requirement.assessment || "",
    parentRequirementRef: requirement.parentRef || "",
    catalogSource: nistCatalogs.find(c => c.name === template)?.source || (template===asvsManifest.name?asvsManifest.source:getCatalogStatus(template).source || ""),
    controlRef: requirement.ref,
    owner: requirement.owner || String(audit.audit_owner || "Bilgi Güvenliği"),
    businessUnit: requirement.owner || "Bilgi Güvenliği",
    scopeCategory: requirement.category,
  }));
  return [];
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor", "Viewer"]);
  if (auth.response) return auth.response;
  const d = await db(); await ensureAuditClosureSchema(d);
  if (!canReadModule(auth.actor, "Denetim Yönetimi")) return NextResponse.json({error:"forbidden"},{status:403});
  if(req.nextUrl.searchParams.get("view")==="metrics") {
    const pbc=await d.prepare("SELECT count(*) AS n FROM audit_requests r JOIN simple_audits a ON r.audit_id=a.id WHERE json_extract(r.data_json,'$.status') IN ('assigned','changes_requested','submitted')").first<{n:number}>();
    const findings=!isScoped(auth.actor) && canReadModule(auth.actor,"Bulgular ve CAPA")?await d.prepare("SELECT count(*) AS n FROM enterprise_findings WHERE source_type='audit' AND status NOT IN ('closed','cancelled') AND NOT (status='accepted' AND accept_until>=date('now'))").first<{n:number}>():null;
    return NextResponse.json({pbc:pbc?.n??null,findings:findings?.n??null},{headers:{'cache-control':'private, no-store'}});
  }
  if(req.nextUrl.searchParams.get("view")==="findings") {
    if(isScoped(auth.actor))return NextResponse.json({error:"forbidden"},{status:403});
    const id=req.nextUrl.searchParams.get("id")||"";
    const audit=await d.prepare("SELECT id,name FROM simple_audits WHERE id=?").bind(id).first<{id:string;name:string}>();
    if(!audit)return NextResponse.json({error:"missing"},{status:404});
    const exists=await d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='enterprise_findings'").first();
    if(!exists)return NextResponse.json({findings:[],complete:true},{headers:{"cache-control":"private, no-store"}});
    const findings=await d.prepare(`WITH RECURSIVE targets(value) AS (SELECT ? UNION SELECT r.id FROM simple_grc_records r WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=? UNION SELECT c.code FROM simple_grc_record_codes c JOIN simple_grc_records r ON r.id=c.record_id WHERE r.module='Denetim Yönetimi' AND json_extract(r.data_json,'$.auditName')=?), tokens(id,token,rest) AS (
      SELECT id,'',replace(replace(replace(replace(source_ref,',',';'),'|',';'),char(10),';'),char(13),';')||';' FROM enterprise_findings WHERE source_type='audit'
      UNION ALL SELECT id,trim(substr(rest,1,instr(rest,';')-1)),substr(rest,instr(rest,';')+1) FROM tokens WHERE rest<>''
    ) SELECT id,title,status,owner,due_date FROM enterprise_findings WHERE id IN (SELECT id FROM tokens WHERE lower(token) IN (SELECT lower(value) FROM targets)) ORDER BY updated_at DESC,id LIMIT 201`).bind(id,audit.name,audit.name).all();
    return NextResponse.json({findings:findings.results.slice(0,200),complete:findings.results.length<=200},{headers:{"cache-control":"private, no-store"}});
  }
  if (req.nextUrl.searchParams.get("view") === "removal") {
    if(auth.actor.role!=="Admin") return NextResponse.json({error:"forbidden"},{status:403});
    const audit = await d.prepare("SELECT * FROM simple_audits WHERE id=?").bind(req.nextUrl.searchParams.get("id")||"").first<Record<string,string|number|null>>();
    if(!audit)return NextResponse.json({error:"missing"},{status:404});
    try { return NextResponse.json(await auditRemovalPreview(d,audit),{headers:{"cache-control":"private, no-store"}}); }
    catch { return NextResponse.json({error:"unavailable"},{status:503}); }
  }
  if(req.headers.get("x-fornost-connected-map")==="1"&&!isScoped(auth.actor)&&canReadPosture(auth.actor)){
    // Only project identities used for lineage. Pins, hashes and snapshot contents stay in the audit.
    const result=await d.prepare(`SELECT a.id,a.name,a.template,a.status,a.audit_owner,a.updated_at,
      coalesce(json_extract(v.value,'$.archived'),0) archived,coalesce(c.state,'open') closure_state,
      (SELECT json_group_array(DISTINCT json_extract(ctrl.value,'$.id')) FROM json_each(s.value,'$.entries') e,json_each(e.value,'$.controls') ctrl) controls,
      (SELECT json_group_array(DISTINCT json_extract(pin.value,'$.evidenceId')) FROM json_each(s.value,'$.evidence') pin) evidence
      FROM simple_audits a LEFT JOIN audit_closure_state c ON c.audit_id=a.id
      LEFT JOIN simple_grc_metadata v ON v.key='audit_visibility_'||a.id
      LEFT JOIN simple_grc_metadata s ON s.key='audit_posture_'||a.id ORDER BY a.updated_at DESC`).all<{controls:string;evidence:string}>();
    return NextResponse.json({audits:result.results.map(({controls,evidence,...audit})=>({...audit,auditControlRefs:JSON.parse(controls),auditEvidenceRefs:JSON.parse(evidence)}))},{headers:{"cache-control":"private, no-store","vary":"x-fornost-connected-map"}});
  }
  const result = await d.prepare("SELECT a.*, COALESCE(json_extract(v.value,'$.archived'),0) AS archived, COALESCE(v.updated_at,'') AS visibility_revision, COALESCE(c.state,'open') AS closure_state,c.revision AS closure_event, m.value AS catalog_json FROM simple_audits a LEFT JOIN audit_closure_state c ON c.audit_id=a.id LEFT JOIN simple_grc_metadata m ON m.key='audit_catalog_' || a.id LEFT JOIN simple_grc_metadata v ON v.key='audit_visibility_' || a.id ORDER BY a.updated_at DESC").all<Record<string,unknown>>();
  const audits=result.results.map(row=>{const {catalog_json,...audit}=row;let catalog=null;try{catalog=catalog_json?JSON.parse(String(catalog_json)):null;}catch{}return {...audit,catalog};});
  // Reads must not migrate historical audit snapshots to a newer catalog.
  return NextResponse.json({ audits }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ["Admin", "Editor"]);
  if (auth.response) return auth.response;
  try {
    if(!canWriteModule(auth.actor,"Denetim Yönetimi")) return NextResponse.json({error:"forbidden"},{status:403});
    const body = await readCatalogRequest(req) as AuditInput;
    const imported = body.catalogImport === undefined ? undefined : validateCatalogImport(body.catalogImport);
    const name = text(body.name, 160), template = imported?.name || text(body.template, 160) || "Özel Denetim";
    if (name.length < 3) return NextResponse.json({ error: "Denetim adı en az 3 karakter olmalıdır." }, { status: 400 });
    const id = `AUDIT-${crypto.randomUUID()}`, now = new Date().toISOString();
    const d = await db();
    const structured=body.periodStart!==undefined || body.periodEnd!==undefined || body.targetDate!==undefined;
    const dates={periodStart:body.periodStart??'',periodEnd:body.periodEnd??'',targetDate:body.targetDate??''};
    if(Object.values(dates).some(v=>typeof v!=='string'))throw new Error('audit-dates');
    const range=auditPeriod(String(dates.periodStart),String(dates.periodEnd),String(dates.targetDate));
    const audit = {id,name,template,structured,...dates,audit_type:text(body.auditType,100)||"Diğer Denetim",auditor:text(body.auditor,5400),audit_owner:text(body.auditOwner,254)};
    if(structured && !auditTypes.some(([label])=>label===audit.audit_type))throw new Error('audit-type');
    validateAuditTeam(audit.audit_owner,audit.auditor,structured);
    if(structured && audit.audit_owner && !await d.prepare("SELECT 1 FROM local_users WHERE status='Active' AND lower(email)=lower(?)").bind(audit.audit_owner).first())throw new Error('audit-owner');
    const snapshots:D1PreparedStatement[]=[];
    const referencesWithEvidence=new Set<string>();
    if(body.posture!==undefined){
      if(!canReadPosture(auth.actor))throw new PostureError('forbidden',403);
      const input=body.posture as {period?:unknown;token?:unknown}|null;
      if(imported || typeof input?.period!=='string' || typeof input.token!=='string')throw new PostureError('fields');
      if(range && input.period!==range)throw new PostureError('preview-changed',409);
      await ensurePosture(d);
      const baseline=makeBaseline(await readMatrix(d,programName(template)),input.period.trim());
      if(await baselineToken(baseline)!==input.token)throw new PostureError('preview-changed',409);
      for(const r of baseline.entries)if(r.controls.some(c=>c.evidence.length)) referencesWithEvidence.add(r.ref);
      const value=JSON.stringify({...baseline,capturedAt:now});
      if(new TextEncoder().encode(value).length>1750000)throw new PostureError('snapshot-size',413);
      snapshots.push(d.prepare("INSERT INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(`audit_posture_${id}`,value,now));
    }
    const rows = auditTemplateRows(audit, imported);
    for(const row of rows)if(referencesWithEvidence.has(row.requirementRef)) row.evidenceStatus="İncelemede";
    const provenance = {template,...(structured?{structuredTeam:true}:{}),...(snapshots.length?{hasPosture:true}:{}),revision:imported?.version || "2026-10-05-full-packs",source:imported?.source || nistCatalogs.find(c=>c.name===template)?.source || (template===asvsManifest.name?asvsManifest.source:getCatalogStatus(template).source || ""),count:rows.length,imported:!!imported,rightsConfirmed:imported?.rightsConfirmed || false,createdBy:auth.actor.email,createdAt:now};
    await d.batch([
      d.prepare("INSERT INTO simple_audits(id,name,template,audit_type,auditor,audit_owner,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,name,template,audit.audit_type,audit.auditor,audit.audit_owner,text(body.status,40) || "Başlanmadı",now,now),
      d.prepare("INSERT INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(`audit_catalog_${id}`,JSON.stringify(provenance),now),
      ...(structured ? [d.prepare("INSERT INTO simple_grc_metadata(key,value,updated_at) VALUES(?,?,?)").bind(`audit_plan_${id}`,JSON.stringify({plan:{...emptyAuditPlan,...dates},revision:crypto.randomUUID(),updatedAt:now,updatedBy:auth.actor.email}),now)] : []),
      ...snapshots,
      ...auditRequirementInserts(id,rows,now).map(statement=>d.prepare(statement.sql).bind(...statement.values)),
    ]);
    const insertedRequirements = rows.length;
    return NextResponse.json({ ok: true, id, insertedRequirements }, { status: 201 });
  } catch (error) {
    if(error instanceof Error && ['audit-team','audit-owner','audit-type','audit-dates'].includes(error.message))return NextResponse.json({error:error.message},{status:400});
    if (error instanceof PostureError) return NextResponse.json({error:error.code},{status:error.status});
    if (String(error).toLowerCase().includes("unique")) return NextResponse.json({ error: "Bu adla bir denetim zaten portföyde." }, { status: 409 });
    return NextResponse.json({ error: "Denetim oluşturulamadı." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ["Admin"]);
  if (auth.response) return auth.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id || id.length > 100) return NextResponse.json({ error: "Geçersiz denetim kimliği." }, { status: 400 });
  try {
  const d = await db(), audit = await d.prepare("SELECT * FROM simple_audits WHERE id=?").bind(id).first<Record<string, string | number | null>>();
  if (!audit) return NextResponse.json({ error: "Denetim bulunamadı." }, { status: 404 });
  const deletedRequirements = await deleteAudit(d, audit, auth.actor.email);
  return NextResponse.json({ ok: true, deletedRequirements });
  } catch(error) {
    const linked=error instanceof AuditLinked, conflict=error instanceof LifecycleConflict, closed=isAuditClosedError(error);
    return NextResponse.json({error:linked||conflict?error.message:closed?auditClosedMessage:"Denetim silinemedi.",code:linked?"AUDIT_LINKED":conflict?"LIFECYCLE_CONFLICT":undefined},{status:linked||conflict||closed?409:503});
  }
}

export async function PATCH(req: NextRequest) {
  const auth=await requireRole(req,["Admin","Editor"]); if(auth.response)return auth.response;
  if(!canWriteModule(auth.actor,"Denetim Yönetimi"))return NextResponse.json({error:"forbidden"},{status:403});
  try {
    const raw=await req.text(); if(raw.length>10000)return NextResponse.json({error:"fields"},{status:413});
    const body=JSON.parse(raw);
    if(!body||typeof body!=="object"||Array.isArray(body)||typeof body.id!=="string"||body.id.length>100)return NextResponse.json({error:"fields"},{status:400});
    if(body.action!=="edit"&&auth.actor.role!=="Admin")return NextResponse.json({error:"forbidden"},{status:403});
    const d=await db(); await ensureAuditClosureSchema(d);
    const audit=await d.prepare("SELECT * FROM simple_audits WHERE id=?").bind(body.id).first<Record<string,string|number|null>>();
    if(!audit)return NextResponse.json({error:"missing"},{status:404});
    const result=await updateAudit(d,audit,auth.actor.email,body);
    return NextResponse.json({ok:true,audit:result});
  } catch(error) {
    const conflict=error instanceof LifecycleConflict, closed=isAuditClosedError(error), duplicate=String(error).toLowerCase().includes("unique");
    return NextResponse.json({error:conflict?"conflict":closed?"audit-closed":duplicate?"duplicate":"fields"},{status:conflict||closed||duplicate?409:400});
  }
}
