import {usagePins, type EvidenceUsage, type EvidenceUsageRow} from './usage';

type Workflow = 'continuity' | 'regulatory' | 'tprm' | 'policy' | 'findings' | 'incidents';
type Row = {id:string; entity_id:string; purpose:NonNullable<EvidenceUsageRow['decision']>['purpose']; actor:string; created_at:string; snapshot_json:string; available:number; source_available:number; title:string|null; owner:string|null; status:string|null; due_date:string|null};

/** Retained decisions are history, including a prior submission on a currently open workflow.
 * Never infer the current approval from the last canonical pin: a later legacy write may exist. */
export async function readWorkflowUsage(db:D1Database, workflow:Workflow, evidence:EvidenceUsage['evidence']) {
  const context=workflow==='incidents' ? `i.id IS NOT NULL AS source_available,i.code || ' · ' || i.title AS title,i.owner AS owner,i.status AS status,NULL AS due_date FROM workflow_evidence_pins p LEFT JOIN enterprise_incidents i ON i.id=p.entity_id` : workflow==='findings' ? `
    f.id IS NOT NULL AS source_available,f.code || ' · ' || f.title AS title,
    f.owner AS owner,f.status AS status,f.due_date AS due_date
    FROM workflow_evidence_pins p LEFT JOIN enterprise_findings f ON f.id=p.entity_id` : workflow==='policy' ? `
    d.id IS NOT NULL AND (p.purpose='policy-retire' OR (v.id IS NOT NULL AND v.policy_id=d.id AND (p.purpose LIKE 'version-%' OR (x.id IS NOT NULL AND x.policy_id=d.id)))) AS source_available,
    d.code || ' · ' || d.title || CASE WHEN p.purpose='policy-retire' THEN '' WHEN x.id IS NOT NULL THEN ' · ' || x.scope ELSE ' · v' || COALESCE(v.version_number,'') END AS title,
    COALESCE(x.owner,d.owner) AS owner,COALESCE(x.status,v.status,d.status) AS status,
    COALESCE(x.expires_at,d.next_review) AS due_date
    FROM workflow_evidence_pins p
    LEFT JOIN policy_exceptions x ON p.purpose IN ('approve-exception','close-exception') AND x.id=p.entity_id
    LEFT JOIN policy_versions v ON v.id=CASE WHEN p.purpose LIKE 'version-%' THEN p.entity_id ELSE x.version_id END
    LEFT JOIN policy_documents d ON d.id=CASE WHEN p.purpose='policy-retire' THEN p.entity_id ELSE COALESCE(x.policy_id,v.policy_id) END` : workflow==='tprm' ? `
    v.vendor_id IS NOT NULL AND r.id IS NOT NULL AND
      (p.purpose IN ('vendor-offboard','vendor-contract-extended') OR (p.purpose LIKE 'assessment-%' AND a.id IS NOT NULL) OR (p.purpose IN ('submit-finding','verify-finding') AND f.id IS NOT NULL AND a.id IS NOT NULL AND a.vendor_id=f.vendor_id)) AS source_available,
    v.name || ' · ' || COALESCE(f.title,'Cycle ' || a.cycle_number,v.service) AS title,
    COALESCE(f.owner,v.risk_owner) AS owner,COALESCE(f.status,a.status,v.status) AS status,
    COALESCE(f.due_date,v.next_review) AS due_date
    FROM workflow_evidence_pins p
    LEFT JOIN third_party_findings f ON p.purpose IN ('submit-finding','verify-finding') AND f.id=p.entity_id
    LEFT JOIN third_party_assessments a ON a.id=CASE WHEN p.purpose LIKE 'assessment-%' THEN p.entity_id ELSE f.assessment_id END
    LEFT JOIN third_party_profiles v ON v.vendor_id=CASE WHEN p.purpose IN ('vendor-offboard','vendor-contract-extended') THEN p.entity_id ELSE COALESCE(f.vendor_id,a.vendor_id) END
    LEFT JOIN simple_grc_records r ON r.id=v.vendor_id AND r.module='Tedarikçiler'` : workflow==='continuity' ? `
    CASE WHEN p.purpose='exercise-result' THEN e.id ELSE g.id END IS NOT NULL AND plan.id IS NOT NULL AS source_available,
    CASE WHEN p.purpose='exercise-result' THEN e.code ELSE g.title END || ' · ' || plan.name AS title,
    CASE WHEN p.purpose='exercise-result' THEN e.facilitator ELSE g.owner END AS owner,
    CASE WHEN p.purpose='exercise-result' THEN e.status ELSE g.status END AS status,
    CASE WHEN p.purpose='exercise-result' THEN e.scheduled_date ELSE g.due_date END AS due_date
    FROM workflow_evidence_pins p
    LEFT JOIN enterprise_continuity_exercises e ON p.purpose='exercise-result' AND e.id=p.entity_id
    LEFT JOIN enterprise_continuity_gaps g ON p.purpose='gap-closure' AND g.id=p.entity_id
    LEFT JOIN enterprise_continuity_plans plan ON plan.id=COALESCE(e.plan_id,g.plan_id)` : `
    i.id IS NOT NULL AND c.id IS NOT NULL AND s.id IS NOT NULL AS source_available,
    i.target_title || ' · ' || c.title AS title,i.action_owner AS owner,i.status,i.due_date
    FROM workflow_evidence_pins p
    LEFT JOIN regulatory_change_impacts i ON i.id=p.entity_id
    LEFT JOIN regulatory_changes c ON c.id=i.change_id
    LEFT JOIN regulatory_intelligence_sources s ON s.id=c.source_id`;
  const purposes=workflow==='incidents'?['incident-contain','incident-eradicate','incident-recover','incident-review','incident-close']:workflow==='findings'?['capa-submit','capa-verify','capa-accept-risk']:workflow==='policy'?['version-submit','version-approve','version-publish','approve-exception','close-exception','policy-retire']:workflow==='tprm'?['assessment-submit','assessment-approved','assessment-conditional','submit-finding','verify-finding','vendor-offboard','vendor-contract-extended']:workflow==='continuity'?['exercise-result','gap-closure']:['impact-submit','impact-verify'];
  const query=`SELECT p.id,p.entity_id,p.purpose,p.actor,p.created_at,p.snapshot_json,
    EXISTS(SELECT 1 FROM evidence_versions v WHERE v.id=json_extract(p.snapshot_json,'$.id')
      AND v.evidence_id=? AND v.version_no=json_extract(p.snapshot_json,'$.versionNo')
      AND v.content_sha256=json_extract(p.snapshot_json,'$.contentSha256')) AS available,
    ${context}
    WHERE p.workflow=? AND p.purpose IN (SELECT value FROM json_each(?)) AND json_extract(p.snapshot_json,'$.evidenceId')=?
    ORDER BY p.created_at DESC,p.id DESC LIMIT 201`;
  const records=(await db.prepare(query).bind(evidence.id,workflow,JSON.stringify(purposes),evidence.id).all<Row>()).results;
  const rows:EvidenceUsageRow[]=records.slice(0,200).map(row=>({
    id:row.id,source:workflow,module:workflow==='incidents'?'Güvenlik Olayları':workflow==='findings'?'Bulgular ve CAPA':workflow==='policy'?'Politika Merkezi':workflow==='tprm'?'Tedarikçiler':workflow==='continuity'?'İş Sürekliliği':'Regülasyon Merkezi',
    title:row.title||row.entity_id,owner:row.owner||'',status:row.status||'',dueDate:row.due_date||'',historical:true,
    pins:usagePins([{...JSON.parse(row.snapshot_json),available:row.available}],evidence),
    decision:{purpose:row.purpose,actor:row.actor,createdAt:row.created_at,sourceAvailable:Boolean(row.source_available)},
    target:{module:workflow==='incidents'?'Güvenlik Olayları':workflow==='findings'?'Bulgular ve CAPA':workflow==='policy'?'Politika Merkezi':workflow==='tprm'?'Tedarikçiler':workflow==='continuity'?'İş Sürekliliği':'Regülasyon Merkezi',kind:workflow==='incidents'?'incident':workflow==='findings'?'finding':workflow==='policy'?(row.purpose==='policy-retire'?'policy-review':row.purpose.startsWith('version-')?'policy-version':'policy-exception'):workflow==='tprm'?(['vendor-offboard','vendor-contract-extended'].includes(row.purpose)?'vendor-review':row.purpose.startsWith('assessment-')?'vendor-assessment':'vendor-finding'):workflow==='regulatory'?'regulatory-impact':row.purpose==='exercise-result'?'continuity-exercise':'continuity-gap',ref:row.entity_id,source:'evidence-usage'},
  }));
  return {rows,complete:records.length<=200&&rows.every(row=>row.decision?.sourceAvailable)};
}
