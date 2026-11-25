/** Canonical record IDs only: titles and framework references are not unique across audits. */
export function requirementLink(value: unknown): {requirementId?:string} {
 if(value===undefined||value==='')return {};
 if(typeof value!=='string'||!value||value.length>100||!/^[a-zA-Z0-9_-]+$/.test(value))throw new Error('requirement-link');
 return {requirementId:value};
}
export function auditRequirementLinkGuards(table:'audit_requests'|'audit_workpapers') {
 return [...['INSERT','UPDATE'].map(operation=>`CREATE TRIGGER IF NOT EXISTS audit_requirement_link_${table}_${operation.toLowerCase()} BEFORE ${operation} ON ${table}
 WHEN COALESCE(json_extract(NEW.data_json,'$.requirementId'),'')<>'' AND NOT EXISTS(
 SELECT 1 FROM simple_grc_records r JOIN simple_audits a ON a.name=json_extract(r.data_json,'$.auditName') WHERE r.id=json_extract(NEW.data_json,'$.requirementId') AND r.module='Denetim Yönetimi' AND a.id=NEW.audit_id)
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END`),
 `CREATE TRIGGER IF NOT EXISTS audit_requirement_parent_${table}_update BEFORE UPDATE OF data_json,module ON simple_grc_records
 WHEN EXISTS(SELECT 1 FROM ${table} w JOIN simple_audits a ON a.id=w.audit_id WHERE json_extract(w.data_json,'$.requirementId')=OLD.id AND (NEW.module<>'Denetim Yönetimi' OR COALESCE(json_extract(NEW.data_json,'$.auditName'),'')<>a.name))
 BEGIN SELECT RAISE(ABORT,'requirement-link'); END`];
}
