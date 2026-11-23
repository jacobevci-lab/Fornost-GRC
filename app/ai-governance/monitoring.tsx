'use client';

import { useState } from 'react';
import { DirectoryPersonField } from '../directory-person-field';
import { PolicyEntityPicker } from '../policy-lifecycle/exception-fields';
import { navigateToFornost } from '../navigation-focus';
import { type SystemRow, type Observation, type Link, word } from '../ai/governance-domain';
import type { Submit } from './registration';
export function ObservationForm({
  m,
  tr,
  busy,
  submit
}: {
  m: SystemRow;
  tr: boolean;
  busy: boolean;
  submit: Submit;
}) {
  const t = (a: string, b: string) => tr ? a : b;
  const fields = [['accuracy', t('Doğruluk (%)', 'Accuracy (%)'), 100], ['driftScore', t('Model sapması (%)', 'Model drift (%)'), 100], ['hallucination', t('Halüsinasyon (%)', 'Hallucination (%)'), 100], ['leakage', t('Veri sızıntısı gözlemi (adet)', 'Leakage observations (count)'), 10000000], ['sampleSize', t('Örneklem büyüklüğü', 'Sample size'), 10000000], ['errorRate', t('Hata oranı (%)', 'Error rate (%)'), 100], ['biasScore', t('Yanlılık skoru (0–100)', 'Bias score (0–100)'), 100], ['p95LatencyMs', t('P95 gecikme (ms)', 'P95 latency (ms)'), 600000]] as const;
  return <form className="ag-form" onSubmit={e => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void submit({
      action: 'monitor',
      id: m.id,
      revision: m.revision,
      note: d.get('note'),
      ...Object.fromEntries(fields.map(([k]) => [k, Number(d.get(k))]))
    });
  }}>
    <strong>{m.code} · {m.name}</strong>
    <div className="ag-grid">{fields.map(([key, label, max]) => <label key={key}>
        {label}
        <input type="number" name={key} min={key === 'sampleSize' ? 1 : 0} max={max} step={['sampleSize', 'leakage', 'p95LatencyMs'].includes(key) ? 1 : 0.01} required />
      </label>)}</div>
    <label>
      {t('Ölçüm bağlamı ve gözlenen etki (en az 20 karakter)', 'Measurement context and observed impact (at least 20 characters)')}
      <textarea name="note" required minLength={20} />
    </label>
    <button className="ag-primary" disabled={busy}>{t('İzleme kaydını sakla', 'Save observation')}</button>
  </form>;
}
export function IncidentFields({
  m,
  o,
  tr,
  user,
  busy,
  submit
}: {
  m: SystemRow;
  o: Observation;
  tr: boolean;
  user: string;
  busy: boolean;
  submit: Submit;
}) {
  const p = m.profile!,
    [commander, setCommander] = useState(p.technical !== p.owner ? p.technical : ''),
    [reviewer, setReviewer] = useState(p.reviewer !== user ? p.reviewer : ''),
    [asset, setAsset] = useState<Link[]>(p.asset);
  const t = (a: string, b: string) => tr ? a : b;
  return <form className="ag-form" onSubmit={e => {
    e.preventDefault();
    void submit({
      action: 'incident',
      id: m.id,
      revision: m.revision,
      observation: o.id,
      commander,
      reviewer,
      asset: asset[0]?.id
    });
  }}>
    <p>{t('Olay sahibi', 'Incident owner')} · {p.owner}</p>
    <DirectoryPersonField tr={tr} label={t('Olay yöneticisi', 'Incident commander')} exclude={[p.owner]} value={commander} onChange={v => {
      setCommander(v);
      if (v === reviewer) setReviewer('');
    }} />
    <DirectoryPersonField tr={tr} reviewer label={t('Bağımsız inceleyen', 'Independent reviewer')} exclude={[p.owner, commander, user]} value={reviewer} onChange={setReviewer} />
    <PolicyEntityPicker tr={tr} kind="asset" label={t('Etkilenen varlık', 'Affected asset')} required values={asset} onChange={setAsset} />
    <button className="ag-primary" disabled={busy || !asset.length || !commander || !reviewer}>{t('Olay oluştur', 'Create incident')}</button>
  </form>;
}
export function Monitoring({
  systems,
  tr,
  busy,
  onAdd,
  onAction
}: {
  systems: SystemRow[];
  tr: boolean;
  busy: boolean;
  onAdd: (m: SystemRow) => void;
  onAction: (action: string, m: SystemRow, o: Observation) => void;
}) {
  const t = (a: string, b: string) => tr ? a : b,
    rows = systems.filter(m => m.metrics.length || ['production', 'conditional'].includes(m.phase));
  return <>
    <p>{t('Doğruluk %80 altı, sapma %20 üstü, halüsinasyon %5 üstü veya herhangi bir veri sızıntısı işlem gerektirir.', 'Accuracy below 80%, drift above 20%, hallucination above 5%, or any leakage requires action.')}</p>
    <div className="ag-table">
      <table>
        <thead>
          <tr>{[t('AI sistemi', 'AI system'), t('Ölçüm tarihi', 'Measured'), t('Doğruluk', 'Accuracy'), t('Halüsinasyon', 'Hallucination'), t('Sızıntı', 'Leakage'), t('Sapma', 'Drift'), t('Durum', 'Status'), t('Aksiyonlar', 'Actions')].map(x => <th key={x}>{x}</th>)}</tr>
        </thead>
        <tbody>{rows.flatMap(m => (m.metrics.length ? m.metrics : [null]).map((o, i) => <tr key={o?.id || m.id}>
            <td>
              {m.code}
              <br />
              {m.name}
            </td>
            <td>{o ? new Date(o.recorded_at).toLocaleString(tr ? 'tr-TR' : 'en-GB') : '—'}</td>
            {[o?.accuracy, o?.hallucination, o?.leakage, o?.drift_score].map((v, j) => <td key={j}>{v == null ? '—' : String(v) + (j === 2 ? '' : '%')}</td>)}
            <td>
              {o ? {
                critical: t('Kritik', 'Critical'),
                attention: t('Eşik aşıldı', 'Threshold exceeded'),
                healthy: t('Eşik içinde', 'Within thresholds')
              }[o.health] : t('Ölçüm bekleniyor', 'Awaiting measurement')}
              <br />
              {word(m.phase, tr)}
            </td>
            <td>
              <div className="ag-actions">
 {i === 0 && ['production', 'conditional'].includes(m.phase) && <button disabled={busy} onClick={() => onAdd(m)}>{t('+ İzleme kaydı ekle', '+ Add monitoring record')}</button>}
 {o && o.health !== 'healthy' && <>{['production', 'conditional'].includes(m.phase) && <button disabled={busy} onClick={() => onAction('suspend', m, o)}>{t('Askıya al (Kill-Switch)', 'Suspend (kill switch)')}</button>}
 {(['capa', 'incident'] as const).map(k => {
                    const f = k === 'capa',
                      id = f ? o.finding_id : o.incident_id;
                    return id ? <button key={k} onClick={() => navigateToFornost({
                      module: f ? 'Bulgular ve CAPA' : 'Güvenlik Olayları ve Kriz',
                      kind: f ? 'finding' : 'incident',
                      ref: id
                    })}>{(f ? o.finding_code : o.incident_code) || id} →</button> : <button key={k} disabled={busy} onClick={() => onAction(k, m, o)}>{f ? t('+ CAPA aç', '+ Open CAPA') : t('+ Olay aç', '+ Open incident')}</button>;
                  })}</>}</div>
            </td>
          </tr>))}</tbody>
      </table>
    </div>
    {!rows.length && <p className="ag-empty">{t('Üretim onayı alan sistemler burada izlenir.', 'Systems appear here once approved for production.')}</p>}
  </>;
}
