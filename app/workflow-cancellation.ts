import type { Actor } from './api/auth/security';
import { lifecycleClaim, lifecycleInsert, LifecycleConflict, nextLifecycleStamp } from './enterprise-lifecycle-write';

export type CancellationKind='policy'|'appetite'|'vendor'|'finding'|'incident';
const definitions={
  policy:{table:'policy_documents',key:'id',states:['draft'],events:'policy_events',eventKey:'policy_id',children:'policy_versions',childKey:'policy_id',childStates:['draft','rejected']},
  appetite:{table:'risk_appetite_statements',key:'id',states:['draft','rejected'],events:'risk_appetite_events',eventKey:'appetite_id'},
  vendor:{table:'third_party_profiles',key:'vendor_id',states:['onboarding'],events:'third_party_events',eventKey:'vendor_id',children:'third_party_assessments',childKey:'vendor_id',childStates:['draft']},
  finding:{table:'enterprise_findings',key:'id',states:['open','in-progress'],events:'enterprise_finding_events',eventKey:'finding_id'},
  incident:{table:'enterprise_incidents',key:'id',states:['declared','triage'],events:'enterprise_incident_events',eventKey:'incident_id'},
} as const;
type Row=Record<string,string|number|null>;
export class CancellationError extends Error { constructor(public code:string,public status:number){super(code)} }

/** Cancel erroneous intake without deleting references, evidence or falsely verifying remediation. */
export async function cancelWorkflowRecord(db:D1Database,actor:Actor,kind:CancellationKind,input:Record<string,unknown>){
  if(actor.role!=='Admin')throw new CancellationError('CANCEL_ACCESS',403);
  const id=typeof input.recordId==='string'?input.recordId:'',note=typeof input.note==='string'?input.note.trim():'',reason=String(input.reason||'');
  if(!id||id.length>120||input.confirmation!=='İPTAL ET'||!['duplicate','test','invalid'].includes(reason)||note.length<20||note.length>2000||/\p{Cc}/u.test(note))throw new CancellationError('CANCEL_INPUT',400);
  const d=definitions[kind],row=await db.prepare(`SELECT * FROM ${d.table} WHERE ${d.key}=?`).bind(id).first<Row>();
  if(!row)throw new CancellationError('CANCEL_MISSING',404);
  if(input.expectedUpdatedAt!==row.updated_at||typeof input.expectedUpdatedAt!=='string')throw new LifecycleConflict();
  if(!(d.states as readonly string[]).includes(String(row.status)))throw new CancellationError('CANCEL_STATE',409);
  // Automated signals must retain their governed source workflow.
  if(kind==='finding'&&row.source_type==='continuous-control')throw new CancellationError('CANCEL_STATE',409);
  const guards:string[]=[],values:(string|number|null)[]=[],dependents:D1PreparedStatement[]=[];
  const stamp=nextLifecycleStamp(row.updated_at),eventId=crypto.randomUUID();
  const receipt=`EXISTS(SELECT 1 FROM ${d.events} WHERE id=?)`;
  let children:Row[]=[];
  if('children' in d){
    children=(await db.prepare(`SELECT id,status,updated_at FROM ${d.children} WHERE ${d.childKey}=?`).bind(id).all<Row>()).results;
    if(children.some(c=>!(d.childStates as readonly string[]).includes(String(c.status))))throw new CancellationError('CANCEL_STATE',409);
    guards.push(`(SELECT count(*) FROM ${d.children} WHERE ${d.childKey}=?)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) s WHERE NOT EXISTS(SELECT 1 FROM ${d.children} c WHERE c.id=json_extract(s.value,'$.id') AND c.status=json_extract(s.value,'$.status') AND c.updated_at=json_extract(s.value,'$.updated_at')))`);
    values.push(id,children.length,JSON.stringify(children));
    dependents.push(db.prepare(`UPDATE ${d.children} SET status='cancelled',updated_by=?,updated_at=? WHERE ${d.childKey}=? AND ${receipt}`).bind(actor.email,stamp,id,eventId));
  }
  if(kind==='policy'){
    guards.push("current_version_id IS NULL AND NOT EXISTS(SELECT 1 FROM policy_attestation_campaigns WHERE policy_id=?) AND NOT EXISTS(SELECT 1 FROM policy_exceptions WHERE policy_id=?)");values.push(id,id);
  }
  if(kind==='appetite'){
    guards.push('NOT EXISTS(SELECT 1 FROM risk_kri_measurements WHERE appetite_id=?) AND NOT EXISTS(SELECT 1 FROM risk_kri_breaches WHERE appetite_id=?) AND NOT EXISTS(SELECT 1 FROM risk_appetite_scenarios WHERE appetite_id=?)');values.push(id,id,id);
  }
  if(kind==='vendor'){
    guards.push('NOT EXISTS(SELECT 1 FROM third_party_findings WHERE vendor_id=?)');values.push(id);
    const core=await db.prepare("SELECT data_json,updated_at FROM simple_grc_records WHERE id=? AND module='Tedarikçiler'").bind(id).first<Row>();
    if(!core)throw new CancellationError('CANCEL_STATE',409);
    guards.push("EXISTS(SELECT 1 FROM simple_grc_records WHERE id=? AND data_json=? AND updated_at=?)");values.push(id,core.data_json,core.updated_at);
    dependents.push(db.prepare(`UPDATE simple_grc_records SET data_json=json_set(data_json,'$.status','İptal Edildi'),updated_at=? WHERE id=? AND ${receipt}`).bind(stamp,id,eventId));
  }
  const event:Row={id:eventId,[d.eventKey]:id,action:'cancel',detail:JSON.stringify({reason,note,previousStatus:row.status,children}),actor:actor.email,created_at:stamp};
  if(kind==='finding'||kind==='incident'){event.from_status=String(row.status);event.to_status='cancelled';}
  const result=await db.batch([
    lifecycleClaim(db,d.table,"status='cancelled',updated_by=?,updated_at=?",[actor.email,stamp],row,{sql:guards.length?guards.map(g=>`(${g})`).join(' AND '):'1',values},d.key),
    lifecycleInsert(db,d.events,event),...dependents,
  ]);
  // The event is gated by SQLite changes(), which excludes report-revision triggers.
  if(Number(result[1]?.meta?.changes||0)!==1)throw new LifecycleConflict();
  return {ok:true,id};
}
