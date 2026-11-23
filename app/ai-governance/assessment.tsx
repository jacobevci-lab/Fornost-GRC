'use client';

import { useState } from 'react';
import { WorkflowEvidencePicker } from '../workflow-selection-fields';
import { governingRisk, blockers, controls, messages, word, type SystemRow, type Assessment } from '../ai/governance-domain';
import type { Submit } from './registration';
export default function AssessmentPanel({
  tr,
  m,
  user,
  busy,
  submit,
  edit
}: {
  tr: boolean;
  m: SystemRow;
  user: {
    email: string;
    role: string;
  };
  busy: boolean;
  submit: Submit;
  edit: () => void;
}) {
  const [a, setA] = useState<Assessment>(m.assessment),
    [selection, choose] = useState({
      evidenceId: m.pin?.evidenceId || '',
      versionId: m.pin?.id || ''
    }),
    [note, setNote] = useState(''),
    [reviewDate, setReviewDate] = useState(m.reviewDate);
  const t = (a: string, b: string) => tr ? a : b,
    p = m.profile;
  if (!p) return <div className="ag-empty">
    <p>{t('Bu kayıt için mimari, EU risk sınıfı ve bağımsız inceleyen henüz belirtilmedi.', 'Architecture, EU risk class and independent reviewer have yet to be recorded.')}</p>
    <button onClick={edit}>{t('Sistem profilini tamamla', 'Complete system profile')}</button>
  </div>;
  const reviewing = m.phase === 'review',
    active = ['conditional', 'production'].includes(m.phase),
    editable = !reviewing && m.phase !== 'retired' && user.email !== p.reviewer && (user.role === 'Admin' || [p.owner, p.technical].includes(user.email));
  const signer = reviewing && user.role === 'Admin' && user.email === p.reviewer && ![p.owner, p.technical, m.submittedBy].includes(user.email);
  const problems = blockers(p, a, selection.versionId ? {
    id: selection.versionId
  } : null);
  if(p.risk!==governingRisk(p.risk,m.nativeRisk))problems.unshift('classification');
  const send = (action: string) => submit({
    action,
    id: m.id,
    revision: m.revision,
    reviewDate,
    assessment: a,
    evidenceSelection: selection.versionId ? selection : null,
    note
  });
  const field = (k: 'impact' | 'mitigation' | 'privacy' | 'transferBasis', label: string) => <label>
    {label}
    <textarea value={a[k]} rows={3} onChange={e => setA({
      ...a,
      [k]: e.target.value
    })} />
  </label>;
  return <div className="ag-assess">
    <div className="ag-row">
      <div><strong>{m.code} · {m.name}</strong> <span className="ag-tag">{word(m.phase, tr)}</span></div>
      {!reviewing && !active && m.phase !== 'retired' && <button onClick={edit}>{t('Profili düzenle', 'Edit profile')}</button>}
    </div>
    <fieldset disabled={!editable || busy}>
      <legend>{t('Algoritmik etki değerlendirmesi (AIA)', 'Algorithmic impact assessment (AIA)')}</legend>
      <div className="ag-grid">{field('impact', t('Etkilenen gruplar, haklar ve olası etkiler', 'Affected groups, rights and potential impacts'))}{field('mitigation', t('Azaltım önlemleri ve artık risk', 'Mitigation and residual risk'))}</div>
    </fieldset>
    <fieldset disabled={!editable || busy}>
      <legend>{t('KVKK / DPIA kontrolü', 'Privacy / DPIA review')}</legend>
      <div className="ag-grid">{field('privacy', t('Kişisel veri etkisi ve DPIA kararı', 'Privacy impact and DPIA decision'))}{field('transferBasis', t('KVKK Madde 9 · Aktarım dayanağı', 'KVKK Article 9 · Transfer basis'))}</div>
    </fieldset>
    <fieldset disabled={!editable || busy}>
      <legend>{t('Teknik guardrail ve red-teaming', 'Technical guardrails and red-teaming')}</legend>
      <div className="ag-grid">{controls.map(k => <label key={k} className="ag-check">
          <input type="checkbox" checked={a.checks.includes(k)} onChange={e => setA({
            ...a,
            checks: e.target.checked ? [...a.checks, k] : a.checks.filter(v => v !== k)
          })} />
          {word(k, tr)}
        </label>)}</div>
      <label>
        {t('Doğrulayıcı rapor türü', 'Verification report type')}
        <select value={a.reportType} onChange={e => setA({
          ...a,
          reportType: e.target.value
        })}>
          <option value="">—</option>
          {['redteam', 'bias', 'dpia'].map(k => <option key={k} value={k}>{word(k, tr)}</option>)}
        </select>
      </label>
      {editable ? <WorkflowEvidencePicker tr={tr} value={selection} onChange={choose} /> : <p>{m.pin ? [m.pin.code, m.pin.evidenceTitle, 'v' + m.pin.versionNo].join(' · ') : t('Bağlı rapor yok', 'No linked report')}</p>}
    </fieldset>
    <fieldset>
      <legend>{t('SoD üretim onay kapısı', 'SoD production approval gate')}</legend>
      <label>
        {t('Sonraki gözden geçirme tarihi', 'Next periodic review date')}
        <input type="date" disabled={!editable || busy} value={reviewDate} onChange={e => setReviewDate(e.target.value)} />
      </label>
      <p>{t('Bağımsız inceleyen', 'Independent reviewer')} · {p.reviewer}</p>
      {m.decision && <p>{m.decision}</p>}
      {problems.length > 0 && <ul>{problems.map(k => <li key={k}>{messages[k][tr ? 0 : 1]}</li>)}</ul>}
      {signer && <label>
        {t('Karar gerekçesi ve varsa üretim sınırları', 'Decision rationale and production restrictions')}
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </label>}
      {active && editable && <p>{t('Yeni değerlendirmeye gönderildiğinde mevcut üretim onayı kaldırılır.', 'Submitting for reassessment withdraws the current production approval.')}</p>}
      <div className="ag-actions">{editable && <>
          {!active && <button disabled={busy} onClick={() => void send('save')}>{t('Taslağı kaydet', 'Save assessment')}</button>}
          <button className="ag-primary" disabled={busy || !!problems.length} onClick={() => void send('submit')}>{t('Bağımsız incelemeye gönder', 'Submit for independent review')}</button>
        </>}
 {signer && <>
          <button disabled={busy || note.trim().length < 5} onClick={() => void send('return')}>{t('Düzeltmeye gönder', 'Return for correction')}</button>
          <button disabled={busy || !!problems.length || note.trim().length < 15} onClick={() => void send('conditional')}>{t('Koşullu üretimi onayla', 'Approve conditional production')}</button>
          <button className="ag-primary" disabled={busy || !!problems.length || note.trim().length < 5} onClick={() => void send('approve')}>{t('Üretimi onayla', 'Approve production')}</button>
        </>}</div>
    </fieldset>
  </div>;
}
