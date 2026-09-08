import { cleanAiText, redactSensitiveText } from "./security";
import { dataClassificationAllowed, type AiDataClassification } from "./data-policy";

export const KNOWLEDGE_TYPES = ["text", "markdown", "html", "csv", "json", "pdf", "docx"] as const;
export const KNOWLEDGE_CLASSIFICATIONS = ["Public", "Internal", "Confidential", "Restricted"] as const;
export type KnowledgeType = typeof KNOWLEDGE_TYPES[number];
export type KnowledgeClassification = typeof KNOWLEDGE_CLASSIFICATIONS[number];

const MAX_CONTENT_CHARS = 160_000;
const CHUNK_SIZE = 2_000;
const CHUNK_OVERLAP = 200;

function validKnowledgeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number), date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateKnowledgeGovernance(input: Record<string, unknown>, fallbackOwner = "") {
  const owner = redactSensitiveText(input.owner || fallbackOwner, 320);
  const reviewDueAt = cleanAiText(input.reviewDueAt, 10);
  if (owner.length < 3) throw new Error("Bilgi kaynağı sorumlusu zorunludur.");
  if (!validKnowledgeDate(reviewDueAt)) throw new Error("Geçerli bir gözden geçirme tarihi gereklidir.");
  return { owner, reviewDueAt };
}

function stripHtml(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function normalizeKnowledgeContent(value: unknown, type: KnowledgeType) {
  if (typeof value !== "string") throw new Error("Bilgi kaynağı içeriği metin olmalı.");
  if (value.length > MAX_CONTENT_CHARS) throw new Error("Bilgi kaynağı 160.000 karakteri aşamaz.");
  let normalized = value.replace(/\0/g, "").replace(/\r\n?/g, "\n");
  if (type === "html") normalized = stripHtml(normalized);
  normalized = normalized.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized.length < 40) throw new Error("Bilgi kaynağı en az 40 karakter olmalı.");
  return normalized;
}

export function validateKnowledgeInput(body: Record<string, unknown>) {
  const name = cleanAiText(body.name, 160);
  const sourceType = cleanAiText(body.sourceType, 20) as KnowledgeType;
  const classification = cleanAiText(body.classification, 20) as KnowledgeClassification;
  if (name.length < 3) throw new Error("Kaynak adı en az 3 karakter olmalı.");
  if (!KNOWLEDGE_TYPES.includes(sourceType)) throw new Error("Desteklenmeyen bilgi kaynağı türü.");
  if (!KNOWLEDGE_CLASSIFICATIONS.includes(classification)) throw new Error("Geçersiz veri sınıflandırması.");
  return { name, sourceType, classification, content: normalizeKnowledgeContent(body.content, sourceType) };
}

export function chunkKnowledgeContent(content: string) {
  const chunks: string[] = [];
  let start = 0;
  while (start < content.length && chunks.length < 160) {
    let end = Math.min(content.length, start + CHUNK_SIZE);
    if (end < content.length) {
      const paragraph = content.lastIndexOf("\n", end);
      const sentence = content.lastIndexOf(". ", end);
      const boundary = Math.max(paragraph, sentence);
      if (boundary > start + 600) end = boundary + 1;
    }
    const chunk = content.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= content.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  if (!chunks.length) throw new Error("Kaynak parçalanamadı.");
  return chunks;
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const STOP_WORDS = new Set(["the","and","for","with","this","that","from","what","which","bir","ile","icin","için","olan","olarak","nedir","neler","hangi"]);

function searchTerms(query: string) {
  return [...new Set(normalize(query).split(/[^a-z0-9çğıöşü]+/i).filter(term => term.length >= 3 && !STOP_WORDS.has(term)))].slice(0, 24);
}

type KnowledgeChunkRow = { source_id:string;name:string;classification:string;version:number;ordinal:number;content_text:string;updated_at:string };

export async function searchApprovedKnowledge(db: D1Database, query: string, maxClassification: AiDataClassification = "Confidential") {
  const result = await db.prepare(`SELECT c.source_id,s.name,s.classification,c.version,c.ordinal,c.content_text,s.updated_at
    FROM ai_knowledge_chunks c JOIN ai_knowledge_sources s ON s.id=c.source_id
    WHERE s.status='approved' AND s.classification!='Restricted' AND c.version=s.current_version
    ORDER BY s.updated_at DESC,c.ordinal ASC LIMIT 600`).all<KnowledgeChunkRow>();
  const terms = searchTerms(query);
  return (result.results || []).filter(row=>dataClassificationAllowed(row.classification,maxClassification)).map(row => {
    const title = normalize(`${row.name} ${row.classification}`), content = normalize(row.content_text);
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 8;
      if (content.includes(term)) score += term.length >= 6 ? 4 : 2;
    }
    const ref = `KB-${row.source_id.slice(0,8).toUpperCase()}-V${row.version}-C${row.ordinal+1}`;
    return { ref, sourceId:row.source_id, name:row.name, classification:row.classification, version:Number(row.version), ordinal:Number(row.ordinal), content:redactSensitiveText(row.content_text,CHUNK_SIZE), score };
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name) || a.ordinal-b.ordinal).slice(0,16);
}

export async function retrieveApprovedKnowledge(db: D1Database, query: string, maxChars = 9_000, maxClassification: AiDataClassification = "Confidential") {
  const ranked = await searchApprovedKnowledge(db,query,maxClassification);

  const sources: Array<{id:string;module:string;title:string}> = [], chunks: string[] = [];
  let used = 0;
  for (const item of ranked) {
    const chunk = JSON.stringify({sourceId:item.ref,module:"AI Bilgi Tabanı",title:item.name,classification:item.classification,content:item.content});
    if (used + chunk.length > maxChars) continue;
    used += chunk.length;
    chunks.push(chunk);
    sources.push({id:item.ref,module:"AI Bilgi Tabanı",title:item.name});
  }
  return { sources, contextText: chunks.join("\n") };
}

const SOURCE_REF_PATTERN = /\[([^\]\n]{1,300})\]/g;
const looksLikeSourceRef=(value:string)=>/^(?:KB-|[A-Z]{2,}[A-Z0-9]*[-_:])[A-Z0-9._:-]+$/i.test(value);

export function enforceGroundedCitations(answer: string, allowedRefs: string[]) {
  const allowed = new Set(allowedRefs), cited = new Set<string>(), invalid = new Set<string>();
  const cleaned = answer.replace(SOURCE_REF_PATTERN,(whole,group:string)=>{
    const refs=group.split(/[,;]/).map(value=>value.trim()).filter(Boolean);
    if(!refs.some(ref=>allowed.has(ref)||looksLikeSourceRef(ref)))return whole;
    const valid:string[]=[];
    for(const ref of refs){if(allowed.has(ref)){cited.add(ref);valid.push(ref);}else if(looksLikeSourceRef(ref))invalid.add(ref);}
    return valid.map(ref=>`[${ref}]`).join(" ");
  }).replace(/[ \t]+\n/g,"\n").trim();
  const warning = allowedRefs.length && !cited.size ? "\n\nKaynak doğrulaması: Bu yanıt doğrulanmış bir Fornost kaynak referansı içermedi; karar vermeden önce kaynak kayıtlarını inceleyin." : "";
  return { answer:`${cleaned}${warning}`.trim(), citedRefs:[...cited], invalidRefs:[...invalid], grounded:cited.size>0 || allowedRefs.length===0 };
}
