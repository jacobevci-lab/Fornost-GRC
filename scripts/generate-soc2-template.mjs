import fs from "node:fs/promises";
import path from "node:path";
import readXlsxFile from "read-excel-file/node";

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/generate-soc2-template.mjs <mapping.xlsx>");

const workbook = await readXlsxFile(input, { getSheets: true });
const rows = Array.isArray(workbook) && workbook[0]?.data
  ? workbook.find((sheet) => sheet.sheet === "SOC2 Mapping")?.data
  : workbook;
if (!Array.isArray(rows)) throw new Error("SOC2 Mapping sheet not found.");
const [headers, ...body] = rows;
const keyByHeader = {
  "TSC ID": "tscId",
  "TSC Kategorisi": "tscCategory",
  "TSC Kriteri / Beklenti": "expectation",
  "Example of Controls": "exampleControls",
  "Performing Controls – ODINE": "performingControls",
  "Control Owner": "controlOwner",
  Frequency: "frequency",
  "Control Type": "controlType",
  Nature: "nature",
  "ISO/IEC 27001:2022 Ek A": "isoAnnex",
  "ISO Ek A Kontrol Başlıkları": "isoControlTitles",
  "İlgili ISO/IEC 27001:2022 Maddesi": "isoClauses",
  "ISO 22301:2019 İlişkisi": "iso22301",
  "Beklenen Kanıt / Doküman": "expectedEvidence",
  "Type II Test Yaklaşımı": "typeIITestApproach",
  "Mevcut Doküman / Kayıt": "currentDocuments",
  "Gap / Denetim Notu": "gapNote",
  "Required Action": "requiredAction",
  Status: "consultantStatus",
  Kaynak: "source",
};

const records = body.map((row) => Object.fromEntries(
  headers.flatMap((header, index) => {
    const key = keyByHeader[String(header || "")];
    if (!key) return [];
    const value = row[index];
    return [[key, value == null ? "" : String(value).trim()]];
  }),
));

const source = `// Generated from the consultant-authored ODINE_SOC2_TypeII_Detayli_Mapping.xlsx.\n` +
  `// Preserve the original wording; publish updates as a new template version.\n` +
  `export type Soc2TemplateControl = {\n` +
  [...new Set(Object.values(keyByHeader))].map((key) => `  ${key}: string;`).join("\n") +
  `\n};\n\n` +
  `export const soc2TemplateMeta = ${JSON.stringify({
    id: "soc2-odine-v1",
    name: "SOC 2 Type II – ODINE Mapping v1",
    framework: "SOC 2 Type II",
    auditName: "SOC 2 Type II – 2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    scope: ["Security", "Availability", "Confidentiality"],
    phaseTwo: ["Processing Integrity", "Privacy"],
    sourceFile: path.basename(input),
    authoringBasis: "GRC danışmanı tarafından hazırlanan uzman başlangıç değerlendirmesi",
  }, null, 2)} as const;\n\n` +
  `export const soc2TemplateControls: Soc2TemplateControl[] = ${JSON.stringify(records, null, 2)};\n`;

await fs.writeFile(new URL("../app/api/grc/soc2-template.ts", import.meta.url), source);
console.log(`Generated ${records.length} SOC 2 controls.`);
