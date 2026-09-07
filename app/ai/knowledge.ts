import { cleanAiText, redactSensitiveText } from "./security";

export const KNOWLEDGE_TYPES = ["text", "markdown", "html", "csv", "json"] as const;
export const KNOWLEDGE_CLASSIFICATIONS = ["Public", "Internal", "Confidential", "Restricted"] as const;
export type KnowledgeType = typeof KNOWLEDGE_TYPES[number];
export type KnowledgeClassification = typeof KNOWLEDGE_CLASSIFICATIONS[number];

const MAX_CONTENT_CHARS = 160_000;
const CHUNK_SIZE = 2_000;
const CHUNK_OVERLAP = 200;

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

function searchTerms(query: string) {
  return [...new Set(normalize(query).split(/[^a-z0-9çğıöşü]+/i).filter(term => term.length >= 3))].slice(0, 24);
}

type KnowledgeChunkRow = { source_id:string;name:string;classification:string;version:number;ordinal:number;content_text:string;updated_at:string };

export async function retrieveApprovedKnowledge(db: D1Database, query: string, maxChars = 9_000) {
  const result = await db.prepare(`SELECT c.source_id,s.name,s.classification,c.version,c.ordinal,c.content_text,s.updated_at
    FROM ai_knowledge_chunks c JOIN ai_knowledge_sources s ON s.id=c.source_id
    WHERE s.status='approved' AND s.classification!='Restricted' AND c.version=s.current_version
    ORDER BY s.updated_at DESC,c.ordinal ASC LIMIT 600`).all<KnowledgeChunkRow>();
  const terms = searchTerms(query);
  const ranked = (result.results || []).map(row => {
    const title = normalize(`${row.name} ${row.classification}`), content = normalize(row.content_text);
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 8;
      if (content.includes(term)) score += term.length >= 6 ? 4 : 2;
    }
    return { row, score };
  }).filter(item => item.score > 0).sort((a,b) => b.score-a.score || b.row.updated_at.localeCompare(a.row.updated_at) || a.row.ordinal-b.row.ordinal);

  const sources: Array<{id:string;module:string;title:string}> = [], chunks: string[] = [];
  let used = 0;
  for (const { row } of ranked.slice(0, 16)) {
    const ref = `KB-${row.source_id.slice(0,8).toUpperCase()}-V${row.version}-C${row.ordinal+1}`;
    const safeContent = redactSensitiveText(row.content_text, CHUNK_SIZE);
    const chunk = JSON.stringify({sourceId:ref,module:"AI Bilgi Tabanı",title:row.name,classification:row.classification,content:safeContent});
    if (used + chunk.length > maxChars) continue;
    used += chunk.length;
    chunks.push(chunk);
    sources.push({id:ref,module:"AI Bilgi Tabanı",title:row.name});
  }
  return { sources, contextText: chunks.join("\n") };
}
