import { milestoneLabels, recurrenceLabels } from './audit-milestones';
import { workpaperStatusLabels } from './audit-workpapers';
import { buildReportCsv, buildReportHtml, buildReportPdf, type ReportRecord, type ReportOptions } from './report-export';
import { auditPlanLabels } from './audit-plan';
import { requestStatusLabels } from './audit-requests';
import { findingLabel } from './findings/presentation';
import { auditReportSummary, type AuditReportDetail } from './audit-status-report';

export function auditStatusReportView(detail: AuditReportDetail, tr: boolean, fontBytes?: Uint8Array) {
  if (detail.integrity !== 'verified') throw new Error('integrity');
  const s = detail.snapshot, n = auditReportSummary(s.items), t = (a: string, b: string) => tr ? a : b;
  const fieldLabels: Record<string, string> = {
    ...Object.fromEntries(Object.entries(auditPlanLabels).map(([key, label]) => [key, label[tr ? 0 : 1]])),
    population:t('Evren ve kaynak','Population and source'),populationCount:t('Evren büyüklüğü','Population size'),method:t('Seçim yöntemi','Selection method'),rationale:t('Seçim gerekçesi','Sampling rationale'),procedure:t('Test adımları','Test steps'),conclusion:t('Sonuç görüşü','Conclusion'),samples:t('Örneklem sonuçları','Sample results'),
    title: t('Başlık','Title'), summary: t('Hazırlayanın özeti','Preparer summary'), limitations: t('Kısıtlar ve notlar','Limitations and notes'),
    requirementRef:t('Madde referansı','Requirement reference'), requirementTitle:t('Madde başlığı','Requirement title'), requirementStatement:t('Madde metni','Requirement statement'),
    requirementGuidance:t('Rehber','Guidance'), requirementAssessment:t('Değerlendirme','Assessment'), auditorResult:t('Denetçi değerlendirmesi','Auditor assessment'),
    owner:t('Sorumlu','Owner'), reviewer:t('İnceleyen','Reviewer'), status:t('Durum','Status'), dueDate:t('Termin','Due date'), reviewDueDate:t('İnceleme termini','Review due date'),
    instructions:t('Kabul ölçütleri','Acceptance criteria'), note:t('Karar gerekçesi','Decision reason'), evidence:t('Sabit kanıt sürümleri','Pinned evidence versions'),
    description:t('Açıklama','Description'), severity:t('Önem','Severity'), rootCause:t('Kök neden','Root cause'), correctiveAction:t('Düzeltici aksiyon','Corrective action'), preventiveAction:t('Önleyici aksiyon','Preventive action'),
    sourceRef:t('Kaynak kimliği','Source identity'), sourceType:t('Kaynak türü','Source type'), controlRef:t('Kontrol referansı','Control reference'), riskRef:t('Risk referansı','Risk reference'),
    id:t('Kayıt kimliği','Record ID'),auditId:t('Denetim kimliği','Audit ID'),auditName:t('Denetim adı','Audit name'),auditor:t('Denetçi / ekip','Auditor / team'),auditOwner:t('Denetim sahibi','Audit owner'),
    businessUnit:t('İş birimi','Business unit'),progress:t('İlerleme','Progress'),evidenceStatus:t('Kanıt durumu','Evidence status'),startDate:t('Başlangıç','Start date'),endDate:t('Bitiş','End date'),
    planRevision:t('Plan sürümü','Plan revision'),planUpdatedAt:t('Plan kayıt zamanı','Plan saved at'),planUpdatedBy:t('Planı kaydeden','Plan saved by'),revision:t('Kaynak sürümü','Source revision'),
    recurrence:t('Tekrar sıklığı','Recurrence'),recurrenceOf:t('Önceki dönem görev kimliği','Previous occurrence ID'),recurrenceDay:t('Tekrar için ayın günü','Recurrence day of month'),
    dependsOn:t('Ön koşul görev kimlikleri','Prerequisite milestone IDs'),
    createdAt:t('Oluşturma zamanı','Created at'),updatedAt:t('Güncelleme zamanı','Updated at'),createdBy:t('Oluşturan','Created by'),workflowRevision:t('İş planı sürümü','Work plan revision'),timeZone:t('Saat dilimi','Time zone'),
    template:t('Katalog','Catalog'),source:t('Katalog kaynağı','Catalog source'),count:t('Katalog madde sayısı','Catalog requirement count'),imported:t('İçe aktarılan katalog','Imported catalog'),rightsConfirmed:t('Kullanım hakkı teyidi','Usage rights confirmed'),
    findingType:t('Bulgu türü','Finding type'),sourceTitle:t('Kaynak başlığı','Source title'),acceptanceRationale:t('Risk kabul gerekçesi','Risk acceptance rationale'),acceptUntil:t('Risk kabul bitişi','Risk acceptance expiry'),recurrenceCount:t('Tekrar sayısı','Recurrence count'),
    evidenceReference:t('Sunulan kanıt referansı','Submitted evidence reference'),evidenceSha256:t('Sunulan kanıt özeti','Submitted evidence digest'),verificationEvidenceReference:t('Doğrulama kanıt referansı','Verification evidence reference'),verificationEvidenceSha256:t('Doğrulama kanıt özeti','Verification evidence digest'),
  };
  const statuses: Record<string, string> = tr ? {} : { 'Başlanmadı':'Not started','Devam Ediyor':'In progress','İncelemede':'In review','Kapatıldı':'Closed','Kapalı':'Closed','Tamamlandı':'Completed' };
  const rows: ReportRecord[] = [
    { id:s.id, module:t('Rapor notları','Report notes'), data:{title:s.title,summary:s.summary,limitations:s.limitations,owner:s.createdBy,status:t('Saklanan görüntü','Saved snapshot')} },
    { id:s.audit.id, module:t('Denetim planı','Audit plan'), data:{ title:s.audit.name,...s.plan.plan,owner:s.audit.owner,auditor:s.audit.auditor,template:s.audit.template,planRevision:s.plan.revision,planUpdatedAt:s.plan.updatedAt,planUpdatedBy:s.plan.updatedBy,status:statuses[s.audit.status]||s.audit.status } },
    { id:s.workflow.revision||s.audit.id, module:t('Talep iş planı','Request work plan'), data:{title:t('Talep iş planının kayıtlı durumu','Recorded request work plan state'),status:s.workflow.state==='closed'?t('Kapalı','Closed'):s.workflow.state==='active'?t('Aktif','Active'):t('Taslak','Draft'),timeZone:s.workflow.timeZone,workflowRevision:s.workflow.revision,planRevision:s.workflow.planRevision} },
    ...(s.catalog ? [{id:`catalog:${s.audit.id}`,module:t('Madde kataloğu','Requirement catalog'),data:{title:t('Katalog kaynağı ve sürümü','Catalog source and revision'),...s.catalog}}] : []),
    ...s.items.map(item => {
      const r = item.record, data = {...r.data};
      if (item.kind === 'request') {
        data.status = requestStatusLabels[String(data.status) as keyof typeof requestStatusLabels]?.[tr?0:1] || data.status;
        if (Array.isArray(data.evidence)) data.evidence = data.evidence.map(v => `${v.title} · v${v.versionNo} · ${v.id}\n${v.fileName}\nSHA-256 ${v.contentSha256}`).join('\n\n');
      } else if (item.kind === 'finding') { data.status=findingLabel(String(data.status),tr?'tr':'en'); data.severity=findingLabel(String(data.severity),tr?'tr':'en'); }
      else if (item.kind === 'milestone') {if(data.recurrence)data.recurrence=recurrenceLabels[String(data.recurrence) as keyof typeof recurrenceLabels]?.[tr?0:1]||data.recurrence;data.status=milestoneLabels[String(data.status) as keyof typeof milestoneLabels]?.[tr?0:1]||data.status;if(Array.isArray(data.dependsOn))data.dependsOn=data.dependsOn.join(', ');}
      else if (item.kind === 'workpaper') {
        data.status = workpaperStatusLabels[String(data.status) as keyof typeof workpaperStatusLabels]?.[tr?0:1] || data.status;
        data.method = data.method === 'census' ? t('Tam sayım','Census') : t('Yargısal örneklem','Judgmental sampling');
        if (Array.isArray(data.samples)) data.samples = data.samples.map(v => `${v.reference} · ${v.result === 'pass' ? t('Uygun','Pass') : v.result === 'exception' ? t('İstisna','Exception') : t('Bekliyor','Pending')}\n${v.note}\n${v.versionId}`).join('\n\n');
        if (Array.isArray(data.evidence)) data.evidence = data.evidence.map(v => `${v.title} · v${v.versionNo} · ${v.id}\n${v.fileName}\nSHA-256 ${v.contentSha256}`).join('\n\n');
      }
      else data.status=statuses[String(data.status)]||data.status;
      return {...r,module:item.kind==='requirement'?t('Denetim maddesi','Audit requirement'):item.kind==='request'?t('Kanıt talebi','Evidence request'):item.kind==='milestone'?t('Denetim görevi','Audit milestone'):item.kind==='workpaper'?t('Çalışma kâğıdı','Workpaper'):t('Bulgu / CAPA','Finding / CAPA'),data};
    }),
  ];
  const scope=t('Kayıtlı plan, bu denetime ait tüm maddeler, talepler, tarihli görevler, çalışma kâğıtları ve doğrudan bağlı CAPA bulguları. Bulgular yalnız kaynak türü denetim olup kaynak referansı denetim kimliği veya bir madde kimliği/koduyla tam eşleşiyorsa dahil edilir. Serbest metin ve ortak kontrol referansları kapsamı genişletmez. Kanıt dosyalarının kendisi ve canlı hazırlık skoru dahil değildir. Rapor, denetim görüşü veya kapatma kararı değildir.',
    'Saved plan, all requirements, requests, milestones and workpapers for this audit, and directly linked CAPA findings. Findings are included only when their source type is audit and their source reference exactly matches the audit ID or a requirement ID/code. Free text and shared control references do not expand the scope. File bytes and live readiness scores are excluded. This report is not an audit opinion or a closure decision.');
  const metrics = [
    {label:t('Denetim görevleri','Audit milestones'),value:n.milestones,note:t(`${n.outstandingMilestones} açık`,`${n.outstandingMilestones} outstanding`)},
    {label:t('Çalışma kâğıtları','Workpapers'),value:n.workpapers,note:t(`${n.outstandingWorkpapers} sonuçlanmamış`,`${n.outstandingWorkpapers} outstanding`)},
    {label:t('Denetim maddeleri','Audit requirements'),value:n.requirements,note:t(`${n.unfinishedRequirements} madde sonuçlanmamış`,`${n.unfinishedRequirements} unfinished requirements`)},
    {label:t('Kanıt talepleri','Evidence requests'),value:n.requests,note:t(`${n.outstandingRequests} açık · ${n.acceptedRequests} kabul · ${n.cancelledRequests} iptal`,`${n.outstandingRequests} outstanding · ${n.acceptedRequests} accepted · ${n.cancelledRequests} cancelled`)},
    {label:t('Doğrudan bağlı bulgular','Directly linked findings'),value:n.findings,note:t(`${n.unresolvedFindings} kapatılmamış; risk kabulleri ayrı kararlar olarak korunur`,`${n.unresolvedFindings} not closed; risk acceptances remain separate decisions`)},
  ];
  const options:ReportOptions={template:'detailed',reportId:s.id,generatedAt:s.createdAt,preparedBy:s.createdBy,scope,fieldLabels,fontBytes,hideFieldKeys:true,qualityFields:[],intro:[{label:t('Hazırlayanın özeti','Preparer summary'),value:s.summary},...(s.limitations?[{label:t('Kısıtlar ve notlar','Limitations and notes'),value:s.limitations}]:[])],filters:[{label:t('Denetim kimliği','Audit ID'),value:s.audit.id},{label:'SHA-256',value:detail.sha256}]};
  return {title:`${t('Denetim Durum Raporu','Audit Status Report')} · ${s.title}`,rows,metrics,options};
}
export function auditStatusReportHtml(detail:AuditReportDetail,tr:boolean){const v=auditStatusReportView(detail,tr);return buildReportHtml(v.title,v.rows,v.metrics,tr,v.options);}
export function auditStatusReportCsv(detail:AuditReportDetail,tr:boolean){const v=auditStatusReportView(detail,tr);return buildReportCsv(v.title,v.rows,v.metrics,tr,v.options);}
export function auditStatusReportPdf(detail:AuditReportDetail,tr:boolean,fontBytes?:Uint8Array){const v=auditStatusReportView(detail,tr,fontBytes);return buildReportPdf(v.title,v.metrics,v.rows,tr,v.options);}
