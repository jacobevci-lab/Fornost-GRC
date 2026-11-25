export const labels = {
  llm: ['Üretken AI / LLM', 'Generative AI / LLM'],
  agent: ['Otonom AI Agent (Tool/MCP erişimli)', 'Autonomous AI agent (tools/MCP)'],
  ml: ['Tahmine dayalı / analitik ML', 'Predictive / analytical ML'],
  embedded: ['Üçüncü taraf SaaS gömülü AI', 'Third-party SaaS embedded AI'],
  private: ['Kurum içi / özel bulut', 'On-prem / private cloud'],
  cloud: ['Bulut API (Azure / AWS / GCP)', 'Cloud API (Azure / AWS / GCP)'],
  saas: ['Harici SaaS', 'External SaaS'],
  minimal: ['Minimal risk', 'Minimal risk'],
  limited: ['Sınırlı risk · Şeffaflık', 'Limited risk · Transparency'],
  high: ['Yüksek risk · Tam etki değerlendirmesi', 'High risk · Full impact assessment'],
  prohibited: ['Kabul edilemez / Yasaklı', 'Unacceptable / Prohibited'],
  rag: ['Kurumsal RAG dokümanları', 'Enterprise RAG documents'],
  pii: ['Müşteri kişisel verileri', 'Customer personal data'],
  sensitive: ['Finansal / hassas veri', 'Financial / sensitive data'],
  code: ['Kaynak kod', 'Source code'],
  public: ['Yalnızca halka açık veri', 'Public data only'],
  draft: ['Taslak', 'Draft'],
  assessment: ['Değerlendirmede', 'In assessment'],
  review: ['Değerlendirmede', 'In assessment'],
  conditional: ['Koşullu üretim', 'Conditional production'],
  production: ['Üretimde', 'In production'],
  suspended: ['Askıya alındı', 'Suspended'],
  retired: ['Emekli', 'Retired'],
  injection: ['Prompt injection koruması', 'Prompt injection protection'],
  dlp: ['PII maskeleme / DLP', 'PII masking / DLP'],
  output: ['Çıktı doğrulama / halüsinasyon kontrolü', 'Output validation / hallucination control'],
  access: ['Erişim kontrolü ve loglama', 'Access control and logging'],
  redteam: ['Red-teaming raporu', 'Red-team report'],
  bias: ['Yanlılık raporu', 'Bias report'],
  dpia: ['DPIA raporu', 'DPIA report'],
  unreviewed: ['Karar bekliyor', 'Pending decision'],
  banned: ['Kullanımı yasaklandı', 'Use prohibited'],
  admitted: ['Envantere alındı', 'Admitted to inventory']
} as const;
export const word = (key: string, tr: boolean) => (labels as Record<string, readonly string[]>)[key]?.[tr ? 0 : 1] ?? key;
const riskOrder=['','minimal','limited','high','prohibited'];
export function governingRisk(profileRisk='',nativeRisk=''){
  return riskOrder.indexOf(nativeRisk)>riskOrder.indexOf(profileRisk)?nativeRisk:profileRisk;
}
export const controls = ['injection', 'dlp', 'output', 'access'] as const;
export type Link = {
  id: string;
  label: string;
};
export type Profile = {
  name: string;
  model: string;
  purpose: string;
  unit: string;
  architecture: string;
  deployment: string;
  provider: string;
  vendor: Link[];
  asset: Link[];
  risk: string;
  tools: string;
  write: boolean;
  hitl: string;
  sources: string[];
  pii: boolean;
  noTraining: boolean;
  zdr: boolean;
  transfer: boolean;
  owner: string;
  technical: string;
  reviewer: string;
  risks: Link[];
  controls: Link[];
  reviewDate: string;
  impact: string;
  likelihood: string;
  sensitivity: string;
  autonomy: string;
  maturity: string;
  controlNotes: string;
};
export const blankProfile: Profile = {
  name: '',
  model: '',
  purpose: '',
  unit: '',
  architecture: 'llm',
  deployment: 'private',
  provider: '',
  vendor: [],
  asset: [],
  risk: '',
  tools: '',
  write: false,
  hitl: '',
  sources: [],
  pii: false,
  noTraining: false,
  zdr: false,
  transfer: false,
  owner: '',
  technical: '',
  reviewer: '',
  risks: [],
  controls: [],
  reviewDate: '',
  impact: '',
  likelihood: '',
  sensitivity: '',
  autonomy: '',
  maturity: '',
  controlNotes: ''
};
export type Assessment = {
  impact: string;
  mitigation: string;
  privacy: string;
  transferBasis: string;
  checks: string[];
  reportType: string;
};
export const blankAssessment: Assessment = {
  impact: '',
  mitigation: '',
  privacy: '',
  transferBasis: '',
  checks: [],
  reportType: ''
};
export type Pin = {
  id: string;
  evidenceId: string;
  evidenceTitle: string;
  fileName: string;
  contentSha256: string;
  versionNo: number;
  code?: string;
};
export type SystemRow = {
  id: string;
  code: string;
  name: string;
  model: string;
  vendor: string;
  owner: string;
  purpose: string;
  reviewDate: string;
  phase: string;
  revision: string;
  profile: Profile | null;
  assessment: Assessment;
  pin: Pin | null;
  openIssue: boolean;
  nativeGate: boolean;
  nativeRisk: string;
  decision: string;
  submittedBy: string;
  metrics: Observation[];
};
export type Observation = {
  id: string;
  accuracy: number;
  drift_score: number;
  hallucination: number | null;
  leakage: number | null;
  health: string;
  note: string;
  recorded_at: string;
  alerts_json: string;
  finding_id: string | null;
  incident_id: string | null;
  finding_code: string | null;
  incident_code: string | null;
  acknowledged_at: string | null;
};
export type Shadow = {
  id: string;
  name: string;
  context: string;
  status: string;
  discovered_by: string;
  model_id: string | null;
  decision_note: string | null;
};
export type Desk = {
  systems: SystemRow[];
  shadow: Shadow[];
  nextCode: string;
  asOf: string;
};
export class DeskError extends Error {
  constructor(public code: string, public status = 422) {
    super(code);
  }
}
const list = (v: unknown, options: readonly string[]) => Array.isArray(v) && v.every(x => typeof x === 'string' && options.includes(x)) && new Set(v).size === v.length;
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length <= max ? v.trim() : '';
export function parseProfile(raw: Partial<Profile>): Profile {
  const p = {
    ...blankProfile
  };
  for (const key of ['name', 'model', 'purpose', 'unit', 'provider', 'tools', 'hitl', 'owner', 'technical', 'reviewer', 'reviewDate', 'controlNotes'] as const) p[key] = str(raw[key], ['purpose', 'tools', 'hitl', 'controlNotes'].includes(key) ? 1600 : 240);
  for (const key of ['pii', 'noTraining', 'zdr', 'transfer', 'write'] as const) {
    if (typeof raw[key] !== 'boolean') throw new DeskError('fields');
    p[key] = raw[key];
  }
  for (const [key, options] of [['architecture', ['llm', 'agent', 'ml', 'embedded']], ['deployment', ['private', 'cloud', 'saas']], ['risk', ['minimal', 'limited', 'high', 'prohibited']]] as const) {
    if (!options.some(o => o === raw[key])) throw new DeskError('fields');
    p[key] = raw[key]!;
  }
  for (const key of ['vendor', 'asset', 'risks', 'controls'] as const) {
    const rows = raw[key];
    if (!Array.isArray(rows) || rows.length > (key === 'asset' || key === 'vendor' ? 1 : 50) || rows.some(r => !r || typeof r.id !== 'string' || !r.id || r.id.length > 160) || new Set(rows.map(r => r.id)).size !== rows.length) throw new DeskError('reference');
    p[key] = rows.map(r => ({
      id: r.id,
      label: ''
    }));
  }
  if (!list(raw.sources, ['rag', 'pii', 'sensitive', 'code', 'public']) || !raw.sources?.length) throw new DeskError('data');
  p.sources = raw.sources;
  if (p.sources.includes('public') && (p.sources.length > 1 || p.pii) || p.sources.includes('pii') && !p.pii) throw new DeskError('data');
  if (p.architecture === 'agent' && (!p.tools || !p.hitl)) throw new DeskError('agent');
  if (p.architecture !== 'agent') {
    p.tools = '';
    p.write = false;
  }
  if (p.name.length < 3 || p.model.length < 2 || p.purpose.length < 10 || !p.unit || !p.vendor.length && p.provider.length < 2 || p.controlNotes.length < 5) throw new DeskError('fields');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.reviewDate) || !Number.isFinite(Date.parse(p.reviewDate)) || new Date(p.reviewDate).toISOString().slice(0, 10) !== p.reviewDate) throw new DeskError('date');
  for (const k of ['impact', 'likelihood', 'sensitivity', 'autonomy', 'maturity'] as const) {
    if (!/^[1-5]$/.test(String(raw[k]))) throw new DeskError('score');
    p[k] = String(raw[k]);
  }
  for (const k of ['owner', 'technical', 'reviewer'] as const) {
    p[k] = p[k].toLowerCase();
    if (!p[k]) throw new DeskError('people');
  }
  if ([p.owner, p.technical].includes(p.reviewer)) throw new DeskError('sod');
  return p;
}
export function parseAssessment(input: Partial<Assessment>): Assessment {
  if (!list(input.checks, controls) || !['', 'redteam', 'bias', 'dpia'].includes(String(input.reportType))) throw new DeskError('fields');
  return {
    impact: str(input.impact, 3000),
    mitigation: str(input.mitigation, 3000),
    privacy: str(input.privacy, 3000),
    transferBasis: str(input.transferBasis, 1600),
    checks: input.checks!,
    reportType: input.reportType!
  };
}
export function blockers(p: Profile, a: Assessment, pin: Pick<Pin, 'id'> | null) {
  const issues: string[] = [];
  if (p.risk === 'prohibited') issues.push('prohibited');
  if (p.risk === 'high' && (a.impact.length < 20 || a.mitigation.length < 20)) issues.push('aia');
  if (p.pii && a.privacy.length < 15) issues.push('privacy');
  if (p.transfer && a.transferBasis.length < 10) issues.push('transfer');
  if (['high', 'limited'].includes(p.risk)) {
    if (!controls.every(c => a.checks.includes(c))) issues.push('guardrails');
    if (!pin || !['redteam', 'bias', 'dpia'].includes(a.reportType)) issues.push('evidence');
  }
  return issues;
}
export const messages: Record<string, [string, string]> = {
  'deep-review':['EU AI Act belirsizliklerini, atanan kontrol listesini ve AI BOM yazma yetkilerinin HITL noktalarını tamamlayın.','Complete EU AI Act uncertainty review, the assigned checklist and HITL checkpoints for AI BOM write permissions.'],
  reviewDate: ['Bir sonraki gözden geçirme için gelecekteki bir tarih seçin.', 'Choose a future date for the next periodic review.'],
  autonomy: ['Kritik artık risk taşıyan otonom modelde yazma yetkisini veya risk kontrollerini gözden geçirin.', 'Review write access or controls for an autonomous model with critical residual risk.'],
  classification: ['Sınıf, mevcut mevzuat profilindeki riskin altında olamaz.', 'The risk class cannot be lower than the existing regulatory profile.'],
  maturity: ['Kritik model için kontrol olgunluğu en az 4 olmalıdır.', 'Critical models require control maturity of at least 4.'],
  prohibited: ['Yasaklı risk. Üretim onayı verilemez.', 'Prohibited risk. Production approval is blocked.'],
  aia: ['Tam AIA için etkilenen grupları, etkileri ve azaltım planını belgeleyin.', 'Document affected groups, impacts and mitigation for the full AIA.'],
  privacy: ['KVKK / DPIA incelemesini belgeleyin.', 'Document the privacy / DPIA review.'],
  transfer: ['Yurt dışına aktarım dayanağını belgeleyin.', 'Document the international transfer basis.'],
  guardrails: ['Dört teknik kontrolün test sonucunu tamamlayın.', 'Complete the four technical control tests.'],
  evidence: ['Kanıt Kütüphanesinden geçerli bir rapor sürümü seçin.', 'Select a current, verified report version from the Evidence Library.'],
  sod: ['Atanan bağımsız yönetici, sahiplerden ve değerlendirmeyi gönderenden farklı olmalıdır.', 'The assigned independent Admin must differ from the owners and submitter.'],
  people: ['Etkin dizin kullanıcıları seçin.', 'Choose active directory users.'],
  reference: ['Bağlı kayıt bulunamadı veya türü değişti.', 'A linked record is unavailable or has changed type.'],
  fields: ['Zorunlu alanları ve açıklamaları kontrol edin.', 'Check the required fields and descriptions.'],
  agent: ['Araç kapsamı ve insan gözetimi mekanizmasını belirtin.', 'Specify the tool scope and human oversight mechanism.'],
  data: ['Veri kaynaklarını ve kişisel veri seçimini kontrol edin.', 'Review the data sources and personal data declaration.'],
  score: ['Beş risk faktörünü 1–5 arasında değerlendirin.', 'Rate all five risk factors from 1 to 5.'],
  date: ['Geçerli bir inceleme tarihi girin.', 'Enter a valid review date.'],
  stale: ['Kayıt değişti. Güncel kayıtla yeniden deneyin.', 'The record changed. Reopen the latest record.'],
  denied: ['Bu işlem için yetkiniz yok.', 'You do not have permission for this action.'],
  legacy: ['Önce sistem profilini tamamlayın.', 'Complete the system profile first.'],
  stage: ['Mevcut aşama bu işleme izin vermiyor.', 'The current stage does not allow this action.'],
  metric: ['Tüm ölçümleri ve örneklem büyüklüğünü sayısal olarak girin.', 'Enter numeric measurements and a sample size.'],
  condition: ['Koşullu onay için sınırları ve gerekçeyi yazın.', 'Describe the restrictions and rationale for conditional approval.'],
  incidentRoles: ['Olay aktarımı için bağlı varlık ve üç ayrı sorumlu gerekir.', 'Incident escalation requires a linked asset and three distinct roles.'],
  unavailable: ['Kayıtlar yüklenemedi. Yeniden deneyin.', 'Records could not be loaded. Retry.']
};
