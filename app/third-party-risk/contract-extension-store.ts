import type { Actor } from '../api/auth/security';
import { commitLifecycle, lifecycleClaim, lifecycleInsert, nextLifecycleStamp } from '../enterprise-lifecycle-write';
import { joinWorkflowGuards, prepareWorkflowSelection, workflowPinStatement, ensureWorkflowEvidenceSchema } from '../workflow-selection-store';
import type { WorkflowEvidencePin } from '../workflow-selection';
import { canExtendContract, ContractExtensionError, parseContractExtensionRecord, validateContractExtension } from './contract-extension';

export async function extendSupplierContract(env: { DB: D1Database; BUCKET?: R2Bucket }, actor: Actor, input: Record<string, unknown>) {
  if (typeof input.vendorId !== 'string' || !input.vendorId || input.vendorId.length > 100 || input.evidenceMode !== 'library') throw new ContractExtensionError('TPRM_CONTRACT_INPUT');
  const profile = await env.DB.prepare('SELECT * FROM third_party_profiles WHERE vendor_id=?').bind(input.vendorId).first<Record<string,string|number|null>>();
  if (!profile) throw new ContractExtensionError('TPRM_CONTRACT_SOURCE_CHANGED',409);
  if (!canExtendContract({status:profile.status,reviewer:profile.reviewer,createdBy:profile.created_by,businessOwner:profile.business_owner,riskOwner:profile.risk_owner},actor)) throw new ContractExtensionError('TPRM_CONTRACT_ACCESS',403);
  const value = validateContractExtension(input,{contract_end:profile.contract_end,updated_at:profile.updated_at});
  const selection = await prepareWorkflowSelection(env,actor,input,{},true);
  const core = await env.DB.prepare("SELECT * FROM simple_grc_records WHERE id=? AND module='Tedarikçiler'").bind(input.vendorId).first<Record<string,string|number|null>>();
  let coreData: unknown; try { coreData = JSON.parse(String(core?.data_json)); } catch { /* A corrupted source cannot be amended. */ }
  if (!core || !coreData || typeof coreData !== 'object' || Array.isArray(coreData)) throw new ContractExtensionError('TPRM_CONTRACT_SOURCE_CHANGED',409);
  const now = nextLifecycleStamp(profile.updated_at), coreStamp = nextLifecycleStamp(core.updated_at), eventId = crypto.randomUUID();
  const guard = joinWorkflowGuards(selection.guard,{sql:"EXISTS (SELECT 1 FROM simple_grc_records WHERE id=? AND module='Tedarikçiler' AND data_json IS ? AND created_at IS ? AND updated_at IS ?)",values:[input.vendorId,core.data_json,core.created_at,core.updated_at]});
  await commitLifecycle(env.DB,lifecycleClaim(env.DB,'third_party_profiles','contract_end=?,updated_by=?,updated_at=?',[value.nextDate,actor.email,now],profile,guard,'vendor_id'),[
    env.DB.prepare("UPDATE simple_grc_records SET data_json=json_set(data_json,'$.contractEnd',?),updated_at=? WHERE id=? AND module='Tedarikçiler' AND changes()=1").bind(value.nextDate,coreStamp,input.vendorId),
    lifecycleInsert(env.DB,'third_party_events',{id:eventId,vendor_id:input.vendorId,assessment_id:null,finding_id:null,action:'vendor-contract-extended',detail:JSON.stringify({schema:'tprm-contract-extension-v1',...value,reviewDate:profile.next_review}),actor:actor.email,created_at:now}),
    ...workflowPinStatement(env.DB,selection,'tprm',input.vendorId,'vendor-contract-extended',eventId,actor.email),
  ]);
  return { ok:true, eventId, contractEnd:value.nextDate };
}

export async function readSupplierContractHistory(db: D1Database, vendorId: string, page: number) {
  await ensureWorkflowEvidenceSchema(db);
  const profile = await db.prepare('SELECT vendor_id FROM third_party_profiles WHERE vendor_id=?').bind(vendorId).first();
  if (!profile) throw new ContractExtensionError('TPRM_CONTRACT_SOURCE_CHANGED',404);
  const result = await db.prepare("SELECT e.*,p.id pin_id,p.snapshot_json,p.created_at pin_created_at,p.actor pin_actor FROM third_party_events e LEFT JOIN workflow_evidence_pins p ON p.event_id=e.id AND p.workflow='tprm' AND p.entity_id=e.vendor_id WHERE e.vendor_id=? AND e.action='vendor-contract-extended' ORDER BY e.created_at DESC,e.id DESC LIMIT 51 OFFSET ?").bind(vendorId,page*50).all<Record<string,string>>();
  const rows = result.results.slice(0,50).map(row => {
    let pin: WorkflowEvidencePin | null = null;
    try {
      const evidence=JSON.parse(row.snapshot_json);
      if (row.pin_id && evidence && typeof evidence==='object' && ['id','evidenceId','evidenceTitle','fileKey','fileName','period','owner','createdAt','contentSha256','chainSha256'].every(key=>typeof evidence[key]==='string') && Number.isInteger(evidence.versionNo) && evidence.versionNo>0 && typeof evidence.fileSize==='number') pin={id:row.pin_id,eventId:row.id,entityId:vendorId,purpose:'vendor-contract-extended',evidence,actor:row.pin_actor,createdAt:row.pin_created_at};
    } catch { /* Preserve the event even when historical evidence cannot be read. */ }
    return {id:row.id,actor:row.actor,createdAt:row.created_at,detail:parseContractExtensionRecord(row.detail),pin};
  });
  return { vendorId, page, rows, hasMore:result.results.length>50 };
}
