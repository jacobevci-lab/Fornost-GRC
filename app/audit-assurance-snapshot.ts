// Resolve only explicit identities and frozen mappings inside this engagement.
export const auditAssuranceRows = `WITH RECURSIVE
  audit AS (SELECT id,name FROM simple_audits WHERE id=?),
  baseline AS (SELECT value FROM simple_grc_metadata WHERE key='audit_posture_'||(SELECT id FROM audit)),
  direct(module,refs) AS (
    SELECT 'Kontroller',json_extract(data_json,'$.controlRef') FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=(SELECT name FROM audit)
    UNION ALL SELECT 'Kanıtlar',json_extract(data_json,'$.evidenceRef') FROM simple_grc_records WHERE module='Denetim Yönetimi' AND json_extract(data_json,'$.auditName')=(SELECT name FROM audit)
  ), tokens(module,ref,rest) AS (
    SELECT module,'',replace(replace(replace(refs,',',';'),'|',';'),char(10),';')||';' FROM direct WHERE refs IS NOT NULL
    UNION ALL SELECT module,trim(substr(rest,1,instr(rest,';')-1)),substr(rest,instr(rest,';')+1) FROM tokens WHERE rest<>''
  ), pointers(module,ref) AS (
    SELECT 'Kontroller',json_extract(c.value,'$.id') FROM baseline b,json_each(b.value,'$.entries') e,json_each(e.value,'$.controls') c
    UNION SELECT 'Kanıtlar',json_extract(e.value,'$.evidenceId') FROM baseline b,json_each(b.value,'$.evidence') e
    UNION SELECT 'Kanıtlar',json_extract(e.value,'$.evidenceId') FROM audit_requests r,json_each(r.data_json,'$.evidence') e WHERE r.audit_id=(SELECT id FROM audit)
    UNION SELECT 'Kanıtlar',json_extract(e.value,'$.evidenceId') FROM audit_workpapers w,json_each(w.data_json,'$.evidence') e WHERE w.audit_id=(SELECT id FROM audit)
    UNION SELECT module,ref FROM tokens WHERE ref<>''
  ), resolved AS (
    SELECT DISTINCT p.module,r.id,c.code,r.data_json FROM pointers p
    JOIN simple_grc_records r ON r.module=p.module AND r.id=coalesce((SELECT record_id FROM simple_grc_record_codes WHERE code=p.ref COLLATE NOCASE AND module=p.module),p.ref)
    LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id ORDER BY p.module,r.id
  )
  SELECT json_group_array(json_object('module',module,'id',id,'code',code,
    'title',coalesce(json_extract(data_json,'$.controlTitle'),json_extract(data_json,'$.evidenceTitle'),json_extract(data_json,'$.title')),
    'status',json_extract(data_json,'$.status'),'implementation',json_extract(data_json,'$.implementation'),
    'review',json_extract(data_json,'$.reviewStatus'),'version',json_extract(data_json,'$.versionNo'),
    'expires',json_extract(data_json,'$.expiresAt'),'hash',json_extract(data_json,'$.contentSha256'))) AS records FROM resolved`;
export type AuditAssuranceState={module:string;id:string;code:string|null;title:string|null;status:string|null;implementation:string|null;review:string|null;version:number|null;expires:string|null;hash:string|null};
