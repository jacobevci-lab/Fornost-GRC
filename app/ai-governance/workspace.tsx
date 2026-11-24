'use client';

import {DeepGovernanceTools,ShadowImport} from '../ai/agentic/deep-ui';
import { useState, useRef } from 'react';
import { useWorkflowRecords } from '../use-workflow-records';
import { withBasePath } from '../base-path';
import { DirectoryPersonField } from '../directory-person-field';
import FindingDialog from '../findings/dialog';
import { governingRisk, blockers, messages, word, type Desk, type SystemRow, type Shadow, type Observation } from '../ai/governance-domain';
import Registration from './registration';
import AssessmentPanel from './assessment';
import { Monitoring, ObservationForm, IncidentFields } from './monitoring';
import './workspace.css';
const tabs = [['Karar Masası', 'Decision desk'], ['AI Envanteri', 'AI inventory'], ['Etki & Risk Değerlendirmesi', 'Impact & risk assessment'], ['Sürekli İzleme & Sapma', 'Continuous monitoring & drift'], ['Shadow AI & Keşif', 'Shadow AI & discovery']];
type Modal = {
  kind: 'register' | 'shadow' | 'ban' | 'monitor' | 'suspend' | 'incident' | 'capa' | 'assessment';
  m?: SystemRow;
  s?: Shadow;
  o?: Observation;
};
type Native = 'release' | 'models' | 'assurance-alerts' | 'findings';
export default function Workspace({
  tr,
  user,
  onNative,
  focus
}: {
  tr: boolean;
  user: {
    role: string;
    email: string;
  };
  onNative: (tab: Native) => void;
  focus?: string;
}) {
  const {
    data,
    loading,
    error,
    reload
  } = useWorkflowRecords<Desk>('/api/ai/workspace', null);
  const [tab, tabTo] = useState(focus ? 2 : 0),
    [filter, filterTo] = useState(''),
    [search, setSearch] = useState(''),
    [phase, setPhase] = useState(''),
    [selected, select] = useState(focus || ''),
    [modal, show] = useState<Modal | null>(null),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [capaReviewer, setCapaReviewer] = useState('');
  const lock = useRef(false),
    t = (a: string, b: string) => tr ? a : b,
    locale = tr ? 0 : 1,
    models = data?.systems || [],
    shadow = data?.shadow || [];
  const pending = (m: SystemRow) => m.phase === 'review' || m.nativeGate,
    high = (m: SystemRow) => ['high', 'prohibited'].includes(governingRisk(m.profile?.risk,m.nativeRisk));
  const current = models.find(m => m.id === selected) || models[0],
    shadowOpen = shadow.filter(s => s.status === 'unreviewed');
  function go(n: number, f = '') {
    tabTo(n);
    filterTo(f);
    setPhase('');
    setSearch('');
    setErr('');
    setNotice('');
  }
  function open(v: Modal) {
    setErr('');
    setNotice('');
    show(v);
  }
  function review(m: SystemRow) {
    go(2);
    select(m.id);
  }
  async function submit(b: Record<string, unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setErr('');
    try {
      const r = await fetch(withBasePath('/api/ai/workspace'), {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          ...b,
          lang: tr ? 'tr' : 'en'
        })
      });
      const result = await r.json();
      if (!r.ok) {
        setErr(result.code || 'unavailable');
        if (r.status === 409) await reload();
        return false;
      }
      show(null);
      if (b.action === 'register') {
        select(result.id);
        go(2);
      } else if (b.action === 'shadow') {
        go(4);
      }
      await reload();
      setNotice(t('İşlem kaydedildi.', 'Action recorded.'));
      return true;
    } catch {
      setErr('unavailable');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function action(kind: string, m: SystemRow, o: Observation) {
    if (kind === 'suspend') {
      open({
        kind,
        m,
        o
      });
      return;
    }
    if (!m.profile) {
      review(m);
      setErr('legacy');
      return;
    }
    const p = m.profile;
    if (kind === 'capa' && p.reviewer === user.email) {
      setCapaReviewer('');
      open({
        kind: 'capa',
        m,
        o
      });
      return;
    }
    if (kind === 'incident' && (!p.asset.length || p.owner === p.technical || p.reviewer === user.email)) {
      open({
        kind: 'incident',
        m,
        o
      });
      return;
    }
    void submit({
      action: kind,
      id: m.id,
      revision: m.revision,
      observation: o.id
    });
  }
  const kpis = [[t('Toplam AI Sistemi', 'Total AI systems'), models.length, 1, ''], [t('Yüksek Riskli (EU AI Act)', 'High risk (EU AI Act)'), models.filter(high).length, 1, 'high-risk'], [t('Üretim Onayı Bekleyen', 'Pending production approval'), models.filter(pending).length, 0, 'pending'], [t('Shadow AI / İncelemesiz', 'Shadow AI / unreviewed'), shadowOpen.length, 4, 'unreviewed'], [t('Açık AI Bulgusu / İhlali', 'Open AI finding / breach'), models.filter(m => m.openIssue).length, 1, 'issue']] as const;
  const today = Date.parse(data?.asOf || ''),
    queue: {
      key: string;
      name: string;
      reason: string;
      priority: number;
      date: string;
      run: () => void;
    }[] = [];
  for (const m of models) {
    const add = (reason: string, priority: number, run = () => {
      review(m);
      open({
        kind: 'assessment',
        m
      });
    }) => queue.push({
      key: m.id + priority,
      name: m.code + ' · ' + m.name,
      reason,
      priority,
      date: m.reviewDate,
      run
    });
    if (pending(m)) add(t('Üretim onayı bekliyor', 'Awaiting production approval'), 1, m.nativeGate && m.phase !== 'review' && user.role === 'Admin' ? () => onNative('release') : undefined);
    if (filter === 'pending' || m.phase === 'retired') continue;
    if (m.reviewDate && Date.parse(m.reviewDate) <= today + 30 * 86400000) add(t('Periyodik gözden geçirme', 'Periodic review') + ' · ' + m.reviewDate, 2);
    const gaps = m.profile ? blockers(m.profile, m.assessment, m.pin) : ['legacy'];
    if (gaps.length) add(messages[gaps[0]][locale], 3);
  }
  if (filter !== 'pending') for (const s of shadowOpen) queue.push({
    key: s.id,
    name: s.name,
    reason: t('Shadow AI kararı bekleniyor', 'Shadow AI decision pending'),
    priority: 4,
    date: '',
    run: () => {
      go(4);
      setSearch(s.name);
    }
  });
  queue.sort((a, b) => a.priority - b.priority || a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const clean = (s: string) => s.toLocaleLowerCase(tr ? 'tr' : 'en'),
    includes = (s: string) => clean(s).includes(clean(search.trim()));
  const filtered = models.filter(m => includes([m.code, m.name, m.model, m.vendor, m.profile?.unit].join(' ')) && (!phase || m.phase === phase || phase === 'review' && m.phase === 'assessment') && (!filter || (filter === 'issue' ? m.openIssue : filter === 'high-risk' ? high(m) : governingRisk(m.profile?.risk,m.nativeRisk) === filter)));
  const errMsg = messages[err]?.[locale] || messages.unavailable[locale];
  const modalTitle = modal ? {
    assessment: t('Etki ve risk değerlendirmesi', 'Impact and risk assessment'),
    capa: t('İyileştirme bulgusu aç', 'Open improvement finding'),
    register: t('AI sistemi kaydet', 'Register AI system'),
    shadow: t('Shadow AI kaydı', 'Record shadow AI'),
    ban: t('Kullanımı yasakla', 'Prohibit use'),
    monitor: t('İzleme kaydı ekle', 'Add monitoring record'),
    suspend: t('Üretim onayını askıya al', 'Suspend production approval'),
    incident: t('Güvenlik olayı aç', 'Open security incident')
  }[modal.kind] : '';
  return <section className="ag-workspace" aria-label={t('AI yönetişimi', 'AI governance')}>
    <header className="ag-row">
      <div>
        <h2>{t('AI Yönetişimi', 'AI Governance')}</h2>
      </div>
      <div className="ag-actions">
        <a href={withBasePath('/api/ai/workspace?format=csv&lang=' + (tr ? 'tr' : 'en'))}>{t('AI Envanter CSV', 'AI inventory CSV')}</a>
        <button className="ag-primary" disabled={!data || busy} onClick={() => open({
          kind: 'register'
        })}>{t('+ AI Sistemi Kaydet', '+ Register AI system')}</button>
      </div>
    </header>
    <div className="ag-kpis">{kpis.map(([name, count, n, f]) => <button key={name} disabled={!data} onClick={() => go(n, f)} aria-pressed={tab === n && filter === f}>
        <span>{name}</span>
        <strong>{data ? count : '—'}</strong>
      </button>)}</div>
    <nav className="ag-nav" aria-label={t('AI çalışma alanları', 'AI workspaces')}>{tabs.map((pair, n) => <button key={n} aria-current={tab === n ? 'page' : undefined} onClick={() => go(n)}>{pair[locale]}</button>)}</nav>
    {notice && <p role="status">{notice}</p>}
    {err && !modal && <p role="alert">{errMsg}</p>}
    {loading && !data && <p role="status">{t('Kayıtlar yükleniyor…', 'Loading records…')}</p>}
    {error && <p role="alert">{messages.unavailable[locale]} <button onClick={() => void reload()}>{t('Yeniden dene', 'Retry')}</button></p>}
    {data && <section className="ag-content" aria-label={tabs[tab][locale]}>
 {tab === 0 && <>
        <div className="ag-row">
          <h3>{t('Öncelikli aksiyon kuyruğu', 'Prioritized action queue')}</h3>
          {filter && <button onClick={() => go(0)}>{t('Tüm işler', 'All work')}</button>}
        </div>
        {queue.length ? <ol className="ag-queue">{queue.map(q => <li key={q.key}>
            <div>
              <strong>{q.name}</strong>
              <small>{q.reason}</small>
            </div>
            <button onClick={q.run}>{t('İncele / Karar Ver →', 'Review / Decide →')}</button>
          </li>)}</ol> : <p className="ag-empty">{t('Karar bekleyen iş yok.', 'No decisions pending.')}</p>}
      </>}
 {tab === 1 && <>
        <div className="ag-filters">
          <label>
            {t('Envanterde ara', 'Search inventory')}
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('Kod, ad veya sağlayıcı', 'Code, name or provider')} />
          </label>
          <label>
            {t('Risk / bulgu', 'Risk / finding')}
            <select value={filter} onChange={e => filterTo(e.target.value)}>
              <option value="">{t('Tümü', 'All')}</option>
              <option value="high-risk">{t('Yüksek veya yasaklı', 'High or prohibited')}</option>
              <option value="issue">{kpis[4][0]}</option>
              {['minimal', 'limited', 'high', 'prohibited'].map(v => <option key={v} value={v}>{word(v, tr)}</option>)}
            </select>
          </label>
          <label>
            {t('Yaşam döngüsü', 'Lifecycle')}
            <select value={phase} onChange={e => setPhase(e.target.value)}>
              <option value="">{t('Tümü', 'All')}</option>
              {['draft', 'review', 'conditional', 'production', 'suspended', 'retired'].map(v => <option key={v} value={v}>{word(v, tr)}</option>)}
            </select>
          </label>
        </div>
        <div className="ag-table">
          <table>
            <thead>
              <tr>{[t('Kısa kod', 'Code'), t('Sistem / Agent adı', 'System / agent'), t('Mimari tür', 'Architecture'), t('Sağlayıcı', 'Provider'), 'EU AI Act', t('Veri & KVKK / ZDR', 'Data & privacy / ZDR'), 'HITL', t('Yaşam döngüsü', 'Lifecycle')].map(x => <th key={x}>{x}</th>)}</tr>
            </thead>
            <tbody>{filtered.map(m => {
                const p = m.profile;
                return <tr key={m.id}>
                <td>
                  <button onClick={() => review(m)}>{m.code}</button>
                </td>
                <td>{m.name}</td>
                <td>{p ? word(p.architecture, tr) : '—'}</td>
                <td>{m.vendor}</td>
                <td>
                  <span className="ag-tag" data-risk={governingRisk(p?.risk,m.nativeRisk)}>{p || m.nativeRisk ? word(governingRisk(p?.risk,m.nativeRisk), tr) : t('Sınıflandırılmadı', 'Unclassified')}</span>
                </td>
                <td>{p ? <span className="ag-tag">{p.pii ? 'PII' : t('Kişisel veri yok', 'No PII')} · {p.zdr ? 'ZDR' : t('ZDR yok', 'No ZDR')}{p.transfer ? ' · ' + t('Yurt dışı', 'Cross-border') : ''}</span> : '—'}</td>
                <td>{p ? p.hitl || t('Belirtilmedi', 'Unspecified') : '—'}</td>
                <td>{word(m.phase, tr)}{m.openIssue && <small>{t('Açık bulgu / ihlal', 'Open finding / breach')}</small>}</td>
              </tr>;
              })}</tbody>
          </table>
        </div>
        {!filtered.length && <p className="ag-empty">{models.length ? t('Filtreye uyan sistem yok.', 'No systems match the filter.') : t('Henüz kayıtlı AI sistemi yok.', 'No AI systems registered yet.')}</p>}
      </>}
 {tab === 2 && <>{current ? <>
          <label className="ag-select">
            {t('Değerlendirilecek sistem', 'System to assess')}
            <select value={current.id} onChange={e => {
              select(e.target.value);
              setErr('');
            }}>{models.map(m => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select>
          </label>
          <DeepGovernanceTools key={current.id} m={current} tr={tr} user={user} reload={reload}/>
          <AssessmentPanel key={current.id + current.revision} m={current} tr={tr} user={user} busy={busy} submit={submit} edit={() => open({
            kind: 'register',
            m: current
          })} />
        </> : <p className="ag-empty">{t('Değerlendirme başlatmak için bir AI sistemi kaydedin.', 'Register an AI system to start an assessment.')}</p>}</>}
 {tab === 3 && <Monitoring systems={models} tr={tr} busy={busy} onAdd={m => open({
        kind: 'monitor',
        m
      })} onAction={action} />}
 {tab === 4 && <>
        <ShadowImport tr={tr} reload={reload}/>
        <div className="ag-row">
          <div className="ag-filters">
            <label>
              {t('Araç ara', 'Search tools')}
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <label>
              {t('Karar durumu', 'Decision status')}
              <select value={filter} onChange={e => filterTo(e.target.value)}>
                <option value="">{t('Tümü', 'All')}</option>
                {['unreviewed', 'admitted', 'banned'].map(v => <option key={v} value={v}>{word(v, tr)}</option>)}
              </select>
            </label>
          </div>
          <button className="ag-primary" onClick={() => open({
            kind: 'shadow'
          })}>{t('+ Shadow AI Kaydı', '+ Record shadow AI')}</button>
        </div>
        <ul className="ag-queue">{shadow.filter(s => includes(s.name) && (!filter || s.status === filter)).map(s => <li key={s.id}>
            <div>
              <strong>{s.name}</strong>
              <small>{s.context}</small>
              <span className="ag-tag">{word(s.status, tr)}</span>
              {s.decision_note && <small>{s.decision_note}</small>}
            </div>
            {s.status === 'unreviewed' && user.role === 'Admin' && <div className="ag-actions">
              <button onClick={() => open({
                kind: 'register',
                s
              })}>{t('Envantere al (değerlendirmeye sok)', 'Admit to inventory for assessment')}</button>
              <button onClick={() => open({
                kind: 'ban',
                s
              })}>{t('Kullanımı yasakla', 'Prohibit use')}</button>
            </div>}
            {s.model_id && <button onClick={() => {
              go(2);
              select(s.model_id!);
            }}>{t('Sistemi incele', 'Review system')} →</button>}
          </li>)}</ul>
        {!shadow.some(s => includes(s.name) && (!filter || filter === s.status)) && <p className="ag-empty">{t('Gösterilecek Shadow AI kaydı yok.', 'No shadow AI records to display.')}</p>}
      </>}
 </section>}
    {user.role === 'Admin' && <footer className="ag-links">
      <button onClick={() => onNative('models')}>{t('Teknik model dosyaları', 'Technical model dossiers')} →</button>
      <button onClick={() => onNative('assurance-alerts')}>{t('Güvence uyarıları', 'Assurance alerts')} →</button>
      <button onClick={() => onNative('findings')}>{t('AI bulguları', 'AI findings')} →</button>
    </footer>}
    {modal && <FindingDialog className="ag-dialog" label={modalTitle} busy={busy} onClose={() => {
      show(null);
      setErr('');
    }}>
      <header className="ag-row">
        <h2>{modalTitle}</h2>
        <button type="button" aria-label={t('Kapat', 'Close')} disabled={busy} onClick={() => {
          show(null);
          setErr('');
        }}>×</button>
      </header>
      {err && <p className="ag-error" role="alert">{errMsg}</p>}
      {modal.kind === 'assessment' && modal.m ? <AssessmentPanel key={modal.m.id + modal.m.revision} tr={tr} m={modal.m} user={user} busy={busy} submit={submit} edit={() => open({
        kind: 'register',
        m: modal.m
      })} /> : modal.kind === 'register' ? <Registration tr={tr} code={data?.nextCode || ''} row={modal.m} name={modal.s?.name} shadowId={modal.s?.id} busy={busy} submit={submit} onError={setErr} /> : modal.kind === 'monitor' ? <ObservationForm m={modal.m!} tr={tr} busy={busy} submit={submit} /> : modal.kind === 'capa' ? <form className="ag-form" onSubmit={e => {
        e.preventDefault();
        void submit({
          action: 'capa',
          id: modal.m!.id,
          observation: modal.o!.id,
          revision: modal.m!.revision,
          reviewer: capaReviewer
        });
      }}>
        <DirectoryPersonField label={t('Bağımsız CAPA doğrulayıcı', 'Independent CAPA verifier')} reviewer tr={tr} value={capaReviewer} onChange={setCapaReviewer} exclude={[user.email, modal.m!.profile!.technical]} />
        <button disabled={!capaReviewer || busy}>{t('Bulgu oluştur', 'Create finding')}</button>
      </form> : modal.kind === 'incident' ? <IncidentFields m={modal.m!} o={modal.o!} tr={tr} user={user.email} busy={busy} submit={submit} /> : modal.kind === 'suspend' ? <>
        <p>{modal.m?.code} · {t('Fornost üretim onayını kaldırır ve yeni dağıtımları engeller. Sağlayıcıda çalışan servis için operasyon ekibinin durdurma işlemi ayrıca gerekir.', 'Fornost withdraws production approval and blocks new deployments. Operations must separately stop any running provider service.')}</p>
        <button disabled={busy} onClick={() => void submit({
          action: 'suspend',
          id: modal.m!.id,
          revision: modal.m!.revision,
          observation: modal.o!.id
        })}>{t('Askıya al', 'Suspend')}</button>
      </> : <form className="ag-form" onSubmit={e => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void submit({
          action: modal.kind,
          id: modal.s?.id,
          name: form.get('name'),
          note: form.get('note')
        });
      }}>
        {modal.kind === 'shadow' ? <label>
          {t('Araç adı', 'Tool name')}
          <input name="name" required maxLength={180} />
        </label> : <strong>{modal.s?.name}</strong>}
        <label>
          {modal.kind === 'shadow' ? t('Nerede ve nasıl tespit edildi?', 'Where and how was it discovered?') : t('Yasaklama gerekçesi', 'Reason for prohibition')}
          <textarea name="note" required minLength={10} />
        </label>
        <button className="ag-primary" disabled={busy}>{t('Kaydet', 'Save')}</button>
      </form>}
    </FindingDialog>}
  </section>;
}
