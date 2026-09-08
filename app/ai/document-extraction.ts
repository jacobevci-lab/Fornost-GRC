export const DOCUMENT_MAX_TEXT_CHARS = 160_000;
export const DOCUMENT_MAX_PAGES = 250;

const TEXT_MAX_BYTES = 180_000;
const PDF_MAX_BYTES = 12 * 1024 * 1024;
const DOCX_MAX_BYTES = 8 * 1024 * 1024;

export type ExtractedKnowledgeDocument = {
  content: string;
  sourceType: "text" | "markdown" | "html" | "csv" | "json" | "pdf" | "docx";
  warning: string;
  detail: string;
};

export function knowledgeFileType(name: string) {
  const extension = name.toLowerCase().split(".").pop() || "";
  const types: Record<string, ExtractedKnowledgeDocument["sourceType"]> = {
    txt: "text", md: "markdown", markdown: "markdown", html: "html", htm: "html",
    csv: "csv", json: "json", pdf: "pdf", docx: "docx",
  };
  return types[extension] || null;
}

export function validateKnowledgeFile(name: string, size: number) {
  const sourceType = knowledgeFileType(name);
  if (!sourceType) throw new Error("Desteklenmeyen dosya türü. TXT, MD, HTML, CSV, JSON, PDF veya DOCX seçin.");
  const maximum = sourceType === "pdf" ? PDF_MAX_BYTES : sourceType === "docx" ? DOCX_MAX_BYTES : TEXT_MAX_BYTES;
  if (size <= 0) throw new Error("Dosya boş.");
  if (size > maximum) throw new Error(`${sourceType.toUpperCase()} dosyası ${(maximum / 1024 / 1024).toFixed(sourceType === "pdf" || sourceType === "docx" ? 0 : 2)} MB sınırını aşıyor.`);
  return sourceType;
}

export function normalizeExtractedDocumentText(value: string) {
  const normalized = value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (normalized.length < 40) throw new Error("Belgeden kullanılabilir metin çıkarılamadı.");
  if (normalized.length > DOCUMENT_MAX_TEXT_CHARS) throw new Error("Çıkarılan içerik 160.000 karakter sınırını aşıyor.");
  return normalized;
}

async function extractPdf(file: File): Promise<ExtractedKnowledgeDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const document = await task.promise;
  const pageCount = document.numPages;
  if (pageCount > DOCUMENT_MAX_PAGES) {
    await document.destroy();
    throw new Error(`PDF ${DOCUMENT_MAX_PAGES} sayfa sınırını aşıyor.`);
  }
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const text = await page.getTextContent();
      const pageText = text.items.map(item => "str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "").join("");
      if (pageText.trim()) pages.push(`Sayfa ${pageNumber}\n${pageText}`);
    }
  } finally {
    await document.destroy();
  }
  const content = normalizeExtractedDocumentText(pages.join("\n\n"));
  const sparse = content.length / Math.max(1, pageCount) < 80;
  return {
    content, sourceType: "pdf",
    warning: sparse ? "Metin yoğunluğu düşük. Belge taranmış görüntü içeriyorsa OCR ile doğrulayın." : "",
    detail: `${pageCount} sayfadan ${content.length.toLocaleString("tr-TR")} karakter çıkarıldı.`,
  };
}

async function extractDocx(file: File): Promise<ExtractedKnowledgeDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const content = normalizeExtractedDocumentText(result.value);
  const warnings = result.messages.filter(message => message.type === "warning");
  return {
    content, sourceType: "docx",
    warning: warnings.length ? `${warnings.length} belge yapısı uyarısı oluştu; çıkarılan metni onaydan önce kontrol edin.` : "",
    detail: `${content.length.toLocaleString("tr-TR")} karakter çıkarıldı.`,
  };
}

export async function extractKnowledgeDocument(file: File): Promise<ExtractedKnowledgeDocument> {
  const sourceType = validateKnowledgeFile(file.name, file.size);
  if (sourceType === "pdf") return extractPdf(file);
  if (sourceType === "docx") return extractDocx(file);
  const content = normalizeExtractedDocumentText(await file.text());
  return { content, sourceType, warning: "", detail: `${content.length.toLocaleString("tr-TR")} karakter okundu.` };
}
