import { buildConnectedGrcGraph, connectedGraphFields, connectedTitle, type ConnectedGrcRow } from "../connected-grc-model";
import { connectedNeighborhood } from "../connected-grc-workbench-model";
import { canReadModule, canWriteModule, type AccessSubject } from "../module-access";
import { includesEdition } from "../licensing/editions";
import { recordDataClassificationAllowed, type AiDataClassification } from "./data-policy";
import { sanitizeAiRecord } from "./security";
import type { AiContextSource } from "./context";

export type RecordIntent = "summary" | "request" | "connections";
export type RecordTask = { recordId: string; intent: RecordIntent; locale: "tr" | "en" };
export class RecordAssistanceError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}
export function parseRecordTask(value: unknown, actor: AccessSubject): RecordTask | null {
  if (value === undefined && (!actor.licenseAccess || actor.licenseAccess.active === "Enterprise")) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RecordAssistanceError("RECORD_REQUIRED", 400);
  const task = value as Partial<RecordTask>;
  if (typeof task.recordId !== "string" || !task.recordId.trim() || task.recordId.length > 180 ||
      !["summary", "request", "connections"].includes(String(task.intent)) || !["tr", "en"].includes(String(task.locale)))
    throw new RecordAssistanceError("INVALID_RECORD_TASK", 400);
  const required = task.intent === "connections" ? "Enterprise" : "Professional";
  if (actor.licenseAccess && !includesEdition(actor.licenseAccess.active, required)) throw new RecordAssistanceError("LICENSE_REQUIRED", 403);
  if (task.intent === "request" && !canWriteModule(actor, "Denetim Yönetimi")) throw new RecordAssistanceError("AUDIT_WRITE_REQUIRED", 403);
  return { recordId: task.recordId, intent: task.intent!, locale: task.locale! };
}

export function recordQuestion(task: RecordTask) {
  const prompts = {
    summary: "Summarize the selected record, its status, and any missing information using only its supplied fields.",
    request: "Draft a short audit evidence request about the selected record, with the item requested and acceptance criteria for human review. Do not invent dates or recipients or claim the request has been sent.",
    connections: "Analyze verified links between the selected record, controls, risks and evidence. Cite the supplied record IDs. Distinguish existing links from candidate control mappings. Explain gaps only within the supplied sources and identify any limitations. Suggestions require human review.",
  };
  return prompts[task.intent] + (task.locale === "tr" ? " Answer in Turkish." : " Answer in English.");
}

type Stored = { id: string; module: string; code: string | null; data_json: string };
const fields = ["statement","title","riskTitle","riskStatement","description","evidenceTitle","controlTitle","controlDescription","status","riskLevel","riskScore","impact","likelihood","period","dueDate","reviewDate","notes","validationStatus"];
const select = "SELECT r.id,r.module,r.data_json,c.code FROM simple_grc_records r LEFT JOIN simple_grc_record_codes c ON c.record_id=r.id";
function readRow(row: Stored, max: AiDataClassification): ConnectedGrcRow | undefined {
  let data;
  try { data = JSON.parse(row.data_json); } catch { return; }
  if (!data || typeof data !== "object" || Array.isArray(data) || !recordDataClassificationAllowed(data,max)) return;
  const projected = Object.fromEntries(Object.entries(data).filter(([key]) => connectedGraphFields.has(key) || fields.includes(key)));
  return { id: row.id, module: row.module, code: row.code ?? undefined, data:projected };
}
function describe(row: ConnectedGrcRow, relation: string) {
  const safe = sanitizeAiRecord(Object.fromEntries(fields.filter(key => Object.hasOwn(row.data,key)).map(key => [key,row.data[key]]))) as Record<string,unknown>;
  const details = Object.fromEntries(Object.entries(safe).filter(([,v]) => ["string","number","boolean"].includes(typeof v)).map(([key,v]) => [key, String(v).slice(0,280)]));
  const title = connectedTitle({...row,data:safe}).slice(0,150);
  return { source:{id:row.id,module:row.module,title}, context:JSON.stringify({sourceId:row.id,module:row.module,title,relation,fields:details}) };
}
const stopWords = new Set(["this","with","control","risk","evidence","assessment","kontrol","kanıt","için","kontrolü","kanıtı"]);
function terms(row: ConnectedGrcRow) {
  const label = [connectedTitle(row), row.data.description, row.data.riskStatement].filter(v=>typeof v==="string").join(" ").toLocaleLowerCase("tr").normalize("NFKC");
  return new Set((label.match(/[\p{L}\p{N}]{3,}/gu) || []).filter(t=>!stopWords.has(t)));
}

export async function recordContext(db: D1Database, task: RecordTask, actor: AccessSubject, max: AiDataClassification) {
  const stored = await db.prepare(select + " WHERE r.id=? AND r.module IN ('Risk Assessment','Kanıtlar')").bind(task.recordId).first<Stored>();
  const root = stored && canReadModule(actor,stored.module) ? readRow(stored,max) : undefined;
  if (!root) throw new RecordAssistanceError("RECORD_UNAVAILABLE",404);
  const first = describe(root,"selected record");
  const sources: AiContextSource[] = [first.source], chunks = [first.context];
  if (task.intent === "connections") {
    const allowed = ["Risk Assessment","Kontroller","Kanıtlar"].filter(module=>canReadModule(actor,module));
    const rows: ConnectedGrcRow[] = [];
    // Page by primary key so a legacy label is resolved against the whole authorized graph.
    const page = db.prepare(select + " WHERE r.module IN (" + allowed.map(()=>"?").join(",") + ") AND r.id>? ORDER BY r.id LIMIT 100");
    let cursor = "";
    for (;;) {
      const {results} = await page.bind(...allowed,cursor).all<Stored>();
      for (const storedRow of results) {
        const row = readRow(storedRow,max);
        if (row) rows.push(row);
      }
      if (results.length < 100) break;
      cursor = results[results.length-1].id;
    }
    const graph = buildConnectedGrcGraph(rows), nearby = connectedNeighborhood(root,graph.links,2,10);
    const related = new Set(graph.links.flatMap(link=>link.source.id===root.id?[link.target.id]:link.target.id===root.id?[link.source.id]:[]));
    const add = (row: ConnectedGrcRow, relationship: string) => {
      const item=describe(row,relationship);
      if (chunks.join("\n").length + item.context.length > 16000) return false;
      chunks.push(item.context); sources.push(item.source); related.add(row.id);
      return true;
    };
    for(const {row,path} of nearby.records) {
      if (!add(row,path.map(link=>link.source.id+" "+link.relation+" "+link.target.id).join(" / "))) break;
    }
    const rootTerms = terms(root);
    const candidates = rows.filter(row=>row.module==="Kontroller"&&!related.has(row.id)&&!nearby.records.some(x=>x.row.id===row.id))
      .map(row=>({row,score:[...terms(row)].filter(term=>rootTerms.has(term)).length}))
      .filter(item=>item.score>=2).sort((a,b)=>b.score-a.score||a.row.id.localeCompare(b.row.id));
    for(const {row} of candidates.slice(0,3)) add(row,"possible control mapping based on shared terms; unconfirmed");
    chunks.push("This is a bounded two-hop view of authorized risk, control and evidence records. Missing sources do not prove a control gap.");
  }
  return {sources, contextText:chunks.join("\n"), inferredModules:[...new Set(sources.map(s=>s.module))], maxDataClassification:max};
}
