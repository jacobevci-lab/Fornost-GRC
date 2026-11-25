export type TemplateKind = 'plan' | 'milestone';
export type DraftTemplate = { version: 1; kind: TemplateKind; name: string; fields: Record<string, string> };
export const templateFields = { plan: ['objective', 'scope', 'exclusions', 'methodology', 'deliverables', 'milestones'], milestone: ['title', 'description'] };

export function parseDraftTemplate(text: string, kind: TemplateKind): DraftTemplate {
  if (text.length > 50000) throw new Error('invalid');
  let value: DraftTemplate;
  try { value = JSON.parse(text); } catch { throw new Error('invalid'); }
  if (!value || value.version !== 1 || value.kind !== kind || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || !value.fields || typeof value.fields !== 'object' || Array.isArray(value.fields)) throw new Error('invalid');
  if (Object.keys(value).some(key => !['version', 'kind', 'name', 'fields'].includes(key))) throw new Error('invalid');
  const entries = Object.entries(value.fields);
  if (!entries.length || entries.some(([key, value]) => !templateFields[kind].includes(key) || typeof value !== 'string' || value.length > (kind === 'plan' ? 4000 : key === 'title' ? 200 : 2000))) throw new Error('invalid');
  return { version: 1, kind, name: value.name.trim(), fields: Object.fromEntries(entries) };
}

export function exportDraftTemplate(kind: TemplateKind, name: string, draft: Record<string, string>): string {
  const fields = Object.fromEntries(templateFields[kind].map(key => [key, draft[key] || '']));
  return JSON.stringify(parseDraftTemplate(JSON.stringify({ version: 1, kind, name, fields }), kind), null, 2);
}

export function applyDraftTemplate<T extends Record<string, string>>(draft: T, template: DraftTemplate, selected: string[]): T {
  const checked = parseDraftTemplate(JSON.stringify(template), template.kind);
  if (!selected.length || selected.some(key => !Object.hasOwn(checked.fields, key))) throw new Error('invalid');
  return { ...draft, ...Object.fromEntries(selected.map(key => [key, checked.fields[key]])) };
}

export function builtInDraftTemplates(kind: TemplateKind, tr: boolean): DraftTemplate[] {
  const items: [string, Record<string, string>][] = kind === 'plan' ? [
    [tr ? 'İç kontrol denetimi' : 'Internal control audit', {
      objective: tr ? 'Seçili süreçlerde kontrol tasarımını ve dönem içindeki işleyişini değerlendirmek.' : 'Evaluate control design and operation during the review period for selected processes.',
      methodology: tr ? 'Kapsamı ve ölçütleri teyit et; süreç sahipleriyle görüş; kanıtların dönemini ve kaynağını doğrula; örnekleme gerekçesini kaydet; test sonuçlarını bağımsız incelemeye sun.' : 'Confirm scope and criteria; interview process owners; verify evidence period and source; document sampling rationale; submit test results for independent review.',
      deliverables: tr ? 'Onaylı kapsam, kanıt talepleri, çalışma kâğıtları, bulgular ve gerekçeli kapanış değerlendirmesi.' : 'Agreed scope, evidence requests, workpapers, findings and a reasoned closure assessment.',
    }],
    [tr ? 'Düzeltici faaliyet takip denetimi' : 'Remediation follow-up audit', {
      objective: tr ? 'Seçili bulgulara yönelik düzeltici faaliyetlerin uygulanmasını ve etkinliğini yeniden değerlendirmek.' : 'Reassess implementation and effectiveness of remediation for selected findings.',
      methodology: tr ? 'Önceki bulguyu ve kabul ölçütünü incele; güncel kanıtı doğrula; kontrolü yeniden test et; kalan riski değerlendir; bağımsız inceleme sonucunu kaydet.' : 'Review the previous finding and acceptance criteria; verify current evidence; retest the control; assess residual risk; record independent review outcomes.',
      deliverables: tr ? 'Yeniden test çalışma kâğıtları, güncel kanıt referansları, açık kalan faaliyetler ve sonuç gerekçeleri.' : 'Retest workpapers, current evidence references, remaining actions and outcome rationale.',
    }],
  ] : [
    [tr ? 'Kapsam mutabakatı' : 'Scope agreement', { title: tr ? 'Denetim kapsamını teyit et' : 'Confirm audit scope', description: tr ? 'İncelenecek süreçleri, dönem ve ölçütleri, kapsam dışı alanları ve beklenen çıktıları ilgili taraflarla teyit edip plana kaydet.' : 'Confirm processes, period, criteria, exclusions and expected outputs with stakeholders and record them in the plan.' }],
    [tr ? 'Kanıt hazırlığı' : 'Evidence preparation', { title: tr ? 'Kanıt taleplerini hazırla' : 'Prepare evidence requests', description: tr ? 'Gerekli kanıtları, dönemleri ve kabul ölçütlerini belirle. Talep sorumlularını ve bağımsız inceleyenleri doğrula; talepleri ayrı iş akışında başlat.' : 'Identify required evidence, periods and acceptance criteria. Confirm request owners and independent reviewers; launch requests through their separate workflow.' }],
    [tr ? 'Saha çalışması' : 'Fieldwork', { title: tr ? 'Kontrol testlerini belgele' : 'Document control tests', description: tr ? 'Örnekleme gerekçesini, test adımlarını, kanıt sürümlerini ve sonuçları çalışma kâğıtlarına kaydet; incelemeye sun.' : 'Record sampling rationale, test steps, evidence versions and outcomes in workpapers; submit for review.' }],
    [tr ? 'Kapanış hazırlığı' : 'Closure preparation', { title: tr ? 'Denetim kapanışını hazırla' : 'Prepare audit closure', description: tr ? 'Açık talepleri, çalışma kâğıtlarını, görevleri ve bulguları gözden geçir. Engelleri çöz; kapanışı ayrı bağımsız onay akışına sun.' : 'Review open requests, workpapers, milestones and findings. Resolve blockers; submit closure through the separate independent approval workflow.' }],
  ];
  return items.map(([name, fields]) => ({ version: 1, kind, name, fields }));
}
