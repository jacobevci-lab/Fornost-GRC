import {event} from '../enterprise/http';
import {withBasePath} from '../base-path';
import {defaultVendorScope,portalQuestions} from './vendor-questionnaire';
import {
  check,
  emailOk,
  hash,
  plusDays,
  stamp,
  token,
  type Env,
} from "./store";
import { readBoundedBody } from "../api/request-body";
import { assessmentMetrics, TPRM_CONTROLS } from "../third-party-risk/domain";
import { reserveRecordCodes } from "../record-code-store";
import {
  computeEvidenceChainHash,
  sha256HexBytes,
} from "../evidence/versioning";
import { pendingEvidence } from "../evidence/intake";
import { validateEvidenceUpload } from "../evidence/validate-upload";
const active =
  "p.status NOT IN ('offboarding','offboarded','rejected','cancelled') AND lower(p.reviewer) NOT IN(lower(p.contact),lower(p.business_owner),lower(p.risk_owner)) AND EXISTS(SELECT 1 FROM local_users u WHERE lower(u.email)=lower(p.reviewer) AND u.role='Admin' AND u.status='Active') AND NOT EXISTS(SELECT 1 FROM third_party_assessments a WHERE a.vendor_id=p.vendor_id AND a.status='submitted')";
type Profile = {
  vendor_id: string;
  name: string;
  contact: string;
  reviewer: string;
  risk_owner: string;
  criticality: string;
  updated_at: string;
  scope: string;
  org_entity_id: string;
};
export async function invite(
  env: Env,
  req: Request,
  id: string,
  actor: string,
  options: {days?:unknown;scope?:unknown} = {},
) {
  const days=options.days??14,scope=options.scope===undefined?defaultVendorScope:String(options.scope).trim();
  check([7,14,30].includes(Number(days))&&typeof days==='number'&&scope.length>0&&scope.length<=2000);
  const db = env.DB,
    p = await db
      .prepare(
        "SELECT p.* FROM third_party_profiles p WHERE p.vendor_id=? AND " +
          active,
      )
      .bind(id)
      .first<Profile>();
  check(p, 409, "vendor-cycle");
  check(
    emailOk(p.contact) &&
      p.reviewer &&
      p.contact.toLowerCase() !== p.reviewer.toLowerCase(),
    422,
    "contact",
  );
  const draft = await db
    .prepare(
      "SELECT id,updated_at FROM third_party_assessments WHERE vendor_id=? AND status='draft'",
    )
    .bind(id)
    .first<{ id: string; updated_at: string }>();
  const key = token(),
    digest = await hash(key),at=stamp(),expiresAt=plusDays(days as number);
  await db.batch([
    db
      .prepare(
        "UPDATE vendor_invitations SET expires_at=? WHERE vendor_id=? AND receipt IS NULL AND expires_at>?",
      )
      .bind(at,id,at),
    db
      .prepare("INSERT INTO vendor_invitations VALUES(?,?,?,?,?,?,?,NULL)")
      .bind(
        digest,
        id,
        p.contact,
        expiresAt,
        actor,
        draft?.id || null,
        draft?.updated_at || null,
      ),
    db.prepare("INSERT INTO vendor_invitation_details VALUES(?,?,?,NULL)").bind(digest,scope,at),
    event(db,actor,'vendor-invite-created',JSON.stringify({vendor:id,days,expiresAt})),
  ]);
  return {url:withBasePath('/vendor-portal/'+key),expiresAt,days};

}
export const docKinds = ["SOC 2 Type II", "ISO 27001", "Pentest", "DPA"];
export async function vendorContext(db: D1Database, key: string) {
  check(/^[a-f0-9]{64}$/.test(key), 404, "link");
  const p = await db
    .prepare(
      "SELECT p.*,coalesce(d.scope,?) scope,coalesce(o.org_entity_id,'root') org_entity_id FROM vendor_invitations i JOIN third_party_profiles p ON p.vendor_id=i.vendor_id LEFT JOIN vendor_invitation_details d ON d.digest=i.digest LEFT JOIN org_record_entities o ON o.kind='vendor' AND o.record_id=p.vendor_id WHERE i.digest=? AND i.receipt IS NULL AND i.expires_at>? AND i.email=p.contact AND lower(i.email)<>lower(p.reviewer) AND " +
        active,
    )
    .bind(defaultVendorScope,await hash(key), stamp())
    .first<Profile>();
  check(p, 410, "link");
  return p;
}
export async function submitVendor(env: Env, req: Request, key: string) {
  const db = env.DB,
    p = await vendorContext(db, key),
    type = req.headers.get("content-type") || "";
  check(type.startsWith("multipart/form-data;"));
  const bytes = await readBoundedBody(
    req,
    env.BUCKET ? 13 * 1024 * 1024 : 3 * 1024 * 1024,
  );
  let fd: FormData;
  try {
    fd = await new Response(bytes, {
      headers: { "content-type": type },
    }).formData();
  } catch {
    check(false, 400, "file");
  }
  const answers: Record<string, boolean> = {};
  for (const q of TPRM_CONTROLS) {
    const value = fd.get(q);
    check(value === "yes" || value === "no");
    answers[q] = value === "yes";
  }
  const declarations:Record<string,string>={};
  for(const key of Object.keys(portalQuestions)){const value=fd.get(key);check(value==='yes'||value==='no',422,'questionnaire');declarations[key]=value;}
  for(const key of ['dataLocation','subprocessors']){const value=fd.get(key);check(typeof value==='string'&&value.trim().length>0&&value.length<=2000,422,'questionnaire');declarations[key]=value.trim();}
  answers.accessControl=answers.accessControl&&declarations.mfa==='yes';
  answers.bcdr=answers.bcdr&&declarations.backups==='yes';
  answers.dpa=answers.dpa&&declarations.privacy==='yes';
  const at = stamp(),
    period = at.slice(0, 10),
    who = "vendor:" + p.contact,
    receipt = "TPA-" + crypto.randomUUID(),
    digest = await hash(key);
  const docs = [
    {
      title: "Supplier questionnaire",
      name: "questionnaire.json",
      type: "application/json",
      bytes: new TextEncoder().encode(
        JSON.stringify({ answers, declarations, scope:p.scope, submittedAt: at }),
      ),
    },
  ];
  for (const kind of docKinds) {
    const values = fd.getAll(kind);
    check(values.length <= 1);
    const v = values[0];
    if (!v) continue;
    check(
      v instanceof File &&
        v.size > 0 &&
        v.size <= (env.BUCKET ? 3 * 1024 * 1024 : 650000),
      413,
      "file",
    );
    const data = new Uint8Array(await v.arrayBuffer());
    let ok = false;
    try {
      ok = validateEvidenceUpload(data, v.name, v.type) === "application/pdf";
    } catch {}
    check(ok, 422, "file");
    docs.push({
      title: kind,
      name: kind.replace(/\W/g, "-") + ".pdf",
      type: "application/pdf",
      bytes: data,
    });
  }
  const codes = await reserveRecordCodes(db, "Kanıtlar", docs.length, at);
  const sameDraft =
    "COALESCE((SELECT id||':'||updated_at FROM third_party_assessments WHERE vendor_id=vendor_invitations.vendor_id AND status='draft'),'')=COALESCE(draft_id||':'||draft_revision,'')";
  const guard =
    "EXISTS(SELECT 1 FROM vendor_invitations WHERE digest=? AND receipt=?)";
  const statements = [
    db
      .prepare(
        "UPDATE vendor_invitations SET receipt=? WHERE digest=? AND receipt IS NULL AND expires_at>? AND " +
          sameDraft +
          " AND EXISTS(SELECT 1 FROM third_party_profiles p WHERE p.vendor_id=vendor_invitations.vendor_id AND p.updated_at=? AND coalesce((SELECT org_entity_id FROM org_record_entities WHERE kind='vendor' AND record_id=p.vendor_id),'root')=? AND p.contact=vendor_invitations.email AND " +
          active +
          ")",
      )
      .bind(receipt, digest, at, p.updated_at,p.org_entity_id),
  ];
  const put = (
    table: string,
    record: Record<string, string | number | Uint8Array>,
  ) => {
    const keys = Object.keys(record);
    statements.push(
      db
        .prepare(
          "INSERT INTO " +
            table +
            "(" +
            keys.join(",") +
            ") SELECT " +
            keys.map(() => "?").join(",") +
            " WHERE " +
            guard,
        )
        .bind(...Object.values(record), digest, receipt),
    );
  };
  const staged: string[] = [];
  let proof = "",
    proofHash = "";
  try {
    for (const [i, d] of docs.entries()) {
      const id = "EVD-" + crypto.randomUUID(),
        fileKey = "evidence/" + id + "/v1-" + d.name,
        ver = "EVV-" + crypto.randomUUID(),
        contentSha256 = await sha256HexBytes(d.bytes);
      const title = p.name + " · " + d.title,
        chain = await computeEvidenceChainHash({
          evidenceId: id,
          versionNo: 1,
          fileKey,
          fileName: d.name,
          fileType: d.type,
          fileSize: d.bytes.length,
          contentSha256,
          evidenceTitle: title,
          owner: p.risk_owner,
          period,
          frameworks: "",
          controlRefs: "",
          changeNote: "Vendor portal submission",
          createdBy: who,
          createdAt: at,
        });
      if (env.BUCKET) {
        await env.BUCKET.put(fileKey, d.bytes, {
          httpMetadata: { contentType: d.type },
        });
        staged.push(fileKey);
      } else
        put("simple_evidence_files", {
          file_key: fileKey,
          file_name: d.name,
          content_type: d.type,
          content: d.bytes,
          created_at: at,
        });
      const meta = {
        ...pendingEvidence,
        fileKey,
        fileName: d.name,
        fileType: d.type,
        fileSize: String(d.bytes.length),
        contentSha256,
        evidenceTitle: title,
        sourceVendorRef: p.vendor_id,
        owner: p.risk_owner,
        reviewer: p.reviewer,
        period,
        collectedAt: period,
        uploadedBy: who,
        versionUploadedBy: who,
        versionNo: "1",
        versionChainSha256: chain,
        versionUpdatedAt: at,
      };
      put("simple_grc_records", {
        id,
        module: "Kanıtlar",
        data_json: JSON.stringify(meta),
        created_at: at,
        updated_at: at,
      });
      put("org_record_entities",{kind:'evidence',record_id:id,org_entity_id:p.org_entity_id,note:'Vendor portal evidence',revision:at});
      put("simple_grc_record_codes", {
        record_id: id,
        module: "Kanıtlar",
        code: codes[i],
        created_at: at,
      });
      put("evidence_versions", {
        id: ver,
        evidence_id: id,
        version_no: 1,
        file_key: fileKey,
        file_name: d.name,
        file_type: d.type,
        file_size: d.bytes.length,
        content_sha256: contentSha256,
        chain_sha256: chain,
        evidence_title: title,
        owner: p.risk_owner,
        period,
        frameworks: "",
        control_refs: "",
        change_note: "Vendor portal submission",
        created_by: who,
        created_at: at,
      });
      if (i === 0) {
        proof = id;
        proofHash = contentSha256;
      }
    }
    statements.push(
      db
        .prepare(
          "UPDATE third_party_assessments SET status='superseded',updated_at=?,updated_by=? WHERE vendor_id=? AND status IN ('draft','approved','conditional','rejected') AND " +
            guard,
        )
        .bind(at, who, p.vendor_id, digest, receipt),
    );
    const impact =
        { critical: 5, high: 4, medium: 3, low: 2 }[p.criticality] || 3,
      m = assessmentMetrics(impact, 3, 1, answers);
    statements.push(
      db
        .prepare(
          "INSERT INTO third_party_assessments(id,vendor_id,cycle_number,impact,likelihood,control_maturity,questionnaire_json,coverage,inherent_score,residual_score,risk_tier,critical_gaps_json,treatment_plan,status,evidence_reference,evidence_sha256,created_by,created_at,updated_by,updated_at,submitted_by,submitted_at) SELECT ?,?,1+COALESCE((SELECT max(cycle_number) FROM third_party_assessments WHERE vendor_id=?),0),?,3,1,?,?,?,?,?,?,'','submitted',?,?,?,?,?,?,?,? WHERE " +
            guard,
        )
        .bind(
          receipt,
          p.vendor_id,
          p.vendor_id,
          impact,
          JSON.stringify(answers),
          m.coverage,
          m.inherentScore,
          m.residualScore,
          m.riskTier,
          JSON.stringify(
            TPRM_CONTROLS.filter(
              (k) =>
                [
                  "incidentNotification",
                  "dataDeletion",
                  "auditRights",
                  "dpa",
                ].includes(k) && !answers[k],
            ),
          ),
          proof,
          proofHash,
          who,
          at,
          who,
          at,
          who,
          at,
          digest,
          receipt,
        ),
    );
    statements.push(
      db
        .prepare(
          "UPDATE third_party_profiles SET status='in-review',updated_at=?,updated_by=? WHERE vendor_id=? AND " +
            guard,
        )
        .bind(at, who, p.vendor_id, digest, receipt),
    );
    put("third_party_events", {
      id: crypto.randomUUID(),
      vendor_id: p.vendor_id,
      assessment_id: receipt,
      action: "assessment-submit",
      detail: codes.join(", "),
      actor: who,
      created_at: at,
    });
    statements.push(event(db,who,'vendor-assessment-submitted',JSON.stringify({vendor:p.vendor_id,evidence:codes,reviewer:p.reviewer}),'changes()=1'));
    const result = await db.batch(statements);
    check(result[0].meta?.changes === 1, 409, "link");
    return { submitted: true };
  } catch (e) {
    const committed = await db
      .prepare("SELECT id FROM third_party_assessments WHERE id=?")
      .bind(receipt)
      .first();
    if (committed) return { submitted: true };
    for (const k of staged) await env.BUCKET?.delete(k);
    throw e;
  }
}

export async function invitationView(db:D1Database,id:string){
 return {invitations:(await db.prepare(`SELECT i.digest id,i.expires_at expiresAt,i.receipt,d.scope,d.created_at createdAt,d.revoked_at revokedAt FROM vendor_invitations i LEFT JOIN vendor_invitation_details d ON d.digest=i.digest WHERE i.vendor_id=? ORDER BY i.expires_at DESC LIMIT 30`).bind(id).all()).results};
}
export async function revokeInvitation(db:D1Database,id:string,digest:string,actor:string){
 check(/^[a-f0-9]{64}$/.test(digest));const at=stamp();
 const result=await db.batch([
  db.prepare('UPDATE vendor_invitations SET expires_at=? WHERE vendor_id=? AND digest=? AND receipt IS NULL AND expires_at>?').bind(at,id,digest,at),
  event(db,actor,'vendor-invite-revoked',JSON.stringify({vendor:id}),'changes()=1'),
  db.prepare('UPDATE vendor_invitation_details SET revoked_at=? WHERE digest=? AND changes()=1').bind(at,digest),
 ]);check(result[0].meta?.changes,409,'state');return {ok:true};
}
