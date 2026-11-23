import type {Actor} from '../api/auth/security';
import {scopedApiAllowed} from '../module-access';
import {ensureWorkflowEvidenceSchema} from '../workflow-selection-store';
import {lifecycleInsert,nextLifecycleStamp} from '../enterprise-lifecycle-write';
import type {WorkflowEvidence} from '../workflow-selection';
export async function incidentUploadContext(db:D1Database,actor:Actor,id:unknown,revision:unknown){
 if(typeof id!=='string'||!/^INC-[\w-]{1,100}$/.test(id)||typeof revision!=='string'||!scopedApiAllowed(actor,'/api/incidents','POST'))return null;
 const r=await db.prepare('SELECT status,owner,commander,updated_at FROM enterprise_incidents WHERE id=?').bind(id).first<{status:string;owner:string;commander:string;updated_at:string}>();
 if(!r||r.updated_at!==revision||['closed','cancelled'].includes(r.status)||(actor.role!=='Admin'&&![r.owner,r.commander].some(email=>email.toLowerCase()===actor.email.toLowerCase())))return null;
 await ensureWorkflowEvidenceSchema(db);
 const eventId=crypto.randomUUID(),stamp=nextLifecycleStamp(r.updated_at);
 return {guard:{sql:'EXISTS(SELECT 1 FROM enterprise_incidents WHERE id=? AND updated_at=? AND status=? AND owner=? AND commander=?)',values:[id,r.updated_at,r.status,r.owner,r.commander]},
   statements(evidence:WorkflowEvidence){return [
    db.prepare('UPDATE enterprise_incidents SET updated_at=?,updated_by=? WHERE id=? AND changes()=1').bind(stamp,actor.email,id),
    lifecycleInsert(db,'enterprise_incident_events',{id:eventId,incident_id:id,action:'link-evidence',from_status:r.status,to_status:r.status,detail:evidence.evidenceTitle,evidence_reference:evidence.evidenceId,evidence_sha256:evidence.contentSha256,actor:actor.email,created_at:stamp}),
    lifecycleInsert(db,'workflow_evidence_pins',{id:crypto.randomUUID(),workflow:'incidents',entity_id:id,purpose:'incident-response',event_id:eventId,snapshot_json:JSON.stringify(evidence),actor:actor.email,created_at:stamp})
   ]}};
}
