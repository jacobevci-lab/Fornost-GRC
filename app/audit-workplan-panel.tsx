"use client";
import { useEffect, useRef, useState } from 'react';
import { withBasePath } from './base-path';
import { auditPlanLabels } from './audit-plan';
import { requestStatusLabels, type AuditRequestWorkflow } from './audit-requests';
import { workplanResolved, type WorkplanClosureDetail, type WorkplanEvent, type WorkplanPlan, type WorkplanPreview } from './audit-workplan';

const errors: Record<string, [string, string]> = {
  'audit-closed': ['Denetim kapalı. Önce Kapanış ve onay görünümünden gerekçeyle yeniden açın.', 'The audit is closed. Reopen it with a reason in Closure and approval first.'],
  outstanding: ['Kapatmadan önce tüm talepleri sonuçlandırın; taslaklar da buna dahildir.', 'Resolve every request before closing, including drafts.'],
  'closure-changed': ['Talepler değişti. Kapanış özetini yeniden yükleyin.', 'Requests changed. Reload the closure preview.'],
  'preview-changed': ['Talepler değişti. Kapanış özetini yeniden yükleyin.', 'Requests changed. Reload the closure preview.'],
  'plan-changed': ['Kayıtlı plan değişti. Kapanış özetini yeniden yükleyin.', 'The saved plan changed. Reload the closure preview.'],
  conflict: ['İş planı değişti. Güncel durumu yeniden yükleyin.', 'The work plan changed. Reload its current state.'],
  forbidden: ['Denetim yazma ve kanıt okuma yetkisi gerekir.', 'Audit write and evidence read access are required.'],
  note: ['5–2.000 karakterlik gerekçe girin.', 'Enter a reason of 5–2,000 characters.'],
  unavailable: ['Sonuç doğrulanamadı. Yeniden göndermeden güncel durumu yükleyin; gerekçeniz korunuyor.', 'The outcome could not be confirmed. Reload before retrying; your reason is retained.'],
};
export function AuditWorkplanPanel({ auditId, lang, workflow, canManage, evidenceAccess, disabled, onBusy, onChanged }: {
  auditId: string; lang: string; workflow: AuditRequestWorkflow; canManage: boolean; evidenceAccess: boolean; disabled: boolean;
  onBusy: (busy: boolean) => void; onChanged: () => Promise<unknown>;
}) {
  const en = lang === 'en', t = (tr: string, eng: string) => en ? eng : tr;
  const [history, setHistory] = useState<{ events: WorkplanEvent[]; complete: boolean } | null>(null);
  const [mode, setMode] = useState<'close' | 'reopen' | null>(null), [preview, setPreview] = useState<WorkplanPreview | null>(null);
  const [detail, setDetail] = useState<WorkplanClosureDetail | null>(null), [note, setNote] = useState('');
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [valid, setValid] = useState(false), [historyFailed, setHistoryFailed] = useState(false);
  const [refresh, setRefresh] = useState(0), pending = useRef(false), generation = useRef(0);
  const endpoint = `/api/audits/requests/closure?auditId=${encodeURIComponent(auditId)}`;
  useEffect(() => {
    let live = true; const controller = new AbortController();
    fetch(withBasePath(endpoint), { cache: 'no-store', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(body => { if (live) { setHistory(body); setHistoryFailed(false); } }).catch(() => { if (live) setHistoryFailed(true); });
    return () => { live = false; controller.abort(); };
  }, [endpoint, workflow.revision, refresh]);
  useEffect(() => () => { generation.current++; }, []);
  async function load(kind: 'close' | 'reopen' | 'detail', closureId = '') {
    if (pending.current) return;
    const sequence = ++generation.current; setLoading(true); setError(''); setValid(false);
    if (kind !== 'detail') { setMode(kind); setPreview(null); setDetail(null); } else { setDetail(null); setMode(null); }
    try {
      const response = await fetch(withBasePath(endpoint + (kind === 'detail' ? `&closureId=${encodeURIComponent(closureId)}` : '&preview=1')), { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'unavailable');
      if (sequence !== generation.current) return;
      if (kind === 'detail') setDetail(body); else { setPreview(body); setValid(true); }
    } catch (err) { if (sequence === generation.current) setError(err instanceof Error ? err.message : 'unavailable'); }
    finally { if (sequence === generation.current) setLoading(false); }
  }
  async function submit() {
    if (pending.current || !valid || !preview || !mode || disabled || note.trim().length < 5) return;
    pending.current = true; onBusy(true); setError('');
    try {
      const response = await fetch(withBasePath('/api/audits/requests/closure'), { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000), body: JSON.stringify({ auditId, action: mode, expectedRevision: preview.workflow.revision, expectedPlanRevision: preview.plan.revision, expectedRequests: preview.requests.map(({ id, revision }) => ({ id, revision })), note }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'unavailable');
      setMode(null); setPreview(null); setNote(''); setDetail(null); setValid(false); setRefresh(value => value + 1); await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'unavailable'); setValid(false); }
    finally { pending.current = false; onBusy(false); }
  }
  const closeReady = preview && preview.workflow.state === 'active' && workplanResolved(preview.requests, preview.complete);
  return <div className="ar-workplan" aria-label={t('İş planı kapanışı ve geçmişi', 'Work plan closure and history')}>
    <h4>{t('İş planı kapanışı', 'Work plan closure')} · {workflow.state === 'closed' ? t('Kapalı', 'Closed') : workflow.state === 'active' ? t('Aktif', 'Active') : t('Taslak', 'Draft')}</h4>
    <p>{t('Kapanış, kayıtlı planı, talep kararlarını ve sabit kanıt sürümlerini saklar. Denetim görüşü veya bulgu kapatma kararı değildir. Yeniden açma önceki kabul kararlarını değiştirmez.', 'Closure saves the recorded plan, request decisions and pinned evidence versions. It is not an audit opinion or a finding closure. Reopening preserves previous acceptance decisions.')}</p>
    {canManage && evidenceAccess && workflow.state !== 'draft' && <button type="button" disabled={disabled || loading} onClick={() => void load(workflow.state === 'closed' ? 'reopen' : 'close')}>{workflow.state === 'closed' ? t('Yeniden açmayı değerlendir', 'Review reopening') : t('Kapanış özetini gör', 'Preview closure')}</button>}
    {error && <p role="alert">{(errors[error] || errors.unavailable)[en ? 1 : 0]}</p>}
    {loading && <p role="status">{t('Yükleniyor…', 'Loading…')}</p>}
    {mode && <div className="ar-closure-preview">
      <h4>{mode === 'close' ? t('Kapanış önizlemesi', 'Closure preview') : t('İş planını yeniden aç', 'Reopen the work plan')}</h4>
      {preview && <><p><b>{preview.auditName}</b></p>
        {mode === 'close' ? <><p>{preview.requests.filter(r => r.status === 'accepted').length} {t('kabul', 'accepted')} · {preview.requests.filter(r => r.status === 'cancelled').length} {t('iptal', 'cancelled')}</p>
          {!closeReady && <p role="status">{preview.complete ? t('Kapanış için tüm talepleri sonuçlandırın. En az bir talep ve aktif iş planı gerekir.', 'Resolve all requests before closing. At least one request and an active work plan are required.') : t('Liste eksik; kapanış yapılamaz.', 'The list is incomplete; closure is blocked.')}</p>}
          <PlanSnapshot plan={preview.plan} en={en}/>
          <ul className="ar-preview-list">{preview.requests.map(row => <li key={row.id}><b>{row.title}</b><span>{requestStatusLabels[row.status]?.[en ? 1 : 0]} · {row.id}</span><span>{row.owner} → {row.reviewer}</span>{row.note && <p>{row.note}</p>}{row.evidence.map(v => <small key={v.id}>{v.title} · v{v.versionNo} · {v.id} · SHA-256 {v.contentSha256}</small>)}</li>)}</ul></> : <p>{t('Yeni taslak talepler eklenebilir. Eski kapanış kaydı ve kabul edilmiş kanıtlar korunur; kabul edilen talepler tekrar incelemeye alınmaz.', 'New draft requests can be added. The prior closure and accepted evidence remain unchanged; accepted requests are not sent for review again.')}</p>}
      </>}
      <label>{t('Kapanış / yeniden açma gerekçesi', 'Closure / reopening reason')}<textarea aria-label={t('Kapanış / yeniden açma gerekçesi', 'Closure / reopening reason')} rows={3} minLength={5} maxLength={2000} value={note} disabled={disabled || loading} onChange={e => setNote(e.target.value)}/></label>
      <div className="ar-actions"><button type="button" disabled={disabled || loading || !valid || note.trim().length < 5 || (mode === 'close' ? !closeReady : preview?.workflow.state !== 'closed')} onClick={() => void submit()}>{mode === 'close' ? t('İş planını kapat', 'Close work plan') : t('İş planını yeniden aç', 'Reopen work plan')}</button><button type="button" disabled={disabled || loading} onClick={() => void load(mode)}>{t('Önizlemeyi yeniden yükle', 'Reload preview')}</button><button type="button" disabled={disabled || loading} onClick={() => { setMode(null); setPreview(null); setError(''); }}>{t('Vazgeç', 'Cancel')}</button></div>
    </div>}
    <details className="ar-closure-history"><summary>{t('Kapanış ve yeniden açma geçmişi', 'Closure and reopening history')}</summary>
      {historyFailed ? <p role="status">{t('Geçmiş yüklenemedi.', 'History could not be loaded.')} <button type="button" onClick={() => setRefresh(value => value + 1)}>{t('Yeniden dene', 'Retry')}</button></p> : !history ? <p>{t('Yükleniyor…', 'Loading…')}</p> : <>{!history.complete && <p>{t('En son 20 işlem gösteriliyor.', 'Showing the latest 20 events.')}</p>}{!history.events.length && <p>{t('Henüz kapanış yok.', 'No closures yet.')}</p>}<ol>{history.events.map(event => <li key={event.id}><b>{event.action === 'close' ? t('Kapatıldı', 'Closed') : t('Yeniden açıldı', 'Reopened')}</b> · {event.actor} · {new Date(event.created_at).toLocaleString(en ? 'en-GB' : 'tr-TR')}<p>{event.note}</p><button type="button" disabled={disabled || loading} onClick={() => void load('detail', event.closure_id)}>{t('Kapanış kaydını gör', 'View closure record')}</button></li>)}</ol></>}
    </details>
    {detail && <div className="ar-closure-record"><h4>{t('Saklanan kapanış kaydı', 'Saved closure record')}</h4><p><b>{detail.snapshot.auditName}</b></p><p>{detail.snapshot.id} · {detail.snapshot.closedBy} · {detail.snapshot.closedAt}</p><p>{detail.snapshot.note}</p><p role="status">{detail.integrity === 'verified' ? t('Kapanış kaydının SHA-256 özeti doğrulandı.', 'Closure record SHA-256 verified.') : t('Kapanış kaydının bütünlüğü doğrulanamadı; indirme kapalı.', 'Closure record integrity could not be verified; download is disabled.')}</p><PlanSnapshot plan={detail.snapshot.plan} en={en}/>
      {!detail.evidenceAccess && <p>{t('Kanıt ayrıntıları yetkiniz nedeniyle gizlendi.', 'Evidence details are hidden by your access permissions.')}</p>}
      <ul className="ar-preview-list">{detail.snapshot.requests.map(row => <li key={row.id}><b>{row.title}</b><span>{requestStatusLabels[row.status]?.[en ? 1 : 0]} · {row.id}</span><span>{row.owner} → {row.reviewer}</span><p>{row.note}</p>{row.evidence.map(v => <small key={v.id}><a href={withBasePath(`/api/evidence?key=${encodeURIComponent(v.fileKey)}`)}>{v.title} · v{v.versionNo} · {v.fileName}</a><br/>SHA-256 {v.contentSha256}</small>)}</li>)}</ul>
      {detail.evidenceAccess && detail.integrity === 'verified' && <a href={withBasePath(`${endpoint}&closureId=${encodeURIComponent(detail.snapshot.id)}&download=1`)}>{t('Kapanış kaydını indir (JSON)', 'Download closure record (JSON)')}</a>}<p>{t('İndirme karar ve dosya referanslarını içerir; dosyaların kendisini içermez.', 'The download contains decisions and file references, not the files themselves.')}</p><button type="button" onClick={() => setDetail(null)}>{t('Kaydı gizle', 'Hide record')}</button>
    </div>}
  </div>;
}
function PlanSnapshot({ plan, en }: { plan: WorkplanPlan; en: boolean }) {
  return <details className="ar-plan-snapshot"><summary>{en ? 'Saved audit plan and scope' : 'Kayıtlı denetim planı ve kapsamı'}</summary><small>{plan.revision || (en ? 'No saved plan' : 'Kayıtlı plan yok')} · {plan.updatedBy || '—'} · {plan.updatedAt || '—'}</small><dl>{Object.entries(plan.plan).map(([key, value]) => <div key={key}><dt>{auditPlanLabels[key as keyof typeof auditPlanLabels]?.[en ? 1 : 0] || key}</dt><dd>{value || '—'}</dd></div>)}</dl></details>;
}
