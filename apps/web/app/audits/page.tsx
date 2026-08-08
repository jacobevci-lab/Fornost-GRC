import { Badge, PageHeader } from '../../components/shell';
import { CreateButton } from '../../components/workflow-actions';
import { audits } from '../../lib/data';
export default function Audits() {
  return (
    <>
      <PageHeader
        eyebrow="Audit çalışma alanı"
        title="Denetim portföyü"
        description="Kapsam, saha çalışması, kanıt talepleri, bulgular ve kapanış doğrulamasını ortak çalışma alanında yönetin."
        action={<CreateButton label="Denetim planla" />}
      />
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header">
            <h2>Aktif denetimler</h2>
            <span className="eyebrow">2026 planı</span>
          </div>
          {audits.map((a) => (
            <div className="audit-card" key={a.name}>
              <header>
                <strong>{a.name}</strong>
                <Badge tone={a.status === 'Sahada' ? 'info' : 'neutral'}>{a.status}</Badge>
              </header>
              <p>
                {a.lead} · {a.period}
              </p>
              <div className="progress">
                <span style={{ width: `${a.progress}%` }} />
              </div>
              <div className="audit-meta">
                <span>Tamamlanma</span>
                <strong>%{a.progress}</strong>
              </div>
            </div>
          ))}
        </article>
        <aside className="panel">
          <div className="panel-header">
            <h2>Çalışma akışı</h2>
          </div>
          <div className="timeline">
            <article>
              <strong>01 · Plan ve kapsam</strong>
              <small>Varlık, kontrol ve örneklem seçimi</small>
            </article>
            <article>
              <strong>02 · Saha çalışması</strong>
              <small>Kanıt talebi ve test adımları</small>
            </article>
            <article>
              <strong>03 · Bulgu ve mutabakat</strong>
              <small>Kök neden, sahip ve vade</small>
            </article>
            <article>
              <strong>04 · Kapanış</strong>
              <small>Aksiyon ve bağımsız doğrulama</small>
            </article>
          </div>
        </aside>
      </section>
    </>
  );
}
