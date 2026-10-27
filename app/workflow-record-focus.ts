type Workflow='continuity'|'regulatory';
export type WorkflowRecordFocus={kind:string;ref:string};
const kinds={continuity:['continuity-plan','continuity-exercise','continuity-gap'],regulatory:['regulatory-change','regulatory-impact']};
/** false means malformed; null means an ordinary unfocused list request. */
export function parseWorkflowRecordFocus(params:URLSearchParams,workflow:Workflow):WorkflowRecordFocus|null|false {
  if(!params.has('focusKind')&&!params.has('focusId'))return null;
  const kind=params.get('focusKind')||'',ref=params.get('focusId')||'';
  return params.getAll('focusKind').length===1&&params.getAll('focusId').length===1&&kinds[workflow].includes(kind)&&/^[a-zA-Z0-9_-]{1,120}$/.test(ref)?{kind,ref}:false;
}
export async function workflowFocusIds(db:D1Database,focus:WorkflowRecordFocus|null) {
  const empty={plan:'',exercise:'',gap:'',change:'',source:'',impact:''};
  if(!focus)return empty;
  if(focus.kind==='continuity-plan')return {...empty,plan:focus.ref};
  if(focus.kind==='continuity-exercise'){
    const row=await db.prepare('SELECT plan_id FROM enterprise_continuity_exercises WHERE id=?').bind(focus.ref).first<{plan_id:string}>();
    return {...empty,exercise:focus.ref,plan:row?.plan_id||''};
  }
  if(focus.kind==='continuity-gap'){
    const row=await db.prepare('SELECT plan_id,exercise_id FROM enterprise_continuity_gaps WHERE id=?').bind(focus.ref).first<{plan_id:string;exercise_id:string}>();
    return {...empty,gap:focus.ref,plan:row?.plan_id||'',exercise:row?.exercise_id||''};
  }
  if(focus.kind==='regulatory-change'){
    const row=await db.prepare('SELECT source_id FROM regulatory_changes WHERE id=?').bind(focus.ref).first<{source_id:string}>();
    return {...empty,change:focus.ref,source:row?.source_id||''};
  }
  const row=await db.prepare('SELECT i.change_id,c.source_id FROM regulatory_change_impacts i LEFT JOIN regulatory_changes c ON c.id=i.change_id WHERE i.id=?').bind(focus.ref).first<{change_id:string;source_id:string}>();
  return {...empty,impact:focus.ref,change:row?.change_id||'',source:row?.source_id||''};
}
