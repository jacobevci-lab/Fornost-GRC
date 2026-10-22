import { validateViewState, type SavedViewState, type ViewSchema } from './saved-register-views';

const statuses = ['today', 'priority', 'overdue', 'soon', 'waiting', 'undated', 'completed', 'all'] as const;
export type QueueFilter = typeof statuses[number];
export const workViewSchema: ViewSchema = { filters: ['module', 'status'], columns: ['title', 'owner', 'status', 'due'] };

/** Preferences only: ownership scope and authorization always come from the current workspace. */
export function readWorkView(value: SavedViewState, supportedModules: string[]): { query: string; module: string; status: QueueFilter } {
  const view = validateViewState(value, workViewSchema);
  const selectedModule = view.filters.module || '', status = view.filters.status;
  if (!statuses.includes(status as QueueFilter) || (selectedModule && !supportedModules.includes(selectedModule))) throw new Error('schema');
  return { query: view.query, module: selectedModule, status: status as QueueFilter };
}

export const WORK_MODULE_LABELS: Record<string, { tr: string; en: string }> = {
  "Risk Assessment": { tr: "Risk", en: "Risk" },
  BIA: { tr: "BIA", en: "BIA" },
  "Varlık Envanteri": { tr: "Varlık", en: "Asset" },
  Uyum: { tr: "Uyum", en: "Compliance" },
  Kontroller: { tr: "Kontrol", en: "Control" },
  Kanıtlar: { tr: "Kanıt", en: "Evidence" },
  Tedarikçiler: { tr: "Tedarikçi", en: "Vendor" },
  "Denetim Yönetimi": { tr: "Denetim", en: "Audit" },
  "Bulgular ve CAPA": { tr: "Bulgu / CAPA", en: "Finding / CAPA" },
  "Risk İştahı ve KRI": { tr: "KRI", en: "KRI" },
  "Politika Merkezi": { tr: "Politika", en: "Policy" },
  "Regülasyon Merkezi": { tr: "Regülasyon", en: "Regulatory" },
  "İş Sürekliliği": { tr: "Süreklilik", en: "Continuity" },
};
