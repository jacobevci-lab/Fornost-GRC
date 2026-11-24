import type {Actor} from '../api/auth/security';
import {canReadModule,canWriteModule} from '../module-access';
import {authority,authorityGuard,currentActor} from '../enterprise/access';
import {event} from '../enterprise/http';
import {ensureEnterprise} from '../enterprise/schema';
import {readMatrix,PostureError} from './store';
import type {Pin} from './types';

export const verificationSchema=`CREATE TABLE IF NOT EXISTS control_effectiveness_reviews(
 id TEXT PRIMARY KEY NOT NULL,control_id TEXT NOT NULL,evidence_version TEXT NOT NULL,
 control_snapshot TEXT NOT NULL,evidence_snapshot TEXT NOT NULL,
 control_revision TEXT NOT NULL,evidence_revision TEXT NOT NULL,
 reviewer TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL)`;

export const verificationIndex='CREATE INDEX IF NOT EXISTS control_effectiveness_source ON control_effectiveness_reviews(control_id,evidence_version)';

// Deliberately separate from evidence approval. No AI tool can write this receipt.
export async function verifyControl(db:D1Database,actor:Actor,body:Record<string,unknown>){
 await ensureEnterprise(db);
 const auth=await authority(db,actor,typeof body.controlId==='string'?[body.controlId]:[]);
 actor=await currentActor(db,actor);
 if(actor.orgScope?.restricted||!['Admin','Editor'].includes(actor.role)||!canWriteModule(actor,'Kontroller')||!canReadModule(actor,'Kanıtlar'))throw new PostureError('forbidden',403);
 const {name,controlId,evidenceVersion,note}=body;
 if(typeof name!=='string'||typeof controlId!=='string'||typeof evidenceVersion!=='string'||typeof note!=='string'||note.trim().length<10||note.length>2000)throw new PostureError('fields');
 const matrix=await readMatrix(db,name),control=matrix.controls.find(c=>c.id===controlId),pin=matrix.pins[controlId]?.find(p=>p.id===evidenceVersion);
 if(!control||!pin||!['uygulanıyor','implemented'].includes(control.implementation.toLowerCase()))throw new PostureError('verification-evidence',409);
 const source=await db.prepare("SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Kontroller'").bind(controlId).first<{data_json:string;updated_at:string}>();
 const evidence=await db.prepare("SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Kanıtlar'").bind(pin.evidenceId).first<{data_json:string;updated_at:string}>();
 if(!source||!evidence)throw new PostureError('conflict',409);
 const data=JSON.parse(source.data_json),ev=JSON.parse(evidence.data_json),lower=(x:unknown)=>String(x||'').trim().toLowerCase();
 const owner=lower(data.ownerEmail||data.owner);
 if(!owner||['taslak','draft','arşivlendi','archived','emekli','retired'].includes(lower(data.status))||[owner,lower(ev.owner),lower(ev.uploadedBy)].some(v=>v&&(v===lower(actor.email)||v===lower(actor.name))))throw new PostureError('independent-reviewer',403);
 const active=await db.prepare("SELECT id FROM local_users WHERE id=? AND lower(email)=lower(?) AND status='Active' AND role IN ('Admin','Editor')").bind(actor.id,actor.email).first();
 if(!active)throw new PostureError('forbidden',403);
 const guard=authorityGuard(actor,auth),id=crypto.randomUUID();
 const result=await db.batch([
  db.prepare(`INSERT INTO control_effectiveness_reviews SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard.sql}
   AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Kontroller' AND data_json=? AND coalesce(updated_at,'')=?)
   AND EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND module='Kanıtlar' AND data_json=? AND coalesce(updated_at,'')=?)
   AND (SELECT id FROM evidence_versions WHERE evidence_id=? ORDER BY version_no DESC LIMIT 1)=?`)
   .bind(id,controlId,pin.id,source.data_json,evidence.data_json,source.updated_at||'',evidence.updated_at||'',actor.email,note.trim(),new Date().toISOString(),...guard.values,controlId,source.data_json,source.updated_at||'',pin.evidenceId,evidence.data_json,evidence.updated_at||'',pin.evidenceId,pin.id),
  event(db,actor.email,'control-effectiveness-verified',JSON.stringify({id,control:control.code,evidence:pin.code,version:pin.version}),'changes()=1')
 ]);
 if(!result[0].meta?.changes)throw new PostureError('conflict',409);
 return {id};
}

export async function markVerifiedPins(db:D1Database,pins:Record<string,Pin[]>){
 const reviews=(await db.prepare(`SELECT v.control_id,v.evidence_version,v.reviewer FROM control_effectiveness_reviews v
 JOIN simple_grc_records c ON c.id=v.control_id AND c.module='Kontroller' AND c.data_json=v.control_snapshot AND coalesce(c.updated_at,'')=v.control_revision
 JOIN evidence_versions ev ON ev.id=v.evidence_version
 JOIN simple_grc_records e ON e.id=ev.evidence_id AND e.module='Kanıtlar' AND e.data_json=v.evidence_snapshot AND coalesce(e.updated_at,'')=v.evidence_revision
 JOIN local_users u ON lower(u.email)=lower(v.reviewer) AND u.status='Active'
 WHERE v.control_id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(Object.keys(pins))).all<{control_id:string;evidence_version:string;reviewer:string}>()).results;
 for(const [id,list] of Object.entries(pins))for(const pin of list){const review=reviews.find(v=>v.control_id===id&&v.evidence_version===pin.id);if(review){pin.verified=true;pin.verifiedBy=review.reviewer;}}
}
