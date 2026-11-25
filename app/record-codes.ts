export const recordCodePrefixes = {
  "Risk Assessment": "RSK",
  BIA: "BIA",
  "Varlık Envanteri": "AST",
  Uyum: "CMP",
  Tedarikçiler: "VEN",
  Kontroller: "CTL",
  Kanıtlar: "EVD",
  "Denetim Yönetimi": "AUD",
} as const;

export type RecordCodeModule = keyof typeof recordCodePrefixes;

export function formatRecordCode(module: RecordCodeModule, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Kayıt sıra numarası pozitif bir tam sayı olmalıdır.");
  return `${recordCodePrefixes[module]}-${String(sequence).padStart(3, "0")}`;
}

export function isLegacyTechnicalRecordId(value: string) {
  return /^[A-Z]{3}-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function displayRecordCode(row: { id: string; code?: string }) {
  return row.code?.trim() || row.id;
}
