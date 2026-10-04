"use client";
import type { ControlAssuranceDetail } from './control-assurance';
import type { BusinessImpactRecord } from './control-business-impact';
import { connectedTitle } from './connected-grc-model';
import { controlAssuranceRecordTarget } from './control-assurance-state';
import { navigateToFornost } from './navigation-focus';
import './control-impact-lens.css';

/** Uses the same evaluated snapshot and selection as the control workspace. */
export default function ControlImpactLens({ detail, lang, reliable }: { reliable: boolean; detail: ControlAssuranceDetail; lang: 'tr' | 'en' }) {
  const tr = lang === 'tr', impact = detail.businessImpact;
  const title = (row: BusinessImpactRecord['row']) => String(row.data.riskTitle || row.data.riskName || connectedTitle(row));
  const open = (item: BusinessImpactRecord) => { const target = controlAssuranceRecordTarget(item.row); if (target) navigateToFornost(target); };
  const hours = (value: number | null) => value === null ? (tr ? 'Bilinmiyor' : 'Unknown') : `${value} ${tr ? 'saat' : 'h'}`;
  const groups: Array<{ label: string; items: BusinessImpactRecord[]; processes: boolean }> = [
    { label: tr ? 'Bağlı varlıklar' : 'Connected assets', items: impact.assets, processes: false },
    { label: tr ? 'Potansiyel etkilenen süreçler' : 'Potentially affected processes', items: impact.processes, processes: true },
  ];
  return <div className="control-impact-lens" aria-label={tr ? 'Kontrol etki özeti' : 'Control impact summary'}>
    {!reliable && <p className="control-impact-warning">{tr ? "Kaynaklar güncel ve tam olarak doğrulanamadı; aşağıdaki bağlantılar yalnız yüklenmiş veriyi gösterir." : "Current source completeness is unverified; the links below show only loaded data."}</p>}
    <strong>{tr ? 'Bu kontrolün bağlı olduğu alanlar' : 'Where this control is connected'}</strong>
    <p>{tr
      ? `${detail.frameworks.length} framework eşlemesi · ${detail.audits.length} denetim gereksinimi · ${detail.risks.length} risk`
      : `${detail.frameworks.length} framework mappings · ${detail.audits.length} audit requirements · ${detail.risks.length} risks`}</p>
    <p>{tr ? `${impact.assets.length} varlık · ${impact.processes.length} süreç · ${impact.processes.filter(item => item.critical).length} kritik süreç` : `${impact.assets.length} assets · ${impact.processes.length} processes · ${impact.processes.filter(item => item.critical).length} critical processes`}</p>
    <span>{tr ? 'Kontrol başarısız olduğunda bu bağımlılıklar önceliklendirmeye yardımcı olur. Bağlantılar, gerçekleşmiş kesinti veya otomatik risk kararı anlamına gelmez.' : 'These dependencies help prioritize a control failure. Links do not establish an actual outage or an automatic risk decision.'}</span>
    {groups.map(group => <details className="control-impact-group" key={group.processes ? 'processes' : 'assets'}><summary>{group.label} ({group.items.length})</summary>
      {group.items.length ? <div className="control-impact-records">{group.items.map(item => <article key={item.row.id}>
        <div><button type="button" onClick={() => open(item)}>{item.row.code || item.row.id} · {title(item.row)}</button>{item.critical && <b>{tr ? 'Kritik' : 'Critical'}</b>}</div>
        <small>{tr ? 'Sahip: ' : 'Owner: '}{String(item.row.data.owner || item.row.data.businessOwner || (tr ? 'Atanmamış' : 'Unassigned'))}</small>
        <span>{item.origin === 'linked-risk' ? (tr ? 'Bağlı risk üzerinden: ' : 'Via linked risk: ') : (tr ? 'Kontrolden: ' : 'From control: ')}{item.path.map(row => `${row.code || row.id} · ${title(row)}`).join(' → ')}</span>
        {group.processes && <small>RTO: {hours(item.recovery.rto)} · RPO: {hours(item.recovery.rpo)} · MTPD: {hours(item.recovery.mtpd)}</small>}
      </article>)}</div> : <p>{tr ? 'Doğrulanmış bağımlılık bağlantısı bulunamadı; bu, iş etkisi olmadığı anlamına gelmez.' : 'No resolved dependency found; this does not establish absence of business impact.'}</p>}
    </details>)}
    {!!impact.unresolved.length && <p className="control-impact-warning">{tr ? `${impact.unresolved.length} bağımlılık referansı çözümlenemedi. Aşağıdaki bağlantı eksiklerini inceleyin.` : `${impact.unresolved.length} dependency references could not be resolved. Review the unresolved references below.`}</p>}
  </div>;
}
